import fs from 'fs';
let code = fs.readFileSync('src/store.ts', 'utf8');

const replacement = `
    if (typeof window !== 'undefined' && !(window as any).__telemetryListener) {
      (window as any).__telemetryListener = true;
      window.addEventListener('telemetry-log', ((e: any) => {
        get().addLog(e.detail.msg, e.detail.type);
      }) as EventListener);
    }
    
    return {
      botState: {
`;

code = code.replace(/return \{\n\s*botState: \{/, replacement);
fs.writeFileSync('src/store.ts', code);
