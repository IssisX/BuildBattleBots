import * as THREE from 'three';
import { 
  CustomBotConfig, AssemblyPlan, CombatMechanicalState, RuntimeMechanicalNode,
  RuntimeStructuralEdge, RuntimeWheelState, RuntimeWeaponState, ResolvedGroundSupport,
  BotControlIntent, ImpactLoadPacket, StructuralCapacityProfile, DriveMechanicalProfile,
  WeaponActuatorProfile, GroundSupportProfile, Vec3, CombatLedgerEvent, BotPartCategory
} from '../types';

// Standard 3D vector helpers to avoid allocation in hot loops
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

export function getStructuralCapacityProfile(category: BotPartCategory, definitionId: string): StructuralCapacityProfile {
  return {
    axialImpulseYield: 60.0,
    shearImpulseYield: 50.0,
    bendingAngularImpulseYield: 40.0,
    torsionalAngularImpulseYield: 35.0,
    ultimateLoadMultiplier: 2.0,
    fatigueStartRatio: 0.4,
    fatigueExponent: 2.0,
    elasticCompliance: 1.0,
    postYieldCompliance: 2.5,
    damping: 6.0,
    failureMode: category === 'wheel' ? 'loosen' : category === 'weapon' ? 'bend' : 'loosen'
  };
}

export function getDriveMechanicalProfile(definitionId: string): DriveMechanicalProfile {
  return {
    wheelInertia: 0.04,
    maximumMotorTorque: 95.0,
    maximumAngularVelocity: 45.0,
    brakeTorque: 120.0,
    longitudinalSlipStiffness: 12.0,
    lateralSlipStiffness: 18.0,
    axleBendingCapacity: 50.0,
    bearingDrag: 0.15,
    seizureThreshold: 0.95
  };
}

export function getWeaponActuatorProfile(definitionId: string, weaponKind: string): WeaponActuatorProfile {
  return {
    actuatorKind: weaponKind === 'flipper' || weaponKind === 'hammer' ? 'limited-angle' : 'rotary',
    inertia: 0.18,
    motorTorque: 140.0,
    passiveDrag: 0.25,
    maximumAngularVelocity: 110.0,
    energyCapacity: 600,
    recoverySeconds: 1.8,
    shaftBendingCapacity: 90.0,
    imbalanceSensitivity: 1.2,
    jamThreshold: 0.88
  };
}

export function getGroundSupportProfile(definitionId: string, category: BotPartCategory): GroundSupportProfile {
  if (category === 'wheel') {
    return {
      kind: 'driven-wheel',
      localContactPoints: [[0, 0, 0]],
      longitudinalFriction: 1.2,
      lateralFriction: 1.4,
      staticFriction: 1.6,
      rollingResistance: 0.02,
      loadBearing: true
    };
  }
  const isWedge = definitionId.includes('wedge') || definitionId.includes('ramp') || definitionId.includes('skid') || definitionId.includes('behemoth');
  return {
    kind: isWedge ? 'skid' : 'chassis-patch',
    localContactPoints: isWedge ? [[0, -0.22, -0.85]] : [[0, -0.25, 0]],
    longitudinalFriction: isWedge ? 0.35 : 0.55,
    lateralFriction: isWedge ? 0.45 : 0.65,
    staticFriction: 0.5,
    rollingResistance: 0.12,
    loadBearing: isWedge
  };
}

