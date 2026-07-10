import fs from 'fs';
let code = fs.readFileSync('src/components/Arena3D.tsx', 'utf8');

const replacement = `
  useEffect(() => {
    const handleDent = (e: any) => {
      globalDeformation.applyDent(e.detail);
      useGameStore.getState().addLog(\`Dent request emitted for \${e.detail.partInstanceId}\`, 'warning');
      useGameStore.getState().addLog(\`Affected vertex displacement computed\`, 'info');
    };
    window.addEventListener('dent-request', handleDent);
    return () => window.removeEventListener('dent-request', handleDent);
  }, []);
`;

code = code.replace(/useEffect\(\(\) => \{\n\s*const handleDent = \(e: any\) => \{\n\s*globalDeformation\.applyDent\(e\.detail\);\n\s*\};\n\s*window\.addEventListener\('dent-request', handleDent\);\n\s*return \(\) => window\.removeEventListener\('dent-request', handleDent\);\n\s*\}, \[\]\);/, replacement);
fs.writeFileSync('src/components/Arena3D.tsx', code);
