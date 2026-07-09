const fs = require('fs');
let store = fs.readFileSync('src/store.ts', 'utf8');

// Add imports
store = store.replace('import { create } from "zustand";', 'import { create } from "zustand";\nimport { DamageableComponent, ImpactEvent } from "./combat/DamageTypes";\nimport { DamageSystem } from "./combat/DamageSystem";');

// Add to GameState interface
store = store.replace('botState: BotState;', 'botState: BotState;\n  playerDamageComponents: Record<string, DamageableComponent>;\n  opponentDamageComponents: Record<string, DamageableComponent>;\n  initDamageComponents: () => void;');

// Add implementation
store = store.replace('setBotState: (state) => set((prev)', 'playerDamageComponents: {},\n  opponentDamageComponents: {},\n  initDamageComponents: () => set((state) => ({\n    playerDamageComponents: {\n      front: DamageSystem.createDefaultComponent("front", "player", "Front Armor", "front"),\n      left: DamageSystem.createDefaultComponent("left", "player", "Left Armor", "left"),\n      right: DamageSystem.createDefaultComponent("right", "player", "Right Armor", "right"),\n      rear: DamageSystem.createDefaultComponent("rear", "player", "Rear Armor", "rear"),\n      top: DamageSystem.createDefaultComponent("top", "player", "Top Armor", "top"),\n      core: DamageSystem.createDefaultComponent("core", "player", "Core Chassis", "core"),\n    },\n    opponentDamageComponents: {\n      front: DamageSystem.createDefaultComponent("front", "opponent", "Front Armor", "front"),\n      left: DamageSystem.createDefaultComponent("left", "opponent", "Left Armor", "left"),\n      right: DamageSystem.createDefaultComponent("right", "opponent", "Right Armor", "right"),\n      rear: DamageSystem.createDefaultComponent("rear", "opponent", "Rear Armor", "rear"),\n      top: DamageSystem.createDefaultComponent("top", "opponent", "Top Armor", "top"),\n      core: DamageSystem.createDefaultComponent("core", "opponent", "Core Chassis", "core"),\n    }\n  })),\n  setBotState: (state) => set((prev)');

// Add to resetBattle and startBattle
store = store.replace('get().addLog(\'Battle simulator reset. Prepare your vehicle.\', \'info\');', 'get().initDamageComponents();\n    get().addLog(\'Battle simulator reset. Prepare your vehicle.\', \'info\');');
store = store.replace('get().addLog(`SYSTEM START: Arena lock engaged.`, \'info\');', 'get().initDamageComponents();\n    get().addLog(`SYSTEM START: Arena lock engaged.`, \'info\');');


fs.writeFileSync('src/store.ts', store);
