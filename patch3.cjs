const fs = require('fs');
const lines = fs.readFileSync('src/components/Arena3D.tsx', 'utf8').split('\n');

const fallbackCode = `            }
            return null;
          })
        )}
`;

lines.splice(2152, 2, ...fallbackCode.split('\n'));
fs.writeFileSync('src/components/Arena3D.tsx', lines.join('\n'));