export function initializeCombatMechanicalState(config: CustomBotConfig, plan: AssemblyPlan, botId: string): CombatMechanicalState {
  const nodeIndexByInstanceId = new Map<string, number>();
  const edgeIndexByJointId = new Map<string, number>();

  const nodes: RuntimeMechanicalNode[] = plan.nodes.map((node, idx) => {
    nodeIndexByInstanceId.set(node.instanceId, idx);
    return {
      nodeIndex: idx,
      partInstanceId: node.instanceId,
      definitionId: node.definitionId,
      category: node.category,
      parentEdgeIndex: -1,
      mass: node.mass,
      localCenterOfMass: [0, 0, 0],
      materialIntegrity: 1.0,
      mountIntegrity: 1.0,
      fatigue: 0.0,
      capability: {
        structuralMultiplier: 1.0,
        actuatorEfficiency: 1.0,
        alignmentQuality: 1.0,
        frictionMultiplier: 1.0,
        rollingResistanceMultiplier: 1.0,
        dragMultiplier: 1.0,
        vibrationAmplitude: 0.0
      },
      failureState: 'nominal'
    };
  });

  const edges: RuntimeStructuralEdge[] = plan.jointDescriptors.map((jd, idx) => {
    const parentNodeIndex = nodeIndexByInstanceId.get(jd.parentInstanceId) ?? 0;
    const childNodeIndex = nodeIndexByInstanceId.get(jd.childInstanceId) ?? 0;

    const childNode = nodes[childNodeIndex];
    if (childNode) {
      childNode.parentEdgeIndex = idx;
    }

    edgeIndexByJointId.set(jd.id, idx);
    const capacity = getStructuralCapacityProfile(childNode?.category ?? 'connector', childNode?.definitionId ?? '');

    return {
      edgeIndex: idx,
      jointId: jd.id,
      parentNodeIndex,
      childNodeIndex,
      kind: jd.kind,
      anchorWorld: [0, 0, 0],
      loadAxisWorld: [1, 0, 0],
      capacity,
      fatigue: 0.0,
      permanentSet: 0.0,
      complianceMultiplier: 1.0,
      demandRatio: 0.0,
      state: 'elastic'
    };
  });

  const wheels: RuntimeWheelState[] = plan.nodes
    .filter(n => n.category === 'wheel' && n.wheel)
    .map(n => ({
      partInstanceId: n.instanceId,
      angularVelocity: 0.0,
      angle: 0.0,
      torque: 0.0,
      slip: [0, 0],
      wobbleAngle: 0.0,
      seized: false,
      detached: false
    }));

  const weapons: RuntimeWeaponState[] = plan.nodes
    .filter(n => n.category === 'weapon' && n.weapon)
    .map(n => ({
      partInstanceId: n.instanceId,
      angularVelocity: 0.0,
      angle: 0.0,
      storedKineticEnergy: 0.0,
      jammed: false,
      seized: false,
      detached: false
    }));

  const supportContacts: ResolvedGroundSupport[] = [];
  plan.nodes.forEach(node => {
    if (node.wheel) {
      supportContacts.push({
        id: `support_wheel_${node.instanceId}`,
        partInstanceId: node.instanceId,
        kind: 'driven-wheel',
        worldContactPoints: [node.wheel.groundContactPoint],
        active: true,
        normalLoad: 0.0,
        longitudinalSlip: 0.0,
        lateralSlip: 0.0
      });
    } else {
      const profile = getGroundSupportProfile(node.definitionId, node.category);
      if (profile.loadBearing) {
        supportContacts.push({
          id: `support_skid_${node.instanceId}`,
          partInstanceId: node.instanceId,
          kind: profile.kind,
          worldContactPoints: [],
          active: false,
          normalLoad: 0.0,
          longitudinalSlip: 0.0,
          lateralSlip: 0.0
        });
      }
    }
  });

  return {
    botId,
    assemblyFingerprint: `${config.id}_${config.updatedAt}`,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes,
    edges,
    wheels,
    weapons,
    nodeIndexByInstanceId,
    edgeIndexByJointId,
    supportContacts,
    centerOfMassLocal: plan.centerOfMass,
    totalMass: plan.totalMass,
    inertiaEstimate: plan.inertiaEstimate,
    processedImpactEvents: new Set<string>(),
    eventLedger: [],
    simulationTick: 0,
    active: true
  };
}

