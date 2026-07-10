const fs = require('fs');
let code = fs.readFileSync('src/components/Arena3D.tsx', 'utf8');

const oldStr = `                   )}
                 </group>
               );
            }
            return null;
            }
            return null;
          })
        )}
        <group ref={visualRootRef}>`;

const newStr = `                   )}
                 </group>
               );
            }
            return null;
          })
        )}
        
        <group ref={visualRootRef}>`;

code = code.replace(oldStr, newStr);
fs.writeFileSync('src/components/Arena3D.tsx', code);
