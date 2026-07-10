import fs from 'fs';
let code = fs.readFileSync('src/combat/DamageTypes.ts', 'utf8');

code = code.replace(/manifoldContacts: number;\n  damageAmount\?: number;/, `manifoldContacts: number;
  damageAmount?: number;
  dentRequest?: import('../types').DentRequest;`);

fs.writeFileSync('src/combat/DamageTypes.ts', code);