export function resolveGroundSupports(
  state: CombatMechanicalState,
  bodyPos: Vec3,
  bodyRotation: [number, number, number, number],
  plan: AssemblyPlan
) {
  _v1.fromArray(bodyPos);
  _q1.fromArray(bodyRotation);

  const GRAVITY = 9.81;
  const W = state.totalMass * GRAVITY;

  // 1. Transform contact points to world space
  state.supportContacts.forEach(support => {
    const node = plan.nodes.find(n => n.instanceId === support.partInstanceId);
    if (!node) return;

    const profile = getGroundSupportProfile(node.definitionId, node.category);
    support.worldContactPoints = profile.localContactPoints.map(localPt => {
      let pt: THREE.Vector3;
      if (node.wheel) {
        // node.wheel.groundContactPoint is already the bottom contact point in bot-local space!
        pt = new THREE.Vector3().fromArray(node.wheel.groundContactPoint);
      } else {
        // transform from local part space to bot local space
        pt = new THREE.Vector3().fromArray(localPt);
        const nPos = new THREE.Vector3().fromArray(node.worldTransform.position);
        const nRot = new THREE.Quaternion().fromArray(node.worldTransform.rotation);
        pt.applyQuaternion(nRot).add(nPos);
      }
      // Bot local space to world space (using bodyPos and bodyRotation parsed in _q1 and _v1)
      pt.applyQuaternion(_q1).add(_v1);
      return [pt.x, pt.y, pt.z];
    });

    // Check if bottom contact point is touching the expected floor band (Y near 0)
    const lowestY = Math.min(...support.worldContactPoints.map(p => p[1]));
    support.active = lowestY <= 0.25; // Contact threshold
  });

  // 2. Solve static loads using determinant/Cramer's rule solver
  const activeSupports = state.supportContacts.filter(s => s.active);
  if (activeSupports.length === 0) {
    state.supportContacts.forEach(s => s.normalLoad = 0);
    return;
  }

  // Position of COM in world coordinates
  const comWorld = _v1.clone().add(new THREE.Vector3().fromArray(state.centerOfMassLocal).applyQuaternion(_q1));

  if (activeSupports.length === 1) {
    state.supportContacts.forEach(s => s.normalLoad = s.active ? W : 0);
    return;
  }

  let S1 = activeSupports.length;
  let Sx = 0, Sz = 0;
  let Sxx = 0, Szz = 0, Sxz = 0;

  activeSupports.forEach(s => {
    const pt = s.worldContactPoints[0];
    const dx = pt[0] - comWorld.x;
    const dz = pt[2] - comWorld.z;
    Sx += dx;
    Sz += dz;
    Sxx += dx * dx;
    Szz += dz * dz;
    Sxz += dx * dz;
  });

  const M00 = S1, M01 = Sx, M02 = Sz;
  const M10 = Sx, M11 = Sxx, M12 = Sxz;
  const M20 = Sz, M21 = Sxz, M22 = Szz;

  const det = M00 * (M11 * M22 - M12 * M21) - M01 * (M10 * M22 - M12 * M20) + M02 * (M10 * M21 - M11 * M20);

  if (Math.abs(det) > 1e-6) {
    const A = (W * (M11 * M22 - M12 * M21)) / det;
    const B = (-W * (M10 * M22 - M12 * M20)) / det;
    const C = (W * (M10 * M21 - M11 * M20)) / det;

    let sum = 0;
    activeSupports.forEach(s => {
      const pt = s.worldContactPoints[0];
      const dx = pt[0] - comWorld.x;
      const dz = pt[2] - comWorld.z;
      const load = Math.max(0, A + B * dx + C * dz);
      s.normalLoad = load;
      sum += load;
    });

    if (sum > 0) {
      activeSupports.forEach(s => {
        s.normalLoad = (s.normalLoad / sum) * W;
      });
    } else {
      activeSupports.forEach(s => s.normalLoad = W / S1);
    }
  } else {
    // Fallback: simple distance weight distribution
    let totalInvDist = 0;
    const dists = activeSupports.map(s => {
      const pt = s.worldContactPoints[0];
      const dx = pt[0] - comWorld.x;
      const dz = pt[2] - comWorld.z;
      const d = Math.sqrt(dx * dx + dz * dz) + 0.01;
      totalInvDist += 1 / d;
      return d;
    });

    activeSupports.forEach((s, idx) => {
      s.normalLoad = ((1 / dists[idx]) / totalInvDist) * W;
    });
  }
}

