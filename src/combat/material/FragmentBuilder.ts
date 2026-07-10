import * as THREE from 'three';
import { HybridArmorState } from './HybridDeformationSolver';

export class FragmentBuilder {
  static build(
    state: HybridArmorState,
    detachedTriangles: number[]
  ): { retained: THREE.BufferGeometry | null, fragment: THREE.BufferGeometry | null } {
    const { topology, positions, material } = state;
    const numTriangles = topology.triangleIndices.length / 3;
    const detachedSet = new Set(detachedTriangles);

    const thickness = material.totalThickness;
    const halfThick = thickness / 2;

    const buildMesh = (triangles: number[], isFragment: boolean) => {
      const pos: number[] = [];
      const idx: number[] = [];
      const groups: { start: number, count: number, materialIndex: number }[] = [];
      
      const vMap = new Map<number, number>();
      
      const addVert = (vIdx: number, offset: THREE.Vector3) => {
        const p = new THREE.Vector3(positions[vIdx*3], positions[vIdx*3+1], positions[vIdx*3+2]).add(offset);
        pos.push(p.x, p.y, p.z);
        return (pos.length / 3) - 1;
      };

      // We will extrude the surface along the vertex normals.
      // First, compute vertex normals for the subset.
      const vNormals = new Float32Array(positions.length);
      for (const t of triangles) {
        const iA = topology.triangleIndices[t*3];
        const iB = topology.triangleIndices[t*3+1];
        const iC = topology.triangleIndices[t*3+2];
        const n = new THREE.Vector3(topology.triangleNormals[t*3], topology.triangleNormals[t*3+1], topology.triangleNormals[t*3+2]);
        for (const i of [iA, iB, iC]) {
          vNormals[i*3] += n.x;
          vNormals[i*3+1] += n.y;
          vNormals[i*3+2] += n.z;
        }
      }

      // Normalize
      for (let i = 0; i < positions.length / 3; i++) {
        const n = new THREE.Vector3(vNormals[i*3], vNormals[i*3+1], vNormals[i*3+2]);
        if (n.lengthSq() > 0) n.normalize();
        vNormals[i*3] = n.x; vNormals[i*3+1] = n.y; vNormals[i*3+2] = n.z;
      }

      const topIdx: number[] = [];
      const botIdx: number[] = [];

      // Create Top and Bottom surfaces
      let triCount = 0;
      for (const t of triangles) {
        const iA = topology.triangleIndices[t*3];
        const iB = topology.triangleIndices[t*3+1];
        const iC = topology.triangleIndices[t*3+2];
        
        const getV = (i: number, isTop: boolean) => {
          const key = isTop ? i : -i - 1;
          if (!vMap.has(key)) {
            const n = new THREE.Vector3(vNormals[i*3], vNormals[i*3+1], vNormals[i*3+2]).multiplyScalar(isTop ? halfThick : -halfThick);
            vMap.set(key, addVert(i, n));
          }
          return vMap.get(key)!;
        };

        const tA = getV(iA, true), tB = getV(iB, true), tC = getV(iC, true);
        const bA = getV(iA, false), bB = getV(iB, false), bC = getV(iC, false);

        topIdx.push(tA, tB, tC);
        // Bottom is reversed winding
        botIdx.push(bA, bC, bB);
        triCount++;
      }

      let currentIndex = 0;
      groups.push({ start: currentIndex, count: topIdx.length, materialIndex: 0 });
      idx.push(...topIdx);
      currentIndex += topIdx.length;

      groups.push({ start: currentIndex, count: botIdx.length, materialIndex: 1 });
      idx.push(...botIdx);
      currentIndex += botIdx.length;

      // Find boundary edges
      const edgeCount = new Map<string, number[]>();
      for (const t of triangles) {
        const iA = topology.triangleIndices[t*3];
        const iB = topology.triangleIndices[t*3+1];
        const iC = topology.triangleIndices[t*3+2];
        
        const edges = [[iA, iB], [iB, iC], [iC, iA]];
        for (const [a, b] of edges) {
          const key = Math.min(a,b) + '_' + Math.max(a,b);
          if (!edgeCount.has(key)) edgeCount.set(key, []);
          edgeCount.get(key)!.push(a, b);
        }
      }

      const wallIdx: number[] = [];
      for (const [key, edgeVerts] of edgeCount.entries()) {
        if (edgeVerts.length === 2) { // Boundary edge
          const a = edgeVerts[0];
          const b = edgeVerts[1];
          const tA = vMap.get(a)!;
          const tB = vMap.get(b)!;
          const bA = vMap.get(-a-1)!;
          const bB = vMap.get(-b-1)!;

          // Wall quads
          wallIdx.push(tA, bA, tB);
          wallIdx.push(bA, bB, tB);
        }
      }

      groups.push({ start: currentIndex, count: wallIdx.length, materialIndex: 2 });
      idx.push(...wallIdx);

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geom.setIndex(idx);
      geom.computeVertexNormals();
      
      for (const g of groups) {
        geom.addGroup(g.start, g.count, g.materialIndex);
      }
      
      return geom;
    };

    let fragmentGeom: THREE.BufferGeometry | null = null;
    if (detachedTriangles.length > 0) {
      fragmentGeom = buildMesh(detachedTriangles, true);
    }

    const retainedTriangles: number[] = [];
    for (let t = 0; t < numTriangles; t++) {
      if (!detachedSet.has(t)) retainedTriangles.push(t);
    }

    let retainedGeom: THREE.BufferGeometry | null = null;
    if (retainedTriangles.length > 0) {
      retainedGeom = buildMesh(retainedTriangles, false);
    }

    return { retained: retainedGeom, fragment: fragmentGeom };
  }
}
