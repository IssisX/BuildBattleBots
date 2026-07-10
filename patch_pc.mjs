import fs from 'fs';
let code = fs.readFileSync('src/lib/partsCatalog.ts', 'utf8');

code = code.replace(/import \* as THREE from 'three';\n/, ''); // remove first occurrence
fs.writeFileSync('src/lib/partsCatalog.ts', code);
