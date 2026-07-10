const fs = require('fs');
const code = fs.readFileSync('src/components/Arena3D.tsx', 'utf8');

const target = `            if (partDef && partDef.colliders && partDef.colliders.length > 0) {
              return (
                <group key={tr.instanceId} position={tr.world.position} rotation={tr.world.rotation}>
                  {partDef.colliders.map((col, idx) => {
                    if (col.kind === 'box' || col.kind === 'wedge') {
                      return (
                        <CuboidCollider 
                          key={\`\${tr.instanceId}-\${idx}\`}
                          args={[col.dimensions[0] / 2, col.dimensions[1] / 2, col.dimensions[2] / 2]} 
                          position={col.localPosition} 
                          rotation={col.localRotation}
                          restitution={settings.collisionRestitution} friction={0.2} 
                        />
                      );
                    }
                    if (col.kind === 'cylinder') {
                      return (
                        <CylinderCollider 
                          key={\`\${tr.instanceId}-\${idx}\`}
                          args={[col.dimensions[0] / 2, col.dimensions[1]]} 
                          position={col.localPosition}
                          rotation={col.localRotation}
                          restitution={settings.collisionRestitution} friction={0.2} 
                        />
                      );
                    }
                    if (col.kind === 'capsule') {
                      return (
                        <CapsuleCollider 
                          key={\`\${tr.instanceId}-\${idx}\`}
                          args={[Math.max(0.01, col.dimensions[0] - col.dimensions[1]) / 2, col.dimensions[1] / 2]} 
                          position={col.localPosition}
                          rotation={col.localRotation}
                          restitution={settings.collisionRestitution} friction={0.2} 
                        />
                      );
                    }
                    return null;
                  })}
                </group>
              );
            }
            
            return null;`

const replacement = `            if (partDef && partDef.colliders && partDef.colliders.length > 0) {
              return (
                <group key={tr.instanceId} position={tr.world.position} rotation={tr.world.rotation}>
                  {partDef.colliders.map((col, idx) => {
                    if (col.kind === 'box' || col.kind === 'wedge') {
                      return (
                        <CuboidCollider 
                          key={\`\${tr.instanceId}-\${idx}\`}
                          args={[col.dimensions[0] / 2, col.dimensions[1] / 2, col.dimensions[2] / 2]} 
                          position={col.localPosition} 
                          rotation={col.localRotation}
                          restitution={settings.collisionRestitution} friction={0.2} 
                        />
                      );
                    }
                    if (col.kind === 'cylinder') {
                      return (
                        <CylinderCollider 
                          key={\`\${tr.instanceId}-\${idx}\`}
                          args={[col.dimensions[0] / 2, col.dimensions[1]]} 
                          position={col.localPosition}
                          rotation={col.localRotation}
                          restitution={settings.collisionRestitution} friction={0.2} 
                        />
                      );
                    }
                    if (col.kind === 'capsule') {
                      return (
                        <CapsuleCollider 
                          key={\`\${tr.instanceId}-\${idx}\`}
                          args={[Math.max(0.01, col.dimensions[0] - col.dimensions[1]) / 2, col.dimensions[1] / 2]} 
                          position={col.localPosition}
                          rotation={col.localRotation}
                          restitution={settings.collisionRestitution} friction={0.2} 
                        />
                      );
                    }
                    return null;
                  })}
                </group>
              );
            } else if (partDef) {
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
            
            return null;`

if(code.indexOf(target) !== -1) {
  fs.writeFileSync('src/components/Arena3D.tsx', code.replace(target, replacement));
  console.log('patched successfully');
} else {
  console.log('target not found');
}
