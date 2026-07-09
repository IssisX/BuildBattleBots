import sys
content = open('src/components/Arena3D.tsx').read()
target = """               const targetComp = components[hitZone];
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
               
               if (damageEvent) damageEvent.damageAmount = baseDamage;
               useGameStore.getState().processImpactEvent(damageEvent);"""
replace = """               const targetComp = components[hitZone];
               const wasDetached = targetComp?.detached;
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
               
               if (targetComp && !wasDetached && targetComp.detached) {
                 useGameStore.getState().addLog(`${isPlayer ? 'Opponent' : 'Player'} ${hitZone} component DESTROYED!`, 'critical');
                 useGameStore.getState().spawnSparks([contactPoint[0], contactPoint[1] + 0.2, contactPoint[2]], 40, '#FF3300');
                 useGameStore.getState().spawnDebris([contactPoint[0], contactPoint[1] + 0.2, contactPoint[2]], 15);
               }
               
               if (damageEvent) damageEvent.damageAmount = baseDamage;
               useGameStore.getState().processImpactEvent(damageEvent);"""
if target in content:
    open('src/components/Arena3D.tsx', 'w').write(content.replace(target, replace))
    print('Replaced')
else:
    print('Not found')
