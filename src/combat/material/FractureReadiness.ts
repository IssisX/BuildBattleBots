import { HybridArmorState } from './HybridDeformationSolver';

export class FractureReadiness {
  static evaluate(state: HybridArmorState, localVertices: number[], fatigueSusceptibility: number) {
    const { topology, material } = state;
    
    for (let i = 0; i < topology.edgeVertexA.length; i++) {
        const plasticStrain = state.backingAccumulatedPlasticStrain[i];
        
        // Use the event's supplied fatigue susceptibility mapped against local strain
        const backingDemand = plasticStrain / Math.max(1e-6, material.ductileBacking.ductilityLimit);
        
        const deltaFatigue = fatigueSusceptibility * Math.pow(
            Math.max(0, backingDemand - material.ductileBacking.fatigueStart), 
            material.ductileBacking.fatigueExponent
        );
        state.edgeFatigue[i] = Math.max(0, Math.min(1, state.edgeFatigue[i] + deltaFatigue));
        
        const Rcomposite = material.interface.modeIFractureEnergy * Math.max(0.1, 1.0 - state.edgeCompositeDamage[i]);
        const Rbacking = material.ductileBacking.fractureEnergyPerArea * Math.max(0.1, 1.0 - state.edgeBackingDamage[i]);
        const Rinterface = material.interface.modeIFractureEnergy * Math.max(0.1, 1.0 - state.edgeInterfaceDamage[i]);
        
        state.edgeFractureResistance[i] = (Rcomposite + Rbacking + Rinterface) * 
            Math.max(0.1, 1 - material.ductileBacking.fatigueAmplification * state.edgeFatigue[i]);
    }
  }
}
