import * as THREE from 'three';
import { 
  CustomBotConfig, PlacedBotPart, AssemblyPlan, ResolvedAssemblyNode, 
  AssemblyIssue, AssemblyIssueCode, JointBuildDescriptor, Vec3, ResolvedTransform,
  ResolvedColliderBounds
} from '../types';
import { PART_TEMPLATES } from './partsCatalog';

export function finalizeAssemblyPlan(candidate: CustomBotConfig): AssemblyPlan {
  const seed = parseInt((candidate?.id || '').replace('auto_', '')) || 0;
  
  const plan: AssemblyPlan = {
    seed,
    rootInstanceId: candidate?.rootPartId || '',
    nodes: [],
    totalMass: 0,
    centerOfMass: [0,0,0],
    supportPolygon: [],
    inertiaEstimate: [0,0,0],
    jointDescriptors: [],
    issues: [],
    valid: false
  };

  // Traversal and resolution
  const partMap = new Map<string, PlacedBotPart>();
  if (!candidate || !candidate.parts) {
    plan.issues.push({ code: 'missing-root', severity: 'error', partInstanceIds: [], message: 'Root part missing.' });
    return plan;
  }
  candidate.parts.forEach(p => partMap.set(p.instanceId, p));

  const root = partMap.get(candidate.rootPartId);
  if (!root) {
    plan.issues.push({ code: 'missing-root', severity: 'error', partInstanceIds: [], message: 'Root part missing.' });
    return plan;
  }

  const resolvedMap = new Map<string, ResolvedAssemblyNode>();
  const visited = new Set<string>();

  const resolveNode = (instanceId: string, depth: number): ResolvedAssemblyNode | null => {
    if (resolvedMap.has(instanceId)) return resolvedMap.get(instanceId)!;
    if (visited.has(instanceId)) {
      plan.issues.push({ code: 'cycle-detected', severity: 'error', partInstanceIds: [instanceId], message: 'Cycle detected in assembly.' });
      return null;
    }
    visited.add(instanceId);

    const part = partMap.get(instanceId);
    if (!part) return null;

    const def = PART_TEMPLATES.find(t => t.templateId === part.definitionId);
    if (!def) {
      plan.issues.push({ code: 'missing-definition', severity: 'error', partInstanceIds: [instanceId], message: `Definition ${part.definitionId} not found.` });
      return null;
    }

    const localTrans: ResolvedTransform = {
      position: [...part.localPosition] as Vec3,
      rotation: [0,0,0,1] // We will use quaternions internally
    };
    
    // Euler to Quat for localRotation
    const localQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(part.localRotation[0], part.localRotation[1], part.localRotation[2]));
    localTrans.rotation = [localQ.x, localQ.y, localQ.z, localQ.w];

    let worldPos = new THREE.Vector3(...localTrans.position);
    let worldQuat = localQ.clone();

    if (part.parentInstanceId) {
      const parentNode = resolveNode(part.parentInstanceId, depth + 1);
      if (!parentNode) return null;
      
      const parentObj = new THREE.Object3D();
      parentObj.position.set(...parentNode.worldTransform.position);
      parentObj.quaternion.set(...parentNode.worldTransform.rotation);
      
      // parent socket offset is ALREADY supposed to be part.localPosition according to types, but we'll strictly compose:
      // parent world * part local
      const childObj = new THREE.Object3D();
      childObj.position.set(...localTrans.position);
      childObj.quaternion.copy(localQ);
      parentObj.add(childObj);
      parentObj.updateMatrixWorld(true);
      
      childObj.getWorldPosition(worldPos);
      childObj.getWorldQuaternion(worldQuat);

      // Symmetrical Wheel Alignment Adjustment:
      // Ensure the tire and rim do not intersect/clip into the chassis by offsetting them outward
      if (def.type === 'wheel') {
        const d = (def.size && def.size[2]) || 0.2;
        const offset = d / 2 + 0.04; // Half-width plus 0.04m clearance
        if (worldPos.x > 0.01) {
          localTrans.position[0] += offset;
        } else if (worldPos.x < -0.01) {
          localTrans.position[0] -= offset;
        }
        
        // Re-compose with the correct offset
        childObj.position.set(...localTrans.position);
        parentObj.updateMatrixWorld(true);
        childObj.getWorldPosition(worldPos);
        childObj.getWorldQuaternion(worldQuat);
      }
    } else {
      if (def.type === 'wheel') {
        const d = (def.size && def.size[2]) || 0.2;
        const offset = d / 2 + 0.04;
        if (worldPos.x > 0.01) {
          localTrans.position[0] += offset;
        } else if (worldPos.x < -0.01) {
          localTrans.position[0] -= offset;
        }
        worldPos.set(...localTrans.position);
      }
    }

    const node: ResolvedAssemblyNode = {
      instanceId,
      definitionId: part.definitionId,
      category: def.type as any,
      parentInstanceId: part.parentInstanceId,
      parentSocketId: part.parentSocketId,
      localPosition: [...localTrans.position] as Vec3,
      localRotation: [...part.localRotation] as Vec3,
      worldTransform: {
        position: [worldPos.x, worldPos.y, worldPos.z],
        rotation: [worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w]
      },
      mass: def.mass || 1,
      worldCenterOfMass: [worldPos.x, worldPos.y, worldPos.z],
      colliderBounds: []
    };
    
    // Extract colliders
    if (def.colliders) {
      node.colliderBounds = def.colliders.map(c => {
         const cObj = new THREE.Object3D();
         cObj.position.set(...worldPos.toArray());
         cObj.quaternion.copy(worldQuat);
         
         const localC = new THREE.Object3D();
         localC.position.set(...c.localPosition);
         localC.quaternion.setFromEuler(new THREE.Euler(...c.localRotation));
         cObj.add(localC);
         cObj.updateMatrixWorld(true);
         
         const cwp = new THREE.Vector3();
         const cwq = new THREE.Quaternion();
         localC.getWorldPosition(cwp);
         localC.getWorldQuaternion(cwq);
         return {
           kind: c.kind,
           worldPosition: [cwp.x, cwp.y, cwp.z],
           worldRotation: [cwq.x, cwq.y, cwq.z, cwq.w],
           dimensions: c.dimensions
         };
      });
    }

    // Wheel parsing
    if (node.category === 'wheel') {
       // Check if left or right based on local x offset
       const side = part.localPosition[0] < 0 ? 'left' : part.localPosition[0] > 0 ? 'right' : 'center';
       // We'll enforce axle along local X
       const axleAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(worldQuat).normalize();
       const rollingDir = new THREE.Vector3(0, 0, -1).applyQuaternion(worldQuat).normalize();
       const groundDir = new THREE.Vector3(0, -1, 0).applyQuaternion(worldQuat).normalize();
       
       const isCylinder = def.shape === 'cylinder';
       const wRadius = isCylinder 
         ? ((def.size && def.size[0]) || 0.25) 
         : ((def.size && def.size[1] / 2) || 0.25);
       const wWidth = isCylinder 
         ? ((def.size && def.size[2]) || 0.2) 
         : ((def.size && def.size[0]) || 0.2);
       
       node.wheel = {
         partInstanceId: instanceId,
         side,
         worldCenter: [worldPos.x, worldPos.y, worldPos.z],
         axleAxisWorld: [axleAxis.x, axleAxis.y, axleAxis.z],
         rollingDirectionWorld: [rollingDir.x, rollingDir.y, rollingDir.z],
         groundDirectionWorld: [groundDir.x, groundDir.y, groundDir.z],
         tireRadius: wRadius,
         tireWidth: wWidth,
         rimRadius: wRadius * 0.8,
         rimWidth: wWidth,
         meshRotation: [worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w],
         colliderRotation: [worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w],
         motorAxisWorld: [axleAxis.x, axleAxis.y, axleAxis.z],
         motorDirectionSign: side === 'left' ? -1 : 1,
         groundContactPoint: [worldPos.x, worldPos.y - wRadius, worldPos.z],
         sweepRadius: wRadius
       };
    }
    
    // Weapon parsing
    if (node.category === 'weapon') {
       const spinAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(worldQuat).normalize();
       node.weapon = {
         partInstanceId: instanceId,
         worldPivot: [worldPos.x, worldPos.y, worldPos.z],
         spinAxisWorld: [spinAxis.x, spinAxis.y, spinAxis.z]
       };
    }

    resolvedMap.set(instanceId, node);
    plan.nodes.push(node);
    return node;
  };

  candidate.parts.forEach(p => resolveNode(p.instanceId, 0));

  // Compute Mass Properties
  let tMass = 0;
  let cm = new THREE.Vector3();
  plan.nodes.forEach(n => {
     tMass += n.mass;
     cm.add(new THREE.Vector3(...n.worldCenterOfMass).multiplyScalar(n.mass));
  });
  if (tMass > 0) cm.divideScalar(tMass);
  plan.totalMass = tMass;
  plan.centerOfMass = [cm.x, cm.y, cm.z];
  plan.inertiaEstimate = [tMass * 0.4, tMass * 0.4, tMass * 0.4];

  // Wheel validation and Support Polygon
  const wheels = plan.nodes.filter(n => n.wheel);
  if (wheels.length < 2) {
    plan.issues.push({ code: 'insufficient-locomotion', severity: 'error', partInstanceIds: [], message: 'Less than 2 wheels' });
  } else {
    wheels.forEach(w => {
       plan.supportPolygon.push([w.wheel!.groundContactPoint[0], w.wheel!.groundContactPoint[2]]);
    });
  }

  if (plan.totalMass > 250) {
    plan.issues.push({ code: 'mass-limit-exceeded', severity: 'error', partInstanceIds: [], message: 'Over 250kg' });
  }

  // Generate joint descriptors
  plan.nodes.forEach(n => {
    if (n.parentInstanceId) {
       let kind: 'fixed' | 'revolute' | 'prismatic' = 'fixed';
       let motor = undefined;
       let axisLocal: Vec3 | undefined = undefined;
       
       if (n.wheel) {
         kind = 'revolute';
         axisLocal = [1, 0, 0];
         motor = { targetVelocity: 0, stiffness: 0, damping: 10, maximumForceOrImpulse: 500, directionSign: n.wheel.motorDirectionSign };
       } else if (n.weapon) {
         kind = 'revolute';
         axisLocal = [1, 0, 0];
         motor = { targetVelocity: 0, stiffness: 0, damping: 5, maximumForceOrImpulse: 1000, directionSign: 1 };
       }
       
       plan.jointDescriptors.push({
         id: `joint_${n.instanceId}`,
         parentInstanceId: n.parentInstanceId,
         childInstanceId: n.instanceId,
         kind,
         parentAnchorLocal: n.localPosition,
         childAnchorLocal: [0,0,0],
         axisLocal,
         motor
       });
    }
  });

  plan.valid = plan.issues.filter(i => i.severity === 'error').length === 0;
  return plan;
}
