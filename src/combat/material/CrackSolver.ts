import { HybridArmorState } from './HybridDeformationSolver';
import { ArmorFractureRequest } from './HybridArmorMaterial';
import * as THREE from 'three';

export type FractureResult = {
  accepted: boolean;
  seedEdge: number;
  fracturedEdges: number[];
  detachedTriangles: number[];
  remainingEnergy: number;
};

// Reusable min-heap priority queue
class PriorityQueue<T> {
  private data: { item: T; priority: number }[] = [];

  push(item: T, priority: number) {
    this.data.push({ item, priority });
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const result = this.data[0].item;
    const last = this.data.pop();
    if (this.data.length > 0 && last !== undefined) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return result;
  }

  isEmpty() {
    return this.data.length === 0;
  }

  private bubbleUp(idx: number) {
    const element = this.data[idx];
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      const parent = this.data[parentIdx];
      if (element.priority >= parent.priority) break;
      this.data[idx] = parent;
      this.data[parentIdx] = element;
      idx = parentIdx;
    }
  }

  private sinkDown(idx: number) {
    const length = this.data.length;
    const element = this.data[idx];
    while (true) {
      const leftChildIdx = 2 * idx + 1;
      const rightChildIdx = 2 * idx + 2;
      let leftChild, rightChild;
      let swap = null;

      if (leftChildIdx < length) {
        leftChild = this.data[leftChildIdx];
        if (leftChild.priority < element.priority) swap = leftChildIdx;
      }
      if (rightChildIdx < length) {
        rightChild = this.data[rightChildIdx];
        if (
          (swap === null && rightChild.priority < element.priority) ||
          (swap !== null && leftChild && rightChild.priority < leftChild.priority)
        ) {
          swap = rightChildIdx;
        }
      }
      if (swap === null) break;
      this.data[idx] = this.data[swap];
      this.data[swap] = element;
      idx = swap;
    }
  }
}

export class CrackSolver {
  static evaluateAndPropagate(
    request: ArmorFractureRequest,
    state: HybridArmorState
  ): FractureResult {
    const { topology, material } = state;
    const numEdges = topology.edgeVertexA.length;
    const numTriangles = topology.triangleIndices.length / 3;

    // 2. Deterministic Edge Candidate Evaluation and Seed Selection
    let bestSeed = -1;
    let bestScore = -Infinity;

    const contactPt = new THREE.Vector3(request.localContactPoint[0], request.localContactPoint[1], request.localContactPoint[2]);
    const minFractureEnergy = 5;

    if (request.fractureEnergy < minFractureEnergy) {
      return { accepted: false, seedEdge: -1, fracturedEdges: [], detachedTriangles: [], remainingEnergy: request.fractureEnergy };
    }

    for (let e = 0; e < numEdges; e++) {
      if (topology.mountProtectedEdgeMask[e]) continue;

      const a = topology.edgeVertexA[e];
      const b = topology.edgeVertexB[e];
      const pA = new THREE.Vector3(state.positions[a * 3], state.positions[a * 3 + 1], state.positions[a * 3 + 2]);
      const pB = new THREE.Vector3(state.positions[b * 3], state.positions[b * 3 + 1], state.positions[b * 3 + 2]);
      const edgeCenter = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);

      const dist = edgeCenter.distanceTo(contactPt);
      const proximityWeight = Math.max(0, 1 - dist / 0.8);

      const E_required = topology.edgeRestLength[e] * material.totalThickness * state.edgeFractureResistance[e];
      const E_available = request.fractureEnergy * proximityWeight * Math.max(1, request.overmatchRatio);

      // K_eq proxy calculation
      const kEq = state.edgeInterfaceDamage[e] + state.edgeBackingDamage[e] + state.edgeFatigue[e];

      if (E_available >= E_required && (state.edgeInterfaceDamage[e] > 0.5 || state.edgeBackingDamage[e] > 0.5 || kEq > 1.0)) {
        const score = (E_available - E_required) + (kEq * 10);
        if (score > bestScore) {
          bestScore = score;
          bestSeed = e;
        }
      }
    }

    if (bestSeed === -1) {
      return { accepted: false, seedEdge: -1, fracturedEdges: [], detachedTriangles: [], remainingEnergy: request.fractureEnergy };
    }

