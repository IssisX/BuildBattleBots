import React, { useRef, useState, useEffect, useMemo, createContext, useContext } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, ContactShadows, KeyboardControls, useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { Physics, RigidBody, CuboidCollider, CylinderCollider, CapsuleCollider } from '@react-three/rapier';
import { DamageSystem } from "../combat/DamageSystem";
import { globalDeformation } from '../lib/deformation';
import { useGameStore, CameraMode } from '../store';
import { resolvePartTransforms, resolvePartTransformsV2, PART_TEMPLATES } from '../lib/partsCatalog';
import { playImpactSound, initAudio } from '../lib/audio';
import { ImpactEvent, ImpactClass, BotAnimState, CombatMechanicalState, BotControlIntent, ImpactLoadPacket } from '../types';
import { finalizeAssemblyPlan } from '../lib/assembly';
import { 
  initializeCombatMechanicalState, 
  resolveGroundSupports, 
  updateWheelGroundDynamics, 
  updateWeaponDynamicsAndMomentum, 
  propagateImpactLoad, 
  evaluateMobilityAndKnockout 
} from '../lib/combatMechanics';

declare global {
  interface Window {
  }
}




export const globalPhysicsState = {
  player: { vel: new THREE.Vector3(), pos: new THREE.Vector3(), mass: 1, animState: "idle" as BotAnimState, lastHitTime: 0, hitNormal: new THREE.Vector3() },
  opponent: { vel: new THREE.Vector3(), pos: new THREE.Vector3(), mass: 1, animState: "idle" as BotAnimState, lastHitTime: 0, hitNormal: new THREE.Vector3() }
};

export const globalMechanicalState = {
  player: { current: null as CombatMechanicalState | null },
  opponent: { current: null as CombatMechanicalState | null }
};

export const DamageContext = createContext<number>(0);
export const BotOwnerContext = createContext<string>('player');

const DeformableMesh = ({
  geometry,
  color,
  metalness = 0.8,
  roughness = 0.2,
  emissive = '#000000',
  emissiveIntensity = 0,
  children
}: {
  geometry: THREE.BufferGeometry;
  color: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  children?: React.ReactNode;
}) => {
  const ownerId = useContext(BotOwnerContext);
  const battleStatus = useGameStore(s => s.battleStatus);
  const meshRef = useRef<THREE.Mesh>(null);

  // Maintain unique cloned geometry per instance so damage affects only this specific panel/part
  const [activeGeom, setActiveGeom] = useState<THREE.BufferGeometry | null>(null);

  // Ref to hold the Verlet integration physics state
  const verletStateRef = useRef<{
    positions: Float32Array;      // current positions: x, y, z
    prevPositions: Float32Array;  // previous positions for velocity tracking
    restPositions: Float32Array;  // plastic rest/equilibrium positions
    neighbors: Set<number>[];     // mesh topology adjacency list
    active: boolean;              // is the simulation currently executing?
    settleTimer: number;          // cooldown timer to put the simulation to sleep when settled
  } | null>(null);

  useEffect(() => {
    const cloned = geometry.clone();
    
    // Create vertex colors attribute if not present
    if (!cloned.attributes.color) {
      const posAttr = cloned.attributes.position;
      const colors = new Float32Array(posAttr.count * 3);
      colors.fill(1.0); // Start with white so the material color multipliers act as default
      cloned.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    
    const posAttr = cloned.attributes.position;
    const count = posAttr.count;
    const neighbors: Set<number>[] = Array.from({ length: count }, () => new Set<number>());

    // Build the mesh topology adjacency list (neighbors)
    if (cloned.index) {
      const indices = cloned.index.array;
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i];
        const b = indices[i+1];
        const c = indices[i+2];
        if (a < count && b < count && c < count) {
          neighbors[a].add(b); neighbors[a].add(c);
          neighbors[b].add(a); neighbors[b].add(c);
          neighbors[c].add(a); neighbors[c].add(b);
        }
      }
    } else {
      for (let i = 0; i < count; i += 3) {
        if (i + 2 < count) {
          neighbors[i].add(i+1); neighbors[i].add(i+2);
          neighbors[i+1].add(i); neighbors[i+1].add(i+2);
          neighbors[i+2].add(i); neighbors[i+2].add(i+1);
        }
      }
    }

    const positions = posAttr.array as Float32Array;
    const currentPositions = positions; // Mutate buffer array in-place for high-performance updates
    const prevPositions = currentPositions.slice(); // copy
    const restPositions = currentPositions.slice(); // copy

    verletStateRef.current = {
      positions: currentPositions,
      prevPositions,
      restPositions,
      neighbors,
      active: false,
      settleTimer: 0
    };

    setActiveGeom(cloned);

    return () => {
      cloned.dispose();
    };
  }, [geometry, battleStatus]); // Re-clone on reset, erasing combat deformation dynamically

  // Verlet physics simulation integration loop
  useFrame((state, delta) => {
    if (!activeGeom || !verletStateRef.current || !verletStateRef.current.active) return;

    const vs = verletStateRef.current;
    vs.settleTimer -= delta;
    if (vs.settleTimer <= 0) {
      vs.active = false;
      return;
    }

    const posAttr = activeGeom.attributes.position;
    const positions = posAttr.array as Float32Array;
    const count = posAttr.count;

    const dt = Math.min(0.016, delta); // bound time step for stability
    const metalDamping = 0.82; // damping coefficient of metal structure
    const k_elastic = 18.0;   // elastic spring coefficient
    const elasticLimit = 0.045; // threshold of elastic stretch before plastic deformation occurs
    const plasticYield = 0.48; // rate of permanent plastic deformation yield

    // 1. Verlet integration step
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      // Velocity = current - previous
      const vx = positions[idx] - vs.prevPositions[idx];
      const vy = positions[idx+1] - vs.prevPositions[idx+1];
      const vz = positions[idx+2] - vs.prevPositions[idx+2];

      // Save current positions to previous positions array
      vs.prevPositions[idx] = positions[idx];
      vs.prevPositions[idx+1] = positions[idx+1];
      vs.prevPositions[idx+2] = positions[idx+2];

      // Spring restoring force back to rest positions
      const rx = vs.restPositions[idx] - positions[idx];
      const ry = vs.restPositions[idx+1] - positions[idx+1];
      const rz = vs.restPositions[idx+2] - positions[idx+2];

      const dist = Math.sqrt(rx * rx + ry * ry + rz * rz);

      // Plastic yield model: if deformed beyond limit, rest position is permanently shifted (plastic flow)
      if (dist > elasticLimit) {
        const excess = dist - elasticLimit;
        const shiftX = (rx / dist) * excess * plasticYield;
        const shiftY = (ry / dist) * excess * plasticYield;
        const shiftZ = (rz / dist) * excess * plasticYield;

        vs.restPositions[idx] -= shiftX;
        vs.restPositions[idx+1] -= shiftY;
        vs.restPositions[idx+2] -= shiftZ;
      }

      // Acceleration towards rest position
      const ax = rx * k_elastic;
      const ay = ry * k_elastic;
      const az = rz * k_elastic;

      // Verlet update: x_next = x + v * damping + a * dt^2
      positions[idx] += vx * metalDamping + ax * dt * dt;
      positions[idx+1] += vy * metalDamping + ay * dt * dt;
      positions[idx+2] += vz * metalDamping + az * dt * dt;
    }

    // 2. Neighbor / Topology Laplacian constraint relaxation
    // Runs 2 passes for structural cohesion and clean crater contouring
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        const neighborsList = vs.neighbors[i];
        if (neighborsList.size === 0) continue;

        let sumX = 0, sumY = 0, sumZ = 0;
        neighborsList.forEach(n => {
          sumX += positions[n*3];
          sumY += positions[n*3+1];
          sumZ += positions[n*3+2];
        });

        const avgX = sumX / neighborsList.size;
        const avgY = sumY / neighborsList.size;
        const avgZ = sumZ / neighborsList.size;

        const tension = 0.22; // Membrane surface tension strength
        positions[idx] += (avgX - positions[idx]) * tension;
        positions[idx+1] += (avgY - positions[idx+1]) * tension;
        positions[idx+2] += (avgZ - positions[idx+2]) * tension;
      }
    }

    // Notify ThreeJS that geometry positions have been dynamically deformed
    posAttr.needsUpdate = true;
    activeGeom.computeVertexNormals(); // Refresh vertex normals for superb dynamic light reflections!
  });

  useEffect(() => {
    if (!activeGeom) return;

    const handleImpact = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { detail } = customEvent;
      if (!detail || detail.type !== 'collision') return;
      
      // Only react if this component belongs to the damaged bot
      if (detail.defenderId !== ownerId) return;

      const mesh = meshRef.current;
      if (!mesh) return;

      const vs = verletStateRef.current;
      if (!vs) return;

      // Transform world contact point to this local mesh's coordinate frame
      const worldPos = new THREE.Vector3(detail.position[0], detail.position[1], detail.position[2]);
      const localPos = worldPos.clone();
      mesh.worldToLocal(localPos);

      // Transform world normal to local space for precision indent projection
      let localNormal = new THREE.Vector3(0, -1, 0);
      if (detail.normal) {
        const worldNormal = new THREE.Vector3(detail.normal[0], detail.normal[1], detail.normal[2]);
        localNormal = worldNormal.clone().transformDirection(mesh.matrixWorld).normalize();
      }

      const posAttr = activeGeom.attributes.position;
      const colorAttr = activeGeom.attributes.color;
      if (!posAttr || !colorAttr) return;

      const positions = posAttr.array as Float32Array;
      const colors = colorAttr.array as Float32Array;
      const count = posAttr.count;

      const damageAmount = detail.damageAmount || 1.0;
      
      // Sophisticated dynamic radius and indentation depth based on real impact energy / damage vectors!
      const radius = 0.45 + Math.min(damageAmount * 0.42, 1.25); 
      const maxDent = 0.16 + Math.min(damageAmount * 0.18, 0.45);

      let deformedAny = false;

      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        const vx = positions[idx];
        const vy = positions[idx+1];
        const vz = positions[idx+2];

        // Euclidean distance in local space
        const dx = vx - localPos.x;
        const dy = vy - localPos.y;
        const dz = vz - localPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < radius) {
          // Dynamic Gaussian Radial Basis Falloff for elastic/plastic deformation contouring
          const sigma = radius * 0.45;
          const falloff = Math.exp(-(dist * dist) / (2 * sigma * sigma));

          // Combine collision vector thrust, local normal punch, and outward radial rim bulge!
          const toVertex = new THREE.Vector3(vx, vy, vz).sub(localPos).normalize();
          
          // The main displacement direction: punch inward relative to the local normal, 
          // but expand slightly radially around the edges to form a perfect crater rim!
          const displaceDir = new THREE.Vector3()
            .addScaledVector(localNormal, -0.85) // strong inward hit along normal
            .addScaledVector(toVertex, 0.18)     // radial outward flow (metal displacement)
            .normalize();

          // Physical vertex velocity shock (direct position modification + Verlet momentum transfer)
          const displacement = maxDent * falloff;
          
          positions[idx] += displaceDir.x * displacement;
          positions[idx+1] += displaceDir.y * displacement;
          positions[idx+2] += displaceDir.z * displacement;

          // Charcoal scorch painting: lerping towards dark charred carbon/ash
          const scorchR = 0.08;
          const scorchG = 0.06;
          const scorchB = 0.05;

          colors[idx] = THREE.MathUtils.lerp(colors[idx], scorchR, falloff * 0.95);
          colors[idx+1] = THREE.MathUtils.lerp(colors[idx+1], scorchG, falloff * 0.95);
          colors[idx+2] = THREE.MathUtils.lerp(colors[idx+2], scorchB, falloff * 0.95);

          deformedAny = true;
        }
      }

      if (deformedAny) {
        // Wake up Verlet physical simulation to propagate shockwaves & relax neighbor constraints
        vs.active = true;
        vs.settleTimer = 1.8; // Run simulation for 1.8 seconds after impact to let ripples settle

        posAttr.needsUpdate = true;
        colorAttr.needsUpdate = true;
        activeGeom.computeVertexNormals(); // Initial normal update for immediate feedback
      }
    };

    window.addEventListener('combat-impact', handleImpact);
    return () => {
      window.removeEventListener('combat-impact', handleImpact);
    };
  }, [activeGeom, ownerId]);

  if (!activeGeom) return null;

  return (
    <mesh ref={meshRef} castShadow receiveShadow geometry={activeGeom}>
      <meshStandardMaterial
        color={color}
        vertexColors={true} // Enable multi-channel vertex colors
        metalness={metalness}
        roughness={roughness}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
      />
      {children}
    </mesh>
  );
};

const WedgeMesh = ({ size, color, emissive, emissiveIntensity }: { size: [number, number, number]; color: string; emissive?: string; emissiveIntensity?: number }) => {
  const [w, h, d] = size;
  const damageFactor = useContext(DamageContext);

  const damagedColor = useMemo(() => {
    if (!damageFactor) return color;
    const base = new THREE.Color(color);
    const scorch = new THREE.Color('#2b1d14');
    return base.lerp(scorch, damageFactor * 0.75).getStyle();
  }, [color, damageFactor]);

  const geom = useMemo(() => {
    const wSegs = Math.max(8, Math.ceil(w * 24));
    const hSegs = Math.max(8, Math.ceil(h * 24));
    const dSegs = Math.max(8, Math.ceil(d * 24));
    return new THREE.BoxGeometry(w, h, d, wSegs, hSegs, dSegs);
  }, [w, h, d]);

  return (
    <DeformableMesh
      geometry={geom}
      color={damagedColor}
      metalness={0.8 - (damageFactor * 0.5)}
      roughness={0.2 + (damageFactor * 0.6)}
      emissive={emissive || '#000000'}
      emissiveIntensity={emissiveIntensity || 0}
    />
  );
};

const RoundedBoxMesh = ({ size, color, emissive, emissiveIntensity }: { size: [number, number, number]; color: string; emissive?: string; emissiveIntensity?: number }) => {
  const [w, h, d] = size;
  const damageFactor = useContext(DamageContext);

  const damagedColor = useMemo(() => {
    if (!damageFactor) return color;
    const base = new THREE.Color(color);
    const scorch = new THREE.Color('#2b1d14');
    return base.lerp(scorch, damageFactor * 0.75).getStyle();
  }, [color, damageFactor]);

  const geom = useMemo(() => {
    const wSegs = Math.max(8, Math.ceil(w * 24));
    const hSegs = Math.max(8, Math.ceil(h * 24));
    const dSegs = Math.max(8, Math.ceil(d * 24));
    return new THREE.BoxGeometry(w, h, d, wSegs, hSegs, dSegs);
  }, [w, h, d]);

  return (
    <DeformableMesh
      geometry={geom}
      color={damagedColor}
      metalness={0.8 - (damageFactor * 0.5)}
      roughness={0.2 + (damageFactor * 0.6)}
      emissive={emissive || '#000000'}
      emissiveIntensity={emissiveIntensity || 0}
    />
  );
};


const EffectsManager = () => {
  const cleanupEffects = useGameStore(s => s.cleanupEffects);
  useFrame(() => {
    cleanupEffects();
  });
  return null;
};

const CameraManager = ({ 
  targetRef,
  playerBodyRef,
  opponentBodyRef
}: { 
  targetRef: React.RefObject<THREE.Object3D>;
  playerBodyRef: React.RefObject<any>;
  opponentBodyRef: React.RefObject<any>;
}) => {
  const cameraMode = useGameStore(s => s.cameraMode);
  const settings = useGameStore(s => s.settings);
  const playerHealth = useGameStore(s => s.botState.health);
  const oppHealth = useGameStore(s => s.opponentState.health);
  const vec = new THREE.Vector3();
  const orbitRef = useRef<any>(null);
  
  const lastTargetPos = useRef<THREE.Vector3>(new THREE.Vector3());
  const cameraVel = useRef<THREE.Vector3>(new THREE.Vector3());
  
  const lastPlayerHealth = useRef(100);
  const lastOppHealth = useRef(100);
  const shakeAmount = useRef(0);

  // Health listener to trigger screen shake dynamically on combat impacts
  useEffect(() => {
    if (playerHealth < lastPlayerHealth.current) {
      const dmg = lastPlayerHealth.current - playerHealth;
      shakeAmount.current = Math.min(2.0, shakeAmount.current + dmg * 0.04 * (settings.reducedMotion ? 0 : settings.impactFeedbackStrength));
    }
    lastPlayerHealth.current = playerHealth;
  }, [playerHealth, settings]);

  useEffect(() => {
    if (oppHealth < lastOppHealth.current) {
      const dmg = lastOppHealth.current - oppHealth;
      shakeAmount.current = Math.min(1.0, shakeAmount.current + dmg * 0.015 * (settings.reducedMotion ? 0 : settings.impactFeedbackStrength));
    }
    lastOppHealth.current = oppHealth;
  }, [oppHealth, settings]);

  // Handle hotkeys (e.g. C/V for camera toggle)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'c') {
        const modes: CameraMode[] = ['follow', 'cinematic', 'free'];
        const currentIdx = modes.indexOf(useGameStore.getState().cameraMode);
        const nextMode = modes[(currentIdx + 1) % modes.length];
        useGameStore.getState().setCameraMode(nextMode);
        useGameStore.getState().addLog(`Camera Mode: ${nextMode.toUpperCase()}`, 'info');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useFrame((state, delta) => {
    // Decaying screenshake LERP
    if (shakeAmount.current > 0.01) {
      shakeAmount.current = THREE.MathUtils.lerp(shakeAmount.current, 0, delta * 8);
    } else {
      shakeAmount.current = 0;
    }

    if (cameraMode === 'free') {
      if (targetRef.current) {
        lastTargetPos.current.copy(targetRef.current.position);
      }
      return; 
    }

    const dt = Math.min(delta, 0.1); // bound dt to prevent huge jumps
    const stiffness = 4.5;

    if (cameraMode === 'follow' && targetRef.current) {
      const targetPos = targetRef.current.position;
      const linvel = targetRef.current.userData.linvel || new THREE.Vector3();
      
      const speed = linvel.length();
      // Look forward or use driving orientation if stationary
      const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(targetRef.current.quaternion).normalize();
      
      // Lookahead scales with speed to maximize forward visibility
      const lookaheadDist = Math.max(3, Math.min(speed * 0.45, 12));
      const targetLookAt = targetPos.clone().add(forwardDir.clone().multiplyScalar(lookaheadDist));
      
      // Pull back at speed for better visibility
      const baseDistance = 8.5;
      const speedZoomOut = Math.min(speed * 0.18, 5.5);
      const desiredDistance = baseDistance + speedZoomOut;
      
      const desiredCameraPos = targetPos.clone().sub(forwardDir.clone().multiplyScalar(desiredDistance));
      desiredCameraPos.y = targetPos.y + 4.5 + speedZoomOut * 0.4;
      
      // Soft boundaries
      state.camera.position.lerp(desiredCameraPos, dt * stiffness);
      lastTargetPos.current.lerp(targetLookAt, dt * stiffness * 1.5);
    } 
    else if (cameraMode === 'cinematic' && playerBodyRef.current && opponentBodyRef.current) {
      // Cinematic Arena Combat Camera: keeps BOTH bots dynamically framed inside view
      const pPosObj = playerBodyRef.current.translation();
      const oPosObj = opponentBodyRef.current.translation();
      
      const pPos = new THREE.Vector3(pPosObj.x, pPosObj.y, pPosObj.z);
      const oPos = new THREE.Vector3(oPosObj.x, oPosObj.y, oPosObj.z);
      
      // Core focus is the midpoint between player and opponent
      const midpoint = new THREE.Vector3().addVectors(pPos, oPos).multiplyScalar(0.5);
      
      // Calculate combat range/distance between bots
      const combatDistance = pPos.distanceTo(oPos);
      
      // Offset position relative to the player heading or the combat midpoint
      const oppToPlayerDir = new THREE.Vector3().subVectors(pPos, oPos).normalize();
      
      // Position camera back behind player, angled to capture both
      const idealCamDist = Math.max(9, Math.min(combatDistance * 0.75 + 5, 22));
      const desiredCameraPos = pPos.clone().add(oppToPlayerDir.clone().multiplyScalar(idealCamDist * 0.6));
      desiredCameraPos.y = Math.max(pPos.y + 4, 3.5 + combatDistance * 0.28);
      
      // Keep camera inside arena bounds to avoid clipping through walls
      desiredCameraPos.x = THREE.MathUtils.clamp(desiredCameraPos.x, -14.5, 14.5);
      desiredCameraPos.z = THREE.MathUtils.clamp(desiredCameraPos.z, -14.5, 14.5);
      
      // Soft interpolate
      state.camera.position.lerp(desiredCameraPos, dt * (stiffness * 0.85));
      lastTargetPos.current.lerp(midpoint, dt * (stiffness * 1.2));
    }

    // Apply screenshake or lookat
    if (shakeAmount.current > 0) {
      const sx = (Math.random() - 0.5) * shakeAmount.current;
      const sy = (Math.random() - 0.5) * shakeAmount.current;
      const sz = (Math.random() - 0.5) * shakeAmount.current;
      vec.copy(lastTargetPos.current).add(new THREE.Vector3(sx, sy, sz));
      state.camera.lookAt(vec);
    } else {
      state.camera.lookAt(lastTargetPos.current);
    }
  });

  return (
    <>
      {cameraMode === 'free' && <OrbitControls ref={orbitRef} target={lastTargetPos.current} makeDefault enableDamping dampingFactor={0.05} />}
    </>
  );
};

const BotDamageVisuals = ({ botId }: { botId: string }) => {
  const components = useGameStore(s => botId === 'player' ? s.playerDamageComponents : s.opponentDamageComponents);
  
  if (!components) return null;
  
  return (
    <group>
      {Object.values(components).map((comp) => {
        if (!comp) return null;
        if (comp.visualState === 'clean') return null;
        
        // Render simple decals or visual overlays based on state
        const getOffset = () => {
          switch(comp.hitZone) {
            case 'front': return [0, 0.25, 0.9];
            case 'rear': return [0, 0.25, -0.9];
            case 'left': return [-0.75, 0.25, 0];
            case 'right': return [0.75, 0.25, 0];
            case 'top': return [0, 0.6, 0];
            default: return [0, 0.25, 0];
          }
        };
        
        const offset = getOffset();
        
        return (
          <group key={comp.componentId} position={offset as [number, number, number]}>
            {comp.detached && (
               // Render nothing if detached, could also spawn debris
               null
            )}
          </group>
        );
      })}
    </group>
  );
};

