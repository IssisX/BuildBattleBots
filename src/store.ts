import { create } from 'zustand';
import { db, auth } from './lib/firebase.ts';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, serverTimestamp, writeBatch } from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

import { CustomBotConfig, BotPhysicsSummary } from './types';
import { validateCustomBot, computePhysicsSummary } from './lib/validation';
import { resolvePartTransformsV2 } from './lib/partsCatalog';

export const getInitialCustomBotConfig = (): CustomBotConfig => {
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('battlebot_custom_config_v2') : null;
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error("Failed to parse custom bot config", e);
  }

  // Fallback to basic schema
  return {
    id: 'custom_v2',
    name: 'Custom Gladiator',
    schemaVersion: 1,
    rootPartId: 'core_0',
    parts: [
      {
        instanceId: 'core_0',
        definitionId: 'core_heavy',
        localPosition: [0, 0, 0],
        localRotation: [0, 0, 0],
        color: '#2a2d32'
      }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
};

export const compileCustomBotStatsV2 = (config: CustomBotConfig): VehicleConfig => {
  const resolved = resolvePartTransformsV2(config.parts, config.rootPartId);
  const physics = computePhysicsSummary(config, resolved);

  return {
    id: config.id,
    name: config.name,
    weapon: { type: 'spinner', rpm: 5000, damage: 85 },
    armor: { type: 'steel', integrity: 100, weight: physics.totalMass },
    motor: { torque: 800, maxSpeed: 25 },
    isCustom: true,
    parts: config.parts as any, // So Arena3D recognizes it as custom
    customConfig: config,
    physicsSummary: physics
  };
};

import { VehicleConfig, BotState, WeaponType, ArmorType, TelemetryEvent, GameSettings, ModularPart, PlacedBotPart } from './types';

export interface SavedCustomBot {
  id: string;
  name: string;
  parts: PlacedBotPart[];
  rootPartId: string;
  createdAt: number;
  modularParts?: ModularPart[];
}

export interface CareerStats {
  wins: number;
  losses: number;
  battlesFought: number;
  totalCreditsEarned: number;
}

export interface MatchHistoryEntry {
  id: string;
  timestamp: number;
  playerBotName: string;
  opponentName: string;
  outcome: 'victory' | 'defeat';
  creditsEarned: number;
  playerHealthRemaining: number;
}

const getInitialCurrency = (): number => {
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('battlebot_currency') : null;
    return saved ? parseInt(saved, 10) : 1200;
  } catch (e) {
    return 1200;
  }
};

const getInitialUnlockedWeapons = (): WeaponType[] => {
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('battlebot_unlocked_weapons') : null;
    return saved ? JSON.parse(saved) : ['spinner', 'flipper'];
  } catch (e) {
    return ['spinner', 'flipper'];
  }
};

const getInitialSavedCustomBots = (): SavedCustomBot[] => {
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('battlebot_saved_custom_bots') : null;
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
};

const getInitialCareerStats = (): CareerStats => {
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('battlebot_career_stats') : null;
    return saved ? JSON.parse(saved) : { wins: 0, losses: 0, battlesFought: 0, totalCreditsEarned: 0 };
  } catch (e) {
    return { wins: 0, losses: 0, battlesFought: 0, totalCreditsEarned: 0 };
  }
};

const getInitialMatchHistory = (): MatchHistoryEntry[] => {
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('battlebot_match_history') : null;
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
};

export type CameraMode = 'free' | 'follow' | 'cinematic';
export type BattleStatus = 'menu' | 'countdown' | 'battle' | 'ended';

interface GameState {
  cameraMode: CameraMode;
  setCameraMode: (mode: CameraMode) => void;
  
  settings: GameSettings;
  updateSetting: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
  resetSettings: () => void;
  
  botConfig: VehicleConfig;
  setBotConfig: (config: VehicleConfig) => void;
  botState: BotState;
  setBotState: (state: BotState | ((prev: BotState) => BotState)) => void;

  opponentConfig: VehicleConfig;
  setOpponentConfig: (config: VehicleConfig) => void;
  opponentState: BotState;
  setOpponentState: (state: BotState | ((prev: BotState) => BotState)) => void;

  battleStatus: BattleStatus;
  setBattleStatus: (status: BattleStatus) => void;
  countdown: number;
  setCountdown: (val: number) => void;
  winner: 'player' | 'opponent' | null;
  setWinner: (winner: 'player' | 'opponent' | null) => void;

  logs: TelemetryEvent[];
  addLog: (message: string, type: TelemetryEvent['type']) => void;
  clearLogs: () => void;
  
  currency: number;
  addCurrency: (amount: number) => void;
  unlockedWeapons: WeaponType[];
  unlockWeapon: (weapon: WeaponType) => void;
  paintScheme: string;
  setPaintScheme: (color: string) => void;

  // Build-a-bot Custom builder state
  customBotParts: ModularPart[];
  customBotConfig: CustomBotConfig;
  physicsSummary?: BotPhysicsSummary;
  setCustomBotParts: (parts: ModularPart[] | ((prev: ModularPart[]) => ModularPart[])) => void;
  setCustomBotConfig: (config: CustomBotConfig | ((prev: CustomBotConfig) => CustomBotConfig)) => void;
  saveCustomBot: (name?: string) => void;