export function updateWheelGroundDynamics(
  state: CombatMechanicalState,
  intent: BotControlIntent,
  bodyLinearVel: Vec3,
  bodyAngularVel: Vec3,
  bodyOrientation: [number, number, number, number],
  bodyPos: Vec3,
  plan: AssemblyPlan,
  delta: number
): { forces: { force: Vec3; point: Vec3 }[]; reactionTorque: Vec3 } {
  const resultForces: { force: Vec3; point: Vec3 }[] = [];
  const reactionTorque = new THREE.Vector3();

  _q1.fromArray(bodyOrientation);
  const linvel = new THREE.Vector3().fromArray(bodyLinearVel);
  const angvel = new THREE.Vector3().fromArray(bodyAngularVel);

  state.wheels.forEach(wheelState => {
    const node = plan.nodes.find(n => n.instanceId === wheelState.partInstanceId);
    if (!node || !node.wheel || wheelState.detached) return;

    const runtimeNode = state.nodes[state.nodeIndexByInstanceId.get(wheelState.partInstanceId)!];
    const capability = runtimeNode.capability;
    const profile = getDriveMechanicalProfile(node.definitionId);

    // Apply continuous seizure risk if damaged
    if (runtimeNode.mountIntegrity < profile.seizureThreshold && Math.random() < (1.0 - runtimeNode.mountIntegrity) * 0.05) {
      wheelState.seized = true;
      state.eventLedger.push({
        type: 'jammed',
        eventId: `seize_${state.simulationTick}`,
        tick: state.simulationTick,
        partInstanceId: wheelState.partInstanceId
      });
    }

    // Determine normal load from ResolvedGroundSupport
    const support = state.supportContacts.find(s => s.partInstanceId === wheelState.partInstanceId);
    const normalLoad = support?.active ? support.normalLoad : 0;

    // Local-world directions
    const axleAxis = new THREE.Vector3().fromArray(node.wheel.axleAxisWorld).applyQuaternion(_q1).normalize();
    const rollingDirection = new THREE.Vector3().fromArray(node.wheel.rollingDirectionWorld).applyQuaternion(_q1).normalize();
    const lateralDirection = new THREE.Vector3().fromArray(node.wheel.groundDirectionWorld).applyQuaternion(_q1).cross(axleAxis).normalize();

    // Bot center of mass in world space
    const comWorld = new THREE.Vector3().fromArray(state.centerOfMassLocal).applyQuaternion(_q1).add(new THREE.Vector3().fromArray(bodyPos));

    // Wheel contact point in world space
    const contactPoint = new THREE.Vector3().fromArray(node.wheel.groundContactPoint).applyQuaternion(_q1).add(new THREE.Vector3().fromArray(bodyPos));

    // vContact = vLinear + wBody x (contactPointWorld - comWorld)
    const rContact = new THREE.Vector3().subVectors(contactPoint, comWorld);
    const vContact = linvel.clone().add(angvel.clone().cross(rContact));

    // Motor and Drive Calculations
    const isLeft = node.wheel.side === 'left';
    // Differential steering mixes steering + throttle
    const driveInput = intent.throttle * 0.9 + (isLeft ? intent.steering : -intent.steering) * 0.8;
    const targetDriveTorque = driveInput * profile.maximumMotorTorque * capability.actuatorEfficiency;

    let appliedMotorTorque = wheelState.seized ? 0 : targetDriveTorque;
    let brakingTorque = intent.brake * profile.brakeTorque;

    // Contact Slip Calculations
    // surface velocity = (axle x wWheel) x rContact
    const surfaceVelMag = wheelState.angularVelocity * node.wheel.tireRadius;
    const surfaceVelocity = rollingDirection.clone().multiplyScalar(surfaceVelMag);

    const slipVelocity = vContact.clone().sub(surfaceVelocity);
    const slipLong = slipVelocity.dot(rollingDirection);
    const slipLat = slipVelocity.dot(lateralDirection);

    wheelState.slip = [slipLong, slipLat];

    // Friction limit
    const mu = (isLeft ? 1.2 : 1.25) * capability.frictionMultiplier;
    const maxFrictionForce = mu * normalLoad;

    // Smooth saturation curve near the friction limit (hyperbolic tangent)
    const slipStiffness = Math.sqrt(slipLong * slipLong * profile.longitudinalSlipStiffness + slipLat * slipLat * profile.lateralSlipStiffness) + 1e-5;
    const tractionMag = maxFrictionForce * Math.tanh(slipStiffness * 0.35) * 0.5;

    const forceLongMag = -tractionMag * (slipLong / slipStiffness);
    const forceLatMag = -tractionMag * (slipLat / slipStiffness);

    const tractionForce = rollingDirection.clone().multiplyScalar(forceLongMag).add(lateralDirection.clone().multiplyScalar(forceLatMag));

    // Contact torque opposes motor
    const contactTorque = forceLongMag * node.wheel.tireRadius;
    const supportProfile = getGroundSupportProfile(node.definitionId, 'wheel');
    const rollingResistance = supportProfile.rollingResistance * normalLoad * capability.rollingResistanceMultiplier;
    const dragTorque = (wheelState.angularVelocity * profile.bearingDrag) * capability.dragMultiplier;

    // Integrate wheel angular velocity
    if (!wheelState.seized) {
      const netTorque = appliedMotorTorque - contactTorque - (Math.sign(wheelState.angularVelocity) * (brakingTorque + rollingResistance + dragTorque));
      const accel = netTorque / profile.wheelInertia;
      wheelState.angularVelocity += accel * delta;
      wheelState.angularVelocity = THREE.MathUtils.clamp(wheelState.angularVelocity, -profile.maximumAngularVelocity, profile.maximumAngularVelocity);
    } else {
      wheelState.angularVelocity = 0;
    }

    wheelState.angle += wheelState.angularVelocity * delta;

    // Save forces
    if (normalLoad > 0) {
      resultForces.push({
        force: [tractionForce.x, tractionForce.y, tractionForce.z],
        point: [contactPoint.x, contactPoint.y, contactPoint.z]
      });
    }

    // Reaction torque onto chassis
    const wheelReaction = axleAxis.clone().multiplyScalar(-(appliedMotorTorque - brakingTorque) * 0.5);
    reactionTorque.add(wheelReaction);
  });

  return { forces: resultForces, reactionTorque: [reactionTorque.x, reactionTorque.y, reactionTorque.z] };
}