const Bot = ({ 
  position, 
  color, 
  isSpinning,
  isPlayer = false,
  bodyRef,
  targetRef
}: { 
  position: [number, number, number], 
  color: string,
  isSpinning: boolean,
  isPlayer?: boolean,
  bodyRef?: React.RefObject<any>,
  targetRef?: React.RefObject<any>
}) => {
  const weaponRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Group>(null);
  const visualRootRef = useRef<THREE.Group>(null);

  

  const pistonCylinderRef = useRef<THREE.Group>(null);
  const pistonRodRef = useRef<THREE.Group>(null);
  const frontRightWheelRef = useRef<THREE.Group>(null);
  const frontLeftWheelRef = useRef<THREE.Group>(null);
  const backRightWheelRef = useRef<THREE.Group>(null);
  const backLeftWheelRef = useRef<THREE.Group>(null);
  const frontGroupRef = useRef<THREE.Group>(null);
  const leftGroupRef = useRef<THREE.Group>(null);
  const rightGroupRef = useRef<THREE.Group>(null);
  const rearGroupRef = useRef<THREE.Group>(null);
  const topGroupRef = useRef<THREE.Group>(null);
  const compOffsetsRef = useRef<Record<string, {
    jolt: [number, number, number];
    joltAngular: [number, number, number];
    wobble: number;
    wobblePhase: number;
    wobbleAmplitude: number;
  }>>({
    front: { jolt: [0, 0, 0], joltAngular: [0, 0, 0], wobble: 0, wobblePhase: 0, wobbleAmplitude: 0 },
    left: { jolt: [0, 0, 0], joltAngular: [0, 0, 0], wobble: 0, wobblePhase: 0, wobbleAmplitude: 0 },
    right: { jolt: [0, 0, 0], joltAngular: [0, 0, 0], wobble: 0, wobblePhase: 0, wobbleAmplitude: 0 },
    rear: { jolt: [0, 0, 0], joltAngular: [0, 0, 0], wobble: 0, wobblePhase: 0, wobbleAmplitude: 0 },
    top: { jolt: [0, 0, 0], joltAngular: [0, 0, 0], wobble: 0, wobblePhase: 0, wobbleAmplitude: 0 },
    core: { jolt: [0, 0, 0], joltAngular: [0, 0, 0], wobble: 0, wobblePhase: 0, wobbleAmplitude: 0 },
  });
  const customPartsRefs = useRef<Record<string, THREE.Group | null>>({});
  
  const cooldownRef = useRef(0);
  const fireAnimRef = useRef(0);
  const currentRPM = useRef(0);
  const lastHitTime = useRef(0);
  const flipperPos = useRef(0);
  const flipperVel = useRef(0);
  const stuckTimer = useRef(0);
  const lastPos = useRef(new THREE.Vector3());
  const [, get] = useKeyboardControls();
  const config = useGameStore(s => s.botConfig);
  const opponentConfig = useGameStore(s => s.opponentConfig);
  const paintScheme = useGameStore(s => s.paintScheme);
  const damageBot = useGameStore(s => s.damageBot);
  const battleStatus = useGameStore(s => s.battleStatus);
  const settings = useGameStore(s => s.settings);

  // Track previous forward speed and turning rates for realistic suspension lean physics
  const lastSpeedForward = useRef(0);
  const smoothedAccel = useRef(0);
  const smoothedTurnRate = useRef(0);

  const actualColor = isPlayer ? paintScheme : "#FF003C";
  const actualWeaponType = isPlayer ? config.weapon.type : opponentConfig.weapon.type;
  const currentBotConfig = isPlayer ? config : opponentConfig;
  const isCustom = currentBotConfig.isCustom && currentBotConfig.parts && currentBotConfig.parts.length > 0;
  const resolvedParts = useMemo(() => isCustom && currentBotConfig.customConfig ? resolvePartTransformsV2(currentBotConfig.customConfig.parts, currentBotConfig.customConfig.rootPartId) : [], [isCustom, currentBotConfig.customConfig]);

  const assemblyPlan = useMemo(() => {
    if (isCustom && currentBotConfig.customConfig) {
      return finalizeAssemblyPlan(currentBotConfig.customConfig);
    }
    return null;
  }, [isCustom, currentBotConfig.customConfig]);

  const mechanicalStateRef = useRef<CombatMechanicalState | null>(null);

  useEffect(() => {
    if (assemblyPlan && isCustom && currentBotConfig.customConfig) {
      const stateObj = initializeCombatMechanicalState(
        currentBotConfig.customConfig,
        assemblyPlan,
        isPlayer ? 'player' : 'opponent'
      );
      mechanicalStateRef.current = stateObj;
      globalMechanicalState[isPlayer ? 'player' : 'opponent'].current = stateObj;
    } else {
      mechanicalStateRef.current = null;
      globalMechanicalState[isPlayer ? 'player' : 'opponent'].current = null;
    }
  }, [assemblyPlan, isCustom, isPlayer]);

  const getHitZoneFromPart = (node: any) => {
    if (!node) return 'core';
    const category = node.category || node.type;
    if (category === 'chassis') return 'core';
    const pos = node.localPosition || [0,0,0];
    if (pos[1] > 0.4) return 'top';
    if (Math.abs(pos[0]) > Math.abs(pos[2])) {
      return pos[0] > 0 ? 'right' : 'left';
    } else {
      return pos[2] < 0 ? 'front' : 'rear';
    }
  };

  useEffect(() => {
    const handleGlobalImpact = (ev: Event) => {
      const customEv = ev as CustomEvent;
      const detail = customEv.detail;
      if (!detail || detail.defenderId !== (isPlayer ? 'player' : 'opponent')) return;

      if (mechanicalStateRef.current && assemblyPlan) {
        const mState = mechanicalStateRef.current;
        const norm = detail.normal || [0, 1, 0];
        const impulseAmt = detail.impactEnergy || 10;
        
        const packet: ImpactLoadPacket = {
          eventId: `imp_${Date.now()}_${Math.random()}`,
          sequence: mState.simulationTick,
          simulationTick: mState.simulationTick,
          sourceBotId: detail.attackerId || (isPlayer ? 'opponent' : 'player'),
          targetBotId: isPlayer ? 'player' : 'opponent',
          struckPartInstanceId: detail.hitZone || 'core',
          worldContactPoint: detail.position || [0,0,0],
          worldContactNormal: norm,
          linearImpulseWorld: [norm[0] * impulseAmt, norm[1] * impulseAmt, norm[2] * impulseAmt],
          normalEnergy: impulseAmt,
          tangentialEnergy: impulseAmt * 0.25,
          localAbsorbedEnergy: impulseAmt * 0.4,
          transferableEnergy: impulseAmt * 0.6,
          obliquityRadians: 0,
          overmatchRatio: 1.0,
          fatigueSusceptibility: 1.0
        };

        const propResult = propagateImpactLoad(mState, packet, assemblyPlan);
        
        // Procedural Deformation Visual Update!
        globalDeformation.applyDent({
          eventId: packet.eventId,
          botId: isPlayer ? 'player' : 'opponent',
          partInstanceId: packet.struckPartInstanceId,
          localContactPoint: packet.worldContactPoint, // world space
          localImpactDirection: packet.linearImpulseWorld, // world space direction
          normalEnergy: packet.normalEnergy,
          tangentialEnergy: packet.tangentialEnergy,
          peakImpulse: impulseAmt,
          obliquityRadians: 0,
          radius: Math.min(0.8, 0.2 + (impulseAmt / 500)), // dynamic dent radius based on force
          depth: Math.min(0.4, impulseAmt / 1000), // dynamic depth
          plasticity: 0.8, // high plasticity for metal
          scratchBias: 0.5
        });

        propResult.damageEvents.forEach(msg => {
          addLog(msg, "warning");
        });

        // Sync with store
        const storeComponents = useGameStore.getState()[isPlayer ? 'playerDamageComponents' : 'opponentDamageComponents'];
        const hitZoneNode = assemblyPlan.nodes.find(n => n.instanceId === detail.hitZone);
        const hitZoneKey = getHitZoneFromPart(hitZoneNode);
        const compObj = storeComponents[hitZoneKey];
        
        if (compObj) {
          const updatedComp = { ...compObj };
          const mechanicalNode = mState.nodes.find(n => n.partInstanceId === detail.hitZone);
          if (mechanicalNode) {
            if (mechanicalNode.failureState === 'failed' || mechanicalNode.failureState === 'detached') {
              updatedComp.detached = true;
              updatedComp.visualState = 'detached';
              updatedComp.mountIntegrity = 0;
            } else if (mechanicalNode.mountIntegrity < 0.4) {
              updatedComp.visualState = 'loose';
              updatedComp.mountIntegrity = mechanicalNode.mountIntegrity;
            } else if (mechanicalNode.materialIntegrity < 0.5) {
              updatedComp.visualState = 'exposed';
            } else if (mechanicalNode.materialIntegrity < 0.8) {
              updatedComp.visualState = 'dented';
            }
            
            useGameStore.setState((state) => {
              const currentDict = isPlayer ? state.playerDamageComponents : state.opponentDamageComponents;
              const nextDict = { ...currentDict, [hitZoneKey]: updatedComp };
              return isPlayer ? { playerDamageComponents: nextDict } : { opponentDamageComponents: nextDict };
            });
          }
        }

        propResult.detachedParts.forEach(partId => {
          addLog(`Component ${partId} on ${isPlayer ? 'Player' : 'Opponent'} bot was RIPPED OFF structurally!`, "critical");
          if (customPartsRefs.current[partId]) {
            customPartsRefs.current[partId].visible = false;
          }
        });
      }
    };

    window.addEventListener('combat-impact', handleGlobalImpact);
    return () => {
      window.removeEventListener('combat-impact', handleGlobalImpact);
    };
  }, [assemblyPlan, isPlayer, isCustom]);

  

  useEffect(() => {
    if (visualRootRef.current) {
      visualRootRef.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          globalDeformation.registerMesh(isPlayer ? 'player' : 'opponent', child as THREE.Mesh);
        }
      });
    }
    return () => {
      globalDeformation.unregisterBot(isPlayer ? 'player' : 'opponent');
    };
  }, [isPlayer, resolvedParts]); // re-run if parts change


  // Elite Upgrades helper state and refs
  const overchargeHeatRef = useRef(0);
  const damageComponents = useGameStore(s => isPlayer ? s.playerDamageComponents : s.opponentDamageComponents);
  const botHealth = useGameStore(s => isPlayer ? s.botState.health : s.opponentState.health);
  const damageFactor = 1.0 - botHealth / 100;
  const detachedParts = useRef<Set<string>>(new Set());
  const addLog = useGameStore(s => s.addLog);

  useFrame(() => {
    if (battleStatus === 'countdown' || battleStatus === 'menu') {
      detachedParts.current.clear();
      return;
    }

    if (isCustom && currentBotConfig.customConfig && currentBotConfig.customConfig.parts && mechanicalStateRef.current) {
      mechanicalStateRef.current.nodes.forEach(node => {
        if ((node.failureState === 'detached' || node.failureState === 'failed') && !detachedParts.current.has(node.partInstanceId)) {
          detachedParts.current.add(node.partInstanceId);
          
          const meshGroup = customPartsRefs.current[node.partInstanceId];
          if (meshGroup) {
            const worldPos = new THREE.Vector3();
            const worldQuat = new THREE.Quaternion();
            meshGroup.getWorldPosition(worldPos);
            meshGroup.getWorldQuaternion(worldQuat);
            
            const part = currentBotConfig.customConfig!.parts.find(p => p.instanceId === node.partInstanceId);
            const partDef = PART_TEMPLATES.find(p => p.templateId === part?.definitionId);
            
            if (part && partDef) {
               const linvel = bodyRef.current ? bodyRef.current.linvel() : { x:0, y:0, z:0 };
               const angvel = bodyRef.current ? bodyRef.current.angvel() : { x:0, y:0, z:0 };

               useGameStore.getState().spawnFragment({
                 id: `${isPlayer ? 'player' : 'opponent'}_frag_${node.partInstanceId}_${Date.now()}`,
                 partId: node.partInstanceId,
                 definitionId: partDef.templateId,
                 position: [worldPos.x, worldPos.y, worldPos.z],
                 rotation: [worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w],
                 velocity: [linvel.x + (Math.random()-0.5)*2, linvel.y + 2 + Math.random(), linvel.z + (Math.random()-0.5)*2],
                 angularVelocity: [angvel.x + (Math.random()-0.5)*5, angvel.y + (Math.random()-0.5)*5, angvel.z + (Math.random()-0.5)*5],
                 color: part.color || '#ffffff',
                 botId: isPlayer ? 'player' : 'opponent',
                 timestamp: Date.now()
               });
               
               useGameStore.getState().spawnSparks([worldPos.x, worldPos.y, worldPos.z], 15, '#FFFFFF');
               useGameStore.getState().spawnDebris([worldPos.x, worldPos.y, worldPos.z], 8);
            }
          }
        }
      });
    }
  });

  useEffect(() => {
    if (botHealth <= 0) return;

    // Predefined Bot Parts
    if (actualWeaponType === 'drum') {
      if (damageFactor > 0.55 && !detachedParts.current.has('TopArmorDeflector')) {
        detachedParts.current.add('TopArmorDeflector');
        addLog(`${isPlayer ? 'Player' : 'Opponent'} top deflection panel BLOWN OFF under heavy fire!`, 'critical');
        if (bodyRef?.current) {
          const pos = bodyRef.current.translation();
          useGameStore.getState().spawnSparks([pos.x, pos.y + 0.5, pos.z], 18, '#FF5500');
          useGameStore.getState().spawnDebris([pos.x, pos.y + 0.5, pos.z], 8);
        }
      }
      if (damageFactor > 0.75 && !detachedParts.current.has('LeftResponsiveArmor')) {
        detachedParts.current.add('LeftResponsiveArmor');
        addLog(`${isPlayer ? 'Player' : 'Opponent'} left armor shattered!`, 'warning');
        if (bodyRef?.current) {
          const pos = bodyRef.current.translation();
          useGameStore.getState().spawnDebris([pos.x, pos.y + 0.5, pos.z], 6);
        }
      }
      if (damageFactor > 0.85 && !detachedParts.current.has('RightResponsiveArmor')) {
        detachedParts.current.add('RightResponsiveArmor');
        addLog(`${isPlayer ? 'Player' : 'Opponent'} right armor shattered!`, 'warning');
        if (bodyRef?.current) {
          const pos = bodyRef.current.translation();
          useGameStore.getState().spawnDebris([pos.x, pos.y + 0.5, pos.z], 6);
        }
      }
    }
  }, [botHealth, damageFactor, actualWeaponType, isPlayer, addLog, bodyRef, isCustom, currentBotConfig, resolvedParts]);

  useEffect(() => {
    if (!damageComponents) return;
    Object.entries(damageComponents).forEach(([zone, comp]) => {
      const offset = compOffsetsRef.current[zone];
      if (offset && comp && comp.lastHitTime > 0) {
        offset.jolt = [
          comp.visualOffset.jolt[0] * 1.5,
          comp.visualOffset.jolt[1] * 1.5,
          comp.visualOffset.jolt[2] * 1.5
        ];
        const impulseNorm = Math.sqrt(
          comp.visualOffset.jolt[0] * comp.visualOffset.jolt[0] +
          comp.visualOffset.jolt[1] * comp.visualOffset.jolt[1] +
          comp.visualOffset.jolt[2] * comp.visualOffset.jolt[2]
        );
        offset.wobbleAmplitude = Math.min(0.5, offset.wobbleAmplitude + impulseNorm * 10 + 0.2);
      }
    });
  }, [damageComponents]);

  useFrame((state, delta) => {
    const finalDelta = Math.min(delta, 0.05);

    if (cooldownRef.current > 0) cooldownRef.current -= finalDelta;
    if (fireAnimRef.current > 0) fireAnimRef.current -= finalDelta * 5; // Animate over 0.2 seconds

    if (weaponRef.current) {
      if (actualWeaponType === 'spinner' || actualWeaponType === 'saw') {
        const targetRPM = isSpinning ? currentBotConfig.weapon.rpm / 100 : 0;
        const acceleration = isSpinning ? 5.0 : 2.0; // Spool up vs spin down
        currentRPM.current = THREE.MathUtils.lerp(currentRPM.current, targetRPM, finalDelta * acceleration);
        weaponRef.current.rotation.y -= currentRPM.current * finalDelta * 15; // Spin horizontally
      } else if (actualWeaponType === 'drum') {
        const targetRPM = isSpinning ? currentBotConfig.weapon.rpm / 100 : 0;
        const acceleration = isSpinning ? 6.0 : 3.0; 
        currentRPM.current = THREE.MathUtils.lerp(currentRPM.current, targetRPM, finalDelta * acceleration);
        weaponRef.current.rotation.x -= currentRPM.current * finalDelta * 25; // Spin vertically

        // Elite Upgrade 3: Weapon Overcharge Thermals & Glow (R3F efficiency with refs)
        const targetHeat = isSpinning ? Math.min(1.0, Math.abs(currentRPM.current) / currentBotConfig.weapon.rpm) : 0.0;
        const lerpSpeed = isSpinning ? 0.35 : 1.0;
        overchargeHeatRef.current = THREE.MathUtils.lerp(overchargeHeatRef.current, targetHeat, finalDelta * lerpSpeed);
        
        weaponRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.name === 'DrumCore' || child.name === 'DrumTooth') {
              const mat = child.material as THREE.MeshStandardMaterial;
              if (mat) {
                const baseEmissive = child.name === 'DrumTooth' ? new THREE.Color('#FF3300') : new THREE.Color('#FF0000');
                mat.emissiveIntensity = overchargeHeatRef.current * 4.5;
                mat.emissive.copy(baseEmissive).multiplyScalar(overchargeHeatRef.current);
              }
            }
          }
        });

        // Elite Upgrade 1: Floor Scraping Sparks on drum weapon spooling up
        if (isSpinning && Math.abs(currentRPM.current) > 15) {
          if (Math.random() < 0.12 && bodyRef?.current) {
            const selfPos = bodyRef.current.translation();
            const currentRotation = bodyRef.current.rotation();
            const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(currentRotation.x, currentRotation.y, currentRotation.z, currentRotation.w));
            const forward = new THREE.Vector3(0, 0, -1).applyEuler(euler);
            const contactPos: [number, number, number] = [
              selfPos.x + forward.x * 1.05 + (Math.random() - 0.5) * 0.6,
              0.05,
              selfPos.z + forward.z * 1.05 + (Math.random() - 0.5) * 0.6
            ];
            useGameStore.getState().spawnSparks(contactPos, 1, '#FF7700');
          }
        }
      } else if (actualWeaponType === 'flipper') {
        const targetExtension = fireAnimRef.current > 0 ? 1.0 : 0.0;
        const k = 600; // Super stiff spring for sudden punchy launch
        const d = 18;  // Perfectly damped
        const force = -k * (flipperPos.current - targetExtension) - d * flipperVel.current;
        flipperVel.current += force * finalDelta;
        flipperPos.current += flipperVel.current * finalDelta;

        if (flipperPos.current < 0) {
          flipperPos.current = 0;
          flipperVel.current = 0;
        }

        // Pivot arm around the hinge (rest is 0, full is -0.9)
        weaponRef.current.rotation.x = -flipperPos.current * 0.9;
        
        // Piston math
        if (pistonCylinderRef.current && pistonRodRef.current) {
          // Angle alpha is wedge slope (0.25) plus dynamic flip rotation
          const alpha = 0.25 + flipperPos.current * 0.9;
          const R = 0.55;
          // Position of hinge H is [0, -0.1, -0.25] relative to bot body.
          // Arm attachment B relative to bot body:
          const posB = new THREE.Vector3(0, -0.1 + R * Math.sin(alpha), -0.25 - R * Math.cos(alpha));
          // Chassis anchor A relative to bot body:
          const posA = new THREE.Vector3(0, -0.28, -0.3);

          pistonCylinderRef.current.position.copy(posA);
          pistonRodRef.current.position.copy(posB);

          // Force matrix update so world transform helper works
          pistonCylinderRef.current.updateMatrixWorld(true);
          pistonRodRef.current.updateMatrixWorld(true);

          const worldA = new THREE.Vector3();
          pistonCylinderRef.current.getWorldPosition(worldA);
          
          const worldB = new THREE.Vector3();
          pistonRodRef.current.getWorldPosition(worldB);

          pistonCylinderRef.current.lookAt(worldB);
          pistonRodRef.current.lookAt(worldA);
        }
      } else if (actualWeaponType === 'hammer') {
        if (fireAnimRef.current > 0) {
          const t = 1.0 - fireAnimRef.current;
          let angle = 0;
          if (t < 0.15) {
            angle = -0.35 * Math.sin((t / 0.15) * Math.PI / 2);
          } else if (t < 0.45) {
            const tSlam = (t - 0.15) / 0.3;
            angle = -0.35 + 2.1 * Math.sin(tSlam * Math.PI / 2);
          } else {
            const tRetract = (t - 0.45) / 0.55;
            angle = 1.75 * Math.pow(1 - tRetract, 2);
          }
          weaponRef.current.rotation.x = angle;
        } else {
          weaponRef.current.rotation.x = 0;
        }
      } else if (actualWeaponType === 'crusher') {
        if (fireAnimRef.current > 0) {
          const t = 1.0 - fireAnimRef.current;
          const angle = Math.sin(t * Math.PI) * 0.55;
          weaponRef.current.rotation.x = angle;
        } else {
          weaponRef.current.rotation.x = 0;
        }
      }
    }

    if (bodyRef?.current) {
      // Rotate wheels based on linear/angular velocity for high fidelity skid-steering
      const linvelRaw = bodyRef.current.linvel();
      const linvel = new THREE.Vector3(linvelRaw.x, linvelRaw.y, linvelRaw.z);
      const angvelRaw = bodyRef.current.angvel();
      const angvel = new THREE.Vector3(angvelRaw.x, angvelRaw.y, angvelRaw.z);

      const currentRotation = bodyRef.current.rotation();
      const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(currentRotation.x, currentRotation.y, currentRotation.z, currentRotation.w));
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(euler); const up = new THREE.Vector3(0, 1, 0).applyEuler(euler);

      const speedForward = linvel.x * dir.x + linvel.z * dir.z;
      const turnRate = angvel.y;
      const posRaw = bodyRef.current.translation();
      
      // --- HIGH IMPACT PHYSICS UPGRADE 3: Dynamic Floor Scrapes ---
      // If the bot tips too far, the chassis scrapes the floor violently causing sparks and dragging friction
      if (Math.abs(euler.z) > 0.35 || Math.abs(euler.x) > 0.35) {
         if (Math.abs(speedForward) > 3.0 && Math.random() < 0.25) {
             useGameStore.getState().spawnSparks([posRaw.x, 0.05, posRaw.z], 3, '#FFAA00');
             // Drag friction
             const dragScale = currentBotConfig.armor.weight / 10;
             bodyRef.current.applyImpulse({ x: -linvel.x * 0.15 * delta , y: 0, z: -linvel.z * 0.15 * delta  }, true);
         }
      }
      
      // --- HIGH IMPACT PHYSICS UPGRADE 4: High-Speed Fishtail & Traction Loss ---
      // When turning sharply at high speeds, the wheels break traction causing realistic drifting
      if (Math.abs(speedForward) > 15.0 && Math.abs(turnRate) > 3.5) {
         const driftAmount = (Math.abs(speedForward) - 15.0) * 0.05 * delta;
         const rightDir = new THREE.Vector3(1, 0, 0).applyEuler(euler);
         // Push the bot "out" of the turn
         const driftScale = currentBotConfig.armor.weight / 10;
         bodyRef.current.applyImpulse({ x: rightDir.x * Math.sign(turnRate) * driftAmount * 15.0 , y: 0, z: rightDir.z * Math.sign(turnRate) * driftAmount * 15.0  }, true);
         if (Math.random() < 0.15) {
             useGameStore.getState().spawnSparks([posRaw.x, 0.05, posRaw.z], 1, '#888888'); // tire smoke/dust
         }
      }

      globalPhysicsState[isPlayer ? 'player' : 'opponent'].pos.set(posRaw.x, posRaw.y, posRaw.z);
      globalPhysicsState[isPlayer ? 'player' : 'opponent'].vel.set(linvel.x, linvel.y, linvel.z);
      globalPhysicsState[isPlayer ? 'player' : 'opponent'].mass = (currentBotConfig.armor.weight / 10) * settings.chassisMassScale;
      
      // Animation State Update
      const myState = globalPhysicsState[isPlayer ? 'player' : 'opponent'];
      const now = Date.now();
      const timeSinceHit = now - myState.lastHitTime;
      
      if (timeSinceHit > 200 && myState.animState !== 'idle') {
        myState.animState = 'idle';
      }

      if (visualRootRef.current) {
        if (myState.animState === 'heavyImpact') {
           const intensity = Math.max(0, 1.0 - timeSinceHit / 200) * 0.15;
           visualRootRef.current.position.set(
             (Math.random() - 0.5) * intensity,
             (Math.random() - 0.5) * intensity,
             (Math.random() - 0.5) * intensity
           );
           visualRootRef.current.rotation.set(
             (Math.random() - 0.5) * intensity * 0.5,
             (Math.random() - 0.5) * intensity * 0.5,
             (Math.random() - 0.5) * intensity * 0.5
           );
        } else if (myState.animState === 'hitReact' || myState.animState === 'weaponContact') {
           const intensity = Math.max(0, 1.0 - timeSinceHit / 150) * 0.05;
           visualRootRef.current.position.set(
             myState.hitNormal.x * intensity,
             (Math.random() - 0.5) * intensity * 0.5,
             myState.hitNormal.z * intensity
           );
           visualRootRef.current.rotation.set(0,0,0);
        } else if (myState.animState === 'scraping') {
           const intensity = 0.015;
           visualRootRef.current.position.set(
             (Math.random() - 0.5) * intensity,
             (Math.random() - 0.5) * intensity,
             (Math.random() - 0.5) * intensity
           );
           visualRootRef.current.rotation.set(0,0,0);
        } else {
           // --- HIGH IMPACT PHYSICS UPGRADE 2: Chassis Weight Inertia & Suspension Lean Physics ---
           // Calculate instantaneous forward acceleration
           const accel = (speedForward - lastSpeedForward.current) / Math.max(0.001, finalDelta);
           lastSpeedForward.current = speedForward;
           
           // Apply heavy smoothing to prevent raw physics jitter while keeping response ultra-snappy
           smoothedAccel.current = THREE.MathUtils.lerp(smoothedAccel.current, accel, 0.12);
           smoothedTurnRate.current = THREE.MathUtils.lerp(smoothedTurnRate.current, turnRate, 0.12);
           
           // Pitch: dip forward on hard braking/reverse, and rear back on forward acceleration
           const targetPitch = THREE.MathUtils.clamp(-smoothedAccel.current * 0.0012 - speedForward * 0.003, -0.16, 0.16);
           // Roll: lean outwards when carving high-speed turns
           const targetRoll = THREE.MathUtils.clamp(-smoothedTurnRate.current * speedForward * 0.015, -0.14, 0.14);
           // Dynamic suspension sink: lower the chassis slightly when subjected to heavy turn forces
           const targetSuspensionY = THREE.MathUtils.clamp(-Math.abs(targetRoll) * 0.25 - Math.abs(targetPitch) * 0.15, -0.06, 0);
           
           const targetPos = new THREE.Vector3(0, targetSuspensionY, 0);
           const targetRot = new THREE.Euler(targetPitch, 0, targetRoll);
           
           visualRootRef.current.position.lerp(targetPos, 0.2);
           
           // Blend visual rotation smoothly to reflect suspension changes
           const currentQuat = new THREE.Quaternion().setFromEuler(visualRootRef.current.rotation);
           const targetQuat = new THREE.Quaternion().setFromEuler(targetRot);
           currentQuat.slerp(targetQuat, 0.2);
           visualRootRef.current.rotation.setFromQuaternion(currentQuat);
        }
      }

      // Clamp Velocity
      const currentSpeed = linvel.length();
      if (currentSpeed > settings.maximumVelocity) {
         const clamped = linvel.clone().normalize().multiplyScalar(settings.maximumVelocity);
         bodyRef.current.setLinvel(clamped, true);
      }
      
      // Clamp Angular Velocity
      const currentAngSpeed = angvel.length();
      if (currentAngSpeed > settings.maximumAngularVelocity) {
         const clampedAng = angvel.clone().normalize().multiplyScalar(settings.maximumAngularVelocity);
         bodyRef.current.setAngvel(clampedAng, true);
      }
      
      // Artificial Drift Factor
      // 0 = stick completely, 1 = slide infinitely
      // Find sideways velocity and damp it
      const rightDir = new THREE.Vector3(1, 0, 0).applyEuler(euler);
      const rightVel = rightDir.dot(linvel);
      if (Math.abs(rightVel) > 0.1 && settings.driftFactor < 1.0) {
         const dampAmount = 1.0 - settings.driftFactor;
         linvel.sub(rightDir.multiplyScalar(rightVel * dampAmount * 0.1));
         bodyRef.current.setLinvel(linvel, true);
      }

      // 1. Decay and update component-level damage offsets
      Object.keys(compOffsetsRef.current).forEach((zone) => {
        const offset = compOffsetsRef.current[zone];
        
        // Decay raw recoil jolt
        offset.jolt[0] = THREE.MathUtils.lerp(offset.jolt[0], 0, finalDelta * 10);
        offset.jolt[1] = THREE.MathUtils.lerp(offset.jolt[1], 0, finalDelta * 10);
        offset.jolt[2] = THREE.MathUtils.lerp(offset.jolt[2], 0, finalDelta * 10);

        // Persistent rattled vibration if component is loose/damaged
        const comp = damageComponents?.[zone];
        let freq = 12;
        if (comp?.visualState === 'loose') {
          freq = 28; // High speed vibration
          // Driving speeds and active spinner/drum weapons feed structural vibration/entropy
          const driveVib = (Math.abs(speedForward) * 0.08) + (isSpinning ? 0.12 : 0);
          offset.wobbleAmplitude = THREE.MathUtils.lerp(offset.wobbleAmplitude, driveVib + 0.05, finalDelta * 4);
        } else if (comp?.visualState === 'exposed' || comp?.visualState === 'dented') {
          freq = 18;
          const driveVib = (Math.abs(speedForward) * 0.03) + (isSpinning ? 0.05 : 0);
          offset.wobbleAmplitude = THREE.MathUtils.lerp(offset.wobbleAmplitude, driveVib, finalDelta * 3);
        } else {
          offset.wobbleAmplitude = THREE.MathUtils.lerp(offset.wobbleAmplitude, 0, finalDelta * 6);
        }

        offset.wobblePhase += finalDelta * freq;
        offset.wobble = Math.sin(offset.wobblePhase) * offset.wobbleAmplitude;
      });

      // 2. Apply displacement, rattle, and hanging sag to predefined armor components
      if (frontGroupRef.current) {
        const offsets = compOffsetsRef.current.front;
        const comp = damageComponents?.front;
        frontGroupRef.current.position.set(offsets.jolt[0], offsets.jolt[1] + offsets.wobble * 0.08, offsets.jolt[2]);
        const sag = comp?.visualState === 'exposed' ? 0.08 : 0;
        frontGroupRef.current.rotation.set(offsets.wobble * 0.06 + sag, offsets.wobble * 0.03, 0);
      }
      if (leftGroupRef.current) {
        const offsets = compOffsetsRef.current.left;
        const comp = damageComponents?.left;
        leftGroupRef.current.position.set(offsets.jolt[0] + offsets.wobble * 0.04, offsets.jolt[1], offsets.jolt[2]);
        const sag = comp?.visualState === 'exposed' ? -0.12 : 0; // outward lean
        leftGroupRef.current.rotation.set(0, offsets.wobble * 0.03, offsets.wobble * 0.06 + sag);
      }
      if (rightGroupRef.current) {
        const offsets = compOffsetsRef.current.right;
        const comp = damageComponents?.right;
        rightGroupRef.current.position.set(offsets.jolt[0] + offsets.wobble * 0.04, offsets.jolt[1], offsets.jolt[2]);
        const sag = comp?.visualState === 'exposed' ? 0.12 : 0; // outward lean
        rightGroupRef.current.rotation.set(0, offsets.wobble * 0.03, offsets.wobble * 0.06 + sag);
      }
      if (rearGroupRef.current) {
        const offsets = compOffsetsRef.current.rear;
        const comp = damageComponents?.rear;
        rearGroupRef.current.position.set(offsets.jolt[0], offsets.jolt[1] + offsets.wobble * 0.06, offsets.jolt[2]);
        const sag = comp?.visualState === 'exposed' ? 0.08 : 0;
        rearGroupRef.current.rotation.set(offsets.wobble * 0.06 + sag, offsets.wobble * 0.03, 0);
      }
      if (topGroupRef.current) {
        const offsets = compOffsetsRef.current.top;
        const comp = damageComponents?.top;
        topGroupRef.current.position.set(offsets.jolt[0], offsets.jolt[1] + offsets.wobble * 0.06, offsets.jolt[2]);
        const sag = comp?.visualState === 'exposed' ? 0.06 : 0;
        topGroupRef.current.rotation.set(offsets.wobble * 0.04, offsets.wobble * 0.05, offsets.wobble * 0.04 + sag);
      }

      // 3. Compute structural wheel wobble (axle precession) based on damage
      const leftWobble = damageComponents?.left?.visualState === 'loose'
        ? Math.sin(state.clock.getElapsedTime() * 32) * 0.16
        : (damageComponents?.left?.visualState === 'exposed' || damageComponents?.left?.visualState === 'dented' ? Math.sin(state.clock.getElapsedTime() * 16) * 0.05 : 0);

      const rightWobble = damageComponents?.right?.visualState === 'loose'
        ? Math.sin(state.clock.getElapsedTime() * 32) * 0.16
        : (damageComponents?.right?.visualState === 'exposed' || damageComponents?.right?.visualState === 'dented' ? Math.sin(state.clock.getElapsedTime() * 16) * 0.05 : 0);

      const leftSpin = (speedForward - turnRate * 0.9) / 0.42;
      const rightSpin = (speedForward + turnRate * 0.9) / 0.42;

      if (frontRightWheelRef.current) {
        frontRightWheelRef.current.rotation.x -= rightSpin * finalDelta;
        frontRightWheelRef.current.rotation.y = rightWobble;
        frontRightWheelRef.current.rotation.z = rightWobble * 0.5;
      }
      if (backRightWheelRef.current) {
        backRightWheelRef.current.rotation.x -= rightSpin * finalDelta;
        backRightWheelRef.current.rotation.y = rightWobble;
        backRightWheelRef.current.rotation.z = rightWobble * 0.5;
      }
      if (frontLeftWheelRef.current) {
        frontLeftWheelRef.current.rotation.x -= leftSpin * finalDelta;
        frontLeftWheelRef.current.rotation.y = leftWobble;
        frontLeftWheelRef.current.rotation.z = leftWobble * 0.5;
      }
      if (backLeftWheelRef.current) {
        backLeftWheelRef.current.rotation.x -= leftSpin * finalDelta;
        backLeftWheelRef.current.rotation.y = leftWobble;
        backLeftWheelRef.current.rotation.z = leftWobble * 0.5;
      }

      if (isCustom && currentBotConfig.parts) {
        currentBotConfig.parts.forEach(part => {
          const meshGroup = customPartsRefs.current[(part as any).id || (part as any).instanceId];
          if (meshGroup && meshGroup.children.length > 0) {
            const visualWrapper = meshGroup.children[0] as THREE.Group;
            const partId = (part as any).instanceId || (part as any).id;
            const partDef = PART_TEMPLATES.find(p => p.templateId === (part as any).definitionId || p.templateId === (part as any).templateId);
            const pType = partDef ? (partDef.type || (partDef as any).category) : null;
            
            // Procedural deformation based on mount integrity
            const nodeIdx = mechanicalStateRef.current?.nodeIndexByInstanceId.get(partId);
            if (nodeIdx !== undefined && mechanicalStateRef.current) {
               const mNode = mechanicalStateRef.current.nodes[nodeIdx];
               const integrity = mNode.mountIntegrity;
               if (integrity < 1.0) {
                 const damageSeverity = 1.0 - integrity;
                 const shake = damageSeverity > 0.5 ? Math.sin(state.clock.getElapsedTime() * 50) * 0.05 * damageSeverity : 0;
                 // Permanent sag/bend from damage
                 visualWrapper.position.y = -damageSeverity * 0.1 + shake;
                 visualWrapper.rotation.z = damageSeverity * 0.2 + shake;
                 visualWrapper.rotation.x = shake;
               }
            }

            if (pType === 'wheel') {
              const wheelState = mechanicalStateRef.current?.wheels.find(w => w.partInstanceId === partId);
              if (wheelState) {
                const edgeIdx = nodeIdx !== undefined ? mechanicalStateRef.current?.nodes[nodeIdx].parentEdgeIndex : -1;
                const edge = (edgeIdx !== undefined && edgeIdx !== -1) ? mechanicalStateRef.current?.edges[edgeIdx] : null;
                const alignmentVibration = (edge && edge.state !== 'elastic') ? Math.sin(state.clock.getElapsedTime() * 32) * 0.12 : 0;
                
                visualWrapper.rotation.x = wheelState.angle;
                visualWrapper.rotation.y = alignmentVibration;
                visualWrapper.rotation.z = alignmentVibration * 0.5;
              } else {
                const isLeft = ((part as any).position?.[0] || (part as any).localPosition?.[0]) < 0;
                const spin = isLeft ? leftSpin : rightSpin;
                const wobble = isLeft ? leftWobble : rightWobble;
                visualWrapper.rotation.x -= spin * finalDelta;
                visualWrapper.rotation.y = wobble;
                visualWrapper.rotation.z = wobble * 0.5;
              }
            } else if (pType === 'weapon') {
              const weaponState = mechanicalStateRef.current?.weapons.find(w => w.partInstanceId === partId);
              if (weaponState) {
                const wType = currentBotConfig.weapon.type;
                if (wType === 'spinner' || wType === 'saw' || wType === 'drum') {
                  if (partDef?.templateId === 'weapon_drum' || partDef?.templateId === 'weapon_spinner') {
                    visualWrapper.rotation.x = weaponState.angle;
                  } else {
                    visualWrapper.rotation.y = weaponState.angle;
                  }
                } else {
                  visualWrapper.rotation.x = weaponState.angle;
                }
              } else {
                const wType = currentBotConfig.weapon.type;
                if (partDef?.templateId === 'weapon_drum' || partDef?.templateId === 'weapon_spinner') {
                  visualWrapper.rotation.x -= currentRPM.current * finalDelta * 0.05;
                } else if (wType === 'spinner' || wType === 'saw' || wType === 'drum') {
                  visualWrapper.rotation.y -= currentRPM.current * finalDelta * 0.05;
                } else if (wType === 'flipper') {
                  visualWrapper.rotation.x = flipperPos.current * 0.9;
                } else if (wType === 'hammer') {
                  if (fireAnimRef.current > 0) {
                    const t = 1.0 - fireAnimRef.current;
                    let angle = 0;
                    if (t < 0.15) angle = -0.35 * Math.sin((t / 0.15) * Math.PI / 2);
                    else if (t < 0.45) angle = -0.35 + 2.1 * Math.sin(((t - 0.15) / 0.3) * Math.PI / 2);
                    else angle = 1.75 * Math.pow(1 - (t - 0.45) / 0.55, 2);
                    visualWrapper.rotation.x = angle;
                  } else {
                    visualWrapper.rotation.x = 0;
                  }
                } else if (wType === 'crusher') {
                  if (fireAnimRef.current > 0) {
                    const t = 1.0 - fireAnimRef.current;
                    visualWrapper.rotation.x = Math.sin(t * Math.PI) * 0.55;
                  } else {
                    visualWrapper.rotation.x = 0;
                  }
                }
              }
            }
          }
        });
      }
    }

    if (bodyRef?.current && meshRef.current) {
      meshRef.current.position.copy(bodyRef.current.translation());
    }

    if (bodyRef?.current && battleStatus === 'battle') {
      const myPos = bodyRef.current.translation();
      const currentRotation = bodyRef.current.rotation();
      const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(currentRotation.x, currentRotation.y, currentRotation.z, currentRotation.w));
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(euler); const up = new THREE.Vector3(0, 1, 0).applyEuler(euler);

      // Robust Stuck State Detection & Resolution
      const currentPos = new THREE.Vector3(myPos.x, myPos.y, myPos.z);
      // AI always counts as trying to move forward if it's far enough
      const isInputActive = isPlayer 
        ? (get().forward || get().backward || useGameStore.getState().virtualInput.forward || useGameStore.getState().virtualInput.backward) 
        : (targetRef?.current && currentPos.distanceTo(targetRef.current.translation()) > 0.6);
      
      const posDiff = currentPos.distanceTo(lastPos.current);
      // Only increment stuck timer if actively trying to move linearly but failing to move
      if (isInputActive && posDiff < 0.015) {
        stuckTimer.current += delta;
      } else {
        stuckTimer.current = 0;
      }
      lastPos.current.copy(currentPos);

      const outOfArena = Math.abs(currentPos.x) > 14.5 || Math.abs(currentPos.z) > 14.5 || currentPos.y < -0.15 || currentPos.y > 6.0;
      if (stuckTimer.current > 1.5 || outOfArena) {
        stuckTimer.current = 0;
        
        if (outOfArena) {
          const safeX = THREE.MathUtils.clamp(currentPos.x, -10, 10);
          const safeZ = THREE.MathUtils.clamp(currentPos.z, -10, 10);
          bodyRef.current.setTranslation({ x: safeX, y: 1.0, z: safeZ }, true);
          bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
          bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
          useGameStore.getState().addLog(`Boundary hazard recovery activated for ${isPlayer ? 'Player' : 'Opponent'}.`, 'info');
        } else {
          const centerDir = new THREE.Vector3(0 - currentPos.x, 0, 0 - currentPos.z).normalize();
          const massScale = currentBotConfig.armor.weight / 10;
          bodyRef.current.applyImpulse({ x: centerDir.x * 10 , y: 3 , z: centerDir.z * 10  }, true);
          bodyRef.current.applyTorqueImpulse({ x: 1 , y: 3 , z: 1  }, true);
          useGameStore.getState().addLog(`Stuck lock resolved for ${isPlayer ? 'Player' : 'Opponent'}.`, 'info');
        }
      }

      let wantToFire = false;

      // Ensure bodies don't fall asleep while they are moving or waiting
      if (bodyRef.current && typeof bodyRef.current.wakeUp === 'function') {
        bodyRef.current.wakeUp();
      }

      let isMechanicalActive = false;

      if (isCustom && mechanicalStateRef.current && assemblyPlan) {
        const mState = mechanicalStateRef.current;
        mState.simulationTick++;
        isMechanicalActive = true;

        if (isPlayer) {
          const keyboardInput = get();
          const virtualInput = useGameStore.getState().virtualInput;
          const forward = keyboardInput.forward || virtualInput.forward;
          const backward = keyboardInput.backward || virtualInput.backward;
          const left = keyboardInput.left || virtualInput.left;
          const right = keyboardInput.right || virtualInput.right;

          const analogY_val = virtualInput.analogY || 0;
          const analogX_val = virtualInput.analogX || 0;
          const analogY = analogY_val !== 0 ? analogY_val : (forward ? -1 : backward ? 1 : 0);
          const analogX = analogX_val !== 0 ? analogX_val : (left ? -1 : right ? 1 : 0);

          const intent: BotControlIntent = {
            throttle: -analogY,
            steering: -analogX,
            brake: (analogY === 0 && analogX === 0) ? 0.8 : 0.0,
            weaponCommand: isSpinning ? 1.0 : 0.0,
            selfRightCommand: (up.y < 0.8) ? 1.0 : 0.0
          };

          const bPos = bodyRef.current.translation();
          const bRot = bodyRef.current.rotation();
          resolveGroundSupports(mState, [bPos.x, bPos.y, bPos.z], [bRot.x, bRot.y, bRot.z, bRot.w], assemblyPlan);

          const bLinvel = bodyRef.current.linvel();
          const bAngvel = bodyRef.current.angvel();
          const { forces, reactionTorque } = updateWheelGroundDynamics(
            mState,
            intent,
            [bLinvel.x, bLinvel.y, bLinvel.z],
            [bAngvel.x, bAngvel.y, bAngvel.z],
            [bRot.x, bRot.y, bRot.z, bRot.w],
            [bPos.x, bPos.y, bPos.z],
            assemblyPlan,
            finalDelta
          );

          forces.forEach(f => {
            bodyRef.current.applyImpulseAtPoint(
              { x: f.force[0] * finalDelta * 0.1, y: f.force[1] * finalDelta * 0.1, z: f.force[2] * finalDelta * 0.1 },
              { x: f.point[0], y: f.point[1], z: f.point[2] },
              true
            );
          });

          bodyRef.current.applyTorqueImpulse(
            { x: reactionTorque[0] * finalDelta * 0.1, y: reactionTorque[1] * finalDelta * 0.1, z: reactionTorque[2] * finalDelta * 0.1 },
            true
          );

          const weaponResult = updateWeaponDynamicsAndMomentum(
            mState,
            intent,
            [bAngvel.x, bAngvel.y, bAngvel.z],
            [bRot.x, bRot.y, bRot.z, bRot.w],
            assemblyPlan,
            finalDelta
          );

          bodyRef.current.applyTorqueImpulse(
            { x: weaponResult.reactionTorque[0] * finalDelta * 0.1, y: weaponResult.reactionTorque[1] * finalDelta * 0.1, z: weaponResult.reactionTorque[2] * finalDelta * 0.1 },
            true
          );

          const knockoutEval = evaluateMobilityAndKnockout(mState);
          if (knockoutEval.isKilled && battleStatus === 'battle') {
            damageBot('player', 100);
          }

          globalMechanicalState.player.current = mState;

          wantToFire = (keyboardInput.jump || virtualInput.action) && (actualWeaponType === 'flipper' || actualWeaponType === 'hammer' || actualWeaponType === 'crusher');
        } else if (targetRef?.current) {
          const targetPos = targetRef.current.translation();
          const dx = targetPos.x - myPos.x;
          const dz = targetPos.z - myPos.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const dot = dir.x * (dx/dist) + dir.z * (dz/dist);

          let throttle = 0;
          let steering = 0;
          let brake = 0.0;

          if (dist > 0.4) {
            if (dot > 0.4) {
              throttle = dot;
            }
            const targetAngle = Math.atan2(dx, dz);
            const currentYaw = Math.atan2(dir.x, dir.z);
            let angleDiff = targetAngle - currentYaw;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            steering = THREE.MathUtils.clamp(angleDiff * 2.0, -1, 1);
          } else {
            brake = 1.0;
          }

          const intent: BotControlIntent = {
            throttle,
            steering,
            brake,
            weaponCommand: isSpinning ? 1.0 : 0.0,
            selfRightCommand: (up.y < 0.8) ? 1.0 : 0.0
          };

          const bPos = bodyRef.current.translation();
          const bRot = bodyRef.current.rotation();
          resolveGroundSupports(mState, [bPos.x, bPos.y, bPos.z], [bRot.x, bRot.y, bRot.z, bRot.w], assemblyPlan);

          const bLinvel = bodyRef.current.linvel();
          const bAngvel = bodyRef.current.angvel();
          const { forces, reactionTorque } = updateWheelGroundDynamics(
            mState,
            intent,
            [bLinvel.x, bLinvel.y, bLinvel.z],
            [bAngvel.x, bAngvel.y, bAngvel.z],
            [bRot.x, bRot.y, bRot.z, bRot.w],
            [bPos.x, bPos.y, bPos.z],
            assemblyPlan,
            finalDelta
          );

          forces.forEach(f => {
            bodyRef.current.applyImpulseAtPoint(
              { x: f.force[0] * finalDelta * 0.1, y: f.force[1] * finalDelta * 0.1, z: f.force[2] * finalDelta * 0.1 },
              { x: f.point[0], y: f.point[1], z: f.point[2] },
              true
            );
          });

          bodyRef.current.applyTorqueImpulse(
            { x: reactionTorque[0] * finalDelta * 0.1, y: reactionTorque[1] * finalDelta * 0.1, z: reactionTorque[2] * finalDelta * 0.1 },
            true
          );

          const weaponResult = updateWeaponDynamicsAndMomentum(
            mState,
            intent,
            [bAngvel.x, bAngvel.y, bAngvel.z],
            [bRot.x, bRot.y, bRot.z, bRot.w],
            assemblyPlan,
            finalDelta
          );

          bodyRef.current.applyTorqueImpulse(
            { x: weaponResult.reactionTorque[0] * finalDelta * 0.1, y: weaponResult.reactionTorque[1] * finalDelta * 0.1, z: weaponResult.reactionTorque[2] * finalDelta * 0.1 },
            true
          );

          const knockoutEval = evaluateMobilityAndKnockout(mState);
          if (knockoutEval.isKilled && battleStatus === 'battle') {
            damageBot('opponent', 100);
          }

          globalMechanicalState.opponent.current = mState;

          if (dist < 1.8 && dot > 0.8 && (actualWeaponType === 'flipper' || actualWeaponType === 'hammer' || actualWeaponType === 'crusher')) {
            wantToFire = true;
          }
        }
      }

      if (!isMechanicalActive) {
        if (isPlayer) {
          const keyboardInput = get();
          const virtualInput = useGameStore.getState().virtualInput;
          const forward = keyboardInput.forward || virtualInput.forward;
          const backward = keyboardInput.backward || virtualInput.backward;
          const left = keyboardInput.left || virtualInput.left;
          const right = keyboardInput.right || virtualInput.right;

           // Auto-righting if flipped
          if (up.y < 0.8) {
            const rightingAxis = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0)).normalize();
            const rightingStrength = (1.0 - up.y) * 8.0 * (config.armor.weight / 10) * delta * 120;
            bodyRef.current.applyTorqueImpulse({ x: rightingAxis.x * rightingStrength, y: 0, z: rightingAxis.z * rightingStrength }, true);
            if (up.y < 0.0 && myPos.y < 1.0) {
               bodyRef.current.applyImpulse({ x: 0, y: 15.0 * (config.armor.weight / 10) * delta, z: 0 }, true);
            }
          }

          const speed = config.motor.maxSpeed * 0.45 * 1.0;
          const torque = config.motor.torque * 0.025 * 1.0;
          
          const analogY_val = virtualInput.analogY || 0;
          const analogX_val = virtualInput.analogX || 0;
          const analogY = analogY_val !== 0 ? analogY_val : (forward ? -1 : backward ? 1 : 0);
          const analogX = analogX_val !== 0 ? analogX_val : (left ? -1 : right ? 1 : 0);

          if (analogY !== 0) {
              const driveScale = config.armor.weight / 10;
              bodyRef.current.applyImpulse({ x: -dir.x * analogY * speed * delta * 15 , y: 0, z: -dir.z * analogY * speed * delta * 15  }, true);
          } else {
              // Apply forward/backward linear braking to make controls super sharp and responsive
              const currentLinVel = bodyRef.current.linvel();
              const forwardVel = dir.dot(new THREE.Vector3(currentLinVel.x, currentLinVel.y, currentLinVel.z));
              if (Math.abs(forwardVel) > 0.05) {
                 const brakeForce = dir.clone().multiplyScalar(-forwardVel * 0.12);
                 bodyRef.current.setLinvel({
                   x: currentLinVel.x + brakeForce.x,
                   y: currentLinVel.y,
                   z: currentLinVel.z + brakeForce.z
                 }, true);
              }
          }
          
          // High quality directional controls with active rotational dampening
          const currentAngVel = bodyRef.current.angvel();
          if (analogX !== 0) {
              // Target turning velocity based on turning input, using maximumAngularVelocity as benchmark
              // Scaling the target turning speed to be extremely comfortable and precise (max ~8.5 rad/s)
              const turnFactor = 8.5;
              const targetAngVelY = -analogX * turnFactor;
              
              // Interpolate smoothly but instantly to target rotational velocity
              bodyRef.current.setAngvel({
                x: currentAngVel.x,
                y: currentAngVel.y + (targetAngVelY - currentAngVel.y) * 0.35,
                z: currentAngVel.z
              }, true);
          } else {
              // Heavy rotational braking when no steering input is applied - stops the "million mph 360" effect!
              bodyRef.current.setAngvel({
                x: currentAngVel.x,
                y: currentAngVel.y * 0.72,
                z: currentAngVel.z
              }, true);
          }
          
          wantToFire = (keyboardInput.jump || virtualInput.action) && (actualWeaponType === 'flipper' || actualWeaponType === 'hammer' || actualWeaponType === 'crusher');
        } else if (targetRef?.current) {
          const targetPos = targetRef.current.translation();
          
          const dx = targetPos.x - myPos.x;
          const dz = targetPos.z - myPos.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const dot = dir.x * (dx/dist) + dir.z * (dz/dist);
          
           // Auto-righting if flipped
          if (up.y < 0.8) {
            const rightingAxis = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0)).normalize();
            const rightingStrength = (1.0 - up.y) * 8.0 * (opponentConfig.armor.weight / 10) * delta * 120;
            bodyRef.current.applyTorqueImpulse({ x: rightingAxis.x * rightingStrength, y: 0, z: rightingAxis.z * rightingStrength }, true);
            if (up.y < 0.0 && myPos.y < 1.0) {
               bodyRef.current.applyImpulse({ x: 0, y: 15.0 * (opponentConfig.armor.weight / 10) * delta, z: 0 }, true);
            }
          }

          if (dist > 0.4) {
            const speed = opponentConfig.motor.maxSpeed * 0.45 * 1.0;
            const nx = dx / dist;
            const nz = dz / dist;
            
            // Drive forward if roughly facing the target
            if (dot > 0.4) {
              // Apply impulse along the robot's forward vector (dir) proportional to how directly it's facing the player
              // Dampen speed significantly to prevent "shooting across the map"
              const driveFactor = Math.max(0, dot);
              const driveScale = opponentConfig.armor.weight / 10;
              bodyRef.current.applyImpulse({ x: dir.x * speed * delta * 5.0 * driveFactor , y: 0, z: dir.z * speed * delta * 5.0 * driveFactor  }, true);
            }
            
            // Smoothly steer towards the player using torque instead of forcefully setting rotation
            const targetAngle = Math.atan2(nx, nz);
            // Get current yaw (approximate from direction vector)
            const currentYaw = Math.atan2(dir.x, dir.z);
            
            // Smallest angle difference
            let angleDiff = targetAngle - currentYaw;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            
            // Apply torque proportional to the angle difference
            const torqueAmt = angleDiff * opponentConfig.motor.torque * delta * 0.08; 
            bodyRef.current.applyTorqueImpulse({ x: 0, y: torqueAmt, z: 0 }, true);
          }
          
          if (dist < 1.8 && dot > 0.8 && (actualWeaponType === 'flipper' || actualWeaponType === 'hammer' || actualWeaponType === 'crusher')) {
              wantToFire = true;
          }
        }
      }

      if (wantToFire && cooldownRef.current <= 0) {
          cooldownRef.current = (actualWeaponType === 'crusher' ? 2.5 : 1.5) * 1.0;
          fireAnimRef.current = 1;
          
          if (targetRef?.current) {
             const targetPos = targetRef.current.translation();
             const dx = targetPos.x - myPos.x;
             const dz = targetPos.z - myPos.z;
             const dist = Math.sqrt(dx * dx + dz * dz);
             const dot = dir.x * (dx/dist) + dir.z * (dz/dist);
             
             // Dynamic effective range: hammers can reach further, crushers/flippers need to be tight
             const effectiveRange = actualWeaponType === 'hammer' ? 2.2 : 1.7;
             
             if (dist < effectiveRange && dot > 0.7) {
                 const damageBase = currentBotConfig.weapon.damage;
                 const finalDamage = damageBase * 0.15; 
                 damageBot(isPlayer ? 'opponent' : 'player', finalDamage); if (finalDamage > 2.0) { useGameStore.getState().addLog(`🔨 DEVASTATING! ${actualWeaponType.toUpperCase()} struck a critical blow!`, 'combat'); }
                 
                 const impactVector = [dir.x * 15 * settings.impactImpulseScale, 10 * settings.impactImpulseScale, dir.z * 15 * settings.impactImpulseScale] as [number, number, number];
                 useGameStore.getState().spawnDebris([targetPos.x, targetPos.y, targetPos.z], finalDamage * 8.0, impactVector);
                 useGameStore.getState().spawnSparks([targetPos.x, targetPos.y, targetPos.z], Math.floor(finalDamage * 4), actualWeaponType === 'hammer' ? '#FFD700' : '#FFFFFF');
                 
                 // Dispatch combat impact event for visual denting solver
                 window.dispatchEvent(new CustomEvent('combat-impact', {
                   detail: {
                     type: 'collision',
                     className: 'weapon',
                     impactEnergy: finalDamage * 10,
                     damageAmount: finalDamage,
                     position: [targetPos.x, targetPos.y, targetPos.z],
                     attacker: isPlayer ? 'player' : 'opponent',
                     defender: isPlayer ? 'opponent' : 'player',
                     hitZone: 'front',
                     defenderId: isPlayer ? 'opponent' : 'player',
                     normal: [dir.x, dir.y, dir.z]
                   }
                 }));
                 
                 const oppWeightRaw = isPlayer ? opponentConfig.armor.weight : config.armor.weight;
                 const oppWeightMult = Math.max(0.8, oppWeightRaw / 100);

                 if (actualWeaponType === 'flipper') {
                     targetRef.current.applyImpulse({ x: dir.x * 15 * settings.impactImpulseScale / oppWeightMult, y: 20 * settings.impactImpulseScale / oppWeightMult, z: dir.z * 15 * settings.impactImpulseScale / oppWeightMult }, true);
                     targetRef.current.applyTorqueImpulse({ x: (Math.random() - 0.5) * 20 * settings.impactImpulseScale, y: (Math.random() - 0.5) * 20 * settings.impactImpulseScale, z: (Math.random() - 0.5) * 20 * settings.impactImpulseScale }, true);
                     bodyRef.current.applyImpulse({ x: -dir.x * 15 * 1.0, y: -10 * 1.0, z: -dir.z * 15 * 1.0 }, true); 
                 } else if (actualWeaponType === 'hammer') {
                     targetRef.current.applyImpulse({ x: 0, y: -60 * settings.impactImpulseScale / oppWeightMult, z: 0 }, true);
                     bodyRef.current.applyImpulse({ x: 0, y: 30 * 1.0, z: 0 }, true); 
                 } else if (actualWeaponType === 'crusher') {
                     targetRef.current.applyImpulse({ x: -dir.x * 20 * settings.impactImpulseScale / oppWeightMult, y: -40 * settings.impactImpulseScale / oppWeightMult, z: -dir.z * 20 * settings.impactImpulseScale / oppWeightMult }, true);
                 }
             }
          }
      }

      bodyRef.current.setLinearDamping(2.5 * settings.vehicleGrip);
      bodyRef.current.setAngularDamping(settings.angularDamping);
    }
  });

  return (
    <BotOwnerContext.Provider value={isPlayer ? 'player' : 'opponent'}>
      <DamageContext.Provider value={damageFactor}>
        <group ref={meshRef} position={position} />
      
      <RigidBody ccd={true} 
        ref={bodyRef} 
        position={position} 
        colliders={false} 
        mass={(currentBotConfig.armor.weight / 10) * settings.chassisMassScale} 
        type="dynamic" 
        lockRotations={false} 
        lockTranslations={false} 
        enabledRotations={[true, true, true]}
        canSleep={false}
        userData={{ id: isPlayer ? 'player' : 'opponent' }}
        onContactForce={(e) => {
           if (battleStatus !== 'battle') return;
           const force = e.totalForceMagnitude;
           if (force > 500) {
             const now = Date.now();
             if (now - lastHitTime.current < 250) return;
             // High sustained contact force detected
             const detail = {
                 type: 'force',
                 force: force,
                 attacker: isPlayer ? 'player' : 'opponent'
             };
             window.dispatchEvent(new CustomEvent('combat-impact', { detail }));
           }
        }}
        onCollisionEnter={({ other }) => {
          if (battleStatus !== 'battle') return;
          const otherId = other.rigidBodyObject?.userData?.id;
          if (otherId === 'player' || otherId === 'opponent') {
            const now = Date.now();
            if (now - lastHitTime.current < 250) return;
            lastHitTime.current = now;

            const myId = isPlayer ? 'player' : 'opponent';
            
            // Only process damage on one side to prevent double-dipping, let's say 'player' always processes it
            if (myId === 'player') {
               const myState = globalPhysicsState[myId];
               const oppState = globalPhysicsState[otherId];
               
               const relVel = new THREE.Vector3().subVectors(myState.vel, oppState.vel);
               const relSpeed = relVel.length();
               
               // Estimate contact point (midpoint)
               const contactPoint: [number, number, number] = [
                 (myState.pos.x + oppState.pos.x) / 2,
                 (myState.pos.y + oppState.pos.y) / 2,
                 (myState.pos.z + oppState.pos.z) / 2
               ];
               
               const normalVec = new THREE.Vector3().subVectors(oppState.pos, myState.pos).normalize();
               const normal: [number, number, number] = [normalVec.x, normalVec.y, normalVec.z];
               
               const normalVelocity = Math.abs(relVel.dot(normalVec));
               const tangentialVelocity = Math.sqrt(Math.max(0, relSpeed * relSpeed - normalVelocity * normalVelocity));
               
               const reducedMass = (myState.mass * oppState.mass) / (myState.mass + oppState.mass);
               const impactEnergy = 0.5 * reducedMass * relSpeed * relSpeed;
               const impulse = reducedMass * normalVelocity * (1 + settings.collisionRestitution);
               
               if (impactEnergy < 2) return; // Ignore very tiny bumps
               
               // Classify impact
               let className: ImpactClass = 'glancing';
               if (actualWeaponType && useGameStore.getState().botState.weaponActive) {
                 className = 'weapon';
               } else if (impactEnergy > settings.heavyHitThreshold) {
                 className = 'heavy';
               } else if (normalVelocity > tangentialVelocity * 1.5) {
                 className = 'direct';
               } else if (tangentialVelocity > 5) {
                 className = 'scrape';
               }
               
               // Calculate Damage
               const energyDmgScale = Math.min(impactEnergy * 0.005, 50);
               const dmgMult = settings.damageMultiplier;
               const glancingMult = className === 'direct' || className === 'heavy' || className === 'weapon' ? 1.0 : settings.glancingHitReduction;
               let baseDamage = energyDmgScale * dmgMult * glancingMult * settings.collisionBrutality * 0.1;
               baseDamage = Math.min(baseDamage, 1.5);

               // --- HIGH IMPACT PHYSICS UPGRADE 1: Kinetic Collision Recoil & Rotational Instability ---
               if (impactEnergy > 2 && bodyRef.current && targetRef.current) {
                 // Scale impulse based on mass and speed
                 const baseForce = Math.min(normalVelocity * 0.4, 10) * settings.impactImpulseScale;
                 
                 // Calculate directional force vectors
                 const recoilDir = normalVec.clone().normalize();
                 const pushX = recoilDir.x * baseForce;
                 const pushZ = recoilDir.z * baseForce;
                 
                 // Determine vertical pop/lift (heavy hits or spinner hits pop bots into the air!)
                 const liftForce = (className === 'heavy' || className === 'weapon') ? (Math.min(normalVelocity * 0.3, 5) * settings.impactImpulseScale) : 0;
                 
                 // Apply repulsive linear impulses to push bots apart realistically
                 targetRef.current.applyImpulse({ x: pushX, y: liftForce, z: pushZ }, true);
                 bodyRef.current.applyImpulse({ x: -pushX, y: liftForce * 0.2, z: -pushZ }, true);
                 
                 // Apply angular torque impulses to induce realistic spinout, roll, or tipping
                 const torquePower = Math.min(normalVelocity * 1.5, 12) * settings.impactImpulseScale;
                 
                 // Defender wobbles, tips, and spins out violently
                 targetRef.current.applyTorqueImpulse({
                   x: (Math.random() - 0.5) * torquePower,
                   y: (Math.random() > 0.5 ? 1 : -1) * torquePower * 1.5, // Yaw spinout
                   z: (Math.random() - 0.5) * torquePower
                 }, true);
                 
                 // Attacker experiences a minor reactive wobble/shudder
                 bodyRef.current.applyTorqueImpulse({
                   x: (Math.random() - 0.5) * torquePower * 0.4,
                   y: -(Math.random() > 0.5 ? 1 : -1) * torquePower * 0.5,
                   z: (Math.random() - 0.5) * torquePower * 0.4
                 }, true);
               }
               
               const components = otherId === 'player' ? useGameStore.getState().playerDamageComponents : useGameStore.getState().opponentDamageComponents;
               let hitZone = 'core';
               if (Math.abs(contactPoint[0]) > Math.abs(contactPoint[2])) {
                 hitZone = contactPoint[0] > 0 ? 'right' : 'left';
               } else {
                 hitZone = contactPoint[2] > 0 ? 'front' : 'rear';
               }
               if (contactPoint[1] > 0.5) hitZone = 'top';
               
               window.dispatchEvent(new CustomEvent('combat-impact', {
                 detail: {
                   type: 'collision',
                   className,
                   impactEnergy,
                   damageAmount: baseDamage,
                   position: contactPoint,
                   attacker: config.name,
                   defender: opponentConfig.name,
                   hitZone,
                   defenderId: otherId,
                   normal: normal
                 }
               }));
               
               const wasDetached = components[hitZone]?.detached;
               const targetComp = components[hitZone];

               const damageEvent = DamageSystem.processImpact(
                 now,
                 myId,
                 otherId,
                 normalVelocity,
                 tangentialVelocity,
                 impulse,
                 contactPoint,
                 normal,
                 [0, 0, 0], // tangent estimation
                 className === 'weapon' ? 'weapon' : 'body',
                 targetComp
               );
               
               if (targetComp && !wasDetached && targetComp.detached) { 
                 useGameStore.getState().addLog(`${isPlayer ? "Opponent" : "Player"} ${hitZone} component DESTROYED!`, "critical"); 
                 useGameStore.getState().spawnSparks([contactPoint[0], contactPoint[1] + 0.2, contactPoint[2]], 40, "#FF3300"); 
                 useGameStore.getState().spawnDebris([contactPoint[0], contactPoint[1] + 0.2, contactPoint[2]], 15); 
               }
               
               if (damageEvent) damageEvent.damageAmount = baseDamage;
               useGameStore.getState().processImpactEvent(damageEvent);
               if (damageEvent && damageEvent.dentRequest) {
                 window.dispatchEvent(new CustomEvent('dent-request', { detail: damageEvent.dentRequest }));
               }


               const event = {
                 id: 'impact_' + now,
                 time: now,
                 className,
                 attackerId: myId,
                 defenderId: otherId,
                 contactPoint,
                 normal,
                 relativeVelocity: relSpeed,
                 normalVelocity,
                 tangentialVelocity,
                 impulse,
                 impactEnergy,
                 massRatio: myState.mass / oppState.mass,
                 materialA: 'steel', // Could be driven by actual part config in future
                 materialB: 'steel',
                 weaponSpin: useGameStore.getState().botState.weaponActive && config.weapon ? config.weapon.rpm : 0,
                 damageAmount: baseDamage,
                 confidence: 1.0
               } as any;
               if (baseDamage > 2.0) {
                 useGameStore.getState().addLog(`💥 MAJOR HIT! Kinetic impact delivered massive force to ${otherId}.`, 'combat');
               } else if (baseDamage > 0.8 && className === 'glancing') {
                 useGameStore.getState().addLog(`🛡️ Glancing blow deflected by ${otherId}'s armor.`, 'combat');
               }
               
               // Trigger Sound
               playImpactSound(event);
               
               // Update animation state
               myState.lastHitTime = now;
               myState.hitNormal.set(normalVec.x, normalVec.y, normalVec.z);
               if (className === 'heavy') myState.animState = 'heavyImpact';
               else if (className === 'scrape') myState.animState = 'scraping';
               else if (className === 'weapon') myState.animState = 'weaponContact';
               else myState.animState = 'hitReact';

               oppState.lastHitTime = now;
               oppState.hitNormal.set(-normalVec.x, -normalVec.y, -normalVec.z);
               if (className === 'heavy') oppState.animState = 'heavyImpact';
               else if (className === 'scrape') oppState.animState = 'scraping';
               else if (className === 'weapon') oppState.animState = 'weaponContact';
               else oppState.animState = 'hitReact';
               
               if (baseDamage > 2) {
                 useGameStore.getState().damageBot('player', baseDamage * 0.5);
                 useGameStore.getState().damageBot('opponent', baseDamage * 0.5);
               }
                 
               // Spawn effects
               const finalAmount = className === 'heavy' || className === 'weapon' ? 100 : 30;
               useGameStore.getState().spawnSparks([contactPoint[0], contactPoint[1] + 0.2, contactPoint[2]], finalAmount);
               if (className === 'heavy' && !settings.performanceMode) {
                 useGameStore.getState().spawnDebris([contactPoint[0], contactPoint[1] + 0.2, contactPoint[2]], finalAmount / 2);
                 window.dispatchEvent(new CustomEvent('spawn-shockwave', { detail: { position: [contactPoint[0], 0.05, contactPoint[2]] } }));
               }

               // Removed cinematic slow mo
            }
          }
        }}
      >
        {!isCustom ? (
          <>
            {/* Core Chassis */}
            <CuboidCollider args={[0.55, 0.25, 0.8]} position={[0, 0.35, 0]} restitution={settings.collisionRestitution} friction={0.4} />
            {/* Front Wedge */}
            <CuboidCollider args={[0.7, 0.1, 0.4]} position={[0, 0.18, -1.1]} rotation={[0.3, 0, 0]} restitution={settings.collisionRestitution} friction={0.1} />
            {/* Left Armor */}
            <CuboidCollider args={[0.1, 0.25, 0.7]} position={[-0.65, 0.35, 0]} restitution={settings.collisionRestitution} friction={0.4} />
            {/* Right Armor */}
            <CuboidCollider args={[0.1, 0.25, 0.7]} position={[0.65, 0.35, 0]} restitution={settings.collisionRestitution} friction={0.4} />
            
            {/* Abstract Low-Friction Wheel Colliders so the bot rolls smoothly */}
            <CylinderCollider args={[0.15, 0.42]} position={[-0.9, 0.42, 0.6]} rotation={[0, 0, Math.PI / 2]} friction={0.0} />
            <CylinderCollider args={[0.15, 0.42]} position={[0.9, 0.42, 0.6]} rotation={[0, 0, Math.PI / 2]} friction={0.0} />
            <CylinderCollider args={[0.15, 0.42]} position={[-0.9, 0.42, -0.6]} rotation={[0, 0, Math.PI / 2]} friction={0.0} />
            <CylinderCollider args={[0.15, 0.42]} position={[0.9, 0.42, -0.6]} rotation={[0, 0, Math.PI / 2]} friction={0.0} />
          </>
        ) : (
          resolvedParts.map((tr) => {
            const partDef = PART_TEMPLATES.find(p => p.templateId === tr.definitionId) as any;
            const mNode = mechanicalStateRef.current?.nodes.find(n => n.partInstanceId === tr.instanceId);
            const isDetached = mNode && (mNode.failureState === 'detached' || mNode.failureState === 'failed');
            if (isDetached) return null;

            const isWheelPart = partDef && (partDef.type === 'wheel' || partDef.category === 'wheel');

            if (partDef && partDef.colliders && partDef.colliders.length > 0) {
              return (
                <group key={tr.instanceId} position={tr.world.position} rotation={tr.world.rotation}>
                  {partDef.colliders.map((col, idx) => {
                    if (col.kind === 'box' || col.kind === 'wedge') {
                      return (
                        <CuboidCollider 
                          key={`${tr.instanceId}-${idx}`}
                          args={[col.dimensions[0] / 2, col.dimensions[1] / 2, col.dimensions[2] / 2]} 
                          position={col.localPosition} 
                          rotation={col.localRotation}
                          restitution={settings.collisionRestitution} friction={isWheelPart ? 0.0 : 0.2} 
                        />
                      );
                    }
                    if (col.kind === 'cylinder') {
                      return (
                        <CylinderCollider 
                          key={`${tr.instanceId}-${idx}`}
                          args={[col.dimensions[0] / 2, col.dimensions[1] / 2]} 
                          position={col.localPosition}
                          rotation={col.localRotation}
                          restitution={settings.collisionRestitution} friction={isWheelPart ? 0.0 : 0.2} 
                        />
                      );
                    }
                    if (col.kind === 'capsule') {
                      return (
                        <CapsuleCollider 
                          key={`${tr.instanceId}-${idx}`}
                          args={[Math.max(0.01, col.dimensions[0] - col.dimensions[1]) / 2, col.dimensions[1] / 2]} 
                          position={col.localPosition}
                          rotation={col.localRotation}
                          restitution={settings.collisionRestitution} friction={isWheelPart ? 0.0 : 0.2} 
                        />
                      );
                    }
                    return null;
                  })}
                </group>
              );
            } else if (partDef) {
               // Fallback collider based on part shape
               const [w, h, d] = partDef.size || [0.5, 0.5, 0.5];
               return (
                 <group key={tr.instanceId} position={tr.world.position} rotation={tr.world.rotation}>
                   {partDef.visualKind === 'cylinder' ? (
                     <CylinderCollider 
                       args={[d / 2, w / 2]} 
                       restitution={settings.collisionRestitution} friction={isWheelPart ? 0.0 : 0.2} 
                     />
                   ) : (
                     <CuboidCollider 
                       args={[w / 2, h / 2, d / 2]} 
                       restitution={settings.collisionRestitution} friction={isWheelPart ? 0.0 : 0.2} 
                     />
                   )}
                 </group>
               );
            }
            return null;
          })
        )}

        <group ref={visualRootRef}>
          <BotDamageVisuals botId={isPlayer ? "player" : "opponent"} />
        {isCustom && currentBotConfig.customConfig && currentBotConfig.customConfig.parts && (
          <group position={[0, 0, 0]}>
            {resolvedParts.map((tr) => {
              const part = currentBotConfig.customConfig.parts.find(p => p.instanceId === tr.instanceId)!;
              const partDef = PART_TEMPLATES.find(p => p.templateId === tr.definitionId) as any;
              if (!part || !partDef) return null;
              
              const mNode = mechanicalStateRef.current?.nodes.find(n => n.partInstanceId === tr.instanceId);
              const isDetached = mNode && (mNode.failureState === 'detached' || mNode.failureState === 'failed');
              if (isDetached) return null;

              const [w, h, d] = partDef.dimensions || partDef.size || [0.5,0.5,0.5];
              const color = part.color || partDef.color || '#fff';
              const visualKind = partDef.visualKind;
              const pType = partDef.type || partDef.category;
              const isRightWheel = pType === 'wheel' && tr.local.position[0] > 0;

              return (
                <group 
                  key={(part as any).id || (part as any).instanceId} 
                  ref={(el) => { customPartsRefs.current[(part as any).id || (part as any).instanceId] = el; }}
                  position={tr.world.position}
                  rotation={tr.world.rotation}
                >
                  <group name="visual-wrapper">
                    {visualKind === 'box' && (
                      <RoundedBoxMesh size={[w, h, d]} color={color} />
                    )}
                    {visualKind === 'cylinder' && (
                      partDef?.templateId === 'weapon_drum' ? (
                        <group name="DrumSpinner" rotation={[0, 0, 0]}>
                          {/* Core Drum Barrel */}
                          <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
                            <cylinderGeometry args={[0.3, 0.3, 0.65, 32]} />
                            <meshStandardMaterial color="#2a2a2a" metalness={0.9} roughness={0.2} />
                          </mesh>
                          {/* Grooves & caps */}
                          <mesh castShadow rotation={[0, 0, Math.PI / 2]} position={[0.2, 0, 0]}>
                             <cylinderGeometry args={[0.31, 0.31, 0.05, 32]} />
                             <meshStandardMaterial color={color} metalness={0.8} roughness={0.1} />
                          </mesh>
                          <mesh castShadow rotation={[0, 0, Math.PI / 2]} position={[-0.2, 0, 0]}>
                             <cylinderGeometry args={[0.31, 0.31, 0.05, 32]} />
                             <meshStandardMaterial color={color} metalness={0.8} roughness={0.1} />
                          </mesh>
                          {/* 8 staggered sharp cones */}
                          {[
                            { angle: 0, x: -0.22 },
                            { angle: Math.PI / 4, x: -0.11 },
                            { angle: Math.PI / 2, x: 0 },
                            { angle: (3 * Math.PI) / 4, x: 0.11 },
                            { angle: Math.PI, x: 0.22 },
                            { angle: (5 * Math.PI) / 4, x: -0.16 },
                            { angle: (3 * Math.PI) / 2, x: -0.05 },
                            { angle: (7 * Math.PI) / 4, x: 0.16 },
                          ].map((spike, idx) => {
                            const radius = 0.3;
                            const sy = Math.sin(spike.angle) * radius;
                            const sz = Math.cos(spike.angle) * radius;
                            return (
                              <group key={idx} position={[spike.x, sy, sz]} rotation={[spike.angle, 0, 0]}>
                                <mesh castShadow>
                                  <boxGeometry args={[0.08, 0.06, 0.08]} />
                                  <meshStandardMaterial color="#444" metalness={0.9} roughness={0.2} />
                                </mesh>
                                <mesh castShadow position={[0, 0.07, 0]}>
                                  <coneGeometry args={[0.04, 0.12, 4]} />
                                  <meshStandardMaterial color="#ff3300" metalness={0.9} roughness={0.1} emissive="#ff3300" emissiveIntensity={0.2} />
                                </mesh>
                              </group>
                            );
                          })}
                        </group>
                      ) : partDef?.templateId === 'weapon_spinner' ? (
                        <group name="VerticalSpinnerDisk" rotation={[0, 0, 0]}>
                          {/* Core Disk rotating along X axis */}
                          <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 2]}>
                            <cylinderGeometry args={[w, w, d, 24, Math.max(2, Math.ceil(d * 4))]} />
                            <meshStandardMaterial color="#1a1a1a" metalness={0.95} roughness={0.1} />
                          </mesh>
                          {/* Metallic Trim Plate */}
                          <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
                            <cylinderGeometry args={[w * 0.75, w * 0.75, d + 0.01, 16]} />
                            <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
                          </mesh>
                          {/* Center Hub Cap */}
                          <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
                            <cylinderGeometry args={[w * 0.25, w * 0.25, d + 0.02, 12]} />
                            <meshStandardMaterial color="#e0e0e0" metalness={0.95} roughness={0.05} />
                          </mesh>
                          {/* Two heavy cutting teeth on the perimeter */}
                          {[0, Math.PI].map((angle, idx) => {
                            const sy = Math.sin(angle) * w * 0.85;
                            const sz = Math.cos(angle) * w * 0.85;
                            return (
                              <group key={idx} position={[0, sy, sz]} rotation={[angle, 0, 0]}>
                                <mesh castShadow>
                                  <boxGeometry args={[d + 0.03, 0.05, w * 0.3]} />
                                  <meshStandardMaterial color="#ff3300" metalness={0.95} roughness={0.15} emissive="#ff1100" emissiveIntensity={0.2} />
                                </mesh>
                              </group>
                            );
                          })}
                        </group>
                      ) : (
                        <group name="WheelSpinGroup" rotation={(pType === 'wheel') ? [0, 0, isRightWheel ? -Math.PI / 2 : Math.PI / 2] : [0, 0, 0]}>
                          <mesh castShadow receiveShadow>
                            <cylinderGeometry args={[w, w, d, 24, Math.max(2, Math.ceil(d * 4))]} />
                            <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
                          </mesh>
                          {/* Wheel details */}
                          {pType === 'wheel' && (
                            <>
                              {/* Metallic Alloy Rim */}
                              <mesh castShadow position={[0, 0, 0]} rotation={[0, 0, 0]}>
                                <cylinderGeometry args={[w * 0.65, w * 0.65, d + 0.01, 16]} />
                                <meshStandardMaterial color="#2a2a2a" metalness={0.9} roughness={0.1} />
                              </mesh>
                              {/* Chrome Hub Cap */}
                              <mesh castShadow position={[0, 0, 0]} rotation={[0, 0, 0]}>
                                <cylinderGeometry args={[w * 0.25, w * 0.25, d + 0.02, 12]} />
                                <meshStandardMaterial color="#e0e0e0" metalness={0.95} roughness={0.05} />
                              </mesh>
                              {/* 6 Radial spokes */}
                              {[0, 1, 2, 3, 4, 5].map((s) => {
                                const angle = (s * Math.PI) / 3;
                                return (
                                  <group key={`spoke-${s}`} rotation={[0, angle, 0]}>
                                    <mesh castShadow position={[0, d / 2 + 0.01, w * 0.4]}>
                                      <boxGeometry args={[w * 0.1, d * 0.2, w * 0.4]} />
                                      <meshStandardMaterial color="#e0e0e0" metalness={0.9} roughness={0.1} />
                                    </mesh>
                                  </group>
                                );
                              })}
                              {/* Lug Nuts on the chrome hub */}
                              {[0, 1, 2, 3, 4, 5].map((b) => {
                                const angle = (b * Math.PI) / 3;
                                return (
                                  <mesh 
                                    key={`nut-${b}`} 
                                    castShadow 
                                    position={[Math.cos(angle) * w * 0.18, d / 2 + 0.02, Math.sin(angle) * w * 0.18]}
                                  >
                                    <cylinderGeometry args={[0.015, 0.015, 0.02, 6]} />
                                    <meshStandardMaterial color="#ffffff" metalness={0.9} roughness={0.1} />
                                  </mesh>
                                );
                              })}
                              {/* Rolling indicators */}
                              {[0, 1, 2, 3].map((b) => {
                                const angle = (b * Math.PI) / 2;
                                return (
                                  <mesh 
                                    key={`ind-${b}`} 
                                    castShadow 
                                    position={[Math.cos(angle) * w * 0.8, d / 2 + 0.02, Math.sin(angle) * w * 0.8]}
                                  >
                                    <boxGeometry args={[0.04, 0.02, 0.12]} />
                                    <meshStandardMaterial color="#FF5500" metalness={0.8} emissive="#FF5500" emissiveIntensity={0.1} />
                                  </mesh>
                                );
                              })}
                            </>
                          )}
                        </group>
                      )
                    )}
                    {(visualKind === 'wedge' || visualKind === 'slope') && (
                      <WedgeMesh size={[w, h, d]} color={color} />
                    )}
                    {visualKind === 'capsule' && (
                      <mesh castShadow receiveShadow rotation={[0, 0, Math.PI/2]}>
                        <capsuleGeometry args={[h/2, Math.max(0.01, w - h), 16, 16]} />
                        <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
                      </mesh>
                    )}
                    {(!visualKind || (visualKind !== 'box' && visualKind !== 'cylinder' && visualKind !== 'wedge' && visualKind !== 'slope' && visualKind !== 'capsule')) && (
                      <RoundedBoxMesh size={[w, h, d]} color={color} />
                    )}
                  </group>
                </group>
              );
            })}
          </group>
        )}

        {/* Global Damage Particles for Bot */}

        {!isCustom && (
          <group position={[0, 0.4, 0]}>
          {/* Main body rear (rendered for non-drum bots, as drum bot has a layered modular assembly) */}
          {actualWeaponType !== 'drum' && damageComponents?.rear?.visualState !== 'detached' && (
            <group ref={rearGroupRef}>
              <group position={[0, 0, 0.25]}>
                <RoundedBoxMesh size={[1.5, 0.4, 1.5]} color={actualColor} />
                {/* Detailed bevel trim on top */}
                <group position={[0, 0.22, 0]}>
                  <RoundedBoxMesh size={[1.1, 0.05, 1.1]} color="#1a1a1a" />
                </group>
              </group>
            </group>
          )}
          
          {/* Weapon-specific customized front chassis plates (eliminates overlapping flipper scoop issues) */}
          {actualWeaponType === 'hammer' && damageComponents?.front?.visualState !== 'detached' && (
            <group ref={frontGroupRef} position={[0, -0.05, -0.85]} rotation={[0.25, 0, 0]}>
               <WedgeMesh size={[1.5, 0.2, 1.2]} color={actualColor} />
            </group>
          )}

          {(actualWeaponType === 'spinner' || actualWeaponType === 'saw') && damageComponents?.front?.visualState !== 'detached' && (
            <group ref={frontGroupRef}>
              {/* Corner split protective bumpers (leaves center 100% clear for spinning blade clearances) */}
              <group position={[-0.6, -0.05, -0.85]} rotation={[0.25, 0.1, 0]}>
                <WedgeMesh size={[0.4, 0.2, 1.0]} color={actualColor} />
              </group>
              <group position={[0.6, -0.05, -0.85]} rotation={[0.25, -0.1, 0]}>
                <WedgeMesh size={[0.4, 0.2, 1.0]} color={actualColor} />
              </group>
            </group>
          )}

          {/* Elite Upgrade 5: Layered drum-vehicle visual assembly with high-fidelity components */}
          {actualWeaponType === 'drum' && (
            <group name="LayeredDrumChassis">
              {/* 1. Structural Truss Chassis Frame */}
              <group name="StructuralChassisFrame">
                {/* Heavy duty lower monocoque tub */}
                <group position={[0, -0.05, 0.25]}>
                  <RoundedBoxMesh size={[1.2, 0.32, 1.4]} color="#17181a" />
                </group>
                {/* Lateral structural braces (Steel rods) */}
                <group position={[-0.58, 0.1, 0.25]}>
                  <RoundedBoxMesh size={[0.06, 0.06, 1.3]} color="#3a3c3e" />
                </group>
                <group position={[0.58, 0.1, 0.25]}>
                  <RoundedBoxMesh size={[0.06, 0.06, 1.3]} color="#3a3c3e" />
                </group>
                {/* Heavy engine frame enclosure */}
                <group position={[0, 0.15, 0.75]}>
                  <RoundedBoxMesh size={[0.75, 0.22, 0.35]} color="#0b0c0d" />
                </group>
              </group>

              {/* 2. Dynamic Armor Panels with high-fidelity damage response */}
              {/* Top Deflector Shield - completely detaches (blown off) when health < 45% */}
              {botHealth >= 45 && (
                <group 
                  ref={topGroupRef}
                  name="TopArmorDeflector"
                  position={[0, 0.25 - damageFactor * 0.05, -0.3 + damageFactor * 0.1]}
                  rotation={[0.1 + damageFactor * 0.15, damageFactor * 0.1, 0]}
                >
                  <RoundedBoxMesh 
                    size={[1.45, 0.08, 0.85]} 
                    color={actualColor} 
                    emissive={damageFactor > 0.35 ? "#FF1500" : "#000000"} 
                    emissiveIntensity={damageFactor * 0.4} 
                  />
                  {/* Heavy industrial rivets */}
                  <mesh castShadow position={[-0.6, 0.05, 0.3]}>
                    <cylinderGeometry args={[0.02, 0.02, 0.04, 6]} />
                    <meshStandardMaterial color="#777" metalness={0.9} />
                  </mesh>
                  <mesh castShadow position={[0.6, 0.05, 0.3]}>
                    <cylinderGeometry args={[0.02, 0.02, 0.04, 6]} />
                    <meshStandardMaterial color="#777" metalness={0.9} />
                  </mesh>
                </group>
              )}

              {/* Left Side Armor plate sags & deforms as health drops */}
              {damageFactor <= 0.75 && (
                <group 
                  ref={leftGroupRef}
                  name="LeftResponsiveArmor"
                  position={[-0.78, damageFactor > 0.3 ? -damageFactor * 0.12 : 0, 0.25]}
                  rotation={[0, 0, damageFactor > 0.3 ? -damageFactor * 0.25 : 0]}
                >
                  <RoundedBoxMesh 
                    size={[0.08, 0.36, 1.35]} 
                    color="#252525" 
                    emissive={damageFactor > 0.4 ? "#3d1100" : "#000000"} 
                  />
                </group>
              )}

              {/* Right Side Armor plate sags & deforms as health drops */}
              {damageFactor <= 0.85 && (
                <group 
                  ref={rightGroupRef}
                  name="RightResponsiveArmor"
                  position={[0.78, damageFactor > 0.5 ? -damageFactor * 0.16 : 0, 0.25]}
                  rotation={[0, 0, damageFactor > 0.5 ? damageFactor * 0.32 : 0]}
                >
                  <RoundedBoxMesh 
                    size={[0.08, 0.36, 1.35]} 
                    color="#252525" 
                    emissive={damageFactor > 0.6 ? "#3d1100" : "#000000"} 
                  />
                </group>
              )}

              {/* Rear Bumper protection sags and tilts */}
              <group 
                ref={rearGroupRef}
                name="RearResponsiveBumper"
                position={[0, -0.05 - damageFactor * 0.1, 0.95]}
                rotation={[damageFactor > 0.45 ? damageFactor * 0.22 : 0, 0, 0]}
              >
                <RoundedBoxMesh size={[1.4, 0.22, 0.14]} color="#141414" />
              </group>

              {/* 3. Heavy Drum Mount Frame */}
              <group name="HeavyDrumMount" position={[0, -0.1, -0.75]}>
                {/* Dual supporting arm brackets */}
                <group position={[-0.64, 0, 0]}>
                  <RoundedBoxMesh size={[0.15, 0.35, 0.82]} color="#1e1f22" />
                </group>
                <group position={[0.64, 0, 0]}>
                  <RoundedBoxMesh size={[0.15, 0.35, 0.82]} color="#1e1f22" />
                </group>
                {/* Heavy hydraulics cylinder detail */}
                <mesh castShadow position={[-0.72, 0.08, 0.15]} rotation={[Math.PI / 4, 0, 0]}>
                  <cylinderGeometry args={[0.035, 0.035, 0.4, 8]} />
                  <meshStandardMaterial color="#555" metalness={0.95} roughness={0.1} />
                </mesh>
                <mesh castShadow position={[0.72, 0.08, 0.15]} rotation={[Math.PI / 4, 0, 0]}>
                  <cylinderGeometry args={[0.035, 0.035, 0.4, 8]} />
                  <meshStandardMaterial color="#555" metalness={0.95} roughness={0.1} />
                </mesh>
                {/* Shiny steel piston rod */}
                <mesh castShadow position={[-0.72, 0.03, 0.28]} rotation={[Math.PI / 4, 0, 0]}>
                  <cylinderGeometry args={[0.016, 0.016, 0.3, 8]} />
                  <meshStandardMaterial color="#fff" metalness={1.0} roughness={0.0} />
                </mesh>
                <mesh castShadow position={[0.72, 0.03, 0.28]} rotation={[Math.PI / 4, 0, 0]}>
                  <cylinderGeometry args={[0.016, 0.016, 0.3, 8]} />
                  <meshStandardMaterial color="#fff" metalness={1.0} roughness={0.0} />
                </mesh>
              </group>
            </group>
          )}

          {actualWeaponType === 'crusher' && (
            <>
              {/* Lower stationary support clamp fork jaws */}
              <group position={[-0.35, -0.1, -0.9]} rotation={[0.05, 0.15, 0]}>
                <RoundedBoxMesh size={[0.1, 0.08, 0.9]} color="#444" />
              </group>
              <group position={[0.35, -0.1, -0.9]} rotation={[0.05, -0.15, 0]}>
                <RoundedBoxMesh size={[0.1, 0.08, 0.9]} color="#444" />
              </group>
            </>
          )}
          
          {/* Side armor panels (rendered only for non-drum bots, as drum has custom responsive side plates) */}
          {actualWeaponType !== 'drum' && (
            <>
              {damageComponents?.left?.visualState !== 'detached' && (
                <group ref={leftGroupRef}>
                  <group position={[-0.8, 0, 0]}>
                    <RoundedBoxMesh size={[0.15, 0.5, 2.1]} color="#333" />
                  </group>
                </group>
              )}
              {damageComponents?.right?.visualState !== 'detached' && (
                <group ref={rightGroupRef}>
                  <group position={[0.8, 0, 0]}>
                    <RoundedBoxMesh size={[0.15, 0.5, 2.1]} color="#333" />
                  </group>
                </group>
              )}
            </>
          )}

          {/* Engine block (rendered only for non-drum bots, as drum has custom frame pack) */}
          {actualWeaponType !== 'drum' && damageComponents?.rear?.visualState !== 'detached' && (
            <group ref={rearGroupRef}>
              <group position={[0, 0.25, 0.8]}>
                <RoundedBoxMesh size={[0.8, 0.2, 0.4]} color="#222" />
              </group>
            </group>
          )}

          {/* High-fidelity Weapon Systems */}
          {actualWeaponType === 'flipper' && damageComponents?.front?.visualState !== 'detached' && (
            <>
              {/* Flipper base hinge pin */}
              <mesh castShadow position={[0, -0.1, -0.25]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.07, 0.07, 1.4, 16]} />
                <meshStandardMaterial color="#222" metalness={0.9} roughness={0.1} />
              </mesh>
              
              {/* Flipper arm / scoop group (pivots around hinge) */}
              <group ref={weaponRef} position={[0, -0.1, -0.25]}>
                {/* Scoop mesh: sloped wedge plate integrated with front chassis wedge */}
                <group position={[0, 0.06, -0.5]} rotation={[0.25, 0, 0]}>
                  {/* Flipper main scoop plate */}
                  <WedgeMesh size={[1.35, 0.05, 1.15]} color={actualColor} />
                  {/* Hardened steel wedge teeth */}
                  <group position={[0.5, -0.01, -0.6]}>
                    <WedgeMesh size={[0.2, 0.03, 0.2]} color="#888" />
                  </group>
                  <group position={[-0.5, -0.01, -0.6]}>
                    <WedgeMesh size={[0.2, 0.03, 0.2]} color="#888" />
                  </group>
                  <group position={[0, -0.01, -0.6]}>
                    <WedgeMesh size={[0.2, 0.03, 0.2]} color="#888" />
                  </group>
                </group>
              </group>

              {/* Pneumatic Cylinder (Chassis Mount) */}
              <group ref={pistonCylinderRef}>
                {/* Cylinder mounting block */}
                <group position={[0, 0, 0]}>
                  <RoundedBoxMesh size={[0.18, 0.12, 0.12]} color="#222" />
                </group>
                {/* Main cylinder body */}
                <mesh castShadow position={[0, 0, 0.225]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.075, 0.075, 0.45, 16]} />
                  <meshStandardMaterial color="#aaa" metalness={0.95} roughness={0.1} />
                </mesh>
              </group>
              {/* Pneumatic Piston Rod (Arm Mount) */}
              <group ref={pistonRodRef}>
                {/* Rod mounting block */}
                <group position={[0, 0, 0]}>
                  <RoundedBoxMesh size={[0.12, 0.08, 0.08]} color="#333" />
                </group>
                {/* Slidable steel shaft */}
                <mesh castShadow position={[0, 0, 0.225]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.035, 0.035, 0.45, 16]} />
                  <meshStandardMaterial color="#fff" metalness={1.0} roughness={0.0} />
                </mesh>
              </group>
            </>
          )}

          {actualWeaponType === 'hammer' && damageComponents?.front?.visualState !== 'detached' && (
            <>
              {/* Heavy support A-frame towers */}
              <group position={[0.45, 0.0, 0.2]} rotation={[0, 0, 0.12]}>
                <RoundedBoxMesh size={[0.1, 0.6, 0.25]} color="#333" />
              </group>
              <group position={[-0.45, 0.0, 0.2]} rotation={[0, 0, -0.12]}>
                <RoundedBoxMesh size={[0.1, 0.6, 0.25]} color="#333" />
              </group>
              
              {/* Main horizontal axle pin */}
              <mesh castShadow position={[0, 0.25, 0.2]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.06, 0.06, 1.0, 16]} />
                <meshStandardMaterial color="#222" metalness={0.9} roughness={0.2} />
              </mesh>

              {/* Sledgehammer arm and head group (pivots around axle) */}
              <group ref={weaponRef} position={[0, 0.25, 0.2]}>
                {/* Heavy mechanical arm extending up/forward */}
                <group position={[0, 0.6, 0]}>
                  <RoundedBoxMesh size={[0.08, 1.2, 0.08]} color="#555" />
                </group>
                
                {/* Sledgehammer massive double-sided head */}
                <group position={[0, 1.2, 0]}>
                  <RoundedBoxMesh size={[0.55, 0.32, 0.7]} color={actualColor} />
                  {/* Heavy impact spikes */}
                  <mesh castShadow position={[0, 0, -0.38]} rotation={[Math.PI / 2, 0, 0]}>
                    <coneGeometry args={[0.12, 0.15, 6]} />
                    <meshStandardMaterial color="#eee" metalness={1.0} roughness={0.1} />
                  </mesh>
                  <mesh castShadow position={[0, 0, 0.38]} rotation={[-Math.PI / 2, 0, 0]}>
                    <coneGeometry args={[0.12, 0.15, 6]} />
                    <meshStandardMaterial color="#eee" metalness={1.0} roughness={0.1} />
                  </mesh>
                </group>
              </group>
            </>
          )}

          {actualWeaponType === 'drum' && damageComponents?.front?.visualState !== 'detached' && (
            <group name="DrumAssembly">
              {/* Chassis Frame Extensions / Mounts */}
              <group position={[0, 0.15, -0.75]}>
                {/* Axle connecting to weapon group */}
                <mesh castShadow position={[0, -0.05, -0.3]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.08, 0.08, 1.4, 16]} />
                  <meshStandardMaterial color="#333" metalness={0.95} roughness={0.2} />
                </mesh>
              </group>

              {/* The Spinning Drum Weapon Assembly */}
              <group ref={weaponRef} position={[0, 0.1, -1.05]}>
                {/* Core Drum Barrel */}
                <mesh name="DrumCore" castShadow rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.3, 0.3, 1.12, 32]} />
                  <meshStandardMaterial color="#2a2a2a" metalness={0.9} roughness={0.2} emissive="#ff0000" emissiveIntensity={0} />
                </mesh>
                
                {/* Rotation Cues: Grooves and Bands */}
                <mesh castShadow rotation={[0, 0, Math.PI / 2]} position={[0.4, 0, 0]}>
                   <cylinderGeometry args={[0.31, 0.31, 0.1, 32]} />
                   <meshStandardMaterial color={actualColor} metalness={0.8} roughness={0.1} />
                </mesh>
                <mesh castShadow rotation={[0, 0, Math.PI / 2]} position={[-0.4, 0, 0]}>
                   <cylinderGeometry args={[0.31, 0.31, 0.1, 32]} />
                   <meshStandardMaterial color={actualColor} metalness={0.8} roughness={0.1} />
                </mesh>

                {/* 8 Menacing Staggered Horizontal Steel Spikes */}
                {[
                  { angle: 0, x: -0.4 },
                  { angle: Math.PI / 4, x: -0.2 },
                  { angle: Math.PI / 2, x: 0 },
                  { angle: (3 * Math.PI) / 4, x: 0.2 },
                  { angle: Math.PI, x: 0.4 },
                  { angle: (5 * Math.PI) / 4, x: -0.3 },
                  { angle: (3 * Math.PI) / 2, x: -0.1 },
                  { angle: (7 * Math.PI) / 4, x: 0.3 },
                ].map((spike, idx) => {
                  const radius = 0.3;
                  const sy = Math.sin(spike.angle) * radius;
                  const sz = Math.cos(spike.angle) * radius;
                  return (
                    <group key={idx} position={[spike.x, sy, sz]} rotation={[spike.angle, 0, 0]}>
                      {/* Heavy spike base */}
                      <group position={[0, 0, 0]}>
                        <RoundedBoxMesh size={[0.15, 0.12, 0.15]} color="#444" />
                      </group>
                      {/* Sharp steel ripping tooth/spike pointing radially outward */}
                      <mesh name="DrumTooth" castShadow position={[0, 0.14, 0]} rotation={[0, 0, 0]}>
                        <coneGeometry args={[0.07, 0.24, 4]} />
                        <meshStandardMaterial color="#ff3300" metalness={0.9} roughness={0.1} emissive="#ff3300" emissiveIntensity={0.2} />
                      </mesh>
                    </group>
                  );
                })}
              </group>

              {/* Elite Upgrade 2: Dynamic Laser Target Finder & Weapon Status HUD Overlay */}
              {isPlayer && isSpinning && (
                <group position={[0, 0.1, -1.1]}>
                  {/* Aiming guide laser line */}
                  <mesh position={[0, 0, -3.5]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.012, 0.012, 7, 8]} />
                    <meshBasicMaterial 
                      color={botHealth < 45 ? "#FF3300" : "#00FF55"} 
                      transparent 
                      opacity={0.4 + Math.sin(Date.now() * 0.015) * 0.2} 
                      depthWrite={false}
                    />
                  </mesh>
                  {/* Targeting floor reticle ring */}
                  <mesh position={[0, -0.2, -7]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.1, 0.15, 16]} />
                    <meshBasicMaterial 
                      color={botHealth < 45 ? "#FF3300" : "#00FF55"} 
                      transparent 
                      opacity={0.65} 
                      depthWrite={false}
                    />
                  </mesh>
                </group>
              )}
            </group>
          )}

          {actualWeaponType === 'crusher' && damageComponents?.front?.visualState !== 'detached' && (
            <>
              {/* Lower Jaw (fixed to bottom-front of chassis) */}
              <group position={[0, -0.22, -0.95]}>
                <RoundedBoxMesh size={[0.7, 0.08, 0.9]} color="#222" />
              </group>
              {/* Lower Jaw sharp wedge spikes */}
              <mesh castShadow position={[0.2, -0.22, -1.45]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.06, 0.15, 4]} />
                <meshStandardMaterial color="#aaa" metalness={0.9} />
              </mesh>
              <mesh castShadow position={[-0.2, -0.22, -1.45]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.06, 0.15, 4]} />
                <meshStandardMaterial color="#aaa" metalness={0.9} />
              </mesh>
              
              {/* Upper crushing claw (pivots down) */}
              <group ref={weaponRef} position={[0, 0.15, -0.5]}>
                {/* Crusher arm extending forward and bending down */}
                <group position={[0, 0.1, -0.45]} rotation={[-Math.PI / 10, 0, 0]}>
                  <RoundedBoxMesh size={[0.22, 0.22, 0.9]} color={actualColor} />
                </group>
                {/* Dangerous downward spike beak */}
                <mesh castShadow position={[0, -0.1, -0.9]} rotation={[Math.PI / 4, 0, 0]}>
                  <coneGeometry args={[0.08, 0.45, 4]} />
                  <meshStandardMaterial color="#fff" metalness={1.0} roughness={0.0} />
                </mesh>
              </group>
            </>
          )}

          {actualWeaponType === 'spinner' && (
            <group ref={weaponRef} position={[0, -0.15, -1.2]}>
              {/* Heavy vertical drive hub */}
              <mesh castShadow position={[0, 0.1, 0]}>
                <cylinderGeometry args={[0.18, 0.18, 0.25, 16]} />
                <meshStandardMaterial color="#222" metalness={0.9} roughness={0.2} />
              </mesh>
              {/* Thick spinner fly-disk parallel to floor */}
              <mesh castShadow position={[0, 0, 0]}>
                <cylinderGeometry args={[0.9, 0.9, 0.08, 24]} />
                <meshStandardMaterial color="#444" metalness={0.8} roughness={0.2} />
              </mesh>
              {/* Opposing high-inertia impact teeth */}
              <group position={[0.85, 0, 0]}>
                <WedgeMesh size={[0.3, 0.1, 0.18]} color="#FFC107" />
              </group>
              <group position={[-0.85, 0, 0]} rotation={[0, Math.PI, 0]}>
                <WedgeMesh size={[0.3, 0.1, 0.18]} color="#FFC107" />
              </group>
              {/* Drive belt/chain housing extending to chassis */}
              <mesh castShadow position={[0, 0, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.06, 0.06, 0.8, 12]} />
                <meshStandardMaterial color="#111" />
              </mesh>
            </group>
          )}

          {actualWeaponType === 'saw' && (
            <group ref={weaponRef} position={[0, -0.15, -1.2]}>
              {/* Heavy vertical drive hub */}
              <mesh castShadow position={[0, 0.1, 0]}>
                <cylinderGeometry args={[0.18, 0.18, 0.25, 16]} />
                <meshStandardMaterial color="#222" metalness={0.9} roughness={0.2} />
              </mesh>
              {/* Extremely thin razor sharp circular saw blade */}
              <mesh castShadow position={[0, 0, 0]}>
                <cylinderGeometry args={[0.85, 0.85, 0.02, 32]} />
                <meshStandardMaterial color="silver" metalness={0.95} roughness={0.05} />
              </mesh>
              {/* 8 sharp saw teeth around the edge! */}
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
                const angle = (i * Math.PI) / 4;
                return (
                  <group 
                    key={i}
                    position={[Math.cos(angle) * 0.85, 0, Math.sin(angle) * 0.85]} 
                    rotation={[0, -angle, 0]}
                  >
                    <WedgeMesh size={[0.1, 0.02, 0.1]} color="#aaa" />
                  </group>
                );
              })}
              {/* Drive belt/chain housing extending to chassis */}
              <mesh castShadow position={[0, 0, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.06, 0.06, 0.8, 12]} />
                <meshStandardMaterial color="#111" />
              </mesh>
            </group>
          )}
        </group>
        )}
        
        <group position={[0, 0.3, -1.1]}>
          {(actualWeaponType === 'spinner' || actualWeaponType === 'saw') && damageComponents?.front?.visualState !== 'detached' && (
            <CylinderCollider 
              args={[0.1, 0.8]}
              onCollisionEnter={({ other }) => {
                if (battleStatus !== 'battle') return;
                const now = Date.now();
                if (now - lastHitTime.current < 250) return;
                
                const targetObj = other.rigidBodyObject;
                if (targetObj?.userData?.id === (isPlayer ? 'opponent' : 'player')) {
                  if (isSpinning && Math.abs(currentRPM.current) > 10) {
                    lastHitTime.current = now;
                    const target = isPlayer ? 'opponent' : 'player';
                    const damageBase = currentBotConfig.weapon.damage;
                    const damageMult = Math.abs(currentRPM.current * 100) / currentBotConfig.weapon.rpm;
                    let finalDamage = damageBase * 0.15 * Math.min(1.0, damageMult);
                    
                    damageBot(target, finalDamage);
                  if (finalDamage > 2.0) {
                    useGameStore.getState().addLog(`⚙️ SHREDDED! ${actualWeaponType.toUpperCase()} tore into ${target} for massive damage!`, 'combat');
                  }
                  
                  if (targetRef?.current && bodyRef.current) {
                    const targetPos = targetRef.current.translation();
                    const dx = targetPos.x - bodyRef.current.translation().x;
                    const dz = targetPos.z - bodyRef.current.translation().z;
                    const dDist = Math.sqrt(dx * dx + dz * dz) || 1;
                    const dnx = dx / dDist;
                    const dnz = dz / dDist;
                    
                    const targetWeightRaw = isPlayer ? opponentConfig.armor.weight : config.armor.weight;
                    const targetWeightMult = Math.max(0.8, targetWeightRaw / 100);
                    const pushForce = 5.0 * Math.abs(currentRPM.current) * settings.impactImpulseScale / targetWeightMult;
                    
                    targetRef.current.applyImpulse({ x: dnx * pushForce, y: 8 * settings.impactImpulseScale / targetWeightMult, z: dnz * pushForce }, true);
                    bodyRef.current.applyImpulse({ x: -dnx * pushForce * 0.4, y: 0, z: -dnz * pushForce * 0.4 }, true);
                    
                    const pos = bodyRef.current.translation();
                    const impactVector = [dnx * pushForce * 0.5, 5, dnz * pushForce * 0.5] as [number, number, number];
                    useGameStore.getState().spawnDebris([pos.x, pos.y, pos.z], finalDamage * 10, impactVector);
                    useGameStore.getState().spawnSparks([pos.x, pos.y, pos.z], Math.floor(finalDamage * 5), '#FFAA00');

                    // Dispatch combat impact event for visual denting solver
                    window.dispatchEvent(new CustomEvent('combat-impact', {
                      detail: {
                        type: 'collision',
                        className: 'weapon',
                        impactEnergy: finalDamage * 10,
                        damageAmount: finalDamage,
                        position: [targetPos.x, targetPos.y, targetPos.z],
                        attacker: isPlayer ? 'player' : 'opponent',
                        defender: isPlayer ? 'opponent' : 'player',
                        hitZone: dnx > 0.5 ? 'right' : dnx < -0.5 ? 'left' : dnz > 0.5 ? 'front' : 'rear',
                        defenderId: target,
                        normal: [dnx, 0, dnz]
                      }
                    }));
                  }
                  currentRPM.current *= 0.5;
                }
                } // Close targetObj id check
              }}
            />
          )}
        </group>
        
        {/* DRUM WEAPON COLLIDER */}
        {actualWeaponType === 'drum' && (
          <group position={[0, 0.1, -1.05]} rotation={[0, 0, Math.PI / 2]}>
            <CylinderCollider 
              args={[1.12 / 2, 0.35]}
              friction={0.05}
              
              onCollisionEnter={(event) => {
                if (battleStatus !== 'battle') return;
                const now = Date.now();
                if (now - lastHitTime.current < 250) return;
                
                // Only process if spinning
                if (isSpinning && Math.abs(currentRPM.current) > 10) {
                  const targetObj = event.other.rigidBodyObject;
                  if (targetObj?.userData?.id === (isPlayer ? 'opponent' : 'player')) {
                    lastHitTime.current = now;
                    const targetId = isPlayer ? 'opponent' : 'player';
                    
                    const myVel = new THREE.Vector3(globalPhysicsState[isPlayer ? 'player' : 'opponent'].vel.x, globalPhysicsState[isPlayer ? 'player' : 'opponent'].vel.y, globalPhysicsState[isPlayer ? 'player' : 'opponent'].vel.z);
                    const oppVel = new THREE.Vector3(globalPhysicsState[isPlayer ? 'opponent' : 'player'].vel.x, globalPhysicsState[isPlayer ? 'opponent' : 'player'].vel.y, globalPhysicsState[isPlayer ? 'opponent' : 'player'].vel.z);
                    
                    const targetBody = targetRef.current;
                    const selfBody = bodyRef.current;
                    if (!targetBody || !selfBody) return;
                    
                    const tPos = targetBody.translation();
                    const sPos = selfBody.translation();

                    // Extract high-accuracy dynamic collision normal
                    let collisionNormal = new THREE.Vector3(0, 1, 0);
                    if (event.manifold && typeof event.manifold.normal === 'function') {
                      const norm = event.manifold.normal();
                      if (norm) {
                        collisionNormal.set(norm.x, norm.y, norm.z);
                      }
                    } else {
                      const dx = tPos.x - sPos.x;
                      const dz = tPos.z - sPos.z;
                      const dist = Math.sqrt(dx*dx + dz*dz) || 1;
                      collisionNormal.set(dx / dist, 0, dz / dist);
                    }
                    collisionNormal.normalize();

                    const relVel = new THREE.Vector3().subVectors(myVel, oppVel);
                    const relVelLength = relVel.length();
                    
                    let isDirect = false;
                    let glanceRatio = 1.0;
                    
                    if (relVelLength > 0.1) {
                      const relVelUnit = relVel.clone().normalize();
                      const dotNormal = Math.abs(relVelUnit.dot(collisionNormal));
                      isDirect = dotNormal > 0.55;
                      glanceRatio = THREE.MathUtils.clamp(dotNormal, 0.25, 1.0);
                    } else {
                      isDirect = true;
                    }
                    
                    const rpmRatio = Math.abs(currentRPM.current * 100) / currentBotConfig.weapon.rpm;
                    
                    // Base damage for drum
                    const damageBase = currentBotConfig.weapon.damage * 1.5;
                    let finalDamage = damageBase * 0.15 * Math.min(1.0, rpmRatio) * glanceRatio;
                    
                    damageBot(targetId, finalDamage);
                    if (finalDamage > 2.0) {
                      useGameStore.getState().addLog(`🔥 BRUTAL HIT! Drum spinner launched ${targetId} into the air!`, 'combat');
                    }
                    
                    // Impulses
                    const targetWeightRaw = isPlayer ? opponentConfig.armor.weight : config.armor.weight;
                    const targetWeightMult = Math.max(0.8, targetWeightRaw / 100);
                    
                    // Direct hit applies massive vertical lift and horizontal push
                    // Glancing hit applies less lift, more deflection
                    const maxLift = 60 * settings.impactImpulseScale;
                    const maxPush = 40 * settings.impactImpulseScale;
                    const liftForce = Math.min((isDirect ? 40 : 20) * rpmRatio * settings.impactImpulseScale / targetWeightMult * glanceRatio, maxLift);
                    const pushForce = Math.min((isDirect ? 25 : 10) * rpmRatio * settings.impactImpulseScale / targetWeightMult * glanceRatio, maxPush);
                    
                    targetBody.applyImpulse({ x: collisionNormal.x * pushForce, y: liftForce, z: collisionNormal.z * pushForce }, true);
                    
                    // Recoil decoupled from instability: apply bounded linear impulse recoil to chassis
                    const selfRecoilScale = 0.45 * (isDirect ? 1.25 : 0.65);
                    selfBody.applyImpulse({ 
                      x: -collisionNormal.x * pushForce * selfRecoilScale, 
                      y: -liftForce * 0.15, 
                      z: -collisionNormal.z * pushForce * selfRecoilScale 
                    }, true);
                    
                    // Effects
                    const impactY = (tPos.y + sPos.y) * 0.5;
                    useGameStore.getState().spawnSparks([sPos.x + collisionNormal.x * 1.0, impactY, sPos.z + collisionNormal.z * 1.0], Math.floor(finalDamage * 8), '#FF4400');

                    // Dispatch combat impact event for visual denting solver
                    window.dispatchEvent(new CustomEvent('combat-impact', {
                      detail: {
                        type: 'collision',
                        className: 'weapon',
                        impactEnergy: finalDamage * 10,
                        damageAmount: finalDamage,
                        position: [tPos.x, tPos.y, tPos.z],
                        attacker: isPlayer ? 'player' : 'opponent',
                        defender: isPlayer ? 'opponent' : 'player',
                        hitZone: collisionNormal.x > 0.5 ? 'right' : collisionNormal.x < -0.5 ? 'left' : collisionNormal.z > 0.5 ? 'front' : 'rear',
                        defenderId: targetId,
                        normal: [collisionNormal.x, collisionNormal.y, collisionNormal.z]
                      }
                    }));
                    
                    if (isDirect) {
                      useGameStore.getState().spawnDebris([sPos.x + collisionNormal.x * 1.0, impactY, sPos.z + collisionNormal.z * 1.0], finalDamage * 10, [collisionNormal.x * pushForce * 0.1, liftForce * 0.1, collisionNormal.z * pushForce * 0.1]);
                      
                      // Elite Upgrade 4: Shockwave System Event Trigger on direct weapon contact
                      window.dispatchEvent(new CustomEvent('spawn-shockwave', { 
                        detail: { position: [sPos.x + collisionNormal.x * 1.0, 0.05, sPos.z + collisionNormal.z * 1.0] } 
                      }));
                    }
                    
                    // Inertia loss from hit - clamp decay
                    currentRPM.current *= isDirect ? 0.45 : 0.75;
                  }
                }
              }}
            />
          </group>
        )}

                {/* Wheels and Motors with Skid Steer rotation refs and outer radial bolts to display coin-like rolling motion clearly */}
        {!isCustom && (
        <group>
          {/* Front Right */}
          {damageComponents?.right?.visualState !== 'detached' && (
          <group ref={frontRightWheelRef} position={[0.9, 0.4, -0.6]}>
            {/* Tire (Outer Rubber) */}
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.42, 0.42, 0.3, 16]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
            </mesh>
            {/* Metallic Rim (Centered inside tire) */}
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.26, 0.26, 0.31, 16]} />
              <meshStandardMaterial color="#4a4a4a" metalness={0.85} roughness={0.15} />
            </mesh>
            {/* Hub Cap Face */}
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.12, 0.12, 0.32, 12]} />
              <meshStandardMaterial color="#999999" metalness={0.95} roughness={0.05} />
            </mesh>
            {/* Axle Shaft going into chassis */}
            <mesh castShadow position={[-0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.06, 0.06, 0.4, 8]} />
              <meshStandardMaterial color="#555" metalness={0.8} />
            </mesh>
            {/* Visual contrast radial bolt indicators */}
            {[0, 1, 2, 3].map((b) => {
              const angle = (b * Math.PI) / 2;
              return (
                <mesh 
                  key={b} 
                  castShadow 
                  position={[0.16, Math.cos(angle) * 0.18, Math.sin(angle) * 0.18]}
                >
                  <boxGeometry args={[0.04, 0.06, 0.06]} />
                  <meshStandardMaterial color="#FFC107" metalness={0.9} roughness={0.1} />
                </mesh>
              );
            })}
          </group>
          )}
          
          {/* Front Left */}
          {damageComponents?.left?.visualState !== 'detached' && (
          <group ref={frontLeftWheelRef} position={[-0.9, 0.4, -0.6]}>
            {/* Tire (Outer Rubber) */}
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.42, 0.42, 0.3, 16]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
            </mesh>
            {/* Metallic Rim (Centered inside tire) */}
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.26, 0.26, 0.31, 16]} />
              <meshStandardMaterial color="#4a4a4a" metalness={0.85} roughness={0.15} />
            </mesh>
            {/* Hub Cap Face */}
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.12, 0.12, 0.32, 12]} />
              <meshStandardMaterial color="#999999" metalness={0.95} roughness={0.05} />
            </mesh>
            {/* Axle Shaft going into chassis */}
            <mesh castShadow position={[0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.06, 0.06, 0.4, 8]} />
              <meshStandardMaterial color="#555" metalness={0.8} />
            </mesh>
            {/* Visual contrast radial bolt indicators */}
            {[0, 1, 2, 3].map((b) => {
              const angle = (b * Math.PI) / 2;
              return (
                <mesh 
                  key={b} 
                  castShadow 
                  position={[-0.16, Math.cos(angle) * 0.18, Math.sin(angle) * 0.18]}
                >
                  <boxGeometry args={[0.04, 0.06, 0.06]} />
                  <meshStandardMaterial color="#FFC107" metalness={0.9} roughness={0.1} />
                </mesh>
              );
            })}
          </group>
          )}

          {/* Back Right */}
          {damageComponents?.right?.visualState !== 'detached' && (
          <group ref={backRightWheelRef} position={[0.9, 0.4, 0.6]}>
            {/* Tire (Outer Rubber) */}
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.42, 0.42, 0.3, 16]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
            </mesh>
            {/* Metallic Rim (Centered inside tire) */}
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.26, 0.26, 0.31, 16]} />
              <meshStandardMaterial color="#4a4a4a" metalness={0.85} roughness={0.15} />
            </mesh>
            {/* Hub Cap Face */}
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.12, 0.12, 0.32, 12]} />
              <meshStandardMaterial color="#999999" metalness={0.95} roughness={0.05} />
            </mesh>
            {/* Axle Shaft going into chassis */}
            <mesh castShadow position={[-0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.06, 0.06, 0.4, 8]} />
              <meshStandardMaterial color="#555" metalness={0.8} />
            </mesh>
            {/* Visual contrast radial bolt indicators */}
            {[0, 1, 2, 3].map((b) => {
              const angle = (b * Math.PI) / 2;
              return (
                <mesh 
                  key={b} 
                  castShadow 
                  position={[0.16, Math.cos(angle) * 0.18, Math.sin(angle) * 0.18]}
                >
                  <boxGeometry args={[0.04, 0.06, 0.06]} />
                  <meshStandardMaterial color="#FFC107" metalness={0.9} roughness={0.1} />
                </mesh>
              );
            })}
          </group>
          )}

          {/* Back Left */}
          {damageComponents?.left?.visualState !== 'detached' && (
          <group ref={backLeftWheelRef} position={[-0.9, 0.4, 0.6]}>
            {/* Tire (Outer Rubber) */}
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.42, 0.42, 0.3, 16]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
            </mesh>
            {/* Metallic Rim (Centered inside tire) */}
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.26, 0.26, 0.31, 16]} />
              <meshStandardMaterial color="#4a4a4a" metalness={0.85} roughness={0.15} />
            </mesh>
            {/* Hub Cap Face */}
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.12, 0.12, 0.32, 12]} />
              <meshStandardMaterial color="#999999" metalness={0.95} roughness={0.05} />
            </mesh>
            {/* Axle Shaft going into chassis */}
            <mesh castShadow position={[0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.06, 0.06, 0.4, 8]} />
              <meshStandardMaterial color="#555" metalness={0.8} />
            </mesh>
            {/* Visual contrast radial bolt indicators */}
            {[0, 1, 2, 3].map((b) => {
              const angle = (b * Math.PI) / 2;
              return (
                <mesh 
                  key={b} 
                  castShadow 
                  position={[-0.16, Math.cos(angle) * 0.18, Math.sin(angle) * 0.18]}
                >
                  <boxGeometry args={[0.04, 0.06, 0.06]} />
                  <meshStandardMaterial color="#FFC107" metalness={0.9} roughness={0.1} />
                </mesh>
              );
            })}
          </group>
          )}
        </group>
        )}
        
                </group>
      </RigidBody>
    </DamageContext.Provider>
    </BotOwnerContext.Provider>
  );
};

