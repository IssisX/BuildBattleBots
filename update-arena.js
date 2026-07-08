const fs = require('fs');

let content = fs.readFileSync('src/components/Arena3D.tsx', 'utf8');

// Replace settings that were removed
content = content.replace(/settings\.cameraShakeIntensity/g, 'settings.impactFeedbackStrength');
content = content.replace(/settings\.cameraFollowTightness/g, '0.3');
content = content.replace(/settings\.accelerationSensitivity/g, '1.0');
content = content.replace(/settings\.steeringSensitivity/g, '1.0');
content = content.replace(/settings\.opponentAggression/g, '1.0');
content = content.replace(/settings\.weaponCooldownMultiplier/g, '1.0');
content = content.replace(/settings\.weaponImpactForce/g, 'settings.impactImpulseScale');
content = content.replace(/settings\.recoilStrength/g, '1.0');
content = content.replace(/settings\.restitution/g, 'settings.collisionRestitution');

fs.writeFileSync('src/components/Arena3D.tsx', content);