export function updateWeaponDynamicsAndMomentum(
  state: CombatMechanicalState,
  intent: BotControlIntent,
  bodyAngularVel: Vec3,
  bodyOrientation: [number, number, number, number],
  plan: AssemblyPlan,
  delta: number
): { reactionTorque: Vec3; weaponRPM: number } {
  const reactionTorque = new THREE.Vector3();
  let maxWeaponRPM = 0;

  _q1.fromArray(bodyOrientation);

  state.weapons.forEach(weaponState => {
    const node = plan.nodes.find(n => n.instanceId === weaponState.partInstanceId);
    if (!node || !node.weapon || weaponState.detached) return;

    const runtimeNode = state.nodes[state.nodeIndexByInstanceId.get(weaponState.partInstanceId)!];
    const capability = runtimeNode.capability;
    const profile = getWeaponActuatorProfile(node.definitionId, 'spinner');

    // Continuous load Jam Check
    if (runtimeNode.mountIntegrity < profile.jamThreshold && Math.random() < (1.0 - runtimeNode.mountIntegrity) * 0.04) {
      weaponState.jammed = true;
    }

    const appliedMotorTorque = (weaponState.jammed || weaponState.seized) 
      ? 0 
      : intent.weaponCommand * profile.motorTorque * capability.actuatorEfficiency;

    const drag = profile.passiveDrag * capability.dragMultiplier;
    const netTorque = appliedMotorTorque - (Math.sign(weaponState.angularVelocity) * drag * (Math.abs(weaponState.angularVelocity) + 1.0));

    const accel = netTorque / profile.inertia;
    weaponState.angularVelocity += accel * delta;
    weaponState.angularVelocity = THREE.MathUtils.clamp(weaponState.angularVelocity, -profile.maximumAngularVelocity, profile.maximumAngularVelocity);

    weaponState.angle += weaponState.angularVelocity * delta;
    weaponState.storedKineticEnergy = 0.5 * profile.inertia * weaponState.angularVelocity * weaponState.angularVelocity;

    const rpm = (Math.abs(weaponState.angularVelocity) * 60) / (2 * Math.PI);
    if (rpm > maxWeaponRPM) maxWeaponRPM = rpm;

    // Gyroscopic precession calculation
    // L = I * w_weapon
    const spinAxis = new THREE.Vector3().fromArray(node.weapon.spinAxisWorld).applyQuaternion(_q1).normalize();
    const angularMomentum = spinAxis.clone().multiplyScalar(profile.inertia * weaponState.angularVelocity);
    
    // T_gyro = w_chassis x L
    const chassisW = new THREE.Vector3().fromArray(bodyAngularVel);
    const gyroTorque = chassisW.clone().cross(angularMomentum);

    // Scale it to match the realistic 10x heavier bot physics (since bot is 120kg instead of 12kg)
    gyroTorque.multiplyScalar(0.5);

    // Apply gyro torque directly back onto chassis reaction
    reactionTorque.add(gyroTorque.negate());

    // Apply motor reaction torque (Newton's third law)
    const motorReaction = spinAxis.clone().multiplyScalar(-netTorque * 0.5);
    reactionTorque.add(motorReaction);

    // Continuous structural load back to mount
    const continuousLoad = gyroTorque.length();
    runtimeNode.fatigue += continuousLoad * 0.0001 * delta;
  });

  return { reactionTorque: [reactionTorque.x, reactionTorque.y, reactionTorque.z], weaponRPM: maxWeaponRPM };
}