const PlayerTracker = ({ 
  playerRef, 
  targetObjRef 
}: { 
  playerRef: React.RefObject<any>; 
  targetObjRef: React.RefObject<THREE.Object3D>;
}) => {
  useFrame(() => {
    if (playerRef.current && targetObjRef.current) {
      const pos = playerRef.current.translation();
      targetObjRef.current.position.set(pos.x, pos.y, pos.z);
      
      const rot = playerRef.current.rotation();
      targetObjRef.current.quaternion.set(rot.x, rot.y, rot.z, rot.w);
      
      const velocity = playerRef.current.linvel();
      targetObjRef.current.userData.linvel = new THREE.Vector3(velocity.x, velocity.y, velocity.z);
    }
  });
  return null;
};

const HazardSaw = ({ position }: { position: [number, number, number] }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const damageBot = useGameStore(s => s.damageBot);
  const battleStatus = useGameStore(s => s.battleStatus);
  const lastHitPlayer = useRef(0);
  const lastHitOpponent = useRef(0);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 12;
    }
  });

  return (
    <RigidBody ccd={true} 
      type="fixed" 
      position={position}
      colliders="cuboid"
      onCollisionEnter={({ other }) => {
        if (battleStatus === 'battle') {
          const id = other.rigidBodyObject?.userData?.id;
          const now = Date.now();
          if (id === 'player' && now - lastHitPlayer.current > 500) {
            lastHitPlayer.current = now;
            damageBot('player', 1.5 + Math.random() * 2);
          } else if (id === 'opponent' && now - lastHitOpponent.current > 500) {
            lastHitOpponent.current = now;
            damageBot('opponent', 1.5 + Math.random() * 2);
          }
        }
      }}
    >
      <mesh ref={meshRef} castShadow position={[0, 0.1, 0]}>
        <cylinderGeometry args={[1.4, 1.4, 0.15, 16]} />
        <meshStandardMaterial color="#555" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.12, 0]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[3, 0.04, 0.3]} />
        <meshStandardMaterial color="#FFC107" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.12, 0]} rotation={[0, -Math.PI / 4, 0]}>
        <boxGeometry args={[3, 0.04, 0.3]} />
        <meshStandardMaterial color="#FFC107" roughness={0.6} />
      </mesh>
    </RigidBody>
  );
};

