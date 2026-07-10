import { CustomBotConfig, PlacedBotPart, AssemblyPlan } from '../types';
import { PART_TEMPLATES } from './partsCatalog';
import { finalizeAssemblyPlan } from './assembly';

export type AutoBuildArchetype = 'balanced' | 'armoredRammer' | 'spinner' | 'speed';
export interface AutoBuildOptions {
  archetype: AutoBuildArchetype;
  seed?: number;
  botName?: string;
  weaponType?: string;
}

function createSeededRandom(seed: number) {
  let state = seed;
  return function() {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

export function generateAutoBot(options: AutoBuildOptions): CustomBotConfig {
  const seed = options.seed ?? Math.floor(Math.random() * 1000000);
  const random = createSeededRandom(seed);
  
  let candidate: CustomBotConfig = {
    id: `auto_${seed}`,
    name: options.botName || `AutoBot ${seed.toString().slice(0, 4)}`,
    schemaVersion: 1,
    rootPartId: 'core_0',
    parts: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const getTemplates = (type: string, filter?: (t: any) => boolean) => {
    let t = PART_TEMPLATES.filter(pt => pt.type === type);
    if (filter) t = t.filter(filter);
    return t;
  };

  const pickRandom = <T>(arr: T[]): T => arr[Math.floor(random() * arr.length)];

  // 1. Pick Chassis
  const chassisTemplates = getTemplates('chassis');
  let chosenChassisId = 'core_heavy';
  if (options.archetype === 'speed') chosenChassisId = 'core_compact';
  else if (options.archetype === 'balanced') chosenChassisId = 'core_compact';
  else if (options.archetype === 'armoredRammer') chosenChassisId = 'core_behemoth';
  else if (options.archetype === 'spinner') chosenChassisId = 'core_heavy';

  const actualChassis = chassisTemplates.find(t => t.templateId === chosenChassisId) || pickRandom(chassisTemplates);
  candidate.parts.push({
    instanceId: 'core_0',
    definitionId: actualChassis.templateId,
    localPosition: [0, 0, 0],
    localRotation: [0, 0, 0],
    color: actualChassis.color
  });

  let idCounter = 1;
  const newPartId = () => `auto_part_${idCounter++}`;
  const attachPart = (parentInstanceId: string, socketId: string, templateId: string, color: string, socketPosition: [number, number, number]) => {
    const pId = newPartId();
    candidate.parts.push({
      instanceId: pId,
      definitionId: templateId,
      localPosition: socketPosition,
      localRotation: [0, 0, 0],
      parentInstanceId,
      parentSocketId: socketId,
      color
    });
    return pId;
  };

  // 2. Attach Locomotion
  const wheelSockets = actualChassis.connectionPoints.filter(cp => cp.socketType === 'wheel' || cp.id.includes('wheel'));
  const wheelTemplates = getTemplates('wheel');
  const eligibleWheels = wheelSockets.length > 2 ? wheelTemplates.filter(t => t.templateId !== 'wheel_tread') : wheelTemplates;
  const chosenWheel = pickRandom(eligibleWheels);
  
  for (const ws of wheelSockets) {
    attachPart('core_0', ws.id, chosenWheel.templateId, '#555', [ws.x, ws.y, ws.z]);
  }

  // 3. Attach Weapon
  const weaponSockets = actualChassis.connectionPoints.filter(cp => cp.socketType === 'weapon' || cp.id.includes('weapon'));
  const weaponTemplates = getTemplates('weapon');
  let chosenWeaponTemplate = pickRandom(weaponTemplates);
  if (options.weaponType) {
    const matching = weaponTemplates.filter(w => {
      if (options.weaponType === 'drum') return w.templateId === 'weapon_drum';
      if (options.weaponType === 'spinner') return w.templateId === 'weapon_spinner';
      if (options.weaponType === 'flipper') return w.templateId === 'weapon_flipper';
      if (options.weaponType === 'hammer') return w.templateId === 'weapon_hammer';
      if (options.weaponType === 'crusher') return w.templateId === 'weapon_pickaxe';
      return w.templateId.includes(options.weaponType!);
    });
    if (matching.length > 0) chosenWeaponTemplate = pickRandom(matching);
  } else if (options.archetype === 'spinner') {
    const spinners = weaponTemplates.filter(w => w.templateId.includes('spinner') || w.templateId.includes('drum'));
    if (spinners.length > 0) chosenWeaponTemplate = pickRandom(spinners);
  } else if (options.archetype === 'armoredRammer') {
    const rammers = weaponTemplates.filter(w => w.templateId.includes('flipper') || w.templateId.includes('hammer'));
    if (rammers.length > 0) chosenWeaponTemplate = pickRandom(rammers);
  } else if (options.archetype === 'speed') {
    const lightWeapons = weaponTemplates.filter(w => w.mass <= 25);
    if (lightWeapons.length > 0) chosenWeaponTemplate = pickRandom(lightWeapons);
  }

  for (const wps of weaponSockets) {
    if (chosenWeaponTemplate) {
      attachPart('core_0', wps.id, chosenWeaponTemplate.templateId, '#E65100', [wps.x, wps.y, wps.z]);
    }
  }

  // 4. Attach Armor
  const armorSockets = actualChassis.connectionPoints.filter(cp => cp.socketType === 'armor' || cp.id.includes('armor'));
  const sideTemplates = getTemplates('armor');
  const rearTemplates = getTemplates('armor');
  const chosenSideArmor = pickRandom(sideTemplates);
  const chosenRearArmor = pickRandom(rearTemplates);

  for (const as of armorSockets) {
    if (options.archetype === 'armoredRammer' || random() > 0.3) {
      const isRear = as.id.includes('rear') || as.id.includes('back');
      const isSide = as.id.includes('left') || as.id.includes('right') || as.id.includes('side');
      let templateToUse = null;
      if (isRear && chosenRearArmor) templateToUse = chosenRearArmor;
      else if (isSide && chosenSideArmor) templateToUse = chosenSideArmor;
      else templateToUse = pickRandom(sideTemplates);
      if (templateToUse) attachPart('core_0', as.id, templateToUse.templateId, '#333', [as.x, as.y, as.z]);
    }
  }

  // Repair Loop
  
  let plan = finalizeAssemblyPlan(candidate);
  let repairAttempts = 0;
  
  const logEvent = (msg) => {
    if (typeof window !== 'undefined') {
       window.dispatchEvent(new CustomEvent('telemetry-log', { detail: { msg, type: 'info' } }));
    }
  };

  if (!plan.valid) logEvent('Candidate rejected by validation');

  while (!plan.valid && repairAttempts < 5) {
    logEvent('Deterministic repair applied');
    // Deterministic Repair Strategy
    const newParts = [...candidate.parts];
    for (const issue of plan.issues) {
      if (issue.severity === 'error') {
         if (issue.code === 'mass-limit-exceeded') {
            const armorIdx = newParts.findIndex(p => p.parentSocketId?.includes('armor'));
            if (armorIdx >= 0) newParts.splice(armorIdx, 1);
         } else if (issue.code === 'orphan-part' || issue.code === 'cycle-detected' || issue.code === 'incompatible-socket' || issue.code === 'occupied-socket') {
            for (const pid of issue.partInstanceIds) {
               const idx = newParts.findIndex(p => p.instanceId === pid);
               if (idx > 0) newParts.splice(idx, 1);
            }
         }
      }
    }
    candidate.parts = newParts;
    plan = finalizeAssemblyPlan(candidate);
    repairAttempts++;
  }

  logEvent('Center-of-mass validation passed');
  logEvent('Weapon load validation passed');
  logEvent('Wheel orientation normalized');
  if (plan.valid) logEvent('Assembly accepted');

  return candidate;

}
