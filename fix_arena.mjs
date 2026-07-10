import fs from 'fs';
let code = fs.readFileSync('src/components/Arena3D.tsx', 'utf8');

if (!code.includes("import { globalDeformation }")) {
  code = code.replace(/import { DamageSystem } from "\.\.\/combat\/DamageSystem";/, `import { DamageSystem } from "../combat/DamageSystem";\nimport { globalDeformation } from '../lib/deformation';`);
}

// Move botInstanceEffect below resolvedParts
const effectCode = `
  useEffect(() => {
    if (visualRootRef.current) {
      visualRootRef.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          globalDeformation.registerMesh(isPlayer ? 'player' : 'opponent', child as THREE.Mesh);
        }
      });
    }
    return () => {
      globalDeformation.unregisterBot(isPlayer ? 'player' : 'opponent');
    };
  }, [isPlayer, resolvedParts]); // re-run if parts change
`;

// remove the existing effect
code = code.replace(/useEffect\(\(\) => \{\n\s*if \(visualRootRef\.current\) \{[\s\S]+?\}, \[isPlayer, resolvedParts\]\); \/\/ re-run if parts change/, '');

// insert it after resolvedParts
code = code.replace(/const getPartFalloffThreshold = \(instanceId: string, partType: string\) => \{/, `
${effectCode}
  const getPartFalloffThreshold = (instanceId: string, partType: string) => {`);

fs.writeFileSync('src/components/Arena3D.tsx', code);
