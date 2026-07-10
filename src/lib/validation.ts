import { CustomBotConfig, BotPhysicsSummary, BuildValidationIssue, ResolvedPartTransform, Vec3 } from '../types';
import { finalizeAssemblyPlan } from './assembly';

export const validateCustomBot = (
  config: CustomBotConfig,
  resolvedTransforms: ResolvedPartTransform[]
): { issues: BuildValidationIssue[], isValid: boolean } => {
  const plan = finalizeAssemblyPlan(config);
  const mappedIssues: BuildValidationIssue[] = plan.issues.map(i => ({
    id: `err_${i.code}_${Math.random()}`,
    severity: i.severity,
    message: i.message,
    affectedPartIds: i.partInstanceIds,
    code: 'orphan_part' // fallbacks for now
  }));
  return { issues: mappedIssues, isValid: plan.valid };
};

export const computePhysicsSummary = (
  config: CustomBotConfig,
  resolvedTransforms: ResolvedPartTransform[]
): BotPhysicsSummary => {
  const plan = finalizeAssemblyPlan(config);
  
  let min: Vec3 = [Infinity, Infinity, Infinity];
  let max: Vec3 = [-Infinity, -Infinity, -Infinity];
  let hasWeapon = false;
  let colliderCount = 0;

  for (const n of plan.nodes) {
    if (n.category === 'weapon') hasWeapon = true;
    colliderCount += n.colliderBounds.length;
    
    // Very rough bounding
    min[0] = Math.min(min[0], n.worldTransform.position[0] - 0.5);
    min[1] = Math.min(min[1], n.worldTransform.position[1] - 0.5);
    min[2] = Math.min(min[2], n.worldTransform.position[2] - 0.5);
    
    max[0] = Math.max(max[0], n.worldTransform.position[0] + 0.5);
    max[1] = Math.max(max[1], n.worldTransform.position[1] + 0.5);
    max[2] = Math.max(max[2], n.worldTransform.position[2] + 0.5);
  }

  const size: Vec3 = [
    max[0] === -Infinity ? 0 : max[0] - min[0],
    max[1] === -Infinity ? 0 : max[1] - min[1],
    max[2] === -Infinity ? 0 : max[2] - min[2],
  ];

  return {
    totalMass: plan.totalMass,
    centerOfMass: plan.centerOfMass,
    inertiaProxy: plan.inertiaEstimate,
    bounds: { min, max, size },
    colliderCount,
    stabilityScore: Math.max(0, 100 - (plan.centerOfMass[1] * 100)),
    locomotionReady: plan.nodes.filter(n => n.category === 'wheel').length >= 2,
    weaponReady: hasWeapon,
    spawnFit: size[0] < 3 && size[1] < 2 && size[2] < 3
  };
};
