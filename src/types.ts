
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
  fragmentQuality: "low" | "medium" | "high" | "ultra";
  performanceMode: boolean;

  // Sound Volume Tuning
  soundVolume: number;
  musicVolume: number;

  // Visuals & Level of Detail (LOD)
  graphicsDetail: "low" | "medium" | "high" | "ultra";
  lodScale: number;

  // High-Impact Physics Fidelity
  physicsTimeStep: number;
  physicsSubsteps: number;
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
  color?: string;
  description?: string;
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

export type ResolvedTransform = {
  position: Vec3;
  rotation: [number, number, number, number];
};

export type ResolvedWheelAssembly = {
  partInstanceId: string;
  side: 'left' | 'right' | 'center';

  worldCenter: Vec3;
  axleAxisWorld: Vec3;
  rollingDirectionWorld: Vec3;
  groundDirectionWorld: Vec3;

  tireRadius: number;
  tireWidth: number;
  rimRadius: number;
  rimWidth: number;

  meshRotation: [number, number, number, number];
  colliderRotation: [number, number, number, number];

  motorAxisWorld: Vec3;
  motorDirectionSign: -1 | 1;

  groundContactPoint: Vec3;
  sweepRadius: number;
};

export type LocalSweepBounds = {
  radius: number;
  length: number;
  axis: Vec3;
};

export type ResolvedWeaponAssembly = {
  partInstanceId: string;
  worldPivot: Vec3;
  spinAxisWorld: Vec3;
};

export type ResolvedColliderBounds = {
  kind: ConvexHullKind;
  worldPosition: Vec3;
  worldRotation: [number, number, number, number];
  dimensions: Vec3;
};

export type ResolvedAssemblyNode = {
  instanceId: string;
  definitionId: string;
  category: BotPartCategory;

  parentInstanceId?: string;
  parentSocketId?: string;

  localPosition: Vec3;
  localRotation: Vec3;
  worldTransform: ResolvedTransform;

  mass: number;
  worldCenterOfMass: Vec3;
  colliderBounds: ResolvedColliderBounds[];

  wheel?: ResolvedWheelAssembly;
  weapon?: ResolvedWeaponAssembly;
};

export type AssemblyIssueCode =
  | 'missing-root'
  | 'multiple-roots'
  | 'orphan-part'
  | 'cycle-detected'
  | 'missing-definition'
  | 'missing-parent-socket'
  | 'incompatible-socket'
  | 'occupied-socket'
  | 'mass-limit-exceeded'
  | 'insufficient-locomotion'
  | 'unstable-center-of-mass'
  | 'weapon-load-exceeded'
  | 'structural-overlap'
  | 'wheel-axis-invalid'
  | 'wheel-assembly-misaligned'
  | 'wheel-clearance-blocked'
  | 'weapon-sweep-blocked';

export type AssemblyIssue = {
  code: AssemblyIssueCode;
  severity: 'error' | 'warning';
  partInstanceIds: string[];
  message: string;
  repairHint?: string;
};

export type JointBuildDescriptor = {
  id: string;
  parentInstanceId: string;
  childInstanceId: string;

  kind: 'fixed' | 'revolute' | 'prismatic';

  parentAnchorLocal: Vec3;
  childAnchorLocal: Vec3;
  axisLocal?: Vec3;

  angularLimits?: [number, number];
  linearLimits?: [number, number];

  motor?: {
    targetVelocity: number;
    stiffness: number;
    damping: number;
    maximumForceOrImpulse: number;
    directionSign: -1 | 1;
  };
};

export type AssemblyPlan = {
  seed: number;
  rootInstanceId: string;
  nodes: ResolvedAssemblyNode[];

  totalMass: number;
  centerOfMass: Vec3;
  supportPolygon: [number, number][];
  inertiaEstimate: Vec3;

  jointDescriptors: JointBuildDescriptor[];
  issues: AssemblyIssue[];
  valid: boolean;
};

