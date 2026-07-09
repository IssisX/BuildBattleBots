const fs = require('fs');
let arena = fs.readFileSync('src/components/Arena3D.tsx', 'utf8');

arena = arena.replace("import { create } from 'zustand';", "import { create } from 'zustand';\nimport { DamageSystem } from '../combat/DamageSystem';");

arena = arena.replace(
"               let baseDamage = energyDmgScale * dmgMult * glancingMult * settings.collisionBrutality * 0.1;\n               baseDamage = Math.min(baseDamage, 8);\n               \n               const event: ImpactEvent = {",
`               let baseDamage = energyDmgScale * dmgMult * glancingMult * settings.collisionBrutality * 0.1;
               baseDamage = Math.min(baseDamage, 8);
               
               const components = otherId === 'player' ? useGameStore.getState().playerDamageComponents : useGameStore.getState().opponentDamageComponents;
               let hitZone = 'core';
               if (Math.abs(contactPoint[0]) > Math.abs(contactPoint[2])) {
                 hitZone = contactPoint[0] > 0 ? 'right' : 'left';
               } else {
                 hitZone = contactPoint[2] > 0 ? 'front' : 'rear';
               }
               if (contactPoint[1] > 0.5) hitZone = 'top';
               const targetComp = components[hitZone];

               const damageEvent = DamageSystem.processImpact(
                 now,
                 myId,
                 otherId,
                 normalVelocity,
                 tangentialVelocity,
                 impulse,
                 contactPoint,
                 normal,
                 [0, 0, 0], // tangent estimation
                 className === 'weapon' ? 'weapon' : 'body',
                 targetComp
               );
               
               useGameStore.getState().processImpactEvent(damageEvent);

               const event = {`
);

fs.writeFileSync('src/components/Arena3D.tsx', arena);
