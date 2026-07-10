import fs from 'fs';
let code = fs.readFileSync('src/components/BuildABotWorkshop.tsx', 'utf8');

// Inject diagnostics state and UI
if (!code.includes('diagnosticsMode')) {
  code = code.replace(/const \[activePanel, setActivePanel\] = useState<'chassis' \| 'locomotion' \| 'weapon' \| 'armor'>\('chassis'\);/, `const [activePanel, setActivePanel] = useState<'chassis' | 'locomotion' | 'weapon' | 'armor'>('chassis');\n  const [diagnosticsMode, setDiagnosticsMode] = useState(false);`);
  
  // Add button to header
  code = code.replace(/<button\s*onClick=\{onBack\}/, `<button onClick={() => setDiagnosticsMode(!diagnosticsMode)} className={\`px-3 py-1 font-mono text-[10px] rounded \${diagnosticsMode ? 'bg-[#FF5500]/20 text-[#FF5500] border border-[#FF5500]/50' : 'bg-black text-white/50 border border-white/10'}\`}>DIAGNOSTICS</button>\n          <button onClick={onBack}`);

  // We need to render the diagnostic issues if active
  const diagUI = `
    {diagnosticsMode && (
      <div className="absolute top-20 right-4 w-80 bg-black/90 border border-red-500/50 p-4 z-50 text-xs font-mono text-red-400 overflow-auto max-h-[80vh]">
        <h3 className="text-white mb-2">ASSEMBLY DIAGNOSTICS</h3>
        <p>Valid: {validationResult.isValid ? 'YES' : 'NO'}</p>
        <p>Mass: {physicsSummary.totalMass} / 250</p>
        <ul className="mt-2 space-y-2">
          {validationResult.issues.map((iss, i) => (
             <li key={i}>[{iss.severity}] {iss.message}</li>
          ))}
        </ul>
      </div>
    )}
  `;
  
  code = code.replace(/\{renderPanelContent\(\)\}\n\s*<\/div>/, `{renderPanelContent()}\n            </div>\n${diagUI}`);
  
  fs.writeFileSync('src/components/BuildABotWorkshop.tsx', code);
}
