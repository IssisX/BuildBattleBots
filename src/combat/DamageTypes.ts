export type ImpactClass = 'glancing' | 'scrape' | 'direct' | 'heavy' | 'weapon';

export type DamageLayerKind =
  | 'paint' | 'outerArmor' | 'reinforcedArmor' | 'frame'
  | 'mount' | 'weapon' | 'wheel' | 'core';

export type ComponentVisualDamageState =
  | 'clean' | 'scuffed' | 'dented' | 'cracked'
  | 'loose' | 'exposed' | 'disabled' | 'detached';

export type CombatMaterial = {
  id: number;
  name: 'steel' | 'aluminum' | 'rubber' | 'armorPlate' | 'weaponSteel' | 'composite' | 'arenaWall';
  hardness: number;
  density: number;
  ringHz: number;
  ringDamping: number;
  sparkYield: number;
  scrapeResistance: number;
  deflectAngleBias: number;
  deformation: import('../types').MaterialDeformationProfile;
};

export type DamageLayer = {
  kind: DamageLayerKind;
  maxIntegrity: number;
  integrity: number;
  absorption: number;          // base fraction absorbed at full integrity
  hardness: number;            // resists penetration; softens with heat
  fractureThreshold: number;   // single-hit energy that cracks this layer
  overmatchThreshold: number;  // energy above which a fraction bypasses absorption entirely
  fatigue: number;             // accumulated sub-threshold micro-damage
  fatigueLimit: number;        // crossing it dumps a chunk of integrity (metal fatigue)
  heat: number;                // accumulates on hit, dissipates over time, softens hardness
  exposes?: DamageLayerKind[];
};

export type CrackNode = { x: number; y: number; z: number; energy: number; linked: number[] };

export type DamageableComponent = {
  componentId: number;
  partInstanceId?: string;
  partDefinitionId?: string;
  botId: string;
  label: string;
  hitZone: string;
  layers: DamageLayer[];       // ordered outer → inner
  cracks: CrackNode[];         // crack network graph, grows between adjacent hits
  mountIntegrity: number;      // 1 → rigid; 0 → detached
  disabled: boolean;
  detached: boolean;
  lastHitTime: number;
  visualState: ComponentVisualDamageState;
  visualOffset: {
    jolt: [number, number, number];
    joltAngular: [number, number, number];
    wobblePhase: number;
    wobbleAmplitude: number;
  };
};

export type ImpactEvent = {
  seq: number;                 // monotonic; slot recycled from pool
  time: number;
  attackerId: string;          // numeric entity ids; -1 = environment
  defenderId: string;
  weaponId: string;            // -1 = none
  source: 'body' | 'weapon' | 'arena' | 'debris';   // WHAT hit
  severity: 'tap' | 'scrape' | 'glancing' | 'direct' | 'heavy' | 'crush'; // HOW HARD
  contactPoint: [number, number, number];
  normal: [number, number, number];
  tangent: [number, number, number];
  relativeVelocity: number;
  normalVelocity: number;
  tangentialVelocity: number;
  impulse: number;
  energyNormal: number;        // J — drives dents, penetration
  energyTangential: number;    // J — drives scrapes, sparks, scoring
  obliquityDeg: number;        // 0 = square hit, 90 = pure graze
  attackerRecoilShare: number; // 0..1 — kinetic weapons self-damage on bite
  materialA: number;           // pre-resolved material indices, not strings
  materialB: number;
  manifoldContacts: number;
  damageAmount?: number;
  dentRequest?: import('../types').DentRequest;
  seedRoll: number;            // deterministic per-event random draw
};