export type WheelPhysicsProfile = {
  tireRadius: number;
  tireWidth: number;
  rimRadius: number;
  rimWidth: number;
  canonicalAxleAxis: Vec3;
  friction: number;
  rollingResistance: number;
  driveTorque: number;
};

export type WeaponPhysicsProfile = {
  kind: 'spinner' | 'drum' | 'flipper' | 'hammer' | 'pickaxe';
  movingMass: number;
  effectiveRadius: number;
  targetAngularVelocity?: number;
  spinUpSeconds?: number;
  motorTorque?: number;
  mountTorqueLimit: number;
  sweepBounds: LocalSweepBounds;
};

export type StructuralPhysicsProfile = {
  maxAttachedMass?: number;
  maxAppliedTorque?: number;
  allowedOverlapTolerance?: number;
};

export type DentRequest = {
  eventId: string;
  botId: string;
  partInstanceId: string;

  localContactPoint: Vec3;
  localImpactDirection: Vec3;

  normalEnergy: number;
  tangentialEnergy: number;
  peakImpulse: number;
  obliquityRadians: number;

  radius: number;
  depth: number;
  plasticity: number;
  scratchBias: number;
};

export type MaterialDeformationProfile = {
  dentThreshold: number;
  fullDentEnergy: number;
  minimumDentRadius: number;
  maximumDentRadius: number;
  maximumDentDepth: number;
  elasticity: number;
  plasticity: number;
  constraintStiffness: number;
};

export type MeshDeformationState = {
  partInstanceId: string;

  restPositions: Float32Array;
  positions: Float32Array;
  previousPositions: Float32Array;
  inverseMasses: Float32Array;

  constraintA: Uint32Array;
  constraintB: Uint32Array;
  constraintRestLength: Float32Array;

  affectedVertexIndices: Uint32Array;
  affectedCount: number;

  active: boolean;
  settledFrames: number;
};

export type ComponentFailureState =
  | 'nominal'
  | 'stressed'
  | 'degraded'
  | 'critical'
  | 'failed'
  | 'detached';

export type ComponentCapability = {
  structuralMultiplier: number;
  actuatorEfficiency: number;
  alignmentQuality: number;
  frictionMultiplier: number;
  rollingResistanceMultiplier: number;
  dragMultiplier: number;
  vibrationAmplitude: number;
};

export type RuntimeMechanicalNode = {
  nodeIndex: number;
  partInstanceId: string;
  definitionId: string;
  category: BotPartCategory;
  parentEdgeIndex: number;

  mass: number;
  localCenterOfMass: Vec3;

  materialIntegrity: number;
  mountIntegrity: number;
  fatigue: number;

  capability: ComponentCapability;
  failureState: ComponentFailureState;
};

export type BotControlIntent = {
  throttle: number;
  steering: number;
  brake: number;
  weaponCommand: number;
  selfRightCommand: number;
};

export type GroundSupportProfile = {
  kind: 'driven-wheel' | 'passive-wheel' | 'caster' | 'skid' | 'chassis-patch';
  localContactPoints: Vec3[];
  patchRadius?: number;
  longitudinalFriction: number;
  lateralFriction: number;
  staticFriction: number;
  rollingResistance: number;
  loadBearing: boolean;
};

export type ResolvedGroundSupport = {
  id: string;
  partInstanceId: string;
  kind: GroundSupportProfile['kind'];
  worldContactPoints: Vec3[];
  rollingDirectionWorld?: Vec3;
  lateralDirectionWorld?: Vec3;
  active: boolean;
  normalLoad: number;
  longitudinalSlip: number;
  lateralSlip: number;
};

export type StructuralCapacityProfile = {
  axialImpulseYield: number;
  shearImpulseYield: number;
  bendingAngularImpulseYield: number;
  torsionalAngularImpulseYield: number;

  ultimateLoadMultiplier: number;
  fatigueStartRatio: number;
  fatigueExponent: number;

  elasticCompliance: number;
  postYieldCompliance: number;
  damping: number;

  continuousTorqueLimit?: number;
  continuousLoadLimit?: number;

  failureMode:
    | 'bend'
    | 'loosen'
    | 'shear'
    | 'seize'
    | 'fracture'
    | 'detach';
};

