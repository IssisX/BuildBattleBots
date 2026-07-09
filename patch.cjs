const fs = require('fs');
let store = fs.readFileSync('src/store.ts', 'utf8');

// Add imports
store = store.replace('import { create } from "zustand";', 'import { create } from "zustand";\nimport { DamageableComponent, ImpactEvent } from "./combat/DamageTypes";\nimport { DamageSystem } from "./combat/DamageSystem";');

// Add to GameState interface
store = store.replace('botState: BotState;', 'botState: BotState;\n  playerDamageComponents: Record<string, DamageableComponent>;\n  opponentDamageComponents: Record<string, DamageableComponent>;\n  initDamageComponents: () => void;\n  processImpactEvent: (event: ImpactEvent | null) => void;');

// Add implementation
store = store.replace('setBotState: (state) => set((prev)', `playerDamageComponents: {},
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
  },
  setBotState: (state) => set((prev)`);

// Add to resetBattle and startBattle
store = store.replace("get().addLog('Battle simulator reset. Prepare your vehicle.', 'info');", "get().initDamageComponents();\n    get().addLog('Battle simulator reset. Prepare your vehicle.', 'info');");
store = store.replace("get().addLog(`SYSTEM START: Arena lock engaged.`, 'info');", "get().initDamageComponents();\n    get().addLog(`SYSTEM START: Arena lock engaged.`, 'info');");

fs.writeFileSync('src/store.ts', store);
