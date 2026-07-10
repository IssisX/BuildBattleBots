import fs from 'fs';
let code = fs.readFileSync('src/combat/DamageSystem.ts', 'utf8');

const applyDamage = `
    const prevState = comp.visualState;
    const prevMount = comp.mountIntegrity;
    
    // Update visual state
    if (breachedLayers > 1) {
      comp.visualState = 'exposed';
    } else if (comp.layers[0] && comp.layers[0].integrity < comp.layers[0].maxIntegrity * 0.5) {
      comp.visualState = 'dented';
    } else {
      comp.visualState = 'scuffed';
    }
    
    if (prevState !== 'exposed' && comp.visualState === 'exposed') {
       if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('telemetry-log', { detail: { msg: 'Layer exposed', type: 'warning' } }));
    }
    
    let mountDamage = 0;
    if (ev.severity === 'crush') mountDamage = 0.6;
    else if (ev.severity === 'heavy') mountDamage = 0.4;
    else if (ev.severity === 'direct') mountDamage = 0.15;
    
    if (mountDamage > 0) {
      comp.mountIntegrity -= mountDamage;
      if (comp.mountIntegrity < 0.3) {
        comp.visualState = 'loose';
      }
      if (comp.mountIntegrity <= 0) {
        comp.detached = true;
        comp.visualState = 'detached';
      }
    }
    
    if (prevMount >= 0.3 && comp.mountIntegrity < 0.3) {
       if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('telemetry-log', { detail: { msg: 'Mount loosened', type: 'critical' } }));
    }
    
    if (!comp.detached && comp.visualState === 'detached') {
       if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('telemetry-log', { detail: { msg: 'Component detached', type: 'critical' } }));
    }
`;

code = code.replace(/\/\/ Update visual state[\s\S]+?\}\s*\}\s*comp\.visualOffset\.jolt/, applyDamage.trim() + '\n    \n    comp.visualOffset.jolt');
fs.writeFileSync('src/combat/DamageSystem.ts', code);