  // Persistance Hub additions
  savedCustomBots: SavedCustomBot[];
  careerStats: CareerStats;
  matchHistory: MatchHistoryEntry[];
  
  saveCurrentBotToGarage: (name: string) => void;
  loadBotFromGarage: (botId: string) => void;
  deleteBotFromGarage: (botId: string) => void;
  importFullBackup: (jsonString: string) => boolean;
  exportFullBackup: () => string;
  recordMatchOutcome: (outcome: 'victory' | 'defeat', creditsEarned: number, opponentName: string) => void;

  user: any | null;
  authToken: string | null;
  isSyncing: boolean;
  setUser: (user: any | null, authToken: string | null) => void;
  syncProfileData: () => Promise<void>;

  virtualInput: {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    analogX: number;
    analogY: number;
    action: boolean;
  };
  setVirtualInput: (input: Partial<{ forward: boolean; backward: boolean; left: boolean; right: boolean; analogX: number; analogY: number; action: boolean; }>) => void;

  startBattle: () => void;
  resetBattle: () => void;
  damageBot: (target: 'player' | 'opponent', amount: number) => void;
  
  debris: { id: string; position: [number, number, number]; velocity: [number, number, number]; timestamp: number }[];
  spawnDebris: (position: [number, number, number], amount: number, impactVector?: [number, number, number]) => void;

  sparks: { id: string; position: [number, number, number]; velocity: [number, number, number]; color: string; timestamp: number }[];
  cleanupEffects: () => void;
  spawnSparks: (position: [number, number, number], amount: number, color?: string) => void;
}

const INITIAL_BOT: BotState = {
  id: "PLAYER-1",
  name: "Neon Striker",
  health: 100,
  energy: 100,
  heat: 20,
  status: "nominal",
  weaponActive: false,
  position: [0, 0, 5],
  rotation: [0, 0, 0],
};

const INITIAL_OPPONENT: BotState = {
  id: "OPPONENT-A",
  name: "Apex Predator",
  health: 100,
  energy: 100,
  heat: 20,
  status: "nominal",
  weaponActive: true,
  position: [0, 0, -5],
  rotation: [0, Math.PI, 0]
};

const DEFAULT_CONFIG: VehicleConfig = {
  id: "PLAYER-1",
  name: "Neon Striker",
  weapon: {
    type: "spinner",
    rpm: 3500,
    damage: 60
  },
  armor: {
    type: "titanium",
    integrity: 90,
    weight: 120
  },
  motor: {
    torque: 450,
    maxSpeed: 25
  }
};

const OPPONENT_CONFIGS: VehicleConfig[] = [
  {
    id: "OPPONENT-A",
    name: "Apex Predator",
    weapon: { type: "saw", rpm: 5000, damage: 55 },
    armor: { type: "steel", integrity: 95, weight: 150 },
    motor: { torque: 500, maxSpeed: 18 }
  },
  {
    id: "OPPONENT-B",
    name: "Iron Juggernaut",
    weapon: { type: "hammer", rpm: 2000, damage: 85 },
    armor: { type: "steel", integrity: 100, weight: 200 },
    motor: { torque: 600, maxSpeed: 12 }
  },
  {
    id: "OPPONENT-C",
    name: "Flip Master",
    weapon: { type: "flipper", rpm: 1200, damage: 45 },
    armor: { type: "carbon-fiber", integrity: 80, weight: 100 },
    motor: { torque: 400, maxSpeed: 30 }
  },
  {
    id: "OPPONENT-D",
    name: "Drum Roller",
    weapon: { type: "drum", rpm: 4500, damage: 70 },
    armor: { type: "titanium", integrity: 90, weight: 140 },
    motor: { torque: 480, maxSpeed: 22 }
  },
  {
    id: "OPPONENT-E",
    name: "Crush Claw",
    weapon: { type: "crusher", rpm: 800, damage: 95 },
    armor: { type: "steel", integrity: 100, weight: 180 },
    motor: { torque: 550, maxSpeed: 15 }
  }
];

const DEFAULT_SETTINGS: GameSettings = {
  // Physics / Handling
  vehicleGrip: 1.0,
  driftFactor: 0.1,
  angularDamping: 5.0,
  collisionRestitution: 0.2,
  impactImpulseScale: 1.0,
  knockbackScale: 1.0,
  chassisMassScale: 1.0,
  maximumVelocity: 40.0,
  maximumAngularVelocity: 20.0,

  // Impact / Damage
  damageMultiplier: 1.0,
  collisionBrutality: 1.0,
  heavyHitThreshold: 50.0,
  glancingHitReduction: 0.5,
  impactFeedbackStrength: 1.0,
  reducedMotion: false,

  // Performance Safety
  maxActiveFragments: 30,
  debrisLifetime: 5.0,
  effectLifetime: 2.0,
  fragmentQuality: "medium",
  performanceMode: false
};

