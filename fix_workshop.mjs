import fs from 'fs';
let code = fs.readFileSync('src/components/BuildABotWorkshop.tsx', 'utf8');

code = code.replace(/const \[showAutoBuild, setShowAutoBuild\] = useState\(false\);/, `const [showAutoBuild, setShowAutoBuild] = useState(false);\n  const [diagnosticsMode, setDiagnosticsMode] = useState(false);`);

fs.writeFileSync('src/components/BuildABotWorkshop.tsx', code);
