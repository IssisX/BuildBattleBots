import fs from 'fs';
let code = fs.readFileSync('src/components/Arena3D.tsx', 'utf8');

const importStr = `import { globalDeformation } from '../lib/deformation';`;
if (!code.includes('globalDeformation')) {
  code = code.replace(/import { DamageSystem } from "\.\.\/combat\/DamageSystem";/, `import { DamageSystem } from "../combat/DamageSystem";\n${importStr}`);
}

const dentListener = `
  useEffect(() => {
    const handleDent = (e: any) => {
      globalDeformation.applyDent(e.detail);
    };
    window.addEventListener('dent-request', handleDent);
    return () => window.removeEventListener('dent-request', handleDent);
  }, []);
`;
if (!code.includes('dent-request')) {
  code = code.replace(/const Scene = \(\) => \{/, `const Scene = () => {\n${dentListener}`);
}

const registerMesh = `
  const meshRef = useRef<THREE.Mesh>(null);
  useEffect(() => {
    if (meshRef.current) {
      // In this context we don't have botId easily, but we can assume 'player' or 'opponent' based on a prop or context.
      // But RoundedBoxMesh doesn't have it. We can walk up the parents or just pass it via context.
    }
  }, []);
`;
// Instead of messing with RoundedBoxMesh, we can just intercept after the whole bot is rendered.
// But React Three Fiber's <group ref> allows traversing children!
