const fs = require('fs');
let code = fs.readFileSync('src/components/Arena3D.tsx', 'utf8');

// For custom bots with state
code = code.replace(
  /if \(partDef\?\.templateId === 'weapon_drum'\) \{\s*const drumSpinner = meshGroup\.getObjectByName\('DrumSpinner'\) \|\| meshGroup;\s*drumSpinner\.rotation\.x = weaponState\.angle;\s*\} else \{\s*meshGroup\.rotation\.y = weaponState\.angle;\s*\}/g,
  `if (partDef?.templateId === 'weapon_drum' || partDef?.templateId === 'weapon_spinner') {
                    const spinGroup = meshGroup.getObjectByName('WheelSpinGroup') || meshGroup;
                    spinGroup.rotation.x = weaponState.angle;
                  } else {
                    meshGroup.rotation.y = weaponState.angle;
                  }`
);

// For custom bots without state
code = code.replace(
  /if \(partDef\?\.templateId === 'weapon_drum'\) \{\s*const drumSpinner = meshGroup\.getObjectByName\('DrumSpinner'\);\s*if \(drumSpinner\) \{\s*drumSpinner\.rotation\.x -= currentRPM\.current \* finalDelta \* 15;\s*\}\s*\} else if \(wType === 'spinner' \|\| wType === 'saw' \|\| wType === 'drum'\) \{\s*meshGroup\.rotation\.y -= currentRPM\.current \* finalDelta \* 0\.05;\s*\}/g,
  `if (partDef?.templateId === 'weapon_drum' || partDef?.templateId === 'weapon_spinner') {
                  const spinGroup = meshGroup.getObjectByName('WheelSpinGroup') || meshGroup;
                  if (spinGroup) {
                    spinGroup.rotation.x -= currentRPM.current * finalDelta * 0.05;
                  }
                } else if (wType === 'spinner' || wType === 'saw' || wType === 'drum') {
                  meshGroup.rotation.y -= currentRPM.current * finalDelta * 0.05;
                }`
);

fs.writeFileSync('src/components/Arena3D.tsx', code);
