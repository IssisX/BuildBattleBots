import { ArmorTopology } from './ArmorTopology';
import { HybridArmorPanelProfile, ArmorMaterialResponseRequest } from './HybridArmorMaterial';

export class ImpactLoadSolver {
  static distribute(
    request: ArmorMaterialResponseRequest,
    topology: ArmorTopology,
    positions: Float32Array
  ): { vertexWeights: Float32Array, nodalImpulses: Float32Array, localVertices: number[] } {
    const numVertices = positions.length / 3;
    const vertexWeights = new Float32Array(numVertices);
    const nodalImpulses = new Float32Array(numVertices * 3);
    const localVertices: number[] = [];
    
    // Nearest point
    let nearestIndex = 0;
    let minDist = Infinity;
    const pt = request.localContactPoint;
    
    for (let i = 0; i < numVertices; i++) {
      const dx = positions[i*3] - pt[0];
      const dy = positions[i*3+1] - pt[1];
      const dz = positions[i*3+2] - pt[2];
      const dist2 = dx*dx + dy*dy + dz*dz;
      if (dist2 < minDist) {
        minDist = dist2;
        nearestIndex = i;
      }
    }
    
    const impactRadiusScale = 0.5;
    let rImpact = Math.max(0.1, Math.min(1.0, impactRadiusScale * Math.sqrt(request.deformationEnergy / 1000)));
    
    let sumW = 0;
    const qList: {idx: number, dist2: number, w: number}[] = [];
    
    for (let i = 0; i < numVertices; i++) {
      const dx = positions[i*3] - pt[0];
      const dy = positions[i*3+1] - pt[1];
      const dz = positions[i*3+2] - pt[2];
      const dist2 = dx*dx + dy*dy + dz*dz;
      if (dist2 < rImpact * rImpact) {
        const q = Math.sqrt(dist2) / rImpact;
        const w = Math.pow(1 - q, 4) * (4 * q + 1);
        qList.push({ idx: i, dist2, w });
        sumW += w;
      }
    }
    
    qList.sort((a, b) => a.dist2 - b.dist2 || a.idx - b.idx);
    const topQ = qList.slice(0, 700);
    
    let recalcSumW = 0;
    for (const item of topQ) {
      recalcSumW += item.w;
    }
    
    const nx = request.localSurfaceNormal[0];
    const ny = request.localSurfaceNormal[1];
    const nz = request.localSurfaceNormal[2];
    
    const tx = request.localTangentialDirection[0];
    const ty = request.localTangentialDirection[1];
    const tz = request.localTangentialDirection[2];
    
    const Jx = request.normalImpulse * nx + request.tangentialImpulse * tx;
    const Jy = request.normalImpulse * ny + request.tangentialImpulse * ty;
    const Jz = request.normalImpulse * nz + request.tangentialImpulse * tz;
    
    for (const item of topQ) {
      const wNormalized = item.w / recalcSumW;
      vertexWeights[item.idx] = wNormalized;
      localVertices.push(item.idx);
      
      nodalImpulses[item.idx * 3] = Jx * wNormalized;
      nodalImpulses[item.idx * 3 + 1] = Jy * wNormalized;
      nodalImpulses[item.idx * 3 + 2] = Jz * wNormalized;
    }
    
    return { vertexWeights, nodalImpulses, localVertices };
  }
}
