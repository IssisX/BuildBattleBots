const fs = require('fs');
let store = fs.readFileSync('src/store.ts', 'utf8');

store = store.replace('initDamageComponents: () => void;', 'initDamageComponents: () => void;\n  processImpactEvent: (event: ImpactEvent | null) => void;');

store = store.replace('initDamageComponents: () => set', `processImpactEvent: (event) => {
    if (!event) return;
    set((state) => {
      const components = event.defenderId === 'player' ? { ...state.playerDamageComponents } : { ...state.opponentDamageComponents };
      
      // Nearest zone resolution (simplified logic for now - typically based on contact point relative to bot origin)
      let hitZone = 'core';
      if (Math.abs(event.contactPoint[0]) > Math.abs(event.contactPoint[2])) {
        hitZone = event.contactPoint[0] > 0 ? 'right' : 'left';
      } else {
        hitZone = event.contactPoint[2] > 0 ? 'front' : 'rear';
      }
      if (event.contactPoint[1] > 0.5) hitZone = 'top';

      const comp = components[hitZone];
      if (comp) {
         components[hitZone] = { ...comp, visualState: comp.visualState }; // shallow copy to trigger re-render if needed
      }
      
      // Update overall health based on damage amount (backward compatibility)
      if (event.damageAmount > 0) {
        setTimeout(() => get().damageBot(event.defenderId as any, event.damageAmount), 0);
      }

      return event.defenderId === 'player' ? { playerDamageComponents: components } : { opponentDamageComponents: components };
    });
  },
  initDamageComponents: () => set`);

fs.writeFileSync('src/store.ts', store);
