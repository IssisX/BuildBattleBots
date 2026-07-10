import { HybridArmorPanelProfile } from "../combat/material/HybridArmorMaterial";
import { ModularPart, PartCollider, Transform3, ResolvedPartTransform, Vec3 } from '../types';

export interface PartTemplate {
  templateId: string;
  type: ModularPart['type'];
  label: string;
  shape: ModularPart['shape'];
  size: [number, number, number];
  color: string;
  mass: number;
  health: number;
  armor: number;
  damage: number;
  hybridProfile?: HybridArmorPanelProfile;
  connectionPoints: {
    id: string;
    x: number;
    y: number;
    z: number;
    socketType: "wheel" | "weapon" | "armor" | "any";
  }[];
  description: string;
  cost: number;
  visualKind?: string;
  colliders?: PartCollider[];
}

export const resolvePartTransforms = (parts: ModularPart[]): ResolvedPartTransform[] => {
  const resolved: ResolvedPartTransform[] = [];
  const partMap = new Map<string, ModularPart>();
  parts.forEach(p => partMap.set(p.id, p));

  const resolvedMap = new Map<string, ResolvedPartTransform>();

  const resolve = (partId: string, depth: number): ResolvedPartTransform | null => {
    if (resolvedMap.has(partId)) return resolvedMap.get(partId)!;
    const part = partMap.get(partId);
    if (!part) return null;

    const local: Transform3 = {
      position: [...part.position] as [number, number, number],
      rotation: [...part.rotation] as [number, number, number],
    };

    if (!part.parentPartId) {
      const res: ResolvedPartTransform = {
        instanceId: part.id,
        definitionId: part.templateId,
        local,
        world: local,
        depth
      };
      resolvedMap.set(part.id, res);
      return res;
    }

    const parentRes = resolve(part.parentPartId, depth + 1);
    if (!parentRes) return null;

    // Use THREE to combine transforms
    const parentObj = new THREE.Object3D();
    parentObj.position.set(...parentRes.world.position);
    parentObj.rotation.set(...parentRes.world.rotation);

    const childObj = new THREE.Object3D();
    childObj.position.set(...local.position);
    childObj.rotation.set(...local.rotation);

    parentObj.add(childObj);
    parentObj.updateMatrixWorld(true);

    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    childObj.matrixWorld.decompose(worldPos, worldQuat, worldScale);
    const euler = new THREE.Euler().setFromQuaternion(worldQuat);

    const res: ResolvedPartTransform = {
      instanceId: part.id,
      definitionId: part.templateId,
      local,
      world: {
        position: [worldPos.x, worldPos.y, worldPos.z],
        rotation: [euler.x, euler.y, euler.z]
      },
      parentInstanceId: part.parentPartId,
      depth
    };
    resolvedMap.set(part.id, res);
    return res;
  };

  parts.forEach(p => {
    const res = resolve(p.id, 0);
    if (res) resolved.push(res);
  });

  return resolved;
};

