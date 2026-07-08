export const getCollisionReplacement = () => {
return `
            if (myId === 'player') {
               const myState = globalPhysicsState[myId];
               const oppState = globalPhysicsState[otherId];
               
               const relVel = new THREE.Vector3().subVectors(myState.vel, oppState.vel);
               const relSpeed = relVel.length();
               
               // Estimate contact point (midpoint)
               const contactPoint: [number, number, number] = [
                 (myState.pos.x + oppState.pos.x) / 2,
                 (myState.pos.y + oppState.pos.y) / 2,
                 (myState.pos.z + oppState.pos.z) / 2
               ];
               
               const normalVec = new THREE.Vector3().subVectors(oppState.pos, myState.pos).normalize();
               const normal: [number, number, number] = [normalVec.x, normalVec.y, normalVec.z];
               
               const normalVelocity = Math.abs(relVel.dot(normalVec));
               const tangentialVelocity = Math.sqrt(Math.max(0, relSpeed * relSpeed - normalVelocity * normalVelocity));
               
               const reducedMass = (myState.mass * oppState.mass) / (myState.mass + oppState.mass);
               const impactEnergy = 0.5 * reducedMass * relSpeed * relSpeed;
               const impulse = reducedMass * normalVelocity * (1 + settings.collisionRestitution);
               
               if (impactEnergy < 2) return; // Ignore very tiny bumps
               
               // Classify impact
               let className: ImpactClass = 'glancing';
               if (actualWeaponType !== 'none' && weaponActive) {
                 className = 'weapon';
               } else if (impactEnergy > settings.heavyHitThreshold) {
                 className = 'heavy';
               } else if (normalVelocity > tangentialVelocity * 1.5) {
                 className = 'direct';
               } else if (tangentialVelocity > 5) {
                 className = 'scrape';
               }
               
               // Calculate Damage
               const energyDmgScale = Math.min(impactEnergy * 0.05, 50);
               const dmgMult = settings.damageMultiplier;
               const glancingMult = className === 'direct' || className === 'heavy' || className === 'weapon' ? 1.0 : settings.glancingHitReduction;
               let baseDamage = energyDmgScale * dmgMult * glancingMult * settings.collisionBrutality;
               baseDamage = Math.min(baseDamage, 60);
               
               const event: ImpactEvent = {
                 id: "impact_" + now,
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
                 weaponSpin: weaponActive && config.weapon ? config.weapon.rpm : 0,
                 damageAmount: baseDamage,
                 confidence: 1.0
               };
               
               // Trigger Sound
               playImpactSound(event);
               
               // Apply artificial knockback based on event.impulse to accentuate the hit
               if (settings.knockbackScale !== 1.0) {
                 const knockbackMag = Math.min(event.impulse * 0.5 * settings.knockbackScale, 200); 
                 if (knockbackMag > 5) {
                   const oppToMyDir = new THREE.Vector3().subVectors(myState.vel, oppState.vel).normalize();
                   bodyRef.current?.applyImpulse(oppToMyDir.clone().multiplyScalar(knockbackMag), true);
                 }
               }
               
               if (baseDamage > 2) {
                 useGameStore.getState().damageBot('player', baseDamage * 0.5);
                 useGameStore.getState().damageBot('opponent', baseDamage * 0.5);
                 
                 // Spawn effects`;
}
