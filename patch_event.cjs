const fs = require('fs');
let arena = fs.readFileSync('src/components/Arena3D.tsx', 'utf8');

arena = arena.replace(
/const event = \{\s+id: 'impact_' \+ now,[\s\S]*?confidence: 1.0\s+\};\s+if \(baseDamage > 2\.0\)/,
`const event = {
                 id: 'impact_' + now,
                 time: now,
                 className,
                 attackerId: myId,
                 defenderId: otherId,
                 contactPoint,
                 normal,
                 relativeVelocity: relSpeed,
                 normalVelocity,
                 tangentialVelocity,
                 impulse,
                 impactEnergy,
                 massRatio: myState.mass / oppState.mass,
                 materialA: 'steel', // Could be driven by actual part config in future
                 materialB: 'steel',
                 weaponSpin: useGameStore.getState().botState.weaponActive && config.weapon ? config.weapon.rpm : 0,
                 damageAmount: baseDamage,
                 confidence: 1.0
               } as any;
               if (baseDamage > 2.0)`
);

fs.writeFileSync('src/components/Arena3D.tsx', arena);
