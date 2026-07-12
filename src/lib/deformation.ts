import * as THREE from 'three';
import { MeshDeformationState, DentRequest } from '../types';

export class DeformationSystem {
  // botId -> list of registered meshes
  botMeshes: Map<string, THREE.Mesh[]> = new Map();

  registerMesh(botId: string, mesh: THREE.Mesh) {
    if (!this.botMeshes.has(botId)) {
       this.botMeshes.set(botId, []);
    }
    const arr = this.botMeshes.get(botId)!;
    if (!arr.includes(mesh)) {
       arr.push(mesh);
       
       // If this mesh already has deformation state and cloned geometry, keep it!
       if ((mesh as any).userData.deformation) {
          return;
       }
       
       // Clone geometry to ensure we don't modify shared templates
       let targetGeo = mesh.geometry.clone();
       if (targetGeo.index) {
          targetGeo = targetGeo.toNonIndexed();
       }
       mesh.geometry = targetGeo;
       
       const posAttribute = targetGeo.attributes.position;
       if (!posAttribute) return;
       const count = posAttribute.count;
       
       const restPositions = new Float32Array(count * 3);
       const positions = new Float32Array(count * 3);
       
       for (let i = 0; i < count * 3; i++) {
          restPositions[i] = posAttribute.array[i];
          positions[i] = posAttribute.array[i];
       }
       
       (mesh as any).userData.deformation = {
          restPositions,
          positions,
          count
       };
    }
  }

  unregisterBot(botId: string) {
    this.botMeshes.delete(botId);
  }

  applyDent(req: DentRequest) {
    const meshes = this.botMeshes.get(req.botId);
    if (!meshes) return;
    
    const worldContact = new THREE.Vector3(...req.localContactPoint); // Event passes world contact point
    const worldDir = new THREE.Vector3(...req.localImpactDirection).normalize();
    
    for (const mesh of meshes) {
       const state = mesh.userData.deformation;
       if (!state) continue;
       
       mesh.updateMatrixWorld(true);
       const invMat = mesh.matrixWorld.clone().invert();
       
       const localContact = worldContact.clone().applyMatrix4(invMat);
       // transform direction to local
       const localDir = worldDir.clone().transformDirection(invMat).normalize();
       
       let modified = false;
       const { positions } = state;
       
       for (let i = 0; i < state.count; i++) {
          const vx = positions[i * 3];
          const vy = positions[i * 3 + 1];
          const vz = positions[i * 3 + 2];
          
          const d2 = (vx - localContact.x)**2 + (vy - localContact.y)**2 + (vz - localContact.z)**2;
          const r2 = req.radius * req.radius;
          
          if (d2 < r2) {
             const dist = Math.sqrt(d2);
             const falloff = 1.0 - (dist / req.radius);
             // Smoothstep falloff
             const smooth = falloff * falloff * (3 - 2 * falloff);
             
             // High-fidelity metal wrinkling and buckling (simulates structural sheet metal collapse)
             const crinkle = 1.0 + 0.25 * Math.sin(dist * 60.0) * (1.0 - falloff);
             const disp = req.depth * smooth * req.plasticity * crinkle;
             
             // Direct displacement towards the local center of the mesh to guarantee inward denting
             const toCenter = new THREE.Vector3(vx, vy, vz).normalize().negate();
             // Blend blow direction (negative localDir) with direct center direction
             const dentDir = new THREE.Vector3(-localDir.x, -localDir.y, -localDir.z).normalize();
             if (dentDir.dot(toCenter) < 0) {
                // If the blow direction would push vertices outwards, flip it
                dentDir.negate();
             }
             // Blend 60% blow direction and 40% inward center direction for realistic buckling
             dentDir.lerp(toCenter, 0.4).normalize();
             
             positions[i * 3] += dentDir.x * disp;
             positions[i * 3 + 1] += dentDir.y * disp;
             positions[i * 3 + 2] += dentDir.z * disp;
             
             // Apply tangential shearing to create tearing gouges and scratch lines
             const shearStrength = req.depth * 0.35 * (1.0 - smooth) * falloff;
             const tangent = new THREE.Vector3().crossVectors(localDir, new THREE.Vector3(0, 1, 0)).normalize();
             if (tangent.lengthSq() < 0.1) tangent.set(1, 0, 0);
             
             positions[i * 3] += tangent.x * shearStrength;
             positions[i * 3 + 1] += tangent.y * shearStrength;
             positions[i * 3 + 2] += tangent.z * shearStrength;
             
             modified = true;
          }
       }
       
       if (modified) {
          mesh.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          mesh.geometry.attributes.position.needsUpdate = true;
          mesh.geometry.computeVertexNormals();
       }
    }
  }
}

export const globalDeformation = new DeformationSystem();