export function propagateImpactLoad(
  state: CombatMechanicalState,
  impactPacket: ImpactLoadPacket,
  plan: AssemblyPlan
): { damageEvents: string[]; detachedParts: string[] } {
  const damageEvents: string[] = [];
  const detachedParts: string[] = [];

  // Idempotency check
  if (state.processedImpactEvents.has(impactPacket.eventId)) {
    return { damageEvents, detachedParts };
  }
  state.processedImpactEvents.add(impactPacket.eventId);

  // Struck Node Index
  const struckIdx = state.nodeIndexByInstanceId.get(impactPacket.struckPartInstanceId);
  if (struckIdx === undefined) return { damageEvents, detachedParts };

  let currentNodeIdx = struckIdx;
  const F = new THREE.Vector3().fromArray(impactPacket.linearImpulseWorld);
  const contactPt = new THREE.Vector3().fromArray(impactPacket.worldContactPoint);

  let currentTransferEnergy = impactPacket.transferableEnergy;

  // Track event in Ledger
  state.eventLedger.push({
    type: 'impact',
    eventId: impactPacket.eventId,
    tick: state.simulationTick,
    partInstanceId: impactPacket.struckPartInstanceId,
    energy: impactPacket.normalEnergy,
    impulse: F.length()
  });

  // Traverse structurally from struck node to root
  while (currentNodeIdx !== -1) {
    const node = state.nodes[currentNodeIdx];
    const planNode = plan.nodes[currentNodeIdx];
    if (!node || !planNode) break;

    // Apply local fatigue and integrity degradation based on energy absorption
    const absorbedNodeEnergy = currentTransferEnergy * 0.25;
    currentTransferEnergy -= absorbedNodeEnergy;

    node.fatigue += absorbedNodeEnergy * 0.01;
    node.materialIntegrity = Math.max(0, node.materialIntegrity - absorbedNodeEnergy * 0.005);

    // Calculate edge parameters
    const edgeIdx = node.parentEdgeIndex;
    if (edgeIdx === -1) break; // Reached root

    const edge = state.edges[edgeIdx];
    
    // Joint anchor relative distance
    const anchorWorld = new THREE.Vector3().fromArray(plan.jointDescriptors[edgeIdx].parentAnchorLocal).applyQuaternion(_q1).add(_v1); // Approx transform
    const r = new THREE.Vector3().subVectors(contactPt, anchorWorld);
    const angularImpulse = r.clone().cross(F);

    // Resolve structural capacities
    const loadAxis = new THREE.Vector3().fromArray(edge.loadAxisWorld);
    const Jaxial = Math.abs(F.dot(loadAxis));
    const Jshear = F.clone().projectOnPlane(loadAxis).length();

    const Htorsion = Math.abs(angularImpulse.dot(loadAxis));
    const Hbending = angularImpulse.clone().projectOnPlane(loadAxis).length();

    // Combined quadratic demand ratio
    const C = edge.capacity;
    const demand = Math.sqrt(
      Math.pow(Jaxial / C.axialImpulseYield, 2) +
      Math.pow(Jshear / C.shearImpulseYield, 2) +
      Math.pow(Hbending / C.bendingAngularImpulseYield, 2) +
      Math.pow(Htorsion / C.torsionalAngularImpulseYield, 2)
    );

    edge.demandRatio = demand;
    edge.fatigue += demand * 0.05 * impactPacket.fatigueSusceptibility;

    // Apply state transitions with hysteresis
    if (edge.state === 'elastic' && demand > 1.0) {
      edge.state = 'yielded';
      node.mountIntegrity = Math.max(0.2, node.mountIntegrity - 0.35);
      damageEvents.push(`Mount on part ${node.partInstanceId} yielded under heavy strain!`);
      
      state.eventLedger.push({
        type: 'yielded',
        eventId: `${impactPacket.eventId}_yield_${currentNodeIdx}`,
        tick: state.simulationTick,
        jointId: edge.jointId,
        demandRatio: demand,
        msg: `Structural mount permanent yield`
      });
    }

    if (edge.state === 'yielded' && (demand > C.ultimateLoadMultiplier || edge.fatigue > 1.0)) {
      edge.state = 'loose';
      node.mountIntegrity = Math.max(0.1, node.mountIntegrity - 0.45);
      damageEvents.push(`Mount on part ${node.partInstanceId} is dangerously LOOSE!`);
    }

    if ((edge.state === 'loose' || edge.state === 'yielded') && (demand > C.ultimateLoadMultiplier * 1.5 || edge.fatigue > 1.8)) {
      edge.state = 'failed';
      node.failureState = 'detached';
      node.mountIntegrity = 0;
      detachedParts.push(node.partInstanceId);
      
      state.eventLedger.push({
        type: 'joint_failed',
        eventId: `${impactPacket.eventId}_fail_${currentNodeIdx}`,
        tick: state.simulationTick,
        jointId: edge.jointId
      });
      state.eventLedger.push({
        type: 'detached',
        eventId: `${impactPacket.eventId}_detach_${currentNodeIdx}`,
        tick: state.simulationTick,
        partInstanceId: node.partInstanceId
      });
    }

    // Degrade node capability multipliers based on mechanical state
    node.capability.actuatorEfficiency = Math.max(0, node.materialIntegrity * node.mountIntegrity);
    node.capability.alignmentQuality = Math.max(0.1, node.mountIntegrity);
    node.capability.frictionMultiplier = Math.max(0.3, node.materialIntegrity);
    node.capability.vibrationAmplitude = (1.0 - node.mountIntegrity) * 0.5;

    // Move to parent node in traversal
    currentNodeIdx = edge.parentNodeIndex;
  }

  return { damageEvents, detachedParts };
}

