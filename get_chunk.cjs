const fs = require('fs');
const lines = fs.readFileSync('src/components/Arena3D.tsx', 'utf8').split('\n');
console.log(lines.slice(2125, 2139).join('\n'));