export const PART_TEMPLATES: PartTemplate[] = [
  {
    templateId: "core_feather",
    type: "chassis",
    label: "Featherweight Core",
    shape: "box",
    size: [0.7, 0.25, 0.8],
    color: "#4a4a4a",
    mass: 20,
    health: 80,
    armor: 65,
    damage: 0,
    visualKind: 'box',
    colliders: [{ kind: 'box', localPosition: [0, 0, 0], localRotation: [0, 0, 0], dimensions: [0.7, 0.25, 0.8] }],
    connectionPoints: [
      { id: "front", x: 0, y: 0, z: -0.4, socketType: "weapon" },
      { id: "back", x: 0, y: 0, z: 0.4, socketType: "armor" },
      { id: "left", x: -0.35, y: 0, z: 0, socketType: "wheel" },
      { id: "right", x: 0.35, y: 0, z: 0, socketType: "wheel" },
      { id: "top", x: 0, y: 0.125, z: 0, socketType: "any" }
    ],
    description: "Ultra-light frame for speed and agility. Limited mounting points.",
    cost: 400
  },
  {
    templateId: "frame_bulkhead",
    type: "frame",
    label: "Reinforced Bulkhead",
    shape: "box",
    size: [0.8, 0.4, 0.2],
    color: "#5e5e5e",
    mass: 15,
    health: 120,
    armor: 90,
    damage: 0,
    visualKind: 'box',
    colliders: [{ kind: 'box', localPosition: [0, 0, 0], localRotation: [0, 0, 0], dimensions: [0.8, 0.4, 0.2] }],
    connectionPoints: [
      { id: "front", x: 0, y: 0, z: -0.1, socketType: "any" },
      { id: "back", x: 0, y: 0, z: 0.1, socketType: "any" },
      { id: "left", x: -0.4, y: 0, z: 0, socketType: "any" },
      { id: "right", x: 0.4, y: 0, z: 0, socketType: "any" }
    ],
    description: "Heavy solid structural beam. High integrity against frontal strikes.",
    cost: 150
  },
  {
    templateId: "wheel_omni",
    type: "wheel",
    label: "Mecanum Omni-Wheel",
    shape: "cylinder",
    size: [0.35, 0.35, 0.25],
    color: "#888",
    mass: 12,
    health: 60,
    armor: 40,
    damage: 0,
    visualKind: 'cylinder',
    colliders: [{ kind: 'cylinder', localPosition: [0, 0, 0], localRotation: [0, 0, Math.PI/2], dimensions: [0.25, 0.35, 0.35] }],
    connectionPoints: [],
    description: "Multi-directional roller wheel for unmatched strafing capability.",
    cost: 220
  },
  {
    templateId: "mount_angle",
    type: "mount",
    label: "45-Degree Angle Mount",
    shape: "wedge",
    size: [0.3, 0.3, 0.3],
    color: "#333",
    mass: 6,
    health: 70,
    armor: 60,
    damage: 0,
    visualKind: 'wedge',
    colliders: [{ kind: 'wedge', localPosition: [0, 0, 0], localRotation: [0, 0, 0], dimensions: [0.3, 0.3, 0.3] }],
    connectionPoints: [
      { id: "face", x: 0, y: 0.15, z: -0.15, socketType: "any" } // Approximation
    ],
    description: "Allows mounting parts at a 45 degree angle.",
    cost: 50
  },

  // CHASSIS CORES
  {
    templateId: "core_heavy",
    type: "chassis",
    label: "Titan Heavy Core",
    shape: "box",
    size: [1.3, 0.4, 1.5],
    color: "#2a2d32",
    mass: 65,
    health: 100,
    armor: 95,
    damage: 0,
    visualKind: 'box',
    colliders: [{ kind: 'box', localPosition: [0, 0, 0], localRotation: [0, 0, 0], dimensions: [1.3, 0.4, 1.5] }],
    connectionPoints: [
      { id: "left_wheel_f", x: -0.75, y: 0.0, z: -0.4, socketType: "wheel" },
      { id: "left_wheel_r", x: -0.75, y: 0.0, z: 0.4, socketType: "wheel" },
      { id: "right_wheel_f", x: 0.75, y: 0.0, z: -0.4, socketType: "wheel" },
      { id: "right_wheel_r", x: 0.75, y: 0.0, z: 0.4, socketType: "wheel" },
      { id: "front_weapon", x: 0.0, y: 0.0, z: -0.85, socketType: "weapon" },
      { id: "rear_armor", x: 0.0, y: 0.0, z: 0.85, socketType: "armor" },
      { id: "left_armor", x: -0.7, y: 0.1, z: 0.0, socketType: "armor" },
      { id: "right_armor", x: 0.7, y: 0.1, z: 0.0, socketType: "armor" }
    ],
    description: "Thick monocoque steel core. Heavy duty construction with 4 wheel mounts and extra structural mounts.",
    cost: 0
  },
  {
    templateId: "core_compact",
    type: "chassis",
    label: "Interceptor Core",
    shape: "box",
    size: [0.9, 0.3, 1.1],
    color: "#3a1a1a",
    mass: 35,
    health: 75,
    armor: 70,
    damage: 0,
    visualKind: 'box',
    colliders: [{ kind: 'box', localPosition: [0, 0, 0], localRotation: [0, 0, 0], dimensions: [0.9, 0.3, 1.1] }],
    connectionPoints: [
      { id: "left_wheel", x: -0.55, y: 0.0, z: 0.0, socketType: "wheel" },
      { id: "right_wheel", x: 0.55, y: 0.0, z: 0.0, socketType: "wheel" },
      { id: "front_weapon", x: 0.0, y: 0.0, z: -0.65, socketType: "weapon" },
      { id: "left_armor", x: -0.5, y: 0.0, z: -0.2, socketType: "armor" },
      { id: "right_armor", x: 0.5, y: 0.0, z: -0.2, socketType: "armor" }
    ],
    description: "Lightweight streamlined alloy core. Highly agile, supports 2-wheel setups and high acceleration.",
    cost: 200
  },

  // SECONDARY FRAMES
  {
    templateId: "frame_rail",
    type: "frame",
    label: "Reinforced Frame Rail",
    shape: "box",
    size: [0.2, 0.2, 0.8],
    color: "#444444",
    mass: 10,
    health: 60,
    armor: 60,
    damage: 0,
    visualKind: 'box',
    colliders: [{ kind: 'box', localPosition: [0, 0, 0], localRotation: [0, 0, 0], dimensions: [0.2, 0.2, 0.8] }],
    connectionPoints: [
      { id: "mount_top", x: 0, y: 0.15, z: 0, socketType: "any" },
      { id: "mount_front", x: 0, y: 0, z: -0.45, socketType: "any" }
    ],
    description: "Secondary frame rail for extending bot structure.",
    cost: 50
  },
  {
    templateId: "frame_standoff",
    type: "frame",
    label: "Connector Standoff",
    shape: "cylinder",
    size: [0.1, 0.1, 0.3],
    color: "#555555",
    mass: 3,
    health: 40,
    armor: 40,
    damage: 0,
    visualKind: 'cylinder',
    colliders: [{ kind: 'cylinder', localPosition: [0, 0, 0], localRotation: [0, 0, 0], dimensions: [0.1, 0.1, 0.3] }],
    connectionPoints: [
      { id: "end_mount", x: 0, y: 0, z: 0.15, socketType: "any" }
    ],
    description: "Short standoff connector to space out armor or weapons.",
    cost: 20
  },

  // WHEELS & AXLES
  {
    templateId: "wheel_all_terrain",
    type: "wheel",
    label: "AT Spiked Wheel",
    shape: "cylinder",
    size: [0.42, 0.42, 0.28], // width, radius/size
    color: "#1a1a1a",
    mass: 12,
    health: 80,
    armor: 50,
    damage: 0,
    visualKind: 'cylinder',
    colliders: [{ kind: 'cylinder', localPosition: [0, 0, 0], localRotation: [0, 0, Math.PI/2], dimensions: [0.28, 0.42, 0.42] }],
    connectionPoints: [],
    description: "Deep treaded off-road tire with high grip ratio and reinforced steel hub.",
    cost: 150
  },
  {
    templateId: "wheel_slick",
    type: "wheel",
    label: "Magnesium Slick",
    shape: "cylinder",
    size: [0.35, 0.35, 0.18],
    color: "#121212",
    mass: 6,
    health: 50,
    armor: 30,
    damage: 0,
    visualKind: 'cylinder',
    colliders: [{ kind: 'cylinder', localPosition: [0, 0, 0], localRotation: [0, 0, Math.PI/2], dimensions: [0.18, 0.35, 0.35] }],
    connectionPoints: [],
    description: "Low weight racing wheel. Maximum straight-line acceleration but slightly reduced grip.",
    cost: 100
  },
  {
    templateId: "axle_mount",
    type: "mount",
    label: "Extended Axle Mount",
    shape: "cylinder",
    size: [0.15, 0.15, 0.5],
    color: "#666",
    mass: 8,
    health: 60,
    armor: 50,
    damage: 0,
    visualKind: 'cylinder',
    colliders: [{ kind: 'cylinder', localPosition: [0, 0, 0], localRotation: [0, 0, Math.PI/2], dimensions: [0.5, 0.15, 0.15] }],
    connectionPoints: [
      { id: "wheel_mount", x: 0.25, y: 0, z: 0, socketType: "wheel" }
    ],
    description: "Extends wheelbase for extra stability.",
    cost: 60
  },

  // WEAPONS
  {
    templateId: "weapon_spinner",
    type: "weapon",
    label: "Vertical Spinner Disk",
    shape: "cylinder",
    size: [0.34, 0.34, 0.08],
    color: "#e65100",
    mass: 25,
    health: 90,
    armor: 80,
    damage: 85,
    visualKind: 'cylinder',
    colliders: [{ kind: 'cylinder', localPosition: [0, 0, 0], localRotation: [0, 0, Math.PI/2], dimensions: [0.08, 0.34, 0.34] }],
    connectionPoints: [],
    description: "High-inertia vertical rotating disc. Delivers massive kinetic shockwaves upon direct contact.",
    cost: 300
  },
  {
    templateId: "weapon_drum",
    type: "weapon",
    label: "High-RPM Heavy Drum",
    shape: "cylinder",
    size: [0.34, 0.34, 0.9],
    color: "#d32f2f",
    mass: 28,
    health: 90,
    armor: 85,
    damage: 75,
    visualKind: 'cylinder',
    colliders: [{ kind: 'cylinder', localPosition: [0, 0, 0], localRotation: [0, 0, Math.PI/2], dimensions: [0.9, 0.34, 0.34] }],
    connectionPoints: [],
    description: "Ultra-heavy drum spinner. Direct energy transfer that launches bots vertically.",
    cost: 280
  },
  {
    templateId: "mount_spinner_mast",
    type: "mount",
    label: "Spinner Mast",
    shape: "box",
    size: [0.2, 0.6, 0.4],
    color: "#333",
    mass: 12,
    health: 80,
    armor: 70,
    damage: 0,
    visualKind: 'box',
    colliders: [{ kind: 'box', localPosition: [0, 0, 0], localRotation: [0, 0, 0], dimensions: [0.2, 0.6, 0.4] }],
    connectionPoints: [
      { id: "weapon_mount", x: 0, y: 0.25, z: -0.2, socketType: "weapon" }
    ],
    description: "Mast for mounting vertical spinners high up.",
    cost: 80
  },
  {
    templateId: "weapon_flipper",
    type: "weapon",
    label: "Pneumatic Flipper",
    shape: "wedge",
    size: [1.1, 0.15, 0.8],
    color: "#1976d2",
    mass: 20,
    health: 85,
    armor: 85,
    damage: 45,
    visualKind: 'wedge',
    colliders: [{ kind: 'wedge', localPosition: [0, 0, 0], localRotation: [0, 0, 0], dimensions: [1.1, 0.15, 0.8] }],
    connectionPoints: [],
    description: "High pressure nitrogen-powered flipper. Overturns and launches enemy bots.",
    cost: 250
  },
  {
    templateId: "weapon_hammer",
    type: "weapon",
    label: "Kinetic Sledgehammer",
    shape: "box",
    size: [0.3, 0.3, 0.4],
    color: "#fbc02d",
    mass: 30,
    health: 95,
    armor: 90,
    damage: 95,
    visualKind: 'box',
    colliders: [{ kind: 'box', localPosition: [0, 0, 0], localRotation: [0, 0, 0], dimensions: [0.3, 0.3, 0.4] }],
    connectionPoints: [],
    description: "Overhead mechanical drop-hammer. Devastating top-down structural compression hits.",
    cost: 350
  },
  {
    templateId: "weapon_pickaxe",
    type: "weapon",
    label: "Tungsten Pickaxe",
    shape: "box",
    size: [0.15, 0.4, 0.6],
    color: "#e0e0e0",
    mass: 25,
    health: 80,
    armor: 95,
    damage: 120,
    visualKind: 'box',
    colliders: [{ kind: 'box', localPosition: [0, 0, 0], localRotation: [0, 0, 0], dimensions: [0.15, 0.4, 0.6] }],
    connectionPoints: [],
    description: "Sharp concentrated point that punctures thick top armor.",
    cost: 380
  },
  {
    templateId: "mount_hammer_arm",
    type: "mount",
    label: "Hydraulic Hammer Arm",
    shape: "box",
    size: [0.2, 0.8, 0.2],
    color: "#222222",
    mass: 15,
    health: 85,
    armor: 80,
    damage: 0,
    visualKind: 'box',
    colliders: [{ kind: 'box', localPosition: [0, 0, 0], localRotation: [0, 0, 0], dimensions: [0.2, 0.8, 0.2] }],
    connectionPoints: [
      { id: "weapon_mount", x: 0, y: 0.35, z: 0.1, socketType: "weapon" }
    ],
    description: "Extended reaching arm for mounting overhead smash weapons.",
    cost: 150
  },
  {
    templateId: "armor_spike",
    type: "armor",
    label: "Ramming Spike",
    shape: "cylinder",
    size: [0.1, 0.1, 0.5],
    color: "#aaaaaa",
    mass: 8,
    health: 60,
    armor: 85,
    damage: 15,
    visualKind: 'cylinder',
    colliders: [{ kind: 'cylinder', localPosition: [0, 0, 0], localRotation: [Math.PI/2, 0, 0], dimensions: [0.1, 0.1, 0.5] }],
    connectionPoints: [],
    description: "Frontal combat spike designed to spear into opponents during rams.",
    cost: 80
  },
  {
    templateId: "armor_ablative",
    type: "armor",
    label: "Ablative Ceramic Plate",
    shape: "box",
    size: [0.8, 0.1, 0.4],
    color: "#ffffff",
    mass: 10,
    health: 150,
    armor: 30,
    damage: 0,
    visualKind: 'box',
    colliders: [{ kind: 'box', localPosition: [0, 0, 0], localRotation: [0, 0, 0], dimensions: [0.8, 0.1, 0.4] }],
    connectionPoints: [],
    description: "Sacrificial armor that absorbs massive kinetic shockwaves by shattering layer by layer.",
    cost: 120
  },
  {
    templateId: "wheel_tread",
    type: "wheel",
    label: "Continuous Track",
    shape: "box",
    size: [0.2, 0.3, 0.9],
    color: "#111111",
    mass: 30,
    health: 120,
    armor: 90,
    damage: 0,
    visualKind: 'box',
    colliders: [{ kind: 'box', localPosition: [0, 0, 0], localRotation: [0, 0, 0], dimensions: [0.2, 0.3, 0.9] }],
    connectionPoints: [],
    description: "Heavy tank treads with immense pushing power but low top speed.",
    cost: 250
  },
  {
    templateId: "core_behemoth",
    type: "chassis",
    label: "Behemoth Core",
    shape: "box",
    size: [1.6, 0.4, 1.8],
    color: "#1c1c1c",
    mass: 85,
    health: 140,
    armor: 100,
    damage: 0,
    visualKind: 'box',
    colliders: [{ kind: 'box', localPosition: [0, 0, 0], localRotation: [0, 0, 0], dimensions: [1.6, 0.4, 1.8] }],
    connectionPoints: [
      { id: "left_wheel_1", x: -0.9, y: 0.0, z: -0.6, socketType: "wheel" },
      { id: "left_wheel_2", x: -0.9, y: 0.0, z: 0.0, socketType: "wheel" },
      { id: "left_wheel_3", x: -0.9, y: 0.0, z: 0.6, socketType: "wheel" },
      { id: "right_wheel_1", x: 0.9, y: 0.0, z: -0.6, socketType: "wheel" },
      { id: "right_wheel_2", x: 0.9, y: 0.0, z: 0.0, socketType: "wheel" },
      { id: "right_wheel_3", x: 0.9, y: 0.0, z: 0.6, socketType: "wheel" },
      { id: "front_weapon_1", x: -0.4, y: 0.0, z: -1.0, socketType: "weapon" },
      { id: "front_weapon_2", x: 0.4, y: 0.0, z: -1.0, socketType: "weapon" },
      { id: "rear_armor", x: 0.0, y: 0.0, z: 1.0, socketType: "armor" },
      { id: "top_mount", x: 0.0, y: 0.25, z: 0.0, socketType: "any" }
    ],
    description: "Massive 6-wheel chassis designed for overwhelming weight and pushing power.",
    cost: 500
  },
  // DEFENSE / WEDGES
  {
    templateId: "armor_wedge",
    type: "wedge",
    label: "Hardened Steel Wedge",
    shape: "wedge",
    size: [1.2, 0.25, 0.55],
    color: "#666666",
    mass: 15,
    health: 100,
    armor: 95,
    damage: 0,
    visualKind: 'wedge',
    colliders: [{ kind: 'wedge', localPosition: [0, 0, 0], localRotation: [0, 0, 0], dimensions: [1.2, 0.25, 0.55] }],
    connectionPoints: [],
    description: "Low-ground clearance front wedge. Redirects spinning weapons and scoops up opponents.",
    cost: 100
  },
  {
    templateId: "armor_panel",
    type: "armor",
    hybridProfile: {
      kind: "hybridCompositeDuctileArmor",
      totalThickness: 0.05,
      compositeFace: {
        density: 1600,
        thickness: 0.02,
        fiberAngleRadians: 0,
        E1: 135e9, E2: 10e9, G12: 5e9, nu12: 0.3,
        Xt: 1500e6, Xc: 1200e6, Yt: 50e6, Yc: 250e6, S12: 100e6,
        GIc: 1000, GIIc: 2000, mixedModeExponent: 1.5,
        fiberDamageFloor: 0.1, matrixDamageFloor: 0.01, shearDamageFloor: 0.05,
        fatigueStart: 0.2, fatigueExponent: 2, fatigueAmplification: 1.5,
        bendingComplianceParallel: 0.001, bendingComplianceTransverse: 0.01
      },
      ductileBacking: {
        material: "Steel",
        density: 7850,
        thickness: 0.03,
        youngsModulus: 200e9, poissonRatio: 0.29,
        yieldStress: 500e6, hardeningModulus: 2e9, ductilityLimit: 0.15,
        bendingYieldMomentScale: 1.0, bendingHardeningScale: 1.0,
        fractureEnergyPerArea: 50000,
        fatigueStart: 0.5, fatigueExponent: 1.5, fatigueAmplification: 2.0
      },
      interface: {
        normalCohesiveStiffness: 1e12, shearCohesiveStiffness: 1e12,
        normalStrength: 60e6, shearStrength: 60e6,
        modeIFractureEnergy: 1000, modeIIFractureEnergy: 2000, mixedModeExponent: 1.5,
        fatigueStart: 0.3, fatigueExponent: 2.0, fatigueAmplification: 1.5
      },
      visualDamage: {
        intactRoughness: 0.2, damagedRoughness: 0.8,
        fiberExposureColor: "#d3d3d3", matrixCrackColor: "#1a1a1a", exposedBackingColor: "#a0a0a0",
        heatTintEnergyDensityThreshold: 1e6
      }
    },
    label: "Composite Side Panel",
    shape: "box",
    size: [0.1, 0.38, 1.2],
    color: "#222222",
    mass: 8,
    health: 80,
    armor: 80,
    damage: 0,
    visualKind: 'box',
    colliders: [{ kind: 'box', localPosition: [0, 0, 0], localRotation: [0, 0, 0], dimensions: [0.1, 0.38, 1.2] }],
    connectionPoints: [],
    description: "Carbon-Kevlar composite side skirt. Adds robust kinetic deflection at low extra weight.",
    cost: 80
  },
  {
    templateId: "armor_bumper",
    type: "armor",
    label: "Shock Bumper",
    shape: "capsule",
    size: [1.0, 0.2, 0.2],
    color: "#333",
    mass: 12,
    health: 120,
    armor: 95,
    damage: 0,
    visualKind: 'capsule',
    colliders: [{ kind: 'capsule', localPosition: [0, 0, 0], localRotation: [0, 0, Math.PI/2], dimensions: [1.0, 0.2, 0.2] }],
    connectionPoints: [],
    description: "Absorbs direct kinetic impacts with elastomer suspension.",
    cost: 90
  },
  {
    templateId: "armor_slope",
    type: "wedge",
    label: "Sloped Deflector",
    shape: "wedge",
    size: [0.4, 0.4, 0.8],
    color: "#555",
    mass: 10,
    health: 85,
    armor: 80,
    damage: 0,
    visualKind: 'slope',
    colliders: [{ kind: 'wedge', localPosition: [0, 0, 0], localRotation: [0, 0, 0], dimensions: [0.4, 0.4, 0.8] }],
    connectionPoints: [],
    description: "Angled armor block to deflect horizontal strikes upwards.",
    cost: 70
  }
];