    // 3. Mixed-mode Crack Traversal
    const fracturedEdges = new Set<number>();
    fracturedEdges.add(bestSeed);
    let remainingEnergy = request.fractureEnergy - (topology.edgeRestLength[bestSeed] * material.totalThickness * state.edgeFractureResistance[bestSeed]);

    const queue = new PriorityQueue<number>();
    queue.push(bestSeed, 0);

    let visitedTriangles = 0;
    const maxTriangles = 450;

    while (!queue.isEmpty() && remainingEnergy > 0 && visitedTriangles < maxTriangles) {
      const currEdge = queue.pop()!;
      const t1 = topology.edgeTriangleA[currEdge];
      const t2 = topology.edgeTriangleB[currEdge];

      for (const t of [t1, t2]) {
        if (t === -1) continue;
        visitedTriangles++;

        for (let e = 0; e < numEdges; e++) {
          if (topology.edgeTriangleA[e] === t || topology.edgeTriangleB[e] === t) {
            if (!fracturedEdges.has(e) && !topology.mountProtectedEdgeMask[e]) {
              const req = topology.edgeRestLength[e] * material.totalThickness * state.edgeFractureResistance[e];
              if (remainingEnergy >= req) {
                fracturedEdges.add(e);
                remainingEnergy -= req;
                // propagation cost proxy
                const cost = req - (state.edgeFatigue[e] * 2);
                queue.push(e, cost);
              }
            }
          }
        }
      }
    }

    // 4. Deterministic Connected-Component Analysis
    const activeTriangles = new Uint8Array(numTriangles);
    for (let i = 0; i < numTriangles; i++) {
        activeTriangles[i] = state.activeTriangleMask[i];
    }
    
    const visited = new Uint8Array(numTriangles);
    const regions: number[][] = [];

    for (let t = 0; t < numTriangles; t++) {
      if (activeTriangles[t] && !visited[t]) {
        const region: number[] = [];
        const ccaQueue = [t];
        visited[t] = 1;

        while (ccaQueue.length > 0) {
          const curr = ccaQueue.shift()!;
          region.push(curr);

          // Find neighbors
          for (let e = 0; e < numEdges; e++) {
            if (topology.edgeTriangleA[e] === curr || topology.edgeTriangleB[e] === curr) {
              if (!fracturedEdges.has(e)) {
                const neighbor = topology.edgeTriangleA[e] === curr ? topology.edgeTriangleB[e] : topology.edgeTriangleA[e];
                if (neighbor !== -1 && activeTriangles[neighbor] && !visited[neighbor]) {
                  visited[neighbor] = 1;
                  ccaQueue.push(neighbor);
                }
              }
            }
          }
        }
        regions.push(region);
      }
    }

    // 5. Select and validate at most one coherent detachable region
    let bestRegion: number[] = [];
    let bestRegionScore = -Infinity;

    for (const region of regions) {
      if (region.length === numTriangles) continue; // Entire panel cannot be detached
      
      let area = 0;
      let hasProtected = false;
      let contactsImpact = false;

      for (const t of region) {
        area += topology.triangleAreas[t];
        if (topology.mountProtectedTriangleMask[t]) hasProtected = true;
        
        // Impact proximity
        const i3 = t * 3;
        const centroid = new THREE.Vector3(topology.triangleCentroids[i3], topology.triangleCentroids[i3+1], topology.triangleCentroids[i3+2]);
        if (centroid.distanceTo(contactPt) < 0.6) {
          contactsImpact = true;
        }
      }

      if (hasProtected || area < 0.001 || area > topology.originalSurfaceArea * 0.4) continue;

      const score = area + (contactsImpact ? 10 : 0);
      if (score > bestRegionScore) {
        bestRegionScore = score;
        bestRegion = region;
      }
    }

    if (bestRegion.length === 0) {
      return { accepted: false, seedEdge: bestSeed, fracturedEdges: Array.from(fracturedEdges), detachedTriangles: [], remainingEnergy: request.fractureEnergy };
    }

    return {
      accepted: true,
      seedEdge: bestSeed,
      fracturedEdges: Array.from(fracturedEdges),
      detachedTriangles: bestRegion,
      remainingEnergy
    };
  }
}
