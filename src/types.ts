
export type CombatMaterial = "steel" | "aluminum" | "rubber" | "titanium" | "armorPlate" | "weaponSteel" | "composite" | "arenaWall";

export type ImpactClass = "scrape" | "glancing" | "direct" | "heavy" | "weapon" | "crush" | "landing";

export type ImpactEvent = {
  id: string;
  time: number;
  className: ImpactClass;
  attackerId?: string;
  defenderId?: string;
  contactPoint: [number, number, number];
  normal: [number, number, number];
  relativeVelocity: number;
  normalVelocity: number;
  tangentialVelocity: number;
  impulse: number;
  impactEnergy: number;
  massRatio: number;
  materialA: CombatMaterial;
  materialB: CombatMaterial;
  weaponSpin?: number;
  damageAmount: number;
  confidence: number;
};

export type BotAnimState = "idle" | "accelerating" | "braking" | "turning" | "tractionSlip" | "weaponSpinUp" | "weaponActive" | "weaponContact" | "scraping" | "hitReact" | "heavyImpact" | "airborne" | "landing" | "armorDamaged" | "partLoose" | "partDetached" | "staggered" | "ko";

export type WeaponType = "spinner" | "flipper" | "saw" | "hammer" | "drum" | "crusher" | "none";
export type ArmorType = "titanium" | "steel" | "aluminum" | "carbon-fiber" | "none";

// PHASE 1 SCHEMA
export type BotPartCategory =
  | 'chassis'
  | 'frame'
  | 'wheel'
  | 'armor'
  | 'weapon'
  | 'mount'
  | 'connector'
  | 'stabilizer';

export type SocketType =
  | 'core'
  | 'frame'
  | 'armor'
  | 'wheel'
  | 'weaponMount'
  | 'weapon'
  | 'utility'
  | 'any';

export type Vec3 = [number, number, number];

export type ConnectionPoint = {
  id: string;
  localPosition: Vec3;
  localRotation: Vec3;
  socketType: SocketType;
  accepts: SocketType[];
  occupiedBy?: string;
  strength: number;
  mirrored?: boolean;
};

export type ConvexHullKind =
  | 'box'
  | 'wedge'
  | 'slope'
  | 'trapezoid'
  | 'cylinder'
  | 'capsule'
  | 'compound';

export type PartCollider = {
  kind: ConvexHullKind;
  localPosition: Vec3;
  localRotation: Vec3;
  dimensions: Vec3;
  vertices?: Vec3[];
};

export type BotPartDefinition = {
  id: string; // templateId
  name: string; // label
  category: BotPartCategory;
  mass: number;
  health: number;
  armor?: number;
  damage?: number;
  cost: number;
  dimensions: Vec3; // size
  visualKind: string;
  colliders: PartCollider[];
  connectionPoints: ConnectionPoint[];
  tags: string[];
  color?: string; // default color
  description?: string;
  shape?: "box" | "cylinder" | "wedge" | "capsule" | "compound";
};

export type PlacedBotPart = {
  instanceId: string;
  definitionId: string;
  localPosition: Vec3;
  localRotation: Vec3;
  parentInstanceId?: string;
  parentSocketId?: string;
  childSocketId?: string;
  color?: string;
  animState?: BotAnimState;
};

export type CustomBotConfig = {
  id: string;
  name: string;
  schemaVersion: number;
  rootPartId: string;
  parts: PlacedBotPart[];
  createdAt: number;
  updatedAt: number;
};

export type Transform3 = {
  position: Vec3;
  rotation: Vec3;
  scale?: Vec3;
};

export type ResolvedPartTransform = {
  instanceId: string;
  definitionId: string;
  local: Transform3;
  world: Transform3;
  parentInstanceId?: string;
  depth: number;
};

export type BotPhysicsSummary = {
  totalMass: number;
  centerOfMass: Vec3;
  inertiaProxy: Vec3;
  bounds: {
    min: Vec3;
    max: Vec3;
    size: Vec3;
  };
  colliderCount: number;
  stabilityScore: number;
  locomotionReady: boolean;
  weaponReady: boolean;
  spawnFit: boolean;
};

export type BuildValidationIssue = {
  id: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  affectedPartIds: string[];
  code:
    | 'missing_chassis'
    | 'orphan_part'
    | 'cycle_detected'
    | 'socket_incompatible'
    | 'socket_occupied'
    | 'missing_locomotion'
    | 'missing_weapon_mount'
    | 'mass_out_of_bounds'
    | 'center_of_mass_unstable'
    | 'spawn_footprint_invalid'
    | 'collider_generation_failed';
};

// Deprecated or mapped types
export interface PartConnectionPoint {
  id: string;
  x: number; // local relative coordinates
  y: number;
  z: number;
  socketType: "wheel" | "weapon" | "armor" | "any" | string;
  occupiedById?: string; // ID of part attached here
}

export interface ModularPart {
  id: string;
  templateId: string;
  type: string;
  label: string;
  shape: string;
  size: [number, number, number];
  color: string;
  position: [number, number, number]; // local offset from center
  rotation: [number, number, number]; // pitch, yaw, roll
  animState?: BotAnimState;
  mass: number;
  health: number;
  armor: number;
  damage: number;
  connectionPoints: PartConnectionPoint[];
  parentPartId?: string; // id of parent part
  parentPointId?: string; // id of attachment point on parent
  visualKind?: string;
  colliders?: PartCollider[];
}

export interface GameSettings {
  // Physics / Handling
  vehicleGrip: number;
  driftFactor: number;
  angularDamping: number;
  collisionRestitution: number;
  impactImpulseScale: number;
  knockbackScale: number;
  chassisMassScale: number;
  maximumVelocity: number;
  maximumAngularVelocity: number;

  // Impact / Damage
  damageMultiplier: number;
  collisionBrutality: number;
  heavyHitThreshold: number;
  glancingHitReduction: number;
  impactFeedbackStrength: number;
  reducedMotion: boolean;

  // Performance Safety
  maxActiveFragments: number;
  debrisLifetime: number;
  effectLifetime: number;
  fragmentQuality: "low" | "medium" | "high";
  performanceMode: boolean;
}

export interface BotState {
  id: string;
  name: string;
  health: number;
  energy: number;
  heat: number;
  status: "nominal" | "warning" | "critical" | "destroyed";
  weaponActive: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  animState?: BotAnimState;
}

export interface VehicleConfig {
  id: string;
  name: string;
  weapon: {
    type: WeaponType;
    rpm: number;
    damage: number;
  };
  armor: {
    type: ArmorType;
    integrity: number;
    weight: number;
  };
  motor: {
    torque: number;
    maxSpeed: number;
  };
  isCustom?: boolean;
  parts?: ModularPart[];
  // Phase 1 Custom Configuration hook
  customConfig?: CustomBotConfig;
  physicsSummary?: BotPhysicsSummary;
}

export interface TelemetryEvent {
  id: string;
  timestamp: number;
  message: string;
  type: "info" | "warning" | "critical" | "combat";
}
