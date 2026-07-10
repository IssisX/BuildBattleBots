const fs = require('fs');
let code = fs.readFileSync('src/components/Arena3D.tsx', 'utf8');

const badString = `} else if (partDef) { const [w, h, d] = partDef.size || [0.5, 0.5, 0.5]; return <group key={tr.instanceId} position={tr.world.position} rotation={tr.world.rotation}>{partDef.visualKind === "cylinder" ? <CylinderCollider args={[d / 2, w / 2]} restitution={settings.collisionRestitution} friction={0.2} /> : <CuboidCollider args={[w / 2, h / 2, d / 2]} restitution={settings.collisionRestitution} friction={0.2} /></group>; } return null;`;

code = code.split(badString).join('return null;');

fs.writeFileSync('src/components/Arena3D.tsx', code);