function getValidatedSettings(): GameSettings {
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('battlebot_settings') : null;
    if (!saved) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(saved);
    const validated = { ...DEFAULT_SETTINGS } as any;
    
    const validateNum = (key: keyof GameSettings, min: number, max: number) => {
      if (typeof parsed[key] === 'number' && !isNaN(parsed[key])) {
        validated[key] = Math.max(min, Math.min(max, parsed[key])) as any;
      }
    };

    validateNum('vehicleGrip', 0.5, 3.0);
    validateNum('driftFactor', 0.0, 1.0);
    validateNum('angularDamping', 1.0, 15.0);
    validateNum('collisionRestitution', 0.0, 1.0);
    validateNum('impactImpulseScale', 0.1, 5.0);
    validateNum('knockbackScale', 0.1, 3.0);
    validateNum('chassisMassScale', 0.5, 3.0);
    validateNum('maximumVelocity', 10.0, 100.0);
    validateNum('maximumAngularVelocity', 5.0, 50.0);

    validateNum('damageMultiplier', 0.1, 5.0);
    validateNum('collisionBrutality', 0.5, 3.0);
    validateNum('heavyHitThreshold', 10.0, 200.0);
    validateNum('glancingHitReduction', 0.1, 1.0);
    validateNum('impactFeedbackStrength', 0.0, 3.0);
    
    validateNum('maxActiveFragments', 5, 100);
    validateNum('debrisLifetime', 1.0, 15.0);
    validateNum('effectLifetime', 0.5, 5.0);
    
    if (typeof parsed.reducedMotion === 'boolean') {
      validated.reducedMotion = parsed.reducedMotion;
    }
    if (typeof parsed.performanceMode === 'boolean') {
      validated.performanceMode = parsed.performanceMode;
    }
    if (['low', 'medium', 'high'].includes(parsed.fragmentQuality)) {
      validated.fragmentQuality = parsed.fragmentQuality;
    }
    
    return validated;
  } catch (e) {
    console.error("Failed to parse settings, resetting to defaults", e);
    return { ...DEFAULT_SETTINGS };
  }
}

export const getInitialCustomBotParts = (): ModularPart[] => {
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('battlebot_custom_parts') : null;
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error("Failed to parse custom bot parts", e);
  }
  // Default starter bot configuration with Titan Heavy Core, AT Spiked Wheels, and Vertical Spinner Disk
  return [
    {
      id: "p_core",
      templateId: "core_heavy",
      type: "chassis",
      label: "Titan Heavy Core",
      shape: "box",
      size: [1.3, 0.4, 1.5],
      color: "#2a2d32",
      position: [0, 0.4, 0],
      rotation: [0, 0, 0],
      mass: 65,
      health: 100,
      armor: 95,
      damage: 0,
      visualKind: 'box',
      colliders: [{ kind: 'box', localPosition: [0, 0, 0], localRotation: [0, 0, 0], dimensions: [1.3, 0.4, 1.5] }],
      connectionPoints: [
        { id: "left_wheel_f", x: -0.75, y: 0.0, z: -0.4, socketType: "wheel", occupiedById: "p_lwheel" },
        { id: "left_wheel_r", x: -0.75, y: 0.0, z: 0.4, socketType: "wheel" },
        { id: "right_wheel_f", x: 0.75, y: 0.0, z: -0.4, socketType: "wheel", occupiedById: "p_rwheel" },
        { id: "right_wheel_r", x: 0.75, y: 0.0, z: 0.4, socketType: "wheel" },
        { id: "front_weapon", x: 0.0, y: 0.0, z: -0.85, socketType: "weapon", occupiedById: "p_weapon" },
        { id: "rear_armor", x: 0.0, y: 0.0, z: 0.85, socketType: "armor" },
        { id: "left_armor", x: -0.7, y: 0.1, z: 0.0, socketType: "armor" },
        { id: "right_armor", x: 0.7, y: 0.1, z: 0.0, socketType: "armor" }
      ]
    },
    {
      id: "p_lwheel",
      templateId: "wheel_all_terrain",
      type: "wheel",
      label: "AT Spiked Wheel (L)",
      shape: "cylinder",
      size: [0.42, 0.42, 0.28],
      color: "#1a1a1a",
      position: [-0.75, 0.0, -0.4],
      rotation: [0, 0, 0],
      mass: 12,
      health: 80,
      armor: 50,
      damage: 0,
      visualKind: 'cylinder',
      colliders: [{ kind: 'cylinder', localPosition: [0, 0, 0], localRotation: [0, 0, Math.PI/2], dimensions: [0.28, 0.42, 0.42] }],
      connectionPoints: [],
      parentPartId: "p_core",
      parentPointId: "left_wheel_f"
    },
    {
      id: "p_rwheel",
      templateId: "wheel_all_terrain",
      type: "wheel",
      label: "AT Spiked Wheel (R)",
      shape: "cylinder",
      size: [0.42, 0.42, 0.28],
      color: "#1a1a1a",
      position: [0.75, 0.0, -0.4],
      rotation: [0, 0, 0],
      mass: 12,
      health: 80,
      armor: 50,
      damage: 0,
      visualKind: 'cylinder',
      colliders: [{ kind: 'cylinder', localPosition: [0, 0, 0], localRotation: [0, 0, Math.PI/2], dimensions: [0.28, 0.42, 0.42] }],
      connectionPoints: [],
      parentPartId: "p_core",
      parentPointId: "right_wheel_f"
    },
    {
      id: "p_weapon",
      templateId: "weapon_spinner",
      type: "weapon",
      label: "Vertical Spinner Disk",
      shape: "cylinder",
      size: [0.85, 0.85, 0.08],
      color: "#e65100",
      position: [0.0, 0.0, -0.85],
      rotation: [0, 0, 0],
      mass: 25,
      health: 90,
      armor: 80,
      damage: 85,
      visualKind: 'cylinder',
      colliders: [{ kind: 'cylinder', localPosition: [0, 0, 0], localRotation: [0, 0, Math.PI/2], dimensions: [0.08, 0.85, 0.85] }],
      connectionPoints: [],
      parentPartId: "p_core",
      parentPointId: "front_weapon"
    }
  ];
};