export const DamageTuning = {
  gating: {
    cooldownMs: 110,
    restVMin: 1.5,
    restJMin: 5.0,
  },
  severity: {
    tap: { energyNormal: 0, energyTangential: 0 },
    scrape: { energyNormal: 0, energyTangential: 10 },
    glancing: { energyNormal: 5, energyTangential: 0 },
    direct: { energyNormal: 20, energyTangential: 0 },
    heavy: { energyNormal: 50, energyTangential: 0 },
    crush: { energyNormal: 100, energyTangential: 0 },
  },
  fatigue: {
    baseDump: 0.1, // 10% integrity loss when fatigue limit reached
    zoneMemoryK: 0.15,
  },
  absorption: {
    decayBase: 0.35,
    decayScale: 0.65,
    decayExponent: 0.7,
  },
  heat: {
    softenK: 0.005,
    dissipationRate: 0.1, // units per second
  },
  crack: {
    linkRadius: 0.25,
    thresholdReductionPerLink: 0.05,
  },
  visual: {
    joltReturnRate: 15,
    wobbleFreqMin: 4,
    wobbleFreqMax: 9,
    hitStopTimescale: 0.25,
    hitStopDuration: 85, // ms
    cameraTraumaDecay: 0.8,
  }
};

export const Materials: Record<string, CombatMaterial> = {
  steel: {  id: 0, name: 'steel', hardness: 1.0, density: 7850, ringHz: 1200, ringDamping: 0.02, sparkYield: 0.8, scrapeResistance: 0.7, deflectAngleBias: 0.0 , deformation: {"dentThreshold":10,"fullDentEnergy":100,"minimumDentRadius":0.1,"maximumDentRadius":0.3,"maximumDentDepth":0.1,"elasticity":0.05,"plasticity":0.95,"constraintStiffness":0.8} },
  aluminum: {  id: 1, name: 'aluminum', hardness: 0.6, density: 2700, ringHz: 1800, ringDamping: 0.05, sparkYield: 0.3, scrapeResistance: 0.4, deflectAngleBias: 0.1 , deformation: {"dentThreshold":5,"fullDentEnergy":50,"minimumDentRadius":0.15,"maximumDentRadius":0.4,"maximumDentDepth":0.15,"elasticity":0.02,"plasticity":0.98,"constraintStiffness":0.6} },
  rubber: {  id: 2, name: 'rubber', hardness: 0.1, density: 1100, ringHz: 0, ringDamping: 1.0, sparkYield: 0, scrapeResistance: 0.1, deflectAngleBias: 0.5 , deformation: {"dentThreshold":100,"fullDentEnergy":1000,"minimumDentRadius":0.2,"maximumDentRadius":0.5,"maximumDentDepth":0.05,"elasticity":0.95,"plasticity":0.05,"constraintStiffness":0.2} },
  armorPlate: {  id: 3, name: 'armorPlate', hardness: 1.5, density: 8000, ringHz: 800, ringDamping: 0.01, sparkYield: 1.0, scrapeResistance: 0.9, deflectAngleBias: -0.1 , deformation: {"dentThreshold":30,"fullDentEnergy":200,"minimumDentRadius":0.05,"maximumDentRadius":0.25,"maximumDentDepth":0.05,"elasticity":0.1,"plasticity":0.9,"constraintStiffness":0.95} },
  weaponSteel: {  id: 4, name: 'weaponSteel', hardness: 1.8, density: 7900, ringHz: 1000, ringDamping: 0.01, sparkYield: 0.9, scrapeResistance: 0.95, deflectAngleBias: -0.1 , deformation: {"dentThreshold":40,"fullDentEnergy":250,"minimumDentRadius":0.05,"maximumDentRadius":0.2,"maximumDentDepth":0.04,"elasticity":0.1,"plasticity":0.9,"constraintStiffness":0.95} },
  composite: {  id: 5, name: 'composite', hardness: 0.8, density: 1600, ringHz: 500, ringDamping: 0.2, sparkYield: 0.1, scrapeResistance: 0.8, deflectAngleBias: 0.2 , deformation: {"dentThreshold":15,"fullDentEnergy":80,"minimumDentRadius":0.1,"maximumDentRadius":0.35,"maximumDentDepth":0.1,"elasticity":0.01,"plasticity":0.99,"constraintStiffness":0.85} },
  arenaWall: {  id: 6, name: 'arenaWall', hardness: 2.0, density: 10000, ringHz: 400, ringDamping: 0.1, sparkYield: 0.5, scrapeResistance: 1.0, deflectAngleBias: 0.0 , deformation: {"dentThreshold":200,"fullDentEnergy":1000,"minimumDentRadius":0.05,"maximumDentRadius":0.2,"maximumDentDepth":0.02,"elasticity":0.05,"plasticity":0.95,"constraintStiffness":0.99} },
};
