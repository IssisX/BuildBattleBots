const fs = require('fs');
const code = fs.readFileSync('src/components/Arena3D.tsx', 'utf8');

const updated = code.replace(
  /rotation=\{pType === 'wheel' \? \[0, 0, Math.PI \/ 2\] : \[0, 0, 0\]\}/g,
  "rotation={(pType === 'wheel' || partDef.templateId === 'weapon_drum') ? [0, 0, Math.PI / 2] : [0, 0, 0]}"
);

fs.writeFileSync('src/components/Arena3D.tsx', updated);