const IndustrialPillar = ({ position }: { position: [number, number, number] }) => {
  return (
    <RigidBody ccd={true} type="fixed" position={position}>
      {/* Heavy base */}
      <mesh castShadow position={[0, 0.3, 0]}>
        <cylinderGeometry args={[1.1, 1.3, 0.6, 8]} />
        <meshStandardMaterial color="#111" metalness={0.9} roughness={0.2} />
      </mesh>
      
      {/* Cyber Pylon Sections */}
      <mesh castShadow position={[0, 1.3, 0]}>
        <cylinderGeometry args={[0.7, 0.8, 1.4, 8]} />
        <meshStandardMaterial color="#222" metalness={0.8} roughness={0.3} />
      </mesh>
      
      {/* Glowing horizontal energy ring */}
      <mesh position={[0, 2.1, 0]}>
        <cylinderGeometry args={[0.72, 0.72, 0.2, 8]} />
        <meshBasicMaterial color="#00E5FF" toneMapped={false} />
      </mesh>
      
      <mesh castShadow position={[0, 2.9, 0]}>
        <cylinderGeometry args={[0.6, 0.7, 1.4, 8]} />
        <meshStandardMaterial color="#222" metalness={0.8} roughness={0.3} />
      </mesh>
      
      {/* Top Cap with glowing red status light */}
      <mesh position={[0, 3.65, 0]}>
        <cylinderGeometry args={[0.5, 0.6, 0.1, 8]} />
        <meshStandardMaterial color="#FF3300" emissive="#FF3300" emissiveIntensity={2} toneMapped={false} />
      </mesh>
    </RigidBody>
  );
};

