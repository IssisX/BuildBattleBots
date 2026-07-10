import * as THREE from 'three';

export type ArmorTopology = {
  restPositions: Float32Array;
  triangleIndices: Uint32Array;

  triangleCentroids: Float32Array;
  triangleNormals: Float32Array;
  triangleAreas: Float32Array;

  triangleRestBasisU: Float32Array;
  triangleRestBasisV: Float32Array;
  triangleFiberDirection2D: Float32Array;

  edgeVertexA: Uint32Array;
  edgeVertexB: Uint32Array;
  edgeTriangleA: Int32Array;
  edgeTriangleB: Int32Array;

  edgeRestLength: Float32Array;
  edgeRestDihedral: Float32Array;
  edgeEffectiveWidth: Float32Array;

  triangleNeighborOffsets: Uint32Array;
  triangleNeighbors: Uint32Array;

  vertexTriangleOffsets: Uint32Array;
  vertexTriangles: Uint32Array;

  boundaryEdgeMask: Uint8Array;
  mountProtectedTriangleMask: Uint8Array;
  mountProtectedEdgeMask: Uint8Array;

  originalSurfaceArea: number;
  originalMass: number;
};

export class TopologyBuilder {
  static build(
    geometry: THREE.BufferGeometry,
    fiberAngleRadians: number,
    thickness: number,
    density: number
  ): ArmorTopology {
    const pos = geometry.attributes.position;
    const idx = geometry.index;
    
    if (!pos || !idx) {
      throw new Error("Geometry must be indexed and have positions.");
    }
    
    // Scale-aware tolerance for welding (e.g., 1e-5 relative to typical bot size)
    const tolerance = 1e-5; 
    
    // Weld vertices
    const uniqueVertices: THREE.Vector3[] = [];
    const indexMap = new Map<number, number>();
    
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      let found = -1;
      for (let j = 0; j < uniqueVertices.length; j++) {
        if (uniqueVertices[j].distanceTo(v) < tolerance) {
          found = j;
          break;
        }
      }
      if (found !== -1) {
        indexMap.set(i, found);
      } else {
        indexMap.set(i, uniqueVertices.length);
        uniqueVertices.push(v);
      }
    }
    
    const restPositions = new Float32Array(uniqueVertices.length * 3);
    for (let i = 0; i < uniqueVertices.length; i++) {
      restPositions[i * 3] = uniqueVertices[i].x;
      restPositions[i * 3 + 1] = uniqueVertices[i].y;
      restPositions[i * 3 + 2] = uniqueVertices[i].z;
    }
    
    const rawTriangles: number[] = [];
    for (let i = 0; i < idx.count; i += 3) {
      const a = indexMap.get(idx.getX(i))!;
      const b = indexMap.get(idx.getX(i + 1))!;
      const c = indexMap.get(idx.getX(i + 2))!;
      if (a !== b && b !== c && c !== a) {
        // Compute area to filter out zero-area triangles
        const va = uniqueVertices[a], vb = uniqueVertices[b], vc = uniqueVertices[c];
        const ab = new THREE.Vector3().subVectors(vb, va);
        const ac = new THREE.Vector3().subVectors(vc, va);
        const area = ab.cross(ac).length() * 0.5;
        if (area > 1e-8) {
          rawTriangles.push(a, b, c);
        }
      }
    }
    
    // Remove duplicates
    const triSet = new Set<string>();
    const triangleIndices: number[] = [];
    for (let i = 0; i < rawTriangles.length; i += 3) {
      const sorted = [rawTriangles[i], rawTriangles[i+1], rawTriangles[i+2]].sort((a,b)=>a-b);
      const key = `${sorted[0]}_${sorted[1]}_${sorted[2]}`;
      if (!triSet.has(key)) {
        triSet.add(key);
        triangleIndices.push(rawTriangles[i], rawTriangles[i+1], rawTriangles[i+2]);
      }
    }
    
    const numTriangles = triangleIndices.length / 3;
    const triangleCentroids = new Float32Array(numTriangles * 3);
    const triangleNormals = new Float32Array(numTriangles * 3);
    const triangleAreas = new Float32Array(numTriangles);
    const triangleRestBasisU = new Float32Array(numTriangles * 3);
    const triangleRestBasisV = new Float32Array(numTriangles * 3);
    const triangleFiberDirection2D = new Float32Array(numTriangles * 2);
    
    let totalArea = 0;
    
    // Find edges
    const edgeMap = new Map<string, {a: number, b: number, t1: number, t2: number}>();
    
