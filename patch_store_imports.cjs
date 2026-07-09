const fs = require('fs');
let store = fs.readFileSync('src/store.ts', 'utf8');

store = store.replace("import { create } from 'zustand';", "import { create } from 'zustand';\nimport { DamageableComponent, ImpactEvent } from './combat/DamageTypes';\nimport { DamageSystem } from './combat/DamageSystem';");

store = store.replace('export const useGameStore = create<GameState>()((set, get) => ({', `export const useGameStore = create<GameState>()((set, get) => ({
  playerDamageComponents: {},
  opponentDamageComponents: {},
  initDamageComponents: () => set((state) => ({
    playerDamageComponents: {
      front: DamageSystem.createDefaultComponent("front", "player", "Front Armor", "front"),
      left: DamageSystem.createDefaultComponent("left", "player", "Left Armor", "left"),
      right: DamageSystem.createDefaultComponent("right", "player", "Right Armor", "right"),
      rear: DamageSystem.createDefaultComponent("rear", "player", "Rear Armor", "rear"),
      top: DamageSystem.createDefaultComponent("top", "player", "Top Armor", "top"),
      core: DamageSystem.createDefaultComponent("core", "player", "Core Chassis", "core"),
    },
    opponentDamageComponents: {
      front: DamageSystem.createDefaultComponent("front", "opponent", "Front Armor", "front"),
      left: DamageSystem.createDefaultComponent("left", "opponent", "Left Armor", "left"),
      right: DamageSystem.createDefaultComponent("right", "opponent", "Right Armor", "right"),
      rear: DamageSystem.createDefaultComponent("rear", "opponent", "Rear Armor", "rear"),
      top: DamageSystem.createDefaultComponent("top", "opponent", "Top Armor", "top"),
      core: DamageSystem.createDefaultComponent("core", "opponent", "Core Chassis", "core"),
    }
  })),
  processImpactEvent: (event) => {
    if (!event) return;
    
    // Add marks and components logic here
    
    // Also do legacy damage bot updating
    if (event.damageAmount > 0) {
       setTimeout(() => get().damageBot(event.defenderId as any, event.damageAmount), 0);
    }
  },`);

fs.writeFileSync('src/store.ts', store);
