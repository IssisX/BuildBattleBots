import fs from 'fs';
let code = fs.readFileSync('src/components/Arena3D.tsx', 'utf8');

const replaceStr = `
               if (damageEvent) damageEvent.damageAmount = baseDamage;
               useGameStore.getState().processImpactEvent(damageEvent);
               if (damageEvent && damageEvent.dentRequest) {
                 window.dispatchEvent(new CustomEvent('dent-request', { detail: damageEvent.dentRequest }));
               }
`;

code = code.replace(/if \(damageEvent\) damageEvent\.damageAmount = baseDamage;\s*useGameStore\.getState\(\)\.processImpactEvent\(damageEvent\);/, replaceStr);
fs.writeFileSync('src/components/Arena3D.tsx', code);