export type DriveMechanicalProfile = {
  wheelInertia: number;
  maximumMotorTorque: number;
  maximumAngularVelocity: number;
  brakeTorque: number;

  longitudinalSlipStiffness: number;
  lateralSlipStiffness: number;

  axleBendingCapacity: number;
  bearingDrag: number;
  seizureThreshold: number;
};

export type WeaponActuatorProfile = {
  actuatorKind: 'rotary' | 'limited-angle';
  inertia: number;
  motorTorque: number;
  passiveDrag: number;
  maximumAngularVelocity: number;
  energyCapacity?: number;
  recoverySeconds?: number;
  shaftBendingCapacity: number;
  imbalanceSensitivity: number;
  jamThreshold: number;
};

export type RuntimeWheelState = {
  partInstanceId: string;
  angularVelocity: number;
  angle: number;
  torque: number;
  slip: [number, number];
  wobbleAngle: number;
  seized: boolean;
  detached: boolean;
};

export type RuntimeWeaponState = {
  partInstanceId: string;
  angularVelocity: number;
  angle: number;
  storedKineticEnergy: number;
  jammed: boolean;
  seized: boolean;
  detached: boolean;
};

export type BoundedEventIdentitySet = Set<string>;

export type CombatLedgerEvent =
  | { type: 'impact', eventId: string, tick: number, partInstanceId: string, energy: number, impulse: number }
  | { type: 'yielded', eventId: string, tick: number, jointId: string, demandRatio: number, msg: string }
  | { type: 'degradation', eventId: string, tick: number, partInstanceId: string, capabilityType: string, change: string }
  | { type: 'jammed', eventId: string, tick: number, partInstanceId: string }
  | { type: 'joint_failed', eventId: string, tick: number, jointId: string }
  | { type: 'detached', eventId: string, tick: number, partInstanceId: string }
  | { type: 'knockout', eventId: string, tick: number, reason: string };

export type CombatEventLedger = CombatLedgerEvent[];

export type RuntimeStructuralEdge = {
  edgeIndex: number;
  jointId: string;

  parentNodeIndex: number;
  childNodeIndex: number;

  kind: JointBuildDescriptor['kind'];

  anchorWorld: Vec3;
  loadAxisWorld: Vec3;

  capacity: StructuralCapacityProfile;

  fatigue: number;
  permanentSet: number;
  complianceMultiplier: number;

  demandRatio: number;
  state: 'elastic' | 'yielded' | 'loose' | 'failing' | 'failed';
};

export type CombatMechanicalState = {
  botId: string;
  assemblyFingerprint: string;

  nodeCount: number;
  edgeCount: number;

  nodes: RuntimeMechanicalNode[];
  edges: RuntimeStructuralEdge[];
  wheels: RuntimeWheelState[];
  weapons: RuntimeWeaponState[];

  nodeIndexByInstanceId: Map<string, number>;
  edgeIndexByJointId: Map<string, number>;

  supportContacts: ResolvedGroundSupport[];
  centerOfMassLocal: Vec3;
  totalMass: number;
  inertiaEstimate: Vec3;

  processedImpactEvents: BoundedEventIdentitySet;
  eventLedger: CombatEventLedger;

  simulationTick: number;
  active: boolean;
};

export type ImpactLoadPacket = {
  eventId: string;
  sequence: number;
  simulationTick: number;

  sourceBotId?: string;
  targetBotId: string;
  struckPartInstanceId: string;

  worldContactPoint: Vec3;
  worldContactNormal: Vec3;
  linearImpulseWorld: Vec3;

  normalEnergy: number;
  tangentialEnergy: number;
  localAbsorbedEnergy: number;
  transferableEnergy: number;

  obliquityRadians: number;
  overmatchRatio: number;
  fatigueSusceptibility: number;
};

export type CollisionImpulseAuthority =
  | 'physics-engine'
  | 'custom-resolved';

