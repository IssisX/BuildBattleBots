const fs = require('fs');
let code = fs.readFileSync('src/components/Arena3D.tsx', 'utf8');

code = code.replace(
  /const spinGroup = meshGroup\.getObjectByName\('WheelSpinGroup'\) \|\| meshGroup;\s*spinGroup\.rotation\.x = weaponState\.angle;/g,
  `meshGroup.rotation.x = weaponState.angle;`
);

code = code.replace(
  /const spinGroup = meshGroup\.getObjectByName\('WheelSpinGroup'\) \|\| meshGroup;\s*if \(spinGroup\) \{\s*spinGroup\.rotation\.x -= currentRPM\.current \* finalDelta \* 0\.05;\s*\}/g,
  `meshGroup.rotation.x -= currentRPM.current * finalDelta * 0.05;`
);

fs.writeFileSync('src/components/Arena3D.tsx', code);