    for (let i = 0; i < numTriangles; i++) {
      const i3 = i * 3;
      const a = triangleIndices[i3];
      const b = triangleIndices[i3 + 1];
      const c = triangleIndices[i3 + 2];
      
      const va = uniqueVertices[a], vb = uniqueVertices[b], vc = uniqueVertices[c];
      
      const centroid = new THREE.Vector3().addVectors(va, vb).add(vc).divideScalar(3);
      triangleCentroids[i3] = centroid.x;
      triangleCentroids[i3+1] = centroid.y;
      triangleCentroids[i3+2] = centroid.z;
      
      const ab = new THREE.Vector3().subVectors(vb, va);
      const ac = new THREE.Vector3().subVectors(vc, va);
      const cross = new THREE.Vector3().crossVectors(ab, ac);
      
      const area = cross.length() * 0.5;
      triangleAreas[i] = area;
      totalArea += area;
      
      const normal = cross.normalize();
      triangleNormals[i3] = normal.x;
      triangleNormals[i3+1] = normal.y;
      triangleNormals[i3+2] = normal.z;
      
      const u = ab.clone().normalize();
      const v = new THREE.Vector3().crossVectors(normal, u).normalize();
      
      triangleRestBasisU[i3] = u.x;
      triangleRestBasisU[i3+1] = u.y;
      triangleRestBasisU[i3+2] = u.z;
      
      triangleRestBasisV[i3] = v.x;
      triangleRestBasisV[i3+1] = v.y;
      triangleRestBasisV[i3+2] = v.z;
      
      const fiberDir3D = new THREE.Vector3(Math.cos(fiberAngleRadians), Math.sin(fiberAngleRadians), 0);
      const fiberU = u.dot(fiberDir3D);
      const fiberV = v.dot(fiberDir3D);
      const fLen = Math.sqrt(fiberU*fiberU + fiberV*fiberV) || 1;
      triangleFiberDirection2D[i*2] = fiberU / fLen;
      triangleFiberDirection2D[i*2+1] = fiberV / fLen;
      
      const edges = [
        [Math.min(a,b), Math.max(a,b)],
        [Math.min(b,c), Math.max(b,c)],
        [Math.min(c,a), Math.max(c,a)]
      ];
      
      for (const [eA, eB] of edges) {
        const key = `${eA}_${eB}`;
        if (!edgeMap.has(key)) {
          edgeMap.set(key, {a: eA, b: eB, t1: i, t2: -1});
        } else {
          edgeMap.get(key)!.t2 = i;
        }
      }
    }
    
    const edges = Array.from(edgeMap.values());
    const numEdges = edges.length;
    
    const edgeVertexA = new Uint32Array(numEdges);
    const edgeVertexB = new Uint32Array(numEdges);
    const edgeTriangleA = new Int32Array(numEdges);
    const edgeTriangleB = new Int32Array(numEdges);
    
    const edgeRestLength = new Float32Array(numEdges);
    const edgeRestDihedral = new Float32Array(numEdges);
    const edgeEffectiveWidth = new Float32Array(numEdges);
    const boundaryEdgeMask = new Uint8Array(numEdges);
    
    for (let i = 0; i < numEdges; i++) {
      const e = edges[i];
      edgeVertexA[i] = e.a;
      edgeVertexB[i] = e.b;
      edgeTriangleA[i] = e.t1;
      edgeTriangleB[i] = e.t2;
      
      const va = uniqueVertices[e.a], vb = uniqueVertices[e.b];
      const len = va.distanceTo(vb);
      edgeRestLength[i] = len;
      
      if (e.t2 === -1) {
        boundaryEdgeMask[i] = 1;
        edgeRestDihedral[i] = 0;
        edgeEffectiveWidth[i] = triangleAreas[e.t1] / len;
      } else {
        boundaryEdgeMask[i] = 0;
        const n1 = new THREE.Vector3(triangleNormals[e.t1*3], triangleNormals[e.t1*3+1], triangleNormals[e.t1*3+2]);
        const n2 = new THREE.Vector3(triangleNormals[e.t2*3], triangleNormals[e.t2*3+1], triangleNormals[e.t2*3+2]);
        edgeRestDihedral[i] = Math.acos(Math.max(-1, Math.min(1, n1.dot(n2))));
        edgeEffectiveWidth[i] = (triangleAreas[e.t1] + triangleAreas[e.t2]) / len;
      }
    }
    
    return {
      restPositions,
      triangleIndices: new Uint32Array(triangleIndices),
      triangleCentroids,
      triangleNormals,
      triangleAreas,
      triangleRestBasisU,
      triangleRestBasisV,
      triangleFiberDirection2D,
      edgeVertexA,
      edgeVertexB,
      edgeTriangleA,
      edgeTriangleB,
      edgeRestLength,
      edgeRestDihedral,
      edgeEffectiveWidth,
      triangleNeighborOffsets: new Uint32Array(),
      triangleNeighbors: new Uint32Array(),
      vertexTriangleOffsets: new Uint32Array(),
      vertexTriangles: new Uint32Array(),
      boundaryEdgeMask,
      mountProtectedTriangleMask: new Uint8Array(numTriangles),
      mountProtectedEdgeMask: new Uint8Array(numEdges),
      originalSurfaceArea: totalArea,
      originalMass: totalArea * thickness * density
    };
  }
}
