import { ArmorTopology } from './ArmorTopology';
import { HybridArmorPanelProfile } from './HybridArmorMaterial';
import * as THREE from 'three';

export type HybridArmorState = {
  partInstanceId: string;
  topology: ArmorTopology;
  material: HybridArmorPanelProfile;

  positions: Float32Array;
  previousPositions: Float32Array;
  velocities: Float32Array;
  inverseVertexMasses: Float32Array;

  backingPlasticRestLengths: Float32Array;
  backingPlasticRestDihedrals: Float32Array;
  backingAccumulatedPlasticStrain: Float32Array;
  backingAccumulatedPlasticCurvature: Float32Array;

  triangleStrain: Float32Array;
  triangleStress: Float32Array;
  triangleStrainEnergyDensity: Float32Array;

  compositeFiberDamage: Float32Array;
  compositeMatrixDamage: Float32Array;
  compositeShearDamage: Float32Array;

  edgeInterfaceDamage: Float32Array;
  edgeInterfaceEnergy: Float32Array;

  edgeBackingDamage: Float32Array;
  edgeCompositeDamage: Float32Array;
  edgeFatigue: Float32Array;
  edgeFractureResistance: Float32Array;

  activeTriangleMask: Uint8Array;

  deformationEnergyConsumed: number;
  fractureEnergyReserved: number;

  geometryRevision: number;
  processedEventIds: Set<string>;
};

export class HybridDeformationSolver {
  static init(instanceId: string, topology: ArmorTopology, material: HybridArmorPanelProfile): HybridArmorState {
    const numVertices = topology.restPositions.length / 3;
    const numTriangles = topology.triangleIndices.length / 3;
    const numEdges = topology.edgeVertexA.length;
    
    const arealDensity = material.compositeFace.density * material.compositeFace.thickness +
                         material.ductileBacking.density * material.ductileBacking.thickness;
                         
    const invMasses = new Float32Array(numVertices);
    for(let i=0; i<numVertices; i++) {
        invMasses[i] = 1.0 / Math.max(0.01, (topology.originalSurfaceArea / numVertices) * arealDensity);
    }
    
    return {
      partInstanceId: instanceId,
      topology,
      material,
      positions: new Float32Array(topology.restPositions),
      previousPositions: new Float32Array(topology.restPositions),
      velocities: new Float32Array(numVertices * 3),
      inverseVertexMasses: invMasses,
      backingPlasticRestLengths: new Float32Array(topology.edgeRestLength),
      backingPlasticRestDihedrals: new Float32Array(topology.edgeRestDihedral),
      backingAccumulatedPlasticStrain: new Float32Array(numEdges),
      backingAccumulatedPlasticCurvature: new Float32Array(numEdges),
      triangleStrain: new Float32Array(numTriangles * 3),
      triangleStress: new Float32Array(numTriangles * 3),
      triangleStrainEnergyDensity: new Float32Array(numTriangles),
      compositeFiberDamage: new Float32Array(numTriangles),
      compositeMatrixDamage: new Float32Array(numTriangles),
      compositeShearDamage: new Float32Array(numTriangles),
      edgeInterfaceDamage: new Float32Array(numEdges),
      edgeInterfaceEnergy: new Float32Array(numEdges),
      edgeBackingDamage: new Float32Array(numEdges),
      edgeCompositeDamage: new Float32Array(numEdges),
      edgeFatigue: new Float32Array(numEdges),
      edgeFractureResistance: new Float32Array(numEdges).fill(1.0),
      activeTriangleMask: new Uint8Array(numTriangles).fill(1),
      deformationEnergyConsumed: 0,
      fractureEnergyReserved: 0,
      geometryRevision: 0,
      processedEventIds: new Set()
    };
  }

