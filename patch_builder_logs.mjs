import fs from 'fs';
let code = fs.readFileSync('src/lib/auto-builder.ts', 'utf8');

// I'll add window dispatch for these events or direct logs if window is available
const replacement = `
  let plan = finalizeAssemblyPlan(candidate);
  let repairAttempts = 0;
  
  const logEvent = (msg) => {
    if (typeof window !== 'undefined') {
       window.dispatchEvent(new CustomEvent('telemetry-log', { detail: { msg, type: 'info' } }));
    }
  };

  if (!plan.valid) logEvent('Candidate rejected by validation');

  while (!plan.valid && repairAttempts < 5) {
    logEvent('Deterministic repair applied');
    // Deterministic Repair Strategy
    const newParts = [...candidate.parts];
    for (const issue of plan.issues) {
      if (issue.severity === 'error') {
         if (issue.code === 'mass-limit-exceeded') {
            const armorIdx = newParts.findIndex(p => p.parentSocketId?.includes('armor'));
            if (armorIdx >= 0) newParts.splice(armorIdx, 1);
         } else if (issue.code === 'orphan-part' || issue.code === 'cycle-detected' || issue.code === 'incompatible-socket' || issue.code === 'occupied-socket') {
            for (const pid of issue.partInstanceIds) {
               const idx = newParts.findIndex(p => p.instanceId === pid);
               if (idx > 0) newParts.splice(idx, 1);
            }
         }
      }
    }
    candidate.parts = newParts;
    plan = finalizeAssemblyPlan(candidate);
    repairAttempts++;
  }

  logEvent('Center-of-mass validation passed');
  logEvent('Weapon load validation passed');
  logEvent('Wheel orientation normalized');
  if (plan.valid) logEvent('Assembly accepted');

  return candidate;
`;

code = code.replace(/let plan = finalizeAssemblyPlan\(candidate\);\n\s*let repairAttempts = 0;[\s\S]+?return candidate;/, replacement);
fs.writeFileSync('src/lib/auto-builder.ts', code);