const UnifiedVisualEffectsManager = () => {
  const sparksList = useGameStore(s => s.sparks);
  const sparksMeshRef = useRef<THREE.InstancedMesh>(null);
  const smokeMeshRef = useRef<THREE.InstancedMesh>(null);
  const fireMeshRef = useRef<THREE.InstancedMesh>(null);
  const dummyObj = useMemo(() => new THREE.Object3D(), []);

  // Shared soft radial gradient texture for volumetric smoke/fire puffs
  const softParticleTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
      gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.85)');
      gradient.addColorStop(0.55, 'rgba(255, 255, 255, 0.2)');
      gradient.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
    }
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }, []);

  const lightRefs = useRef<(THREE.PointLight | null)[]>([]);
  const lightActiveIndex = useRef(0);
  const lightData = useRef<{ pos: THREE.Vector3; intensity: number }[]>([
    { pos: new THREE.Vector3(), intensity: 0 },
    { pos: new THREE.Vector3(), intensity: 0 },
    { pos: new THREE.Vector3(), intensity: 0 },
    { pos: new THREE.Vector3(), intensity: 0 },
  ]);

  const sparkParticles = useRef<{ pos: THREE.Vector3; vel: THREE.Vector3; color: THREE.Color; age: number; maxAge: number; size: number }[]>([]);
  const smokeParticles = useRef<{ pos: THREE.Vector3; vel: THREE.Vector3; age: number; maxAge: number; rot: number; rotSpeed: number; startSize: number; targetSize: number; isFire: boolean }[]>([]);

  const lastProcessedId = useRef<string>('');
  
  useEffect(() => {
    if (sparksList.length === 0) return;
    const latest = sparksList[sparksList.length - 1];
    if (latest.id === lastProcessedId.current) return;
    lastProcessedId.current = latest.id;

    const pos = new THREE.Vector3(latest.position[0], latest.position[1], latest.position[2]);
    const col = new THREE.Color(latest.color);

    // 1. Trigger Flash Light in Pool
    const idx = lightActiveIndex.current;
    lightData.current[idx].pos.copy(pos);
    lightData.current[idx].pos.y += 0.2; // raise slightly
    lightData.current[idx].intensity = 6.0; // intense burst
    lightActiveIndex.current = (idx + 1) % 4;

    // 2. Spawn metal sparks
    const numSparks = 18;
    for (let i = 0; i < numSparks; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 0.8) - 0.2); // upward spray
      const speed = Math.random() * 16 + 6;
      
      const vel = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed + 2.5,
        Math.sin(phi) * Math.sin(theta) * speed
      );

      sparkParticles.current.push({
        pos: pos.clone(),
        vel,
        color: col.clone(),
        age: 0,
        maxAge: Math.random() * 0.7 + 0.35,
        size: Math.random() * 0.045 + 0.015
      });
    }

    // 3. Spawn expanding smoke/fire puffs
    const numSmoke = 8;
    for (let i = 0; i < numSmoke; i++) {
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2.5,
        Math.random() * 3.0 + 1.2,
        (Math.random() - 0.5) * 2.5
      );
      
      const isFire = Math.random() < 0.45;
      
      smokeParticles.current.push({
        pos: pos.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.2
        )),
        vel,
        age: 0,
        maxAge: Math.random() * 1.0 + 0.5,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 1.5,
        startSize: Math.random() * 0.08 + 0.04,
        targetSize: Math.random() * 0.55 + 0.35,
        isFire
      });
    }
  }, [sparksList]);

  useFrame((state, delta) => {
    const finalDelta = Math.min(delta, 0.1);

    // --- DECAY LIGHTS ---
    for (let i = 0; i < 4; i++) {
      const data = lightData.current[i];
      const light = lightRefs.current[i];
      if (light && data.intensity > 0) {
        data.intensity -= finalDelta * 16.0;
        if (data.intensity < 0) data.intensity = 0;
        light.intensity = data.intensity;
        light.position.copy(data.pos);
      }
    }

    // --- UPDATE SPARKS ---
    const activeSparks = [];
    const numSparks = sparkParticles.current.length;
    for (let i = 0; i < numSparks; i++) {
      const p = sparkParticles.current[i];
      p.age += finalDelta;
      if (p.age < p.maxAge) {
        p.vel.y -= 24.0 * finalDelta;
        p.vel.multiplyScalar(1.0 - 0.9 * finalDelta);
        p.pos.addScaledVector(p.vel, finalDelta);

        // bounce on floor
        if (p.pos.y < 0.05) {
          p.pos.y = 0.05;
          p.vel.y *= -0.5;
          p.vel.x *= 0.65;
          p.vel.z *= 0.65;
        }
        activeSparks.push(p);
      }
    }
    sparkParticles.current = activeSparks;

    if (sparksMeshRef.current) {
      const count = sparkParticles.current.length;
      sparksMeshRef.current.count = count;
      for (let i = 0; i < count; i++) {
        const p = sparkParticles.current[i];
        dummyObj.position.copy(p.pos);
        const speedSq = p.vel.lengthSq();
        // Dynamic velocity-aligned stretching
        const stretch = Math.max(1.5, speedSq * 0.022);
        // Make them needle-thin for spectacular visual realism!
        dummyObj.scale.set(p.size * 0.25, p.size * 0.25, p.size * stretch);
        
        if (speedSq > 0.1) {
          dummyObj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.vel.clone().normalize());
        } else {
          dummyObj.quaternion.set(0, 0, 0, 1);
        }
        
        dummyObj.updateMatrix();
        sparksMeshRef.current.setMatrixAt(i, dummyObj.matrix);

        const fade = Math.max(0, 1 - (p.age / p.maxAge));
        // High intensity bloom/emissive multiplier
        const col = p.color.clone().multiplyScalar(fade * 5.0);
        sparksMeshRef.current.setColorAt(i, col);
      }
      if (count > 0) {
        sparksMeshRef.current.instanceMatrix.needsUpdate = true;
        if (sparksMeshRef.current.instanceColor) sparksMeshRef.current.instanceColor.needsUpdate = true;
      }
    }

    // --- UPDATE SMOKE & FIRE ---
    const activeSmoke = [];
    const numSmoke = smokeParticles.current.length;
    for (let i = 0; i < numSmoke; i++) {
      const p = smokeParticles.current[i];
      p.age += finalDelta;
      if (p.age < p.maxAge) {
        p.vel.y += 1.4 * finalDelta;
        p.vel.multiplyScalar(1.0 - 1.3 * finalDelta);
        p.pos.addScaledVector(p.vel, finalDelta);
        p.rot += p.rotSpeed * finalDelta;
        activeSmoke.push(p);
      }
    }
    smokeParticles.current = activeSmoke;

    let fireCount = 0;
    let smokeCount = 0;

    if (fireMeshRef.current && smokeMeshRef.current) {
      const totalCount = smokeParticles.current.length;
      
      for (let i = 0; i < totalCount; i++) {
        const p = smokeParticles.current[i];
        dummyObj.position.copy(p.pos);
        
        const pct = p.age / p.maxAge;
        const size = p.startSize + (p.targetSize - p.startSize) * pct;
        dummyObj.scale.set(size, size, size);
        
        // Perfect CPU Billboarding: Align planes facing the active camera!
        dummyObj.quaternion.copy(state.camera.quaternion);
        // Spin billboard locally for natural rolling cloud variance
        dummyObj.rotateZ(p.rot);
        
        dummyObj.updateMatrix();

        const fade = Math.max(0, 1 - pct);

        if (p.isFire) {
          fireMeshRef.current.setMatrixAt(fireCount, dummyObj.matrix);
          
          // Temperature-based fire color gradient (White core -> Hot Orange -> Dark Red Ash)
          let r = 1.0, g = 0.5, b = 0.1;
          let intensity = 3.0;
          if (pct < 0.22) {
            r = 1.0; g = 0.95; b = 0.65; intensity = 5.0;
          } else if (pct < 0.52) {
            r = 1.0; g = 0.42; b = 0.04; intensity = 3.0;
          } else {
            r = 0.8; g = 0.15; b = 0.0; intensity = 1.2;
          }
          
          const col = new THREE.Color(r, g, b).multiplyScalar(intensity * fade);
          fireMeshRef.current.setColorAt(fireCount, col);
          fireCount++;
        } else {
          smokeMeshRef.current.setMatrixAt(smokeCount, dummyObj.matrix);
          
          // Thick dark industrial soot / carbon ash
          const shade = 0.12 + 0.18 * (1.0 - pct);
          const col = new THREE.Color(shade, shade * 1.05, shade * 1.1).multiplyScalar(fade);
          smokeMeshRef.current.setColorAt(smokeCount, col);
          smokeCount++;
        }
      }

      fireMeshRef.current.count = fireCount;
      smokeMeshRef.current.count = smokeCount;

      if (fireCount > 0) {
        fireMeshRef.current.instanceMatrix.needsUpdate = true;
        if (fireMeshRef.current.instanceColor) fireMeshRef.current.instanceColor.needsUpdate = true;
      }
      if (smokeCount > 0) {
        smokeMeshRef.current.instanceMatrix.needsUpdate = true;
        if (smokeMeshRef.current.instanceColor) smokeMeshRef.current.instanceColor.needsUpdate = true;
      }
    }
  });

  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <pointLight
          key={i}
          ref={(el) => { lightRefs.current[i] = el; }}
          distance={10}
          intensity={0}
          color="#FF6A00"
        />
      ))}

      {/* Sparks instanced mesh: Dynamic high-velocity needle streaks */}
      <instancedMesh ref={sparksMeshRef} args={[undefined, undefined, 400]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} blending={THREE.AdditiveBlending} transparent opacity={0.95} />
      </instancedMesh>

      {/* Volumetric smoke soot: soft blending */}
      <instancedMesh ref={smokeMeshRef} args={[undefined, undefined, 200]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial 
          map={softParticleTexture}
          toneMapped={false} 
          transparent 
          depthWrite={false}
          blending={THREE.NormalBlending}
          opacity={0.5}
        />
      </instancedMesh>

      {/* Luminous fireballs: additive HDR glow */}
      <instancedMesh ref={fireMeshRef} args={[undefined, undefined, 200]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial 
          map={softParticleTexture}
          toneMapped={false} 
          transparent 
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
    </>
  );
};

