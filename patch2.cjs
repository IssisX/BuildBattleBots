const fs = require('fs');
const lines = fs.readFileSync('src/components/Arena3D.tsx', 'utf8').split('\n');

const fallbackCode = `            } else if (partDef) {
               // Fallback collider based on part shape
               const [w, h, d] = partDef.size || [0.5, 0.5, 0.5];
               return (
                 <group key={tr.instanceId} position={tr.world.position} rotation={tr.world.rotation}>
                   {partDef.visualKind === 'cylinder' ? (
                     <CylinderCollider 
                       args={[d / 2, w / 2]} 
                       restitution={settings.collisionRestitution} friction={0.2} 
                     />
                   ) : (
                     <CuboidCollider 
                       args={[w / 2, h / 2, d / 2]} 
                       restitution={settings.collisionRestitution} friction={0.2} 
                     />
                   )}
                 </group>
               );
            }
            return null;`;

// Replace lines 2133 to 2135 which are:
//              );
//            }
//            
//            return null;

lines.splice(2132, 4, ...fallbackCode.split('\n'));
fs.writeFileSync('src/components/Arena3D.tsx', lines.join('\n'));