export const compileCustomBotStats = (parts: ModularPart[], customName: string = "Custom Gladiator"): VehicleConfig => {
  let totalMass = 0;
  let maxWeaponDamage = 0;
  let primaryWeaponType: WeaponType = 'spinner';
  let totalArmor = 0;
  let partCount = parts.length;
  let wheelCount = 0;
  
  parts.forEach(p => {
    totalMass += p.mass;
    totalArmor += p.armor;
    if (p.type === 'weapon') {
      if (p.damage > maxWeaponDamage) {
        maxWeaponDamage = p.damage;
        if (p.templateId.includes('spinner')) primaryWeaponType = 'spinner';
        else if (p.templateId.includes('flipper')) primaryWeaponType = 'flipper';
        else if (p.templateId.includes('saw')) primaryWeaponType = 'saw';
        else if (p.templateId.includes('hammer')) primaryWeaponType = 'hammer';
        else if (p.templateId.includes('drum')) primaryWeaponType = 'drum';
        else if (p.templateId.includes('crusher')) primaryWeaponType = 'crusher';
      }
    }
    if (p.type === 'wheel') {
      wheelCount++;
    }
  });

  const avgArmor = partCount > 0 ? totalArmor / partCount : 80;
  const maxSpeed = Math.max(10, Math.min(35, 40 - (totalMass * 0.1) + (wheelCount * 2)));
  const torque = Math.max(200, Math.min(1000, 300 + (totalMass * 3)));

  return {
    id: "PLAYER-CUSTOM",
    name: customName,
    isCustom: true,
    parts,
    weapon: {
      type: primaryWeaponType,
      rpm: primaryWeaponType === 'spinner' || primaryWeaponType === 'saw' ? 4500 : 1200,
      damage: maxWeaponDamage || 50
    },
    armor: {
      type: "titanium" as ArmorType,
      integrity: Math.round(avgArmor),
      weight: totalMass
    },
    motor: {
      torque,
      maxSpeed
    }
  };
};