  static solve(state: HybridArmorState, localVertices: number[], nodalImpulses: Float32Array, dt: number) {
    const { positions, velocities, previousPositions, inverseVertexMasses, topology, material } = state;
    const numEdges = topology.edgeVertexA.length;

    for (const v of localVertices) {
      const idx = v * 3;
      const invM = inverseVertexMasses[v];
      velocities[idx] += nodalImpulses[idx] * invM;
      velocities[idx+1] += nodalImpulses[idx+1] * invM;
      velocities[idx+2] += nodalImpulses[idx+2] * invM;
      
      previousPositions[idx] = positions[idx];
      previousPositions[idx+1] = positions[idx+1];
      previousPositions[idx+2] = positions[idx+2];
      
      positions[idx] += velocities[idx] * dt;
      positions[idx+1] += velocities[idx+1] * dt;
      positions[idx+2] += velocities[idx+2] * dt;
    }
    
    const substeps = 5;
    const h = dt / substeps;
    const h2 = h * h;
    const epsilon = 1e-8;

    for (let step = 0; step < substeps; step++) {
      for (let i = 0; i < numEdges; i++) {
        const a = topology.edgeVertexA[i];
        const b = topology.edgeVertexB[i];
        
        const Lplastic = state.backingPlasticRestLengths[i];
        const dx = positions[b*3] - positions[a*3];
        const dy = positions[b*3+1] - positions[a*3+1];
        const dz = positions[b*3+2] - positions[a*3+2];
        const Lcurrent = Math.sqrt(dx*dx + dy*dy + dz*dz) || epsilon;
        
        const eps = (Lcurrent - Lplastic) / Math.max(Lplastic, epsilon);
        const EbackingEffective = material.ductileBacking.youngsModulus;
        const sigmaBacking = EbackingEffective * eps;
        const yieldCurrent = material.ductileBacking.yieldStress + material.ductileBacking.hardeningModulus * state.backingAccumulatedPlasticStrain[i];
        
        if (Math.abs(sigmaBacking) > yieldCurrent) {
            const dStrain = (Math.abs(sigmaBacking) - yieldCurrent) / Math.max(EbackingEffective + material.ductileBacking.hardeningModulus, epsilon);
            state.backingAccumulatedPlasticStrain[i] = Math.min(state.backingAccumulatedPlasticStrain[i] + dStrain, material.ductileBacking.ductilityLimit);
            state.backingPlasticRestLengths[i] *= (1 + Math.sign(eps) * dStrain);
        }

        // Composite Orthotropic Stretch (Hashin formulation)
        const t1 = topology.edgeTriangleA[i];
        const phi = (t1 !== -1) ? topology.triangleFiberDirection2D[t1*2] : 0; 
        const cos4 = Math.pow(Math.cos(phi), 4);
        const sin4 = Math.pow(Math.sin(phi), 4);
        const cos2 = Math.pow(Math.cos(phi), 2);
        const sin2 = Math.pow(Math.sin(phi), 2);
        
        const E1 = material.compositeFace.E1 * Math.max(material.compositeFace.fiberDamageFloor, 1 - (t1 !== -1 ? state.compositeFiberDamage[t1] : 0));
        const E2 = material.compositeFace.E2 * Math.max(material.compositeFace.matrixDamageFloor, 1 - (t1 !== -1 ? state.compositeMatrixDamage[t1] : 0));
        const G12 = material.compositeFace.G12 * Math.max(material.compositeFace.shearDamageFloor, 1 - (t1 !== -1 ? state.compositeShearDamage[t1] : 0));
        
        const Ecomp_inv = (cos4 / E1) + (sin4 / E2) + (1/G12 - 2*material.compositeFace.nu12/E1) * sin2 * cos2;
        const EcompositeEffective = 1.0 / Ecomp_inv;
        
        const EAeffective = EcompositeEffective * material.compositeFace.thickness + material.ductileBacking.youngsModulus * material.ductileBacking.thickness;
        const complianceStretch = state.backingPlasticRestLengths[i] / Math.max(EAeffective * topology.edgeEffectiveWidth[i], epsilon);
        
        const alphaTilde = complianceStretch / h2;
        const Cstretch = Lcurrent - state.backingPlasticRestLengths[i];
        
        const wA = inverseVertexMasses[a];
        const wB = inverseVertexMasses[b];
        const wSum = wA + wB;
        if (wSum === 0) continue;

        const dLambda = (-Cstretch) / (wSum + alphaTilde);
        const pX = (dx / Lcurrent) * dLambda;
        const pY = (dy / Lcurrent) * dLambda;
        const pZ = (dz / Lcurrent) * dLambda;
        
        positions[a*3] -= wA * pX;
        positions[a*3+1] -= wA * pY;
        positions[a*3+2] -= wA * pZ;
        
        positions[b*3] += wB * pX;
        positions[b*3+1] += wB * pY;
        positions[b*3+2] += wB * pZ;
      }
    }
    
    // Evaluate Hashin-style damage for Composite Face
    for (let i = 0; i < topology.triangleIndices.length / 3; i++) {
        const E1 = material.compositeFace.E1;
        const E2 = material.compositeFace.E2;
        const nu12 = material.compositeFace.nu12;
        const G12 = material.compositeFace.G12;
        const nu21 = nu12 * E2 / E1;
        const Delta = 1 - nu12 * nu21;
        const Q11 = E1 / Delta;
        const Q22 = E2 / Delta;
        const Q12 = nu12 * E2 / Delta;
        
        // Approximate local strains for demonstration (full green-lagrange extraction omitted for brevity)
        const epsilon1 = state.triangleStrain[i*3];
        const epsilon2 = state.triangleStrain[i*3+1];
        const gamma12 = state.triangleStrain[i*3+2];
        
        const sigma1 = Q11 * epsilon1 + Q12 * epsilon2;
        const sigma2 = Q12 * epsilon1 + Q22 * epsilon2;
        const tau12 = G12 * gamma12;
        
        let Ffiber = 0, Fmatrix = 0;
        if (sigma1 >= 0) {
            Ffiber = Math.pow(sigma1 / material.compositeFace.Xt, 2) + Math.pow(tau12 / material.compositeFace.S12, 2);
        } else {
            Ffiber = Math.pow(sigma1 / material.compositeFace.Xc, 2);
        }
        
        if (sigma2 >= 0) {
            Fmatrix = Math.pow(sigma2 / material.compositeFace.Yt, 2) + Math.pow(tau12 / material.compositeFace.S12, 2);
        } else {
            Fmatrix = Math.pow(sigma2 / (2 * material.compositeFace.S12), 2) + 
                      ((Math.pow(material.compositeFace.Yc / (2*material.compositeFace.S12), 2) - 1) * (sigma2 / material.compositeFace.Yc)) + 
                      Math.pow(tau12 / material.compositeFace.S12, 2);
        }
        
        if (Ffiber > 1.0) state.compositeFiberDamage[i] = Math.min(1.0, state.compositeFiberDamage[i] + 0.1);
        if (Fmatrix > 1.0) state.compositeMatrixDamage[i] = Math.min(1.0, state.compositeMatrixDamage[i] + 0.1);
    }
    
    // Update velocities
    for (const v of localVertices) {
      const idx = v * 3;
      velocities[idx] = (positions[idx] - previousPositions[idx]) / dt;
      velocities[idx+1] = (positions[idx+1] - previousPositions[idx+1]) / dt;
      velocities[idx+2] = (positions[idx+2] - previousPositions[idx+2]) / dt;
    }
    
    state.geometryRevision++;
  }
}
