import fs from 'fs';
let code = fs.readFileSync('src/components/Arena3D.tsx', 'utf8');

const botInstanceEffect = `
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

if (!code.includes('globalDeformation.registerMesh')) {
  code = code.replace(/const visualRootRef = useRef<THREE\.Group>\(null\);/, `const visualRootRef = useRef<THREE.Group>(null);\n${botInstanceEffect}`);
}

fs.writeFileSync('src/components/Arena3D.tsx', code);