export const useGameStore = create<GameState>((set, get) => ({
  cameraMode: 'follow',
  setCameraMode: (mode) => set({ cameraMode: mode }),
  
  settings: getValidatedSettings(),
  updateSetting: (key, value) => set((state) => {
    const updated = { ...state.settings, [key]: value };
    try {
      localStorage.setItem('battlebot_settings', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    return { settings: updated };
  }),
  resetSettings: () => set(() => {
    try {
      localStorage.setItem('battlebot_settings', JSON.stringify(DEFAULT_SETTINGS));
    } catch (e) {
      console.error(e);
    }
    get().addLog('⚙️ Settings reset to default values.', 'info');
    return { settings: { ...DEFAULT_SETTINGS } };
  }),
  
  botConfig: DEFAULT_CONFIG,
  setBotConfig: (config) => set((state) => ({ 
    botConfig: config,
    botState: { ...state.botState, name: config.name }
  })),

  botState: INITIAL_BOT,
  setBotState: (stateUpdate) => set((state) => ({
    botState: typeof stateUpdate === 'function' ? stateUpdate(state.botState) : stateUpdate
  })),

  opponentConfig: OPPONENT_CONFIGS[0],
  setOpponentConfig: (config) => set({ opponentConfig: config }),
  opponentState: INITIAL_OPPONENT,
  setOpponentState: (stateUpdate) => set((state) => ({
    opponentState: typeof stateUpdate === 'function' ? stateUpdate(state.opponentState) : stateUpdate
  })),

  battleStatus: 'menu',
  setBattleStatus: (status) => set({ battleStatus: status }),
  countdown: 3,
  setCountdown: (val) => set({ countdown: val }),
  winner: null,
  setWinner: (winner) => set({ winner }),

  logs: [
    { id: '1', timestamp: Date.now() - 3000, message: 'System diagnostics complete. Ready for selection.', type: 'info' }
  ],
  addLog: (message, type) => set((state) => ({
    logs: [...state.logs.slice(-29), { id: Math.random().toString(), timestamp: Date.now(), message, type }]
  })),
  clearLogs: () => set({ logs: [] }),

  currency: getInitialCurrency(),
  addCurrency: (amount) => set((state) => {
    const nextVal = Math.max(0, state.currency + amount);
    try {
      localStorage.setItem('battlebot_currency', nextVal.toString());
    } catch (e) {
      console.error(e);
    }
    return { currency: nextVal };
  }),
  unlockedWeapons: getInitialUnlockedWeapons(),
  unlockWeapon: (weapon) => set((state) => {
    const nextList = state.unlockedWeapons.includes(weapon) ? state.unlockedWeapons : [...state.unlockedWeapons, weapon];
    try {
      localStorage.setItem('battlebot_unlocked_weapons', JSON.stringify(nextList));
    } catch (e) {
      console.error(e);
    }
    return { unlockedWeapons: nextList };
  }),
  paintScheme: '#00E5FF',
  setPaintScheme: (color) => set({ paintScheme: color }),

  customBotParts: getInitialCustomBotParts(),
  customBotConfig: getInitialCustomBotConfig(),
  physicsSummary: undefined,

  setCustomBotConfig: (configUpdate) => set((state) => {
    const nextConfig = typeof configUpdate === 'function' ? configUpdate(state.customBotConfig) : configUpdate;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('battlebot_custom_config_v2', JSON.stringify(nextConfig));
      } catch (e) {}
    }
    
    // Update live physics summary
    const resolved = resolvePartTransformsV2(nextConfig.parts, nextConfig.rootPartId);
    const physics = computePhysicsSummary(nextConfig, resolved);

    return { customBotConfig: nextConfig, physicsSummary: physics };
  }),
  setCustomBotParts: (partsUpdate) => set((state) => {
    const nextParts = typeof partsUpdate === 'function' ? partsUpdate(state.customBotParts) : partsUpdate;
    try {
      localStorage.setItem('battlebot_custom_parts', JSON.stringify(nextParts));
    } catch (e) {
      console.error(e);
    }
    return { customBotParts: nextParts };
  }),
  saveCustomBot: (name) => {
    const config = get().customBotConfig;
    const botName = name || config.name || "Custom Gladiator";
    const newConfig = { ...config, name: botName };
    get().setCustomBotConfig(newConfig);
    const vehicleConfig = compileCustomBotStatsV2(newConfig);
    get().setBotConfig(vehicleConfig);
    get().addLog(`🔧 Custom Bot assembled: ${botName}! Stats compiled.`, 'info');
  },

  savedCustomBots: getInitialSavedCustomBots(),
  careerStats: getInitialCareerStats(),
  matchHistory: getInitialMatchHistory(),

  user: null,
  authToken: null,
  isSyncing: false,

  setUser: (user, authToken) => {
    set({ user, authToken });
    if (user && authToken) {
      get().syncProfileData();
    } else {
      set({
        savedCustomBots: getInitialSavedCustomBots(),
        careerStats: getInitialCareerStats(),
        matchHistory: getInitialMatchHistory()
      });
    }
  },

  syncProfileData: async () => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    set({ isSyncing: true });
    try {
      const userRef = doc(db, 'users', userId);
      try {
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
          await setDoc(userRef, {
            email: auth.currentUser?.email,
            createdAt: serverTimestamp()
          });
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, `users/${userId}`);
      }

      let careerStats = { wins: 0, losses: 0, battlesFought: 0, totalCreditsEarned: 0 };
      try {
        const statsDoc = await getDoc(doc(db, 'users', userId, 'careerStats', 'stats'));
        if (statsDoc.exists()) {
          careerStats = statsDoc.data() as CareerStats;
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, `users/${userId}/careerStats/stats`);
      }

      let savedCustomBots: SavedCustomBot[] = [];
      try {
        const botsSnapshot = await getDocs(collection(db, 'users', userId, 'savedBots'));
        botsSnapshot.forEach((doc) => {
          savedCustomBots.push(doc.data() as SavedCustomBot);
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, `users/${userId}/savedBots`);
      }

      let matchHistory: MatchHistoryEntry[] = [];
      try {
        const matchSnapshot = await getDocs(collection(db, 'users', userId, 'matchHistory'));
        matchSnapshot.forEach((doc) => {
          matchHistory.push(doc.data() as MatchHistoryEntry);
        });
        matchHistory.sort((a, b) => b.timestamp - a.timestamp);
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, `users/${userId}/matchHistory`);
      }

      set({
        savedCustomBots,
        careerStats,
        matchHistory
      });
      get().addLog('☁️ Sync complete: Loaded profile from Cloud Firestore.', 'info');
    } catch (e: any) {
      console.error('syncProfileData error:', e);
      get().addLog('⚠️ Cloud sync failed. Running in Local Offline mode.', 'warning');
    } finally {
      set({ isSyncing: false });
    }
  },

  saveCurrentBotToGarage: (name) => {
    const currentParts = get().customBotParts;
    const currentConfig = get().customBotConfig;
    const botName = name || currentConfig.name || "Custom Gladiator";
    
    const newBotSlot: SavedCustomBot = {
      id: 'bot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: botName,
      parts: currentConfig.parts,
      rootPartId: currentConfig.rootPartId,
      createdAt: Date.now(),
      modularParts: currentParts
    };

    set((state) => {
      const updatedSlots = [...state.savedCustomBots, newBotSlot];
      try {
        localStorage.setItem('battlebot_saved_custom_bots', JSON.stringify(updatedSlots));
      } catch (e) {
        console.error(e);
      }
      return { savedCustomBots: updatedSlots };
    });

    get().addLog(`💾 Custom Bot saved to slot: ${botName}`, 'info');

    const userId = auth.currentUser?.uid;
    if (userId) {
      const botPath = `users/${userId}/savedBots/${newBotSlot.id}`;
      setDoc(doc(db, 'users', userId, 'savedBots', newBotSlot.id), {
        userId,
        name: newBotSlot.name,
        parts: newBotSlot.parts,
        rootPartId: newBotSlot.rootPartId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }).catch(e => {
        try { handleFirestoreError(e, OperationType.CREATE, botPath); } catch {}
      });
    }
  },

  loadBotFromGarage: (botId) => {
    const bot = get().savedCustomBots.find(b => b.id === botId);
    if (!bot) return;

    const configV2: CustomBotConfig = {
      id: bot.id,
      name: bot.name,
      schemaVersion: 1,
      rootPartId: bot.rootPartId,
      parts: bot.parts,
      createdAt: bot.createdAt,
      updatedAt: Date.now()
    };
    
    set({
      customBotParts: bot.parts ? (bot.modularParts || []) : [],
      customBotConfig: configV2
    });

    if (bot.modularParts && bot.modularParts.length > 0) {
      try {
        localStorage.setItem('battlebot_custom_parts', JSON.stringify(bot.modularParts));
      } catch (e) {}
    }
    try {
      localStorage.setItem('battlebot_custom_config_v2', JSON.stringify(configV2));
    } catch (e) {}

    const compiled = compileCustomBotStatsV2(configV2);
    set({ botConfig: compiled });
    get().addLog(`🔌 Loaded custom BattleBot from Garage: ${bot.name}`, 'info');
  },

  deleteBotFromGarage: (botId) => {
    set((state) => {
      const updatedSlots = state.savedCustomBots.filter(b => b.id !== botId);
      try {
        localStorage.setItem('battlebot_saved_custom_bots', JSON.stringify(updatedSlots));
      } catch (e) {
        console.error(e);
      }
      return { savedCustomBots: updatedSlots };
    });
    get().addLog('❌ Custom Bot deleted from Garage.', 'info');

    const userId = auth.currentUser?.uid;
    if (userId) {
      const path = `users/${userId}/savedBots/${botId}`;
      deleteDoc(doc(db, 'users', userId, 'savedBots', botId)).catch(e => {
        try { handleFirestoreError(e, OperationType.DELETE, path); } catch {}
      });
    }
  },

  exportFullBackup: () => {
    const data = {
      currency: get().currency,
      unlockedWeapons: get().unlockedWeapons,
      savedCustomBots: get().savedCustomBots,
      careerStats: get().careerStats,
      matchHistory: get().matchHistory,
      paintScheme: get().paintScheme,
      settings: get().settings
    };
    return JSON.stringify(data, null, 2);
  },

  importFullBackup: (jsonString) => {
    try {
      const data = JSON.parse(jsonString);
      if (typeof data !== 'object' || data === null) return false;

      const newCurrency = typeof data.currency === 'number' ? data.currency : 1200;
      const newWeapons = Array.isArray(data.unlockedWeapons) ? data.unlockedWeapons : ['spinner', 'flipper'];
      const newBots = Array.isArray(data.savedCustomBots) ? data.savedCustomBots : [];
      const newStats = data.careerStats && typeof data.careerStats === 'object' ? data.careerStats : { wins: 0, losses: 0, battlesFought: 0, totalCreditsEarned: 0 };
      const newHistory = Array.isArray(data.matchHistory) ? data.matchHistory : [];
      const newPaint = typeof data.paintScheme === 'string' ? data.paintScheme : '#00E5FF';
      const newSettings = data.settings && typeof data.settings === 'object' ? data.settings : get().settings;

      localStorage.setItem('battlebot_currency', newCurrency.toString());
      localStorage.setItem('battlebot_unlocked_weapons', JSON.stringify(newWeapons));
      localStorage.setItem('battlebot_saved_custom_bots', JSON.stringify(newBots));
      localStorage.setItem('battlebot_career_stats', JSON.stringify(newStats));
      localStorage.setItem('battlebot_match_history', JSON.stringify(newHistory));
      localStorage.setItem('battlebot_paint_scheme', newPaint);
      localStorage.setItem('battlebot_settings', JSON.stringify(newSettings));

      set({
        currency: newCurrency,
        unlockedWeapons: newWeapons,
        savedCustomBots: newBots,
        careerStats: newStats,
        matchHistory: newHistory,
        paintScheme: newPaint,
        settings: newSettings
      });

      get().addLog('📦 Profile data backup successfully restored!', 'info');

      const userId = auth.currentUser?.uid;
      if (userId) {
        // Simple async update
        (async () => {
          try {
            const batch = writeBatch(db);
            batch.set(doc(db, 'users', userId, 'careerStats', 'stats'), {
              ...newStats,
              updatedAt: serverTimestamp()
            });
            for (const bot of newBots) {
              batch.set(doc(db, 'users', userId, 'savedBots', bot.id), {
                userId,
                name: bot.name,
                parts: bot.parts,
                rootPartId: bot.rootPartId,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });
            }
            for (const hist of newHistory) {
              batch.set(doc(db, 'users', userId, 'matchHistory', hist.id), {
                userId,
                timestamp: serverTimestamp(),
                playerBotName: hist.playerBotName,
                opponentName: hist.opponentName,
                outcome: hist.outcome,
                creditsEarned: hist.creditsEarned,
                playerHealthRemaining: hist.playerHealthRemaining
              });
            }
            await batch.commit();
            get().syncProfileData();
          } catch (e) {
            console.error('Cloud backup restore failed:', e);
          }
        })();
      }

      return true;
    } catch (e) {
      console.error("Backup import failed", e);
      return false;
    }
  },

  recordMatchOutcome: (outcome, creditsEarned, opponentName) => {
    const playerBotName = get().botConfig.name;
    const playerHealthRemaining = Math.max(0, Math.round(get().botState.health));
    
    const newEntry: MatchHistoryEntry = {
      id: 'match_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      timestamp: Date.now(),
      playerBotName,
      opponentName,
      outcome,
      creditsEarned,
      playerHealthRemaining
    };

    set((state) => {
      const nextStats = {
        wins: state.careerStats.wins + (outcome === 'victory' ? 1 : 0),
        losses: state.careerStats.losses + (outcome === 'defeat' ? 1 : 0),
        battlesFought: state.careerStats.battlesFought + 1,
        totalCreditsEarned: state.careerStats.totalCreditsEarned + creditsEarned
      };

      const nextHistory = [newEntry, ...state.matchHistory].slice(0, 50);

      try {
        localStorage.setItem('battlebot_career_stats', JSON.stringify(nextStats));
        localStorage.setItem('battlebot_match_history', JSON.stringify(nextHistory));
      } catch (e) {
        console.error(e);
      }

      return {
        careerStats: nextStats,
        matchHistory: nextHistory
      };
    });

    const userId = auth.currentUser?.uid;
    if (userId) {
      const matchPath = `users/${userId}/matchHistory/${newEntry.id}`;
      const statsPath = `users/${userId}/careerStats/stats`;
      
      (async () => {
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, 'users', userId, 'matchHistory', newEntry.id), {
            userId,
            timestamp: serverTimestamp(),
            playerBotName: newEntry.playerBotName,
            opponentName: newEntry.opponentName,
            outcome: newEntry.outcome,
            creditsEarned: newEntry.creditsEarned,
            playerHealthRemaining: newEntry.playerHealthRemaining
          });

          // Ensure parent doc exists before creating stats
          const userRef = doc(db, 'users', userId);
          const userDoc = await getDoc(userRef);
          if (!userDoc.exists()) {
             batch.set(userRef, { email: auth.currentUser?.email, createdAt: serverTimestamp() });
          }

          const statsRef = doc(db, 'users', userId, 'careerStats', 'stats');
          const statsDoc = await getDoc(statsRef);
          if (statsDoc.exists()) {
             batch.update(statsRef, {
               wins: get().careerStats.wins,
               losses: get().careerStats.losses,
               battlesFought: get().careerStats.battlesFought,
               totalCreditsEarned: get().careerStats.totalCreditsEarned,
               updatedAt: serverTimestamp()
             });
          } else {
             batch.set(statsRef, {
               wins: get().careerStats.wins,
               losses: get().careerStats.losses,
               battlesFought: get().careerStats.battlesFought,
               totalCreditsEarned: get().careerStats.totalCreditsEarned,
               updatedAt: serverTimestamp()
             });
          }
          await batch.commit();
        } catch (e) {
          try { handleFirestoreError(e, OperationType.CREATE, matchPath); } catch {}
        }
      })();
    }
  },

  virtualInput: {
    forward: false,
    backward: false,
    left: false,
    right: false,
    analogX: 0,
    analogY: 0,
    action: false,
  },
  setVirtualInput: (input) => set((state) => ({
    virtualInput: { ...state.virtualInput, ...input }
  })),

  startBattle: () => {
    // Select a random opponent configuration to fight
    const oppConfig = OPPONENT_CONFIGS[Math.floor(Math.random() * OPPONENT_CONFIGS.length)];
    
    set({
      battleStatus: 'countdown',
      countdown: 3,
      winner: null,
      botState: {
        ...INITIAL_BOT,
        name: get().botConfig.name,
        health: 100,
        energy: 100,
        heat: 20,
        status: "nominal",
        weaponActive: false,
        position: [0, 0, 8]
      },
      opponentConfig: oppConfig,
      opponentState: {
        ...INITIAL_OPPONENT,
        name: oppConfig.name,
        health: 100,
        energy: 100,
        heat: 20,
        status: "nominal",
        weaponActive: true,
        position: [0, 0, -8]
      }
    });

    get().clearLogs();
    get().addLog(`MATCHING INITIATED: ${get().botConfig.name} vs ${oppConfig.name}`, 'info');

    // Countdown interval
    const interval = setInterval(() => {
      const currentVal = get().countdown;
      if (currentVal > 1) {
        set({ countdown: currentVal - 1 });
        get().addLog(`T-minus ${currentVal - 1}...`, 'info');
      } else {
        clearInterval(interval);
        set({ battleStatus: 'battle' });
        get().addLog('🚨 ACTIVATE! FIGHT! 🚨', 'critical');
      }
    }, 1000);
  },

  resetBattle: () => {
    set({
      battleStatus: 'menu',
      winner: null,
      botState: { ...INITIAL_BOT, name: get().botConfig.name },
      opponentState: INITIAL_OPPONENT,
      debris: []
    });
    get().clearLogs();
    get().addLog('Battle simulator reset. Prepare your vehicle.', 'info');
  },

  debris: [],
  spawnDebris: (position, amount, impactVector) => {
    const settings = get().settings;
    
    const isPerf = settings.performanceMode;
    const maxDebris = settings.maxActiveFragments;

    const rawPieces = Math.min(Math.floor(amount / 3) + 2, 8) ;
    const numPieces = Math.max(1, Math.floor(rawPieces));
    const vx = impactVector ? impactVector[0] : 0;
    const vy = impactVector ? impactVector[1] : 0;
    const vz = impactVector ? impactVector[2] : 0;
    
    const newDebris = Array.from({ length: numPieces }).map((_, i) => {
      const angle = (i / numPieces) * Math.PI * 2;
      const spread = amount * 0.1 ;
      
      return {
        id: Math.random().toString() + i,
        position: [
          position[0] + Math.cos(angle) * 0.5,
          position[1] + 0.2 + (i * 0.1 % 0.5),
          position[2] + Math.sin(angle) * 0.5
        ] as [number, number, number],
        velocity: [
          vx * 0.5 + Math.cos(angle) * spread,
          Math.max(2, vy * 0.5 + spread),
          vz * 0.5 + Math.sin(angle) * spread
        ] as [number, number, number],
        timestamp: Date.now()
      };
    });
    
    set((state) => ({
      debris: [...state.debris, ...newDebris].slice(-maxDebris)
    }));
  },

  sparks: [],
  cleanupEffects: () => {
    const now = Date.now();
    const settings = get().settings;
    const { sparks, debris } = get();
    
    const newSparks = sparks.filter(s => now - s.timestamp < settings.effectLifetime * 1000);
    const newDebris = debris.filter(d => now - d.timestamp < settings.debrisLifetime * 1000);
    
    if (newSparks.length !== sparks.length || newDebris.length !== debris.length) {
      set({ sparks: newSparks, debris: newDebris });
    }
  },
  spawnSparks: (position, amount, color = "#FFAA00") => {
    const settings = get().settings;
    
    const isPerf = settings.performanceMode;
    const maxSparks = settings.maxActiveFragments;

    const numSparks = Math.min(amount, settings.maxActiveFragments);
    const newSparks = Array.from({ length: numSparks }).map((_, i) => ({
        id: Math.random().toString() + "s" + i,
        position: [position[0], position[1] + 0.5, position[2]] as [number, number, number],
        velocity: [
            (Math.random() - 0.5) * 20,
            Math.random() * 15 + 5,
            (Math.random() - 0.5) * 20
        ] as [number, number, number],
        color,
        timestamp: Date.now()
    }));
    set((state) => ({ sparks: [...state.sparks, ...newSparks].slice(-maxSparks) }));
  },

  damageBot: (target, amount) => {
    const settings = get().settings;
    const roundedAmount = Math.round(amount * settings.damageMultiplier);
    if (get().battleStatus !== 'battle') return;

    if (target === 'player') {
      const currentHealth = get().botState.health;
      const nextHealth = Math.max(0, currentHealth - roundedAmount);
      const isDestroyed = nextHealth <= 0;

      set((state) => ({
        botState: {
          ...state.botState,
          health: nextHealth,
          status: isDestroyed ? 'destroyed' : nextHealth < 30 ? 'critical' : nextHealth < 60 ? 'warning' : 'nominal'
        }
      }));

      get().addLog(`💥 CRITICAL CONTACT: Player took -${roundedAmount} DMG!`, 'critical');
      if (roundedAmount > 15) {
          get().addLog(`⚠️ SEVERE DAMAGE: Sparks flying from hull!`, 'critical');
      }

      if (isDestroyed) {
        get().recordMatchOutcome('defeat', 0, get().opponentConfig.name);
        set({ battleStatus: 'ended', winner: 'opponent' });
        get().addLog(`💀 SYSTEM FAILURE: Player bot has been totally neutralized!`, 'critical');
        get().addLog(`❌ MATCH LOST. Repair and upgrade your BattleBot.`, 'warning');
      }
    } else {
      const currentHealth = get().opponentState.health;
      const nextHealth = Math.max(0, currentHealth - roundedAmount);
      const isDestroyed = nextHealth <= 0;

      set((state) => ({
        opponentState: {
          ...state.opponentState,
          health: nextHealth,
          status: isDestroyed ? 'destroyed' : nextHealth < 30 ? 'critical' : nextHealth < 60 ? 'warning' : 'nominal'
        }
      }));

      get().addLog(`🔥 DIRECT HIT: Enemy ${get().opponentState.name} took -${roundedAmount} DMG!`, 'combat');
      if (roundedAmount > 15) {
          get().addLog(`⚡ SPARKS FLY! Devastating blow connects!`, 'combat');
      }

      // Reward player directly for successful hit!
      get().addCurrency(roundedAmount * 3);

      if (isDestroyed) {
        get().recordMatchOutcome('victory', 500, get().opponentConfig.name);
        set({ battleStatus: 'ended', winner: 'player' });
        get().addLog(`🏆 VICTORY: Enemy has been completely dismantled!`, 'combat');
        get().addLog(`💰 REWARD AWARDED: +500 CR for Arena Champion.`, 'info');
        get().addCurrency(500);
      }
    }
  }
}));

