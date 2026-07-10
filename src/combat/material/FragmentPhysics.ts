import * as THREE from 'three';
import { HybridArmorState } from './HybridDeformationSolver';
import { ArmorFractureRequest } from './HybridArmorMaterial';

export class FragmentPhysics {
  static calculate(
    geometry: THREE.BufferGeometry,
    state: HybridArmorState,
    request: ArmorFractureRequest,
    remainingEnergy: number
  ) {
    const pos = geometry.attributes.position.array as Float32Array;
    const idx = geometry.index!.array as Uint16Array | Uint32Array;
    
    let totalArea = 0;
    const centerOfMass = new THREE.Vector3();
    
    // Calculate area and COM based on surface since we didn't actually extrude yet
    for (let i = 0; i < idx.length; i += 3) {
      const a = new THREE.Vector3(pos[idx[i]*3], pos[idx[i]*3+1], pos[idx[i]*3+2]);
      const b = new THREE.Vector3(pos[idx[i+1]*3], pos[idx[i+1]*3+1], pos[idx[i+1]*3+2]);
      const c = new THREE.Vector3(pos[idx[i+2]*3], pos[idx[i+2]*3+1], pos[idx[i+2]*3+2]);
      
      const centroid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
      const ab = new THREE.Vector3().subVectors(b, a);
      const ac = new THREE.Vector3().subVectors(c, a);
      const area = ab.cross(ac).length() * 0.5;
      
      centerOfMass.addScaledVector(centroid, area);
      totalArea += area;
    }
    
    if (totalArea > 0) {
      centerOfMass.divideScalar(totalArea);
    }
    
    // Recenter geometry
    const offset = centerOfMass.clone().negate();
    geometry.translate(offset.x, offset.y, offset.z);
    
    const arealDensity = state.material.compositeFace.density * state.material.compositeFace.thickness +
                         state.material.ductileBacking.density * state.material.ductileBacking.thickness;
    const mass = Math.max(0.01, totalArea * arealDensity);
    
    geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    geometry.boundingBox!.getSize(size);
    // Extrude visually by thickness
    size.y = Math.max(size.y, state.material.totalThickness);
    
    const linearReleaseFraction = 0.5;
    const releaseEfficiency = 0.1;
    const E_release = remainingEnergy * releaseEfficiency;
    const E_linear = E_release * linearReleaseFraction;
    
    const v_release = Math.sqrt(2 * E_linear / mass);
    
    const releaseDirection = new THREE.Vector3(
      request.localSurfaceNormal[0] + request.localTangentialDirection[0] * 0.2,
      request.localSurfaceNormal[1] + Math.random() * 0.2,
      request.localSurfaceNormal[2] + request.localTangentialDirection[2] * 0.2
    ).normalize();
    
    const releaseVelocity = releaseDirection.multiplyScalar(v_release);
    
    // Add some spin
    const E_rot = E_release - E_linear;
    // Approximating angular velocity from E_rot = 1/2 I w^2
    const approxI = mass * (size.x*size.x + size.z*size.z) / 12;
    const w_mag = Math.sqrt(2 * E_rot / Math.max(0.001, approxI));
    
    const releaseAngularVelocity = new THREE.Vector3(
      (Math.random() - 0.5),
      (Math.random() - 0.5),
      (Math.random() - 0.5)
    ).normalize().multiplyScalar(w_mag);

    return {
      mass,
      centerOfMass, // in local part space
      size: [size.x, size.y, size.z] as [number, number, number],
      releaseVelocity: [releaseVelocity.x, releaseVelocity.y, releaseVelocity.z] as [number, number, number],
      releaseAngularVelocity: [releaseAngularVelocity.x, releaseAngularVelocity.y, releaseAngularVelocity.z] as [number, number, number],
    };
  }
}
