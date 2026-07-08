import { CustomBotConfig, BotPhysicsSummary, BuildValidationIssue, BotPartDefinition, PlacedBotPart, ResolvedPartTransform, Vec3 } from '../types';
import { PART_TEMPLATES, resolvePartTransformsV2 } from './partsCatalog';

export const validateCustomBot = (
  config: CustomBotConfig,
  resolvedTransforms: ResolvedPartTransform[]
): { issues: BuildValidationIssue[], isValid: boolean } => {
  const issues: BuildValidationIssue[] = [];

  const partMap = new Map<string, PlacedBotPart>();
  config.parts.forEach(p => partMap.set(p.instanceId, p));

  const defMap = new Map<string, BotPartDefinition>();
  PART_TEMPLATES.forEach(t => {
    // Assuming part templates are roughly mapped to BotPartDefinition for Phase 1
    defMap.set(t.templateId, t as unknown as BotPartDefinition);
  });

  // Check 1: Missing Chassis
  const rootPart = partMap.get(config.rootPartId);
  if (!rootPart) {
    issues.push({
      id: 'err_no_chassis',
      severity: 'error',
      message: 'Bot is missing a core chassis.',
      affectedPartIds: [],
      code: 'missing_chassis'
    });
  } else {
    const rootDef = defMap.get(rootPart.definitionId);
    const rootCat = rootDef?.category || (rootDef as any)?.type;
    if (rootCat !== 'chassis') {
       issues.push({
         id: 'err_root_not_chassis',
         severity: 'error',
         message: 'Root part must be a chassis.',
         affectedPartIds: [config.rootPartId],
         code: 'missing_chassis'
       });
    }
  }

  // Check 2: Cycle Detected / Orphan Parts
  // If a part is not in resolvedTransforms, it might be an orphan or part of a cycle
  const resolvedIds = new Set(resolvedTransforms.map(r => r.instanceId));
  for (const part of config.parts) {
    if (!resolvedIds.has(part.instanceId)) {
      issues.push({
        id: `err_orphan_\${part.instanceId}`,
        severity: 'error',
        message: 'Part is not connected to the root chassis or causes a cycle.',
        affectedPartIds: [part.instanceId],
        code: 'orphan_part'
      });
    }
  }

  // Check 3: Missing Locomotion
  const wheels = config.parts.filter(p => {
    const def = defMap.get(p.definitionId);
    return (def?.category || (def as any)?.type) === 'wheel';
  });
  if (wheels.length < 2) {
    issues.push({
      id: 'err_missing_locomotion',
      severity: 'error',
      message: 'Bot requires at least 2 wheels for locomotion.',
      affectedPartIds: [],
      code: 'missing_locomotion'
    });
  }

  // Check 4: Socket Availability & Compatibility
  // Simplified for phase 1
  for (const part of config.parts) {
    if (part.parentInstanceId) {
       const parent = partMap.get(part.parentInstanceId);
       if (!parent) {
         issues.push({
            id: `err_parent_missing_\${part.instanceId}`,
            severity: 'error',
            message: 'Parent part does not exist.',
            affectedPartIds: [part.instanceId],
            code: 'orphan_part'
         });
       } else {
         const parentDef = defMap.get(parent.definitionId);
         const myDef = defMap.get(part.definitionId);
         if (parentDef && myDef && part.parentSocketId) {
            const socket = parentDef.connectionPoints.find(cp => cp.id === part.parentSocketId);
            if (!socket) {
              issues.push({
                 id: `err_invalid_socket_\${part.instanceId}`,
                 severity: 'error',
                 message: `Invalid socket \${part.parentSocketId} on parent.`,
                 affectedPartIds: [part.instanceId, parent.instanceId],
                 code: 'socket_incompatible'
              });
            } else {
              // Socket compatibility check
              // In phase 1, map old socketType to new SocketType constraints
              const sType = socket.socketType;
              const cat = myDef.category || (myDef as any).type;
              if (sType !== 'any' && sType !== cat && !(sType === 'armor' && cat === 'wedge')) {
                 issues.push({
                   id: `err_incompatible_socket_\${part.instanceId}`,
                   severity: 'error',
                   message: `Cannot mount \${cat} to a \${sType} socket.`,
                   affectedPartIds: [part.instanceId, parent.instanceId],
                   code: 'socket_incompatible'
                 });
              }
            }
         }
       }
    }
  }

  return { issues, isValid: issues.filter(i => i.severity === 'error').length === 0 };
};

export const computePhysicsSummary = (
  config: CustomBotConfig,
  resolvedTransforms: ResolvedPartTransform[]
): BotPhysicsSummary => {
  let totalMass = 0;
  const centerOfMass: Vec3 = [0, 0, 0];
  let colliderCount = 0;
  let hasWeapon = false;

  const defMap = new Map<string, BotPartDefinition>();
  PART_TEMPLATES.forEach(t => {
    defMap.set(t.templateId, t as unknown as BotPartDefinition);
  });

  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];

  for (const tr of resolvedTransforms) {
    const partDef = defMap.get(tr.definitionId);
    if (!partDef) continue;

    const mass = partDef.mass || 1;
    totalMass += mass;

    centerOfMass[0] += tr.world.position[0] * mass;
    centerOfMass[1] += tr.world.position[1] * mass;
    centerOfMass[2] += tr.world.position[2] * mass;

    if (partDef.colliders) colliderCount += partDef.colliders.length;
    if (partDef.category === 'weapon') hasWeapon = true;

    // Very rough bounds based on center point + dimensions
    const dims = partDef.dimensions || (partDef as any).size || [0.5, 0.5, 0.5];
    min[0] = Math.min(min[0], tr.world.position[0] - dims[0]/2);
    min[1] = Math.min(min[1], tr.world.position[1] - dims[1]/2);
    min[2] = Math.min(min[2], tr.world.position[2] - dims[2]/2);

    max[0] = Math.max(max[0], tr.world.position[0] + dims[0]/2);
    max[1] = Math.max(max[1], tr.world.position[1] + dims[1]/2);
    max[2] = Math.max(max[2], tr.world.position[2] + dims[2]/2);
  }

  if (totalMass > 0) {
    centerOfMass[0] /= totalMass;
    centerOfMass[1] /= totalMass;
    centerOfMass[2] /= totalMass;
  }

  const size: Vec3 = [
    max[0] === -Infinity ? 0 : max[0] - min[0],
    max[1] === -Infinity ? 0 : max[1] - min[1],
    max[2] === -Infinity ? 0 : max[2] - min[2],
  ];

  return {
    totalMass,
    centerOfMass,
    inertiaProxy: [totalMass * 0.4, totalMass * 0.4, totalMass * 0.4],
    bounds: { min, max, size },
    colliderCount,
    stabilityScore: Math.max(0, 100 - (centerOfMass[1] * 100)), // lower CoM is better
    locomotionReady: config.parts.filter(p => ['wheel'].includes(defMap.get(p.definitionId)?.type || defMap.get(p.definitionId)?.category)).length >= 2,
    weaponReady: hasWeapon,
    spawnFit: size[0] < 3 && size[1] < 2 && size[2] < 3
  };
};