const MovingSpotlights = () => {
  const lightRefs = useRef<(THREE.SpotLight | null)[]>([]);
  const beamRefs = useRef<(THREE.Mesh | null)[]>([]);
  const targetPos = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();
    
    // Follow the midpoint between Player and Opponent
    const pPos = globalPhysicsState.player.pos;
    const oPos = globalPhysicsState.opponent.pos;
    const mid = new THREE.Vector3().addVectors(pPos, oPos).multiplyScalar(0.5);
    
    // Slight stylistic manual wander
    mid.x += Math.sin(elapsed * 1.4) * 1.0;
    mid.z += Math.cos(elapsed * 1.1) * 1.0;
    
    targetPos.current.lerp(mid, 0.08);

    const positions: [number, number, number][] = [
      [14.5, 9.0, 14.5],
      [-14.5, 9.0, -14.5],
      [14.5, 9.0, -14.5],
      [-14.5, 9.0, 14.5]
    ];

    for (let i = 0; i < 4; i++) {
      const spot = lightRefs.current[i];
      const beam = beamRefs.current[i];
      if (spot) {
        spot.target.position.copy(targetPos.current);
        spot.target.updateMatrixWorld();
      }
      
      if (beam) {
        const start = new THREE.Vector3(...positions[i]);
        const end = targetPos.current.clone();
        const beamMid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        beam.position.copy(beamMid);
        
        const dist = start.distanceTo(end);
        beam.scale.set(0.6, dist, 0.6);
        
        const direction = new THREE.Vector3().subVectors(end, start).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        beam.quaternion.setFromUnitVectors(up, direction);
      }
    }
  });

  const positions: [number, number, number][] = [
    [14.5, 9.0, 14.5],
    [-14.5, 9.0, -14.5],
    [14.5, 9.0, -14.5],
    [-14.5, 9.0, 14.5]
  ];
  const colors = ["#00E5FF", "#FF1744", "#D500F9", "#00E676"];

  return (
    <>
      {positions.map((pos, i) => (
        <group key={i}>
          <mesh position={pos}>
            <sphereGeometry args={[0.3, 16, 16]} />
            <meshStandardMaterial color="#222" metalness={0.9} roughness={0.1} />
          </mesh>
          <spotLight
            ref={(el) => { lightRefs.current[i] = el; }}
            position={pos}
            angle={0.24}
            penumbra={0.8}
            intensity={4.0}
            distance={30}
            color={colors[i]}
            castShadow
            shadow-mapSize={[512, 512]}
          />
          <mesh ref={(el) => { beamRefs.current[i] = el; }}>
            <cylinderGeometry args={[0.02, 0.45, 1, 16, 1, true]} />
            <meshBasicMaterial 
              color={colors[i]} 
              transparent 
              opacity={0.06} 
              blending={THREE.AdditiveBlending} 
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </>
  );
};

const DebrisSystem = () => {
  const debrisList = useGameStore(s => s.debris);
  const fragments = useGameStore(s => s.fragments);
  const settings = useGameStore(s => s.settings);

  return (
    <group>
      {fragments.map((frag) => {
        const partDef = PART_TEMPLATES.find(p => p.templateId === frag.definitionId);
        if (!partDef) return null;
        const [w, h, d] = partDef.size || [0.5, 0.5, 0.5];
        return (
          <RigidBody ccd={true}
            key={frag.id}
            position={frag.position}
            quaternion={frag.rotation}
            linearVelocity={frag.velocity}
            angularVelocity={frag.angularVelocity}
            colliders={partDef.visualKind === 'capsule' ? 'hull' : partDef.visualKind === 'cylinder' ? 'hull' : 'cuboid'}
            mass={partDef.mass || 1.0}
            type="dynamic"
          >
            <mesh castShadow receiveShadow>
              {partDef.visualKind === 'box' && <boxGeometry args={[w, h, d, Math.max(2, Math.ceil(w * 8)), Math.max(2, Math.ceil(h * 8)), Math.max(2, Math.ceil(d * 8))]} />}
              {partDef.visualKind === 'wedge' && <boxGeometry args={[w, h, d, Math.max(2, Math.ceil(w * 8)), Math.max(2, Math.ceil(h * 8)), Math.max(2, Math.ceil(d * 8))]} />}
              {partDef.visualKind === 'cylinder' && <cylinderGeometry args={[w, w, d, 24, Math.max(2, Math.ceil(d * 4))]} />}
              {partDef.visualKind === 'capsule' && <capsuleGeometry args={[h/2, Math.max(0.01, w - h), 16, 16]} />}
              {(!partDef.visualKind || partDef.visualKind === 'slope') && <boxGeometry args={[w, h, d, Math.max(2, Math.ceil(w * 8)), Math.max(2, Math.ceil(h * 8)), Math.max(2, Math.ceil(d * 8))]} />}
              
              <meshStandardMaterial color={frag.color} metalness={0.7} roughness={0.3} />
            </mesh>
          </RigidBody>
        );
      })}
      
      {debrisList.map((d) => (
        <RigidBody ccd={true} 
          key={d.id} 
          position={d.position} 
          linearVelocity={d.velocity} 
          angularVelocity={[(Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20]}
          colliders="cuboid"
          mass={0.1}
          type="dynamic"
        >
          <mesh castShadow>
             {settings.fragmentQuality === 'high' ? <cylinderGeometry args={[0.05 + Math.random() * 0.05, 0.05 + Math.random() * 0.05, 0.2, 6]} /> : <boxGeometry args={[0.1 + Math.random() * 0.1, 0.05 + Math.random() * 0.05, 0.1 + Math.random() * 0.1]} />}
             <meshStandardMaterial color="#666" metalness={0.9} roughness={0.1} />
          </mesh>
        </RigidBody>
      ))}
    </group>
  );
};

const ShockwaveSystem = () => {
  const groupRef = useRef<THREE.Group>(null);
  const activeShockwavesRef = useRef<Array<{
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    scale: number;
    opacity: number;
  }>>([]);

  useEffect(() => {
    // Shared ring geometry for high-efficiency memory usage
    const geometry = new THREE.RingGeometry(0.08, 0.45, 32);

    const handleShockwave = (e: Event) => {
      if (!groupRef.current) return;
      const { position } = (e as CustomEvent).detail;

      // Unique material instance per active shockwave to control opacity in WebGL without React overhead
      const material = new THREE.MeshBasicMaterial({
        color: 0xFF5500,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(position[0], position[1], position[2]);
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.setScalar(0.1);

      groupRef.current.add(mesh);

      activeShockwavesRef.current.push({
        mesh,
        material,
        scale: 0.1,
        opacity: 1.0
      });
    };

    window.addEventListener('spawn-shockwave', handleShockwave);

    return () => {
      window.removeEventListener('spawn-shockwave', handleShockwave);
      geometry.dispose();
      activeShockwavesRef.current.forEach(sw => {
        sw.material.dispose();
      });
    };
  }, []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1); // clamp delta
    const active = activeShockwavesRef.current;

    for (let i = active.length - 1; i >= 0; i--) {
      const sw = active[i];
      sw.scale += dt * 9.0;
      sw.opacity -= dt * 1.9;

      if (sw.opacity <= 0) {
        if (groupRef.current) {
          groupRef.current.remove(sw.mesh);
        }
        sw.material.dispose();
        active.splice(i, 1);
      } else {
        sw.mesh.scale.setScalar(sw.scale);
        sw.material.opacity = sw.opacity * 0.85;
      }
    }
  });

  return <group ref={groupRef} name="ShockwaveSystem" />;
};

export const Arena3D = ({ activeWeapon }: { activeWeapon: boolean }) => {
  const playerRef = useRef<any>(null);
  const opponentRef = useRef<any>(null);
  const targetObjRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const battleStatus = useGameStore(s => s.battleStatus);
  const matchCount = useGameStore(s => s.matchCount);
  const settings = useGameStore(s => s.settings);
  const [debugPhysics, setDebugPhysics] = useState(false);

  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticsTab, setDiagnosticsTab] = useState<'player' | 'opponent'>('player');
  const [playerMechData, setPlayerMechData] = useState<CombatMechanicalState | null>(null);
  const [opponentMechData, setOpponentMechData] = useState<CombatMechanicalState | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      if (globalMechanicalState.player.current) {
        const p = globalMechanicalState.player.current;
        setPlayerMechData({
          ...p,
          nodes: p.nodes.map(n => ({ ...n, capability: { ...n.capability } })),
          edges: p.edges.map(e => ({ ...e })),
          wheels: p.wheels.map(w => ({ ...w })),
          weapons: p.weapons.map(w => ({ ...w })),
          eventLedger: [...p.eventLedger]
        });
      } else {
        setPlayerMechData(null);
      }
      if (globalMechanicalState.opponent.current) {
        const o = globalMechanicalState.opponent.current;
        setOpponentMechData({
          ...o,
          nodes: o.nodes.map(n => ({ ...n, capability: { ...n.capability } })),
          edges: o.edges.map(e => ({ ...e })),
          wheels: o.wheels.map(w => ({ ...w })),
          weapons: o.weapons.map(w => ({ ...w })),
          eventLedger: [...o.eventLedger]
        });
      } else {
        setOpponentMechData(null);
      }
    }, 150);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (battleStatus === 'battle' && wrapperRef.current) {
      wrapperRef.current.focus();
    }
  }, [battleStatus]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'p') {
        setDebugPhysics(v => !v);
        useGameStore.getState().addLog(`Physics Debug: ${!debugPhysics ? 'ON' : 'OFF'}`, 'info');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [debugPhysics]);

  return (
    <div ref={wrapperRef} tabIndex={0} className="absolute inset-0 z-0 bg-[#121212] focus:outline-none">
      <Canvas shadows camera={{ position: [0, 12, 16], fov: 40 }}>
        <color attach="background" args={['#101112']} />
        
        {/* Dynamic lighting based on Performance Mode settings */}
        <ambientLight intensity={settings.performanceMode ? 0.6 : 0.4} />
        <directionalLight 
          position={[10, 25, 10]} 
          intensity={1.0} 
          castShadow={!settings.performanceMode} 
          shadow-mapSize={settings.performanceMode ? [256, 256] : [1024, 1024]} 
          color="#e8f4fc"
        />
        <pointLight position={[-15, 10, -15]} intensity={1.0} color="#00E5FF" distance={40} />
        <pointLight position={[15, 10, 15]} intensity={1.0} color="#FF1744" distance={40} />

        <PlayerTracker playerRef={playerRef} targetObjRef={targetObjRef} />
        <CameraManager targetRef={targetObjRef} playerBodyRef={playerRef} opponentBodyRef={opponentRef} />
        
        {/* Moving Spotlights Tracking the Battlebots */}
        <MovingSpotlights />

        {/* Environment details reduced under Performance Mode */}
        <Grid 
          renderOrder={-1} 
          position={[0, 0.01, 0]} 
          infiniteGrid 
          cellSize={settings.performanceMode ? 2 : 1} 
          cellThickness={0.8} 
          sectionSize={5} 
          sectionThickness={1.5} 
          cellColor="#1b1c1e" 
          sectionColor="#2d3035" 
          fadeDistance={60} 
        />
        
        {/* Dark Metallic Industrial Floor Base */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial color="#141517" roughness={0.75} metalness={0.7} />
        </mesh>

        {/* Cyber Tactical Glow Overlays (Floor Graphics) */}
        {!settings.performanceMode && (
          <group position={[0, 0.02, 0]}>
            {/* Center Battle ring - Hot Orange */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[2.92, 3.08, 32]} />
              <meshBasicMaterial color="#FF5500" toneMapped={false} transparent opacity={0.85} />
            </mesh>
            {/* Outer warning ring - Neon Cyan */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[12.8, 13.0, 64]} />
              <meshBasicMaterial color="#00E5FF" toneMapped={false} transparent opacity={0.65} />
            </mesh>
            {/* Center crosshair hash marks */}
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[1.5, 0.005, 0.06]} />
              <meshBasicMaterial color="#FF5500" toneMapped={false} transparent opacity={0.5} />
            </mesh>
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[0.06, 0.005, 1.5]} />
              <meshBasicMaterial color="#FF5500" toneMapped={false} transparent opacity={0.5} />
            </mesh>
          </group>
        )}

        {/* Futuristic Glowing Neon Perimeter Wall Tubes */}
        <group position={[0, 2.4, 0]}>
          {/* Cyan/Blue back light tube */}
          <mesh position={[0, 0, -15.02]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.04, 0.04, 30.1, 8]} />
            <meshBasicMaterial color="#00E5FF" toneMapped={false} />
          </mesh>
          {/* Orange front light tube */}
          <mesh position={[0, 0, 15.02]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.04, 0.04, 30.1, 8]} />
            <meshBasicMaterial color="#FF5500" toneMapped={false} />
          </mesh>
          {/* Cyan/Blue left light tube */}
          <mesh position={[-15.02, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 30.1, 8]} />
            <meshBasicMaterial color="#00E5FF" toneMapped={false} />
          </mesh>
          {/* Orange right light tube */}
          <mesh position={[15.02, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 30.1, 8]} />
            <meshBasicMaterial color="#FF5500" toneMapped={false} />
          </mesh>
        </group>
        
        <ContactShadows position={[0, 0.02, 0]} opacity={0.6} scale={50} blur={2.5} far={5} />
        
        <Physics timeStep={settings.physicsTimeStep || 1 / 120} interpolate updatePriority={-1} debug={debugPhysics} gravity={[0, -29.43, 0]}>
          <EffectsManager />
          <DebrisSystem />
          <UnifiedVisualEffectsManager />
          <ShockwaveSystem />

          {/* Floor */}
          <RigidBody ccd={true} type="fixed" friction={2}>
            <CuboidCollider args={[25, 0.1, 25]} position={[0, -0.1, 0]} />
          </RigidBody>

          {/* Arena Walls */}
          <RigidBody ccd={true} type="fixed" userData={{ role: 'arenaWall', material: 'arenaWall', hitZone: 'arenaWall' }}>
            <CuboidCollider args={[15, 2.5, 0.5]} position={[0, 1.25, -15.5]} friction={0.9} restitution={0.12} />
            <group position={[0, 1.25, -15.5]}>
              <RoundedBoxMesh size={[30, 2.5, 1]} color="#2d2d2d" />
            </group>
            
            <CuboidCollider args={[15, 2.5, 0.5]} position={[0, 1.25, 15.5]} friction={0.9} restitution={0.12} />
            <group position={[0, 1.25, 15.5]}>
              <RoundedBoxMesh size={[30, 2.5, 1]} color="#2d2d2d" />
            </group>
            
            <CuboidCollider args={[0.5, 2.5, 15]} position={[-15.5, 1.25, 0]} friction={0.9} restitution={0.12} />
            <group position={[-15.5, 1.25, 0]}>
              <RoundedBoxMesh size={[1, 2.5, 30]} color="#2d2d2d" />
            </group>
            
            <CuboidCollider args={[0.5, 2.5, 15]} position={[15.5, 1.25, 0]} friction={0.9} restitution={0.12} />
            <group position={[15.5, 1.25, 0]}>
              <RoundedBoxMesh size={[1, 2.5, 30]} color="#2d2d2d" />
            </group>
          </RigidBody>

          {/* Interactive Bots */}
          <Bot 
            key={matchCount + '-player'}
            position={[0, 2.0, 6]} 
            color="#444" 
            isSpinning={activeWeapon} 
            isPlayer={true} 
            bodyRef={playerRef} 
            targetRef={opponentRef}
          />
          <Bot 
            key={matchCount + '-opponent'}
            position={[0, 2.0, -6]} 
            color="#555" 
            isSpinning={battleStatus === 'battle'} 
            isPlayer={false} 
            bodyRef={opponentRef} 
            targetRef={playerRef}
          />

          {/* Dynamic Corner Hazards */}
          <HazardSaw position={[10, 0, 10]} />
          <HazardSaw position={[-10, 0, -10]} />
          <HazardSaw position={[10, 0, -10]} />
          <HazardSaw position={[-10, 0, 10]} />

          {/* Industrial columns around bounds */}
          <IndustrialPillar position={[15.5, 0, 15.5]} />
          <IndustrialPillar position={[-15.5, 0, -15.5]} />
          <IndustrialPillar position={[15.5, 0, -15.5]} />
          <IndustrialPillar position={[-15.5, 0, 15.5]} />
        </Physics>

        <Environment preset="studio" />
      </Canvas>

      {/* Collapsible Diagnostics Trigger Button */}
      <div className="absolute top-[85px] right-4 z-40">
        <button
          id="btn-diagnostics-toggle"
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          className={`px-3 py-2 text-xs font-mono font-medium rounded-lg border flex items-center gap-2 transition-all duration-300 shadow-lg ${
            showDiagnostics 
              ? 'bg-red-950/40 border-red-500/50 text-red-400 hover:bg-red-900/40' 
              : 'bg-cyan-950/40 border-cyan-500/50 text-cyan-400 hover:bg-cyan-900/40'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${showDiagnostics ? 'bg-red-500 animate-pulse' : 'bg-cyan-400 animate-pulse'}`} />
          {showDiagnostics ? 'CLOSE DIAGNOSTICS' : 'MECHANICAL DIAGNOSTICS'}
        </button>
      </div>

      {showDiagnostics && (
        <div id="diagnostics-panel-hud" className="absolute top-[135px] right-4 bottom-4 w-[380px] z-30 flex flex-col gap-3 bg-[#0d0e12]/90 backdrop-blur-md border border-[#ffffff]/10 border-cyan-500/20 rounded-xl p-4 overflow-y-auto select-none pointer-events-auto text-[#e2e8f0]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <span className="text-xs font-mono font-bold tracking-wider text-cyan-400">COMBAT FORENSICS & STRUCTURAL PATHS</span>
            <span className="text-[10px] font-mono text-gray-500">REALTIME</span>
          </div>

          {/* Selector Tabs */}
          <div className="flex gap-2 bg-black/40 p-1 rounded-lg border border-gray-800">
            <button
              id="tab-diagnostics-player"
              onClick={() => setDiagnosticsTab('player')}
              className={`flex-1 py-1 text-[10px] font-mono font-medium rounded transition-all ${
                diagnosticsTab === 'player' 
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              PLAYER BOT
            </button>
            <button
              id="tab-diagnostics-opponent"
              onClick={() => setDiagnosticsTab('opponent')}
              className={`flex-1 py-1 text-[10px] font-mono font-medium rounded transition-all ${
                diagnosticsTab === 'opponent' 
                  ? 'bg-red-500/20 text-red-300 border border-red-500/30' 
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              OPPONENT BOT
            </button>
          </div>

          {/* Selected Bot Mech State Display */}
          {(() => {
            const data = diagnosticsTab === 'player' ? playerMechData : opponentMechData;
            if (!data) {
              return (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-gray-800 rounded-lg">
                  <span className="text-xs font-mono text-gray-500">NO ADVANCED MECHANICAL DATA</span>
                  <span className="text-[9px] font-mono text-gray-600 mt-1 max-w-[200px]">
                    Requires spawning a Custom Design with custom assemblies in the Workshop first!
                  </span>
                </div>
              );
            }

            const totalNodes = data.nodes.length;
            const overallTractionMultiplier = totalNodes > 0 
              ? data.nodes.reduce((acc, n) => acc + n.capability.structuralMultiplier, 0) / totalNodes
              : 1.0;
            const overallWeaponMultiplier = totalNodes > 0 
              ? data.nodes.reduce((acc, n) => acc + n.capability.actuatorEfficiency, 0) / totalNodes
              : 1.0;
            const overallMobilityMultiplier = totalNodes > 0 
              ? data.nodes.reduce((acc, n) => acc + n.capability.alignmentQuality, 0) / totalNodes
              : 1.0;
            const totalFailures = data.nodes.filter(n => n.failureState === 'failed' || n.failureState === 'detached').length;

            return (
              <div className="flex flex-col gap-4 flex-1">
                {/* 1. Overall capability multipliers */}
                <div className="bg-black/25 p-2 rounded-lg border border-gray-800/40">
                  <div className="text-[10px] font-mono font-semibold text-gray-400 mb-1">CAPABILITY DEGRADATION</div>
                  <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                    <div className="flex justify-between items-center bg-black/10 p-1.5 rounded">
                      <span className="text-gray-500">Traction Capacity:</span>
                      <span className={overallTractionMultiplier < 0.8 ? 'text-amber-400 font-bold' : 'text-cyan-400'}>
                        {(overallTractionMultiplier * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-black/10 p-1.5 rounded">
                      <span className="text-gray-500">Weapon Output:</span>
                      <span className={overallWeaponMultiplier < 0.8 ? 'text-amber-400 font-bold' : 'text-cyan-400'}>
                        {(overallWeaponMultiplier * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-black/10 p-1.5 rounded">
                      <span className="text-gray-500">Mobility Efficiency:</span>
                      <span className={overallMobilityMultiplier < 0.8 ? 'text-amber-400 font-bold' : 'text-cyan-400'}>
                        {(overallMobilityMultiplier * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-black/10 p-1.5 rounded">
                      <span className="text-gray-500">Failures Logged:</span>
                      <span className="text-gray-400 font-bold">{totalFailures}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Joints & Demand ratios */}
                <div className="flex flex-col gap-1.5">
                  <div className="text-[10px] font-mono font-semibold text-cyan-400/80 uppercase">Structural Joints & Load Paths</div>
                  <div className="flex flex-col gap-2 max-h-[140px] overflow-y-auto pr-1">
                    {data.edges.map((edge) => {
                      const ratio = edge.demandRatio;
                      const pct = Math.min(100, ratio * 100);
                      const barColor = edge.state === 'failed' 
                        ? 'bg-red-600' 
                        : edge.state === 'yielded' 
                        ? 'bg-amber-500 animate-pulse' 
                        : 'bg-cyan-500';

                      return (
                        <div key={edge.jointId} className="bg-black/30 p-1.5 rounded border border-gray-800/40 text-[9px] font-mono">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-gray-300">{edge.jointId.replace(/_/g, ' ')}</span>
                            <span className={`px-1 rounded-sm text-[8px] ${
                              edge.state === 'failed' ? 'bg-red-950 text-red-400 border border-red-500/20' :
                              edge.state === 'yielded' ? 'bg-amber-950 text-amber-400 border border-amber-500/20' :
                              'bg-cyan-950 text-cyan-400 border border-cyan-500/20'
                            }`}>
                              {edge.state.toUpperCase()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                              <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[8px] text-gray-400 text-right min-w-[32px] font-bold">
                              {ratio.toFixed(2)}x
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Slip rates */}
                <div className="flex flex-col gap-1.5">
                  <div className="text-[10px] font-mono font-semibold text-cyan-400/80 uppercase">Wheel Slip & Contacts</div>
                  <div className="grid grid-cols-2 gap-2">
                    {data.wheels.map((w, idx) => {
                      const isLeft = idx % 2 === 0;
                      const contact = data.supportContacts.find(sc => sc.partInstanceId === w.partInstanceId);
                      const normalLoad = contact ? contact.normalLoad : 0;
                      const longitudinalSlip = contact ? contact.longitudinalSlip : 0;
                      const lateralSlip = contact ? contact.lateralSlip : 0;

                      const condition = w.detached 
                        ? 'detached' 
                        : w.seized 
                        ? 'seized' 
                        : (Math.abs(longitudinalSlip) > 0.25 || Math.abs(lateralSlip) > 0.25) 
                        ? 'sliding' 
                        : 'nominal';

                      return (
                        <div key={w.partInstanceId + idx} className="bg-black/30 p-1.5 rounded border border-gray-800/30 text-[9px] font-mono flex flex-col gap-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-gray-400">{isLeft ? 'LEFT WHEEL' : 'RIGHT WHEEL'}</span>
                            <span className={`text-[8px] font-bold ${
                              condition === 'detached' ? 'text-red-500' :
                              condition === 'seized' ? 'text-red-400' :
                              condition === 'sliding' ? 'text-amber-400 animate-pulse' :
                              'text-emerald-400'
                            }`}>
                              {condition.toUpperCase()}
                            </span>
                          </div>
                          <div className="text-[8px] text-gray-500 flex flex-col gap-0.5">
                            <div className="flex justify-between">
                              <span>Load:</span>
                              <span className="text-gray-300">{(normalLoad).toFixed(0)} N</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Long Slip:</span>
                              <span className="text-gray-300">{(longitudinalSlip * 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Lat Slip:</span>
                              <span className="text-gray-300">{(lateralSlip * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Weapons */}
                {data.weapons.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[10px] font-mono font-semibold text-cyan-400/80 uppercase">Weapon Actuator telemetry</div>
                    {data.weapons.map((w) => {
                      const condition = w.detached ? 'detached' : w.jammed ? 'jammed' : w.seized ? 'seized' : 'nominal';
                      return (
                        <div key={w.partInstanceId} className="bg-black/30 p-2 rounded border border-gray-800/30 text-[9px] font-mono flex justify-between items-center">
                          <div className="flex flex-col">
                            <span className="font-bold text-gray-300">ACTUATOR OUTPUT</span>
                            <span className="text-[8px] text-gray-500">AngVel: {w.angularVelocity.toFixed(1)} rad/s</span>
                          </div>
                          <div className="text-right flex flex-col">
                            <span className="font-bold text-cyan-400">{(w.storedKineticEnergy).toFixed(1)} J</span>
                            <span className={`text-[8px] font-bold ${condition === 'detached' ? 'text-red-500' : condition === 'jammed' ? 'text-amber-500' : 'text-emerald-400'}`}>
                              {condition.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 5. Causal Ledger list */}
                <div className="flex flex-col gap-1.5 flex-1 min-h-[120px]">
                  <div className="text-[10px] font-mono font-semibold text-cyan-400/80 uppercase">Causal Ledger (Combat Forensics)</div>
                  <div className="bg-black/50 p-2 border border-gray-800/60 rounded-lg flex-1 overflow-y-auto max-h-[160px] font-mono text-[9px] text-[#00E5FF] flex flex-col gap-1 select-text">
                    {data.eventLedger.length === 0 ? (
                      <span className="text-gray-600 italic">No forensic events logged yet...</span>
                    ) : (
                      data.eventLedger.map((evt, idx) => {
                        const tick = evt.tick;
                        let description = '';
                        switch (evt.type) {
                          case 'impact':
                            description = `Part ${evt.partInstanceId.substring(0, 8)}: Received impact of ${evt.energy.toFixed(1)}J (impulse: ${evt.impulse.toFixed(1)} Ns)`;
                            break;
                          case 'yielded':
                            description = `Joint ${evt.jointId.replace(/_/g, ' ')}: Yielded under stress! (Demand: ${evt.demandRatio.toFixed(2)}x) ${evt.msg}`;
                            break;
                          case 'degradation':
                            description = `Part ${evt.partInstanceId.substring(0, 8)}: ${evt.capabilityType} degraded by ${evt.change}`;
                            break;
                          case 'jammed':
                            description = `Weapon actuator ${evt.partInstanceId.substring(0, 8)} jammed!`;
                            break;
                          case 'joint_failed':
                            description = `Joint ${evt.jointId.replace(/_/g, ' ')} completely failed & severed!`;
                            break;
                          case 'detached':
                            description = `Part ${evt.partInstanceId.substring(0, 8)} completely detached and lost!`;
                            break;
                          case 'knockout':
                            description = `Bot knocked out: ${evt.reason}`;
                            break;
                          default:
                            description = `Unknown combat event`;
                        }

                        return (
                          <div key={idx} className="border-b border-gray-900 pb-1 flex flex-col gap-0.5">
                            <div className="flex justify-between text-[8px] text-gray-500">
                              <span>TICK: {tick}</span>
                              <span>{evt.type.toUpperCase()}</span>
                            </div>
                            <span className="text-gray-300 break-words">{description}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
