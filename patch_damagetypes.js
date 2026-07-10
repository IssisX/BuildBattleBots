const fs = require('fs');
let code = fs.readFileSync('src/combat/DamageTypes.ts', 'utf8');

code = code.replace(/export type CombatMaterial = \{[^}]+\};/, `export type CombatMaterial = {
  id: number;
  name: 'steel' | 'aluminum' | 'rubber' | 'armorPlate' | 'weaponSteel' | 'composite' | 'arenaWall';
  hardness: number;
  density: number;
  ringHz: number;
  ringDamping: number;
  sparkYield: number;
  scrapeResistance: number;
  deflectAngleBias: number;
  deformation: import('../types').MaterialDeformationProfile;
};`);

const deformationDefaults = {
  steel: { dentThreshold: 10, fullDentEnergy: 100, minimumDentRadius: 0.1, maximumDentRadius: 0.3, maximumDentDepth: 0.1, elasticity: 0.05, plasticity: 0.95, constraintStiffness: 0.8 },
  aluminum: { dentThreshold: 5, fullDentEnergy: 50, minimumDentRadius: 0.15, maximumDentRadius: 0.4, maximumDentDepth: 0.15, elasticity: 0.02, plasticity: 0.98, constraintStiffness: 0.6 },
  rubber: { dentThreshold: 100, fullDentEnergy: 1000, minimumDentRadius: 0.2, maximumDentRadius: 0.5, maximumDentDepth: 0.05, elasticity: 0.95, plasticity: 0.05, constraintStiffness: 0.2 },
  armorPlate: { dentThreshold: 30, fullDentEnergy: 200, minimumDentRadius: 0.05, maximumDentRadius: 0.25, maximumDentDepth: 0.05, elasticity: 0.1, plasticity: 0.9, constraintStiffness: 0.95 },
  weaponSteel: { dentThreshold: 40, fullDentEnergy: 250, minimumDentRadius: 0.05, maximumDentRadius: 0.2, maximumDentDepth: 0.04, elasticity: 0.1, plasticity: 0.9, constraintStiffness: 0.95 },
  composite: { dentThreshold: 15, fullDentEnergy: 80, minimumDentRadius: 0.1, maximumDentRadius: 0.35, maximumDentDepth: 0.1, elasticity: 0.01, plasticity: 0.99, constraintStiffness: 0.85 },
  arenaWall: { dentThreshold: 200, fullDentEnergy: 1000, minimumDentRadius: 0.05, maximumDentRadius: 0.2, maximumDentDepth: 0.02, elasticity: 0.05, plasticity: 0.95, constraintStiffness: 0.99 }
};

for (const key of Object.keys(deformationDefaults)) {
  const regex = new RegExp(key + ': \\{([^}]+)\\},');
  code = code.replace(regex, key + ': { $1, deformation: ' + JSON.stringify(deformationDefaults[key]) + ' },');
}

fs.writeFileSync('src/combat/DamageTypes.ts', code);
