import fs from 'fs';
import * as THREE from 'three';

let code = fs.readFileSync('src/lib/partsCatalog.ts', 'utf8');

const replacement = `
import { finalizeAssemblyPlan } from './assembly';
import * as THREE from 'three';

export const resolvePartTransformsV2 = (parts: PlacedBotPart[], rootPartId: string): ResolvedPartTransform[] => {
  const mockConfig: CustomBotConfig = { id: 'tmp', name: 'tmp', schemaVersion: 1, rootPartId, parts, createdAt: 0, updatedAt: 0 };
  const plan = finalizeAssemblyPlan(mockConfig);
  return plan.nodes.map(n => {
    const q = new THREE.Quaternion(n.worldTransform.rotation[0], n.worldTransform.rotation[1], n.worldTransform.rotation[2], n.worldTransform.rotation[3]);
    const e = new THREE.Euler().setFromQuaternion(q);
    return {
      instanceId: n.instanceId,
      definitionId: n.definitionId,
      local: { position: n.localPosition, rotation: n.localRotation },
      world: { position: n.worldTransform.position, rotation: [e.x, e.y, e.z] },
      parentInstanceId: n.parentInstanceId,
      depth: 0
    };
  });
};
`;

code = code.replace(/import \{ finalizeAssemblyPlan \}[\s\S]+?return plan\.nodes\.map\([\s\S]+?\}\)\);\n\};\n/, replacement.trim() + '\n');
fs.writeFileSync('src/lib/partsCatalog.ts', code);