export const generatePartFromTemplate = (template: PartTemplate, partId: string): ModularPart => {
  return {
    id: partId,
    templateId: template.templateId,
    type: template.type,
    label: template.label,
    shape: template.shape,
    size: template.size,
    color: template.color,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    mass: template.mass,
    health: template.health,
    armor: template.armor,
    damage: template.damage,
    visualKind: template.visualKind,
    colliders: template.colliders,
    connectionPoints: template.connectionPoints.map(cp => ({
      ...cp,
      occupiedById: undefined
    }))
  };
};

import { PlacedBotPart, CustomBotConfig } from '../types';


import { finalizeAssemblyPlan } from './assembly';
import * as THREE from 'three';

export const resolvePartTransformsV2 = (parts: PlacedBotPart[], rootPartId: string): ResolvedPartTransform[] => {
  const mockConfig: CustomBotConfig = { id: 'tmp', name: 'tmp', schemaVersion: 1, rootPartId, parts, createdAt: 0, updatedAt: 0 };
  const plan = finalizeAssemblyPlan(mockConfig);
  return plan.nodes.map(n => {
    const q = new THREE.Quaternion(n.worldTransform.rotation[0], n.worldTransform.rotation[1], n.worldTransform.rotation[2], n.worldTransform.rotation[3]);
    const e = new THREE.Euler().setFromQuaternion(q);
    return {
      instanceId: n.instanceId,
      definitionId: n.definitionId,
      local: { position: n.localPosition, rotation: n.localRotation },
      world: { position: n.worldTransform.position, rotation: [e.x, e.y, e.z] },
      parentInstanceId: n.parentInstanceId,
      depth: 0
    };
  });
};