export function evaluateMobilityAndKnockout(
  state: CombatMechanicalState,
  observationWindowTicks: number = 180 // approx 3 seconds at 60Hz
): { isKilled: boolean; reason: string } {
  // Check active wheels count and drive capabilities
  const activeWheels = state.wheels.filter(w => !w.detached && !w.seized);
  const totalWheelsCount = state.wheels.length;

  // Let's check traction-limited translate capability
  const driveAbility = activeWheels.reduce((sum, w) => {
    const nodeIdx = state.nodeIndexByInstanceId.get(w.partInstanceId);
    if (nodeIdx === undefined) return sum;
    return sum + state.nodes[nodeIdx].capability.actuatorEfficiency;
  }, 0);

  // If we have lost more than 80% drive capability
  const lostMobility = driveAbility < (totalWheelsCount * 0.15);

  if (lostMobility) {
    if (!state.active) {
      return { isKilled: true, reason: 'Mobility impaired beyond recovery threshold' };
    }
    // We increment a knockdown timer/ticks
    if (state.simulationTick > observationWindowTicks) {
      return { isKilled: true, reason: 'Chassis immobilization observed over knockout window' };
    }
  }

  // Check if root chassis is detached (extreme cases)
  const rootNode = state.nodes.find(n => n.parentEdgeIndex === -1);
  if (rootNode && rootNode.failureState === 'detached') {
    return { isKilled: true, reason: 'Primary core module catastrophic structural failure' };
  }

  return { isKilled: false, reason: '' };
}
