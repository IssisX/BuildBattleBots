const fs = require('fs');
let code = fs.readFileSync('src/components/Arena3D.tsx', 'utf8');

const oldStr = `               );
            }
            return null;
            }
            return null;
          })
        )}`;

const newStr = `               );
            }
            return null;
          })
        )}`;

code = code.replace(oldStr, newStr);
fs.writeFileSync('src/components/Arena3D.tsx', code);
