import { HybridArmorState, HybridDeformationSolver } from './HybridDeformationSolver';
import { CrackSolver } from './CrackSolver';
import { FragmentBuilder } from './FragmentBuilder';
import { FragmentPhysics } from './FragmentPhysics';
import { ArmorFractureRequest } from './HybridArmorMaterial';
import { useGameStore } from '../../store';

export class FracturePhysicsManager {
  static states = new Map<string, HybridArmorState>();
  
  static processImpact(request: ArmorFractureRequest, state: HybridArmorState) {
    const result = CrackSolver.evaluateAndPropagate(request, state);
    if (!result.accepted) {
      console.log(`Fracture rejected for ${request.partInstanceId}`);
      return null;
    }
    
    const geometries = FragmentBuilder.build(state, result.detachedTriangles);
    if (!geometries.retained || !geometries.fragment) return null;
    
    const physics = FragmentPhysics.calculate(geometries.fragment, state, request, result.remainingEnergy);
    
    // In a full implementation we would dispatch an event or directly update store
    // to replace the original geometry with retained geometry and spawn a rigid body with fragment.
    
    return {
      partInstanceId: request.partInstanceId,
      retainedGeom: geometries.retained,
      fragmentGeom: geometries.fragment,
      physics
    };
  }
}
