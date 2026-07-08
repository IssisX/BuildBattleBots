import { CustomBotConfig, PlacedBotPart } from '../types';
import { PART_TEMPLATES } from './partsCatalog';

export type AutoBuildArchetype = 'balanced' | 'armoredRammer' | 'spinner' | 'speed';

export interface AutoBuildOptions {
  archetype: AutoBuildArchetype;
  seed?: number;
  botName?: string;
}

// Simple seeded random number generator
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
  
  const config: CustomBotConfig = {
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
  if (options.archetype === 'speed') {
    chosenChassisId = 'core_compact';
  } else if (options.archetype === 'balanced') {
    chosenChassisId = 'core_standard'; // if exists, else it falls back
  }
  
  const actualChassis = chassisTemplates.find(t => t.templateId === chosenChassisId) || pickRandom(chassisTemplates);
  
  config.parts.push({
    instanceId: 'core_0',
    definitionId: actualChassis.templateId,
    localPosition: [0, 0, 0],
    localRotation: [0, 0, 0],
    color: actualChassis.color
  });

  let idCounter = 1;
  const newPartId = () => `auto_part_${idCounter++}`;

  const attachPart = (
    parentInstanceId: string, 
    socketId: string, 
    templateId: string, 
    color: string, 
    socketPosition: [number, number, number]
  ) => {
    const pId = newPartId();
    config.parts.push({
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
  const chosenWheel = pickRandom(wheelTemplates);
  
  for (const ws of wheelSockets) {
    attachPart('core_0', ws.id, chosenWheel.templateId, '#555', [ws.x, ws.y, ws.z]);
  }

  // 3. Attach Weapon
  const weaponSockets = actualChassis.connectionPoints.filter(cp => cp.socketType === 'weapon' || cp.id.includes('weapon'));
  const weaponTemplates = getTemplates('weapon');
  
  let chosenWeaponTemplate = pickRandom(weaponTemplates);
  if (options.archetype === 'spinner') {
    const spinners = weaponTemplates.filter(w => w.templateId.includes('spin') || w.templateId.includes('drum'));
    if (spinners.length > 0) chosenWeaponTemplate = pickRandom(spinners);
  } else if (options.archetype === 'armoredRammer') {
    const rammers = weaponTemplates.filter(w => w.templateId.includes('ram') || w.templateId.includes('wedge') || w.templateId.includes('spike'));
    if (rammers.length > 0) chosenWeaponTemplate = pickRandom(rammers);
  } else if (options.archetype === 'speed') {
    const lightWeapons = weaponTemplates.filter(w => w.mass < 20);
    if (lightWeapons.length > 0) chosenWeaponTemplate = pickRandom(lightWeapons);
  }

  for (const wps of weaponSockets) {
    if (chosenWeaponTemplate) {
      attachPart('core_0', wps.id, chosenWeaponTemplate.templateId, '#E65100', [wps.x, wps.y, wps.z]);
    }
  }

  // 4. Attach Armor
  const armorSockets = actualChassis.connectionPoints.filter(cp => cp.socketType === 'armor' || cp.id.includes('armor'));
  const armorTemplates = getTemplates('armor').concat(getTemplates('wedge'));
  
  const chosenArmor = pickRandom(armorTemplates);
  
  for (const as of armorSockets) {
    // maybe randomly skip some armor unless it's an armored rammer
    if (options.archetype === 'armoredRammer' || random() > 0.3) {
      attachPart('core_0', as.id, chosenArmor.templateId, '#333', [as.x, as.y, as.z]);
    }
  }

  return config;
}
