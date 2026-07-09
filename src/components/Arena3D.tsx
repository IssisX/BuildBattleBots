import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, ContactShadows, KeyboardControls, useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { Physics, RigidBody, CuboidCollider, CylinderCollider } from '@react-three/rapier';
import { DamageSystem } from "../combat/DamageSystem";
import { useGameStore, CameraMode } from '../store';
import { resolvePartTransforms, resolvePartTransformsV2, PART_TEMPLATES } from '../lib/partsCatalog';
import { playImpactSound, initAudio } from '../lib/audio';
import { ImpactEvent, ImpactClass, BotAnimState } from '../types';

declare global {
  interface Window {
  }
}




export const globalPhysicsState = {
  player: { vel: new THREE.Vector3(), pos: new THREE.Vector3(), mass: 1, animState: "idle" as BotAnimState, lastHitTime: 0, hitNormal: new THREE.Vector3() },
  opponent: { vel: new THREE.Vector3(), pos: new THREE.Vector3(), mass: 1, animState: "idle" as BotAnimState, lastHitTime: 0, hitNormal: new THREE.Vector3() }
};

const WedgeMesh = ({ size, color }: { size: [number, number, number]; color: string }) => {
  const [width, height, depth] = size;
  const geom = useMemo(() => {
    const shape = new THREE.Shape();
    // Profile on Z-Y plane: right triangle (wedge)
    shape.moveTo(-depth / 2, -height / 2);
    shape.lineTo(depth / 2, -height / 2);
    shape.lineTo(-depth / 2, height / 2);
    shape.closePath();

    const extrudeSettings = {
      depth: width,
      bevelEnabled: false
    };
    const g = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    g.center();
    // Rotate to align extrusion along X axis
    g.rotateY(Math.PI / 2);
    return g;
  }, [width, height, depth]);

  return (
    <mesh castShadow receiveShadow geometry={geom}>
      <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
    </mesh>
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
            {comp.visualState === 'scuffed' && (
              <mesh position={[0, 0.01, 0]}>
                <planeGeometry args={[0.4, 0.4]} />
                <meshBasicMaterial color="#333" transparent opacity={0.4} />
              </mesh>
            )}
            {comp.visualState === 'dented' && (
              <mesh position={[0, 0.01, 0]}>
                <circleGeometry args={[0.3, 16]} />
                <meshStandardMaterial color="#111" roughness={0.9} />
              </mesh>
            )}
            {comp.visualState === 'exposed' && (
              <mesh position={[0, 0.01, 0]}>
                <planeGeometry args={[0.6, 0.4]} />
                <meshStandardMaterial color="#555" roughness={0.5} metalness={0.8} />
              </mesh>
            )}
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

  const actualColor = isPlayer ? paintScheme : "#FF003C";
  const actualWeaponType = isPlayer ? config.weapon.type : opponentConfig.weapon.type;
  const currentBotConfig = isPlayer ? config : opponentConfig;
  const isCustom = isPlayer && currentBotConfig.isCustom && currentBotConfig.parts && currentBotConfig.parts.length > 0;
  const resolvedParts = useMemo(() => isCustom && currentBotConfig.customConfig ? resolvePartTransformsV2(currentBotConfig.customConfig.parts, currentBotConfig.customConfig.rootPartId) : [], [isCustom, currentBotConfig.customConfig]);

  const getPartFalloffThreshold = (instanceId: string, partType: string) => {
    const hash = parseInt(instanceId.replace(/[^0-9a-f]/gi, '').slice(-4) || '8000', 16) / 65535;
    const isVital = partType === 'chassis' || partType === 'wheel' || partType === 'weapon' || partType === 'motor';
    return isVital ? 0.98 : 0.2 + hash * 0.7;
  };

  // Elite Upgrades helper state and refs
  const overchargeHeatRef = useRef(0);
  const damageComponents = useGameStore(s => isPlayer ? s.playerDamageComponents : s.opponentDamageComponents);
  const botHealth = useGameStore(s => isPlayer ? s.botState.health : s.opponentState.health);
  const damageFactor = 1.0 - botHealth / 100;
  const detachedParts = useRef<Set<string>>(new Set());
  const addLog = useGameStore(s => s.addLog);

  useEffect(() => {
    if (battleStatus === 'countdown' || battleStatus === 'menu') {
      detachedParts.current.clear();
    }
  }, [battleStatus]);

  useEffect(() => {
    if (botHealth <= 0) return;
    
    // Check Custom Bot Parts
    if (isCustom && currentBotConfig.customConfig && currentBotConfig.customConfig.parts) {
      resolvedParts.forEach(tr => {
        const partDef = PART_TEMPLATES.find(p => p.templateId === tr.definitionId) as any;
        if (!partDef) return;
        const threshold = getPartFalloffThreshold(tr.instanceId, partDef.type || partDef.category || '');
        if (damageFactor > threshold && !detachedParts.current.has(tr.instanceId)) {
          detachedParts.current.add(tr.instanceId);
          if (bodyRef?.current) {
             const pos = bodyRef.current.translation();
             useGameStore.getState().spawnSparks([pos.x, pos.y + 0.5, pos.z], 12, '#FFFFFF');
             useGameStore.getState().spawnDebris([pos.x, pos.y + 0.5, pos.z], 5);
          }
        }
      });
    }

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

  useFrame((state, delta) => {
    const finalDelta = delta;

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
      const posRaw = bodyRef.current.translation();
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
           visualRootRef.current.position.lerp(new THREE.Vector3(0,0,0), 0.2);
           visualRootRef.current.rotation.set(0,0,0);
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

      const turnRate = angvel.y;

      const leftSpin = (speedForward - turnRate * 0.9) / 0.42;
      const rightSpin = (speedForward + turnRate * 0.9) / 0.42;

      if (frontRightWheelRef.current) frontRightWheelRef.current.rotation.x -= rightSpin * finalDelta;
      if (backRightWheelRef.current) backRightWheelRef.current.rotation.x -= rightSpin * finalDelta;
      if (frontLeftWheelRef.current) frontLeftWheelRef.current.rotation.x -= leftSpin * finalDelta;
      if (backLeftWheelRef.current) backLeftWheelRef.current.rotation.x -= leftSpin * finalDelta;

      if (isCustom && currentBotConfig.parts) {
        currentBotConfig.parts.forEach(part => {
          const meshGroup = customPartsRefs.current[(part as any).id || (part as any).instanceId];
          if (meshGroup) {
            const partDef = PART_TEMPLATES.find(p => p.templateId === (part as any).definitionId || p.templateId === (part as any).templateId);
            const pType = partDef ? (partDef.type || (partDef as any).category) : null;
            if (pType === 'wheel') {
              const isLeft = ((part as any).position?.[0] || (part as any).localPosition?.[0]) < 0;
              const spin = isLeft ? leftSpin : rightSpin;
              // Rotate the entire part group around its local X axis (which points left/right in world space)
              meshGroup.rotation.x -= spin * finalDelta;
            } else if (pType === 'weapon') {
              const wType = currentBotConfig.weapon.type;
              if (partDef?.templateId === 'weapon_drum') {
                const drumSpinner = meshGroup.getObjectByName('DrumSpinner');
                if (drumSpinner) {
                  drumSpinner.rotation.x -= currentRPM.current * finalDelta * 15;
                }
              } else if (wType === 'spinner' || wType === 'saw' || wType === 'drum') {
                meshGroup.rotation.y -= currentRPM.current * finalDelta * 0.05;
              } else if (wType === 'flipper') {
                meshGroup.rotation.x = flipperPos.current * 0.9;
              } else if (wType === 'hammer') {
                if (fireAnimRef.current > 0) {
                  const t = 1.0 - fireAnimRef.current;
                  let angle = 0;
                  if (t < 0.15) angle = -0.35 * Math.sin((t / 0.15) * Math.PI / 2);
                  else if (t < 0.45) angle = -0.35 + 2.1 * Math.sin(((t - 0.15) / 0.3) * Math.PI / 2);
                  else angle = 1.75 * Math.pow(1 - (t - 0.45) / 0.55, 2);
                  meshGroup.rotation.x = angle;
                } else {
                  meshGroup.rotation.x = 0;
                }
              } else if (wType === 'crusher') {
                if (fireAnimRef.current > 0) {
                  const t = 1.0 - fireAnimRef.current;
                  meshGroup.rotation.x = Math.sin(t * Math.PI) * 0.55;
                } else {
                  meshGroup.rotation.x = 0;
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
          bodyRef.current.applyImpulse({ x: centerDir.x * 10, y: 3, z: centerDir.z * 10 }, true);
          bodyRef.current.applyTorqueImpulse({ x: 1, y: 3, z: 1 }, true);
          useGameStore.getState().addLog(`Stuck lock resolved for ${isPlayer ? 'Player' : 'Opponent'}.`, 'info');
        }
      }

      let wantToFire = false;

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
          const rightingStrength = (1.0 - up.y) * 8.0 * (config.armor.weight / 100) * delta * 120;
          bodyRef.current.applyTorqueImpulse({ x: rightingAxis.x * rightingStrength, y: 0, z: rightingAxis.z * rightingStrength }, true);
          if (up.y < 0.0 && myPos.y < 1.0) {
             bodyRef.current.applyImpulse({ x: 0, y: 15.0 * (config.armor.weight / 100) * delta, z: 0 }, true);
          }
        }

        const speed = config.motor.maxSpeed * 0.45 * 1.0;
        const torque = config.motor.torque * 0.025 * 1.0;
        
        const analogY_val = virtualInput.analogY || 0;
        const analogX_val = virtualInput.analogX || 0;
        const analogY = analogY_val !== 0 ? analogY_val : (forward ? -1 : backward ? 1 : 0);
        const analogX = analogX_val !== 0 ? analogX_val : (left ? -1 : right ? 1 : 0);

        if (analogY !== 0) {
            bodyRef.current.applyImpulse({ x: -dir.x * analogY * speed * delta * 15, y: 0, z: -dir.z * analogY * speed * delta * 15 }, true);
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
            // Scaling the target turning speed to be extremely comfortable and precise (max ~4.2 rad/s)
            const turnFactor = 4.2;
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
          const rightingStrength = (1.0 - up.y) * 8.0 * (opponentConfig.armor.weight / 100) * delta * 120;
          bodyRef.current.applyTorqueImpulse({ x: rightingAxis.x * rightingStrength, y: 0, z: rightingAxis.z * rightingStrength }, true);
          if (up.y < 0.0 && myPos.y < 1.0) {
             bodyRef.current.applyImpulse({ x: 0, y: 15.0 * (opponentConfig.armor.weight / 100) * delta, z: 0 }, true);
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
            bodyRef.current.applyImpulse({ x: dir.x * speed * delta * 5.0 * driveFactor, y: 0, z: dir.z * speed * delta * 5.0 * driveFactor }, true);
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
                 
                 const oppWeightMult = (isPlayer ? opponentConfig.armor.weight : config.armor.weight) / 100;

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
    <>
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
               const energyDmgScale = Math.min(impactEnergy * 0.05, 50);
               const dmgMult = settings.damageMultiplier;
               const glancingMult = className === 'direct' || className === 'heavy' || className === 'weapon' ? 1.0 : settings.glancingHitReduction;
               let baseDamage = energyDmgScale * dmgMult * glancingMult * settings.collisionBrutality * 0.1;
               baseDamage = Math.min(baseDamage, 1.5);
               
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
                   hitZone
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
          </>
        ) : (
          resolvedParts.map((tr) => {
            const partDef = PART_TEMPLATES.find(p => p.templateId === tr.definitionId) as any;
            const threshold = getPartFalloffThreshold(tr.instanceId, partDef?.type || '');
            if (damageFactor > threshold) return null;

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
                          restitution={settings.collisionRestitution} friction={0.2} 
                        />
                      );
                    }
                    if (col.kind === 'cylinder') {
                      return (
                        <CylinderCollider 
                          key={`${tr.instanceId}-${idx}`}
                          args={[col.dimensions[0] / 2, col.dimensions[1]]} 
                          position={col.localPosition}
                          rotation={col.localRotation}
                          restitution={settings.collisionRestitution} friction={0.2} 
                        />
                      );
                    }
                    if (col.kind === 'capsule') {
                      return (
                        <CylinderCollider 
                          key={`${tr.instanceId}-${idx}`}
                          args={[col.dimensions[0] / 2, col.dimensions[1]]} 
                          position={col.localPosition}
                          rotation={col.localRotation}
                          restitution={settings.collisionRestitution} friction={0.2} 
                        />
                      );
                    }
                    return null;
                  })}
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
              
              const threshold = getPartFalloffThreshold(tr.instanceId, partDef.type || partDef.category || '');
              if (damageFactor > threshold) return null;

              const [w, h, d] = partDef.dimensions || partDef.size || [0.5,0.5,0.5];
              const color = part.color || partDef.color || '#fff';
              const visualKind = partDef.visualKind;
              const pType = partDef.type || partDef.category;

              return (
                <group 
                  key={(part as any).id || (part as any).instanceId} 
                  ref={(el) => { customPartsRefs.current[(part as any).id || (part as any).instanceId] = el; }}
                  position={tr.world.position}
                  rotation={tr.world.rotation}
                >
                  <group name="visual-wrapper">
                    {visualKind === 'box' && (
                      <mesh castShadow receiveShadow>
                        <boxGeometry args={[w, h, d]} />
                        <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
                      </mesh>
                    )}
                    {visualKind === 'cylinder' && (
                      <group name="WheelSpinGroup" rotation={pType === 'wheel' ? [0, 0, Math.PI / 2] : [0, 0, 0]}>
                        <mesh castShadow receiveShadow>
                          <cylinderGeometry args={[w, h, d, 16]} />
                          <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
                        </mesh>
                        {/* Wheel details */}
                        {pType === 'wheel' && (
                          <>
                            <mesh castShadow position={[0, d / 2 + 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
                              <cylinderGeometry args={[w * 0.4, w * 0.4, 0.05, 8]} />
                              <meshStandardMaterial color="#555" metalness={0.9} />
                            </mesh>
                            {/* Rolling indicators */}
                            {[0, 1, 2, 3].map((b) => {
                              const angle = (b * Math.PI) / 2;
                              return (
                                <mesh 
                                  key={b} 
                                  castShadow 
                                  position={[Math.cos(angle) * w * 0.6, d / 2 + 0.02, Math.sin(angle) * w * 0.6]}
                                >
                                  <boxGeometry args={[0.04, 0.03, 0.04]} />
                                  <meshStandardMaterial color="#FFC107" metalness={0.9} />
                                </mesh>
                              );
                            })}
                          </>
                        )}
                      </group>
                    )}
                    {visualKind === 'wedge' && (
                      <mesh castShadow receiveShadow>
                        <boxGeometry args={[w, h, d]} />
                        <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
                      </mesh>
                    )}
                    {visualKind === 'slope' && (
                      <mesh castShadow receiveShadow>
                        <boxGeometry args={[w, h, d]} />
                        <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
                      </mesh>
                    )}
                    {visualKind === 'capsule' && (
                      <mesh castShadow receiveShadow rotation={[0, 0, Math.PI/2]}>
                        <capsuleGeometry args={[w/2, h, 16, 16]} />
                        <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
                      </mesh>
                    )}
                    {(!visualKind || (visualKind !== 'box' && visualKind !== 'cylinder')) && (
                      <mesh castShadow receiveShadow>
                        <boxGeometry args={[w, h, d]} />
                        <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
                      </mesh>
                    )}
                    {visualKind === 'wedge' && (
                      <WedgeMesh size={[w,h,d]} color={color} />
                    )}
                  </group>
                </group>
              );
            })}
          </group>
        )}

        {!isCustom && (
          <group position={[0, 0.4, 0]}>
          {/* Main body rear (rendered for non-drum bots, as drum bot has a layered modular assembly) */}
          {actualWeaponType !== 'drum' && damageComponents?.rear?.visualState !== 'detached' && (
            <mesh castShadow receiveShadow position={[0, 0, 0.25]}>
              <boxGeometry args={[1.5, 0.4, 1.5]} />
              <meshStandardMaterial color={actualColor} metalness={0.8} roughness={0.2} />
            </mesh>
          )}
          
          {/* Weapon-specific customized front chassis plates (eliminates overlapping flipper scoop issues) */}
          {actualWeaponType === 'hammer' && damageComponents?.front?.visualState !== 'detached' && (
            <mesh castShadow receiveShadow position={[0, -0.05, -0.85]} rotation={[0.25, 0, 0]}>
              <boxGeometry args={[1.5, 0.1, 1.2]} />
              <meshStandardMaterial color={actualColor} metalness={0.8} roughness={0.2} />
            </mesh>
          )}

          {(actualWeaponType === 'spinner' || actualWeaponType === 'saw') && damageComponents?.front?.visualState !== 'detached' && (
            <>
              {/* Corner split protective bumpers (leaves center 100% clear for spinning blade clearances) */}
              <mesh castShadow receiveShadow position={[-0.6, -0.05, -0.85]} rotation={[0.25, 0.1, 0]}>
                <boxGeometry args={[0.3, 0.1, 1.0]} />
                <meshStandardMaterial color={actualColor} metalness={0.8} roughness={0.2} />
              </mesh>
              <mesh castShadow receiveShadow position={[0.6, -0.05, -0.85]} rotation={[0.25, -0.1, 0]}>
                <boxGeometry args={[0.3, 0.1, 1.0]} />
                <meshStandardMaterial color={actualColor} metalness={0.8} roughness={0.2} />
              </mesh>
            </>
          )}

          {/* Elite Upgrade 5: Layered drum-vehicle visual assembly with high-fidelity components */}
          {actualWeaponType === 'drum' && (
            <group name="LayeredDrumChassis">
              {/* 1. Structural Truss Chassis Frame */}
              <group name="StructuralChassisFrame">
                {/* Heavy duty lower monocoque tub */}
                <mesh castShadow receiveShadow position={[0, -0.05, 0.25]}>
                  <boxGeometry args={[1.2, 0.32, 1.4]} />
                  <meshStandardMaterial color="#17181a" metalness={0.95} roughness={0.4} />
                </mesh>
                {/* Lateral structural braces (Steel rods) */}
                <mesh castShadow position={[-0.58, 0.1, 0.25]}>
                  <boxGeometry args={[0.06, 0.06, 1.3]} />
                  <meshStandardMaterial color="#3a3c3e" metalness={0.9} roughness={0.1} />
                </mesh>
                <mesh castShadow position={[0.58, 0.1, 0.25]}>
                  <boxGeometry args={[0.06, 0.06, 1.3]} />
                  <meshStandardMaterial color="#3a3c3e" metalness={0.9} roughness={0.1} />
                </mesh>
                {/* Heavy engine frame enclosure */}
                <mesh castShadow position={[0, 0.15, 0.75]}>
                  <boxGeometry args={[0.75, 0.22, 0.35]} />
                  <meshStandardMaterial color="#0b0c0d" metalness={0.85} roughness={0.6} />
                </mesh>
              </group>

              {/* 2. Dynamic Armor Panels with high-fidelity damage response */}
              {/* Top Deflector Shield - completely detaches (blown off) when health < 45% */}
              {botHealth >= 45 && (
                <group 
                  name="TopArmorDeflector"
                  position={[0, 0.25 - damageFactor * 0.05, -0.3 + damageFactor * 0.1]}
                  rotation={[0.1 + damageFactor * 0.15, damageFactor * 0.1, 0]}
                >
                  <mesh castShadow receiveShadow>
                    <boxGeometry args={[1.45, 0.08, 0.85]} />
                    <meshStandardMaterial 
                      color={actualColor} 
                      metalness={0.8} 
                      roughness={0.18} 
                      emissive={damageFactor > 0.35 ? "#FF1500" : "#000000"}
                      emissiveIntensity={damageFactor * 0.4}
                    />
                  </mesh>
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
                  name="LeftResponsiveArmor"
                  position={[-0.78, damageFactor > 0.3 ? -damageFactor * 0.12 : 0, 0.25]}
                  rotation={[0, 0, damageFactor > 0.3 ? -damageFactor * 0.25 : 0]}
                >
                  <mesh castShadow receiveShadow>
                    <boxGeometry args={[0.08, 0.36, 1.35]} />
                    <meshStandardMaterial 
                      color="#252525" 
                      metalness={0.95} 
                      roughness={0.3} 
                      emissive={damageFactor > 0.4 ? "#3d1100" : "#000000"}
                    />
                  </mesh>
                </group>
              )}

              {/* Right Side Armor plate sags & deforms as health drops */}
              {damageFactor <= 0.85 && (
                <group 
                  name="RightResponsiveArmor"
                  position={[0.78, damageFactor > 0.5 ? -damageFactor * 0.16 : 0, 0.25]}
                  rotation={[0, 0, damageFactor > 0.5 ? damageFactor * 0.32 : 0]}
                >
                  <mesh castShadow receiveShadow>
                    <boxGeometry args={[0.08, 0.36, 1.35]} />
                    <meshStandardMaterial 
                      color="#252525" 
                      metalness={0.95} 
                      roughness={0.3} 
                      emissive={damageFactor > 0.6 ? "#3d1100" : "#000000"}
                    />
                  </mesh>
                </group>
              )}

              {/* Rear Bumper protection sags and tilts */}
              <group 
                name="RearResponsiveBumper"
                position={[0, -0.05 - damageFactor * 0.1, 0.95]}
                rotation={[damageFactor > 0.45 ? damageFactor * 0.22 : 0, 0, 0]}
              >
                <mesh castShadow receiveShadow>
                  <boxGeometry args={[1.4, 0.22, 0.14]} />
                  <meshStandardMaterial color="#141414" metalness={0.8} roughness={0.5} />
                </mesh>
              </group>

              {/* 3. Heavy Drum Mount Frame */}
              <group name="HeavyDrumMount" position={[0, -0.1, -0.75]}>
                {/* Dual supporting arm brackets */}
                <mesh castShadow position={[-0.64, 0, 0]}>
                  <boxGeometry args={[0.15, 0.35, 0.82]} />
                  <meshStandardMaterial color="#1e1f22" metalness={0.9} roughness={0.3} />
                </mesh>
                <mesh castShadow position={[0.64, 0, 0]}>
                  <boxGeometry args={[0.15, 0.35, 0.82]} />
                  <meshStandardMaterial color="#1e1f22" metalness={0.9} roughness={0.3} />
                </mesh>
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
              <mesh castShadow receiveShadow position={[-0.35, -0.1, -0.9]} rotation={[0.05, 0.15, 0]}>
                <boxGeometry args={[0.1, 0.08, 0.9]} />
                <meshStandardMaterial color="#444" metalness={0.9} roughness={0.1} />
              </mesh>
              <mesh castShadow receiveShadow position={[0.35, -0.1, -0.9]} rotation={[0.05, -0.15, 0]}>
                <boxGeometry args={[0.1, 0.08, 0.9]} />
                <meshStandardMaterial color="#444" metalness={0.9} roughness={0.1} />
              </mesh>
            </>
          )}
          
          {/* Side armor panels (rendered only for non-drum bots, as drum has custom responsive side plates) */}
          {actualWeaponType !== 'drum' && damageComponents?.rear?.visualState !== 'detached' && (
            <>
              <mesh castShadow receiveShadow position={[0.8, 0, 0]}>
                <boxGeometry args={[0.15, 0.5, 2.1]} />
                <meshStandardMaterial color="#333" metalness={0.9} roughness={0.3} />
              </mesh>
              <mesh castShadow receiveShadow position={[-0.8, 0, 0]}>
                <boxGeometry args={[0.15, 0.5, 2.1]} />
                <meshStandardMaterial color="#333" metalness={0.9} roughness={0.3} />
              </mesh>
            </>
          )}

          {/* Engine block (rendered only for non-drum bots, as drum has custom frame pack) */}
          {actualWeaponType !== 'drum' && damageComponents?.rear?.visualState !== 'detached' && (
            <mesh castShadow position={[0, 0.25, 0.8]}>
              <boxGeometry args={[0.8, 0.2, 0.4]} />
              <meshStandardMaterial color="#222" metalness={0.9} roughness={0.6} />
            </mesh>
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
                  <mesh castShadow receiveShadow>
                    <boxGeometry args={[1.35, 0.05, 1.15]} />
                    <meshStandardMaterial color={actualColor} metalness={0.8} roughness={0.3} />
                  </mesh>
                  {/* Hardened steel wedge teeth */}
                  <mesh castShadow position={[0.5, -0.01, -0.6]}>
                    <boxGeometry args={[0.2, 0.03, 0.2]} />
                    <meshStandardMaterial color="#888" metalness={0.9} roughness={0.1} />
                  </mesh>
                  <mesh castShadow position={[-0.5, -0.01, -0.6]}>
                    <boxGeometry args={[0.2, 0.03, 0.2]} />
                    <meshStandardMaterial color="#888" metalness={0.9} roughness={0.1} />
                  </mesh>
                  <mesh castShadow position={[0, -0.01, -0.6]}>
                    <boxGeometry args={[0.2, 0.03, 0.2]} />
                    <meshStandardMaterial color="#888" metalness={0.9} roughness={0.1} />
                  </mesh>
                </group>
              </group>

              {/* Pneumatic Cylinder (Chassis Mount) */}
              <group ref={pistonCylinderRef}>
                {/* Cylinder mounting block */}
                <mesh castShadow position={[0, 0, 0]}>
                  <boxGeometry args={[0.18, 0.12, 0.12]} />
                  <meshStandardMaterial color="#222" metalness={0.8} roughness={0.4} />
                </mesh>
                {/* Main cylinder body */}
                <mesh castShadow position={[0, 0, 0.225]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.075, 0.075, 0.45, 16]} />
                  <meshStandardMaterial color="#aaa" metalness={0.95} roughness={0.1} />
                </mesh>
              </group>

              {/* Pneumatic Piston Rod (Arm Mount) */}
              <group ref={pistonRodRef}>
                {/* Rod mounting block */}
                <mesh castShadow position={[0, 0, 0]}>
                  <boxGeometry args={[0.12, 0.08, 0.08]} />
                  <meshStandardMaterial color="#333" metalness={0.8} roughness={0.4} />
                </mesh>
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
              <mesh castShadow position={[0.45, 0.0, 0.2]} rotation={[0, 0, 0.12]}>
                <boxGeometry args={[0.1, 0.6, 0.25]} />
                <meshStandardMaterial color="#333" metalness={0.8} roughness={0.4} />
              </mesh>
              <mesh castShadow position={[-0.45, 0.0, 0.2]} rotation={[0, 0, -0.12]}>
                <boxGeometry args={[0.1, 0.6, 0.25]} />
                <meshStandardMaterial color="#333" metalness={0.8} roughness={0.4} />
              </mesh>
              
              {/* Main horizontal axle pin */}
              <mesh castShadow position={[0, 0.25, 0.2]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.06, 0.06, 1.0, 16]} />
                <meshStandardMaterial color="#222" metalness={0.9} roughness={0.2} />
              </mesh>

              {/* Sledgehammer arm and head group (pivots around axle) */}
              <group ref={weaponRef} position={[0, 0.25, 0.2]}>
                {/* Heavy mechanical arm extending up/forward */}
                <mesh castShadow position={[0, 0.6, 0]}>
                  <boxGeometry args={[0.08, 1.2, 0.08]} />
                  <meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} />
                </mesh>
                
                {/* Sledgehammer massive double-sided head */}
                <group position={[0, 1.2, 0]}>
                  <mesh castShadow>
                    <boxGeometry args={[0.55, 0.32, 0.7]} />
                    <meshStandardMaterial color={actualColor} metalness={0.8} roughness={0.3} />
                  </mesh>
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
                      <mesh castShadow>
                        <boxGeometry args={[0.15, 0.12, 0.15]} />
                        <meshStandardMaterial color="#444" metalness={0.9} roughness={0.2} />
                      </mesh>
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
              <mesh castShadow position={[0, -0.22, -0.95]}>
                <boxGeometry args={[0.7, 0.08, 0.9]} />
                <meshStandardMaterial color="#222" metalness={0.8} roughness={0.4} />
              </mesh>
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
                <mesh castShadow position={[0, 0.1, -0.45]} rotation={[-Math.PI / 10, 0, 0]}>
                  <boxGeometry args={[0.22, 0.22, 0.9]} />
                  <meshStandardMaterial color={actualColor} metalness={0.8} roughness={0.3} />
                </mesh>
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
              <mesh castShadow position={[0.85, 0, 0]}>
                <boxGeometry args={[0.3, 0.1, 0.18]} />
                <meshStandardMaterial color="#FFC107" metalness={0.9} />
              </mesh>
              <mesh castShadow position={[-0.85, 0, 0]}>
                <boxGeometry args={[0.3, 0.1, 0.18]} />
                <meshStandardMaterial color="#FFC107" metalness={0.9} />
              </mesh>
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
                  <mesh 
                    key={i}
                    castShadow 
                    position={[Math.cos(angle) * 0.85, 0, Math.sin(angle) * 0.85]} 
                    rotation={[0, -angle, 0]}
                  >
                    <boxGeometry args={[0.1, 0.02, 0.1]} />
                    <meshStandardMaterial color="#aaa" metalness={0.9} />
                  </mesh>
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
                    
                    const targetWeightMult = (isPlayer ? opponentConfig.armor.weight : config.armor.weight) / 100;
                    const pushForce = 0.5 * Math.abs(currentRPM.current) * settings.impactImpulseScale / targetWeightMult;
                    
                    targetRef.current.applyImpulse({ x: dnx * pushForce, y: 8 * settings.impactImpulseScale / targetWeightMult, z: dnz * pushForce }, true);
                    bodyRef.current.applyImpulse({ x: -dnx * pushForce * 0.4, y: 0, z: -dnz * pushForce * 0.4 }, true);
                    
                    const pos = bodyRef.current.translation();
                    const impactVector = [dnx * pushForce * 0.5, 5, dnz * pushForce * 0.5] as [number, number, number];
                    useGameStore.getState().spawnDebris([pos.x, pos.y, pos.z], finalDamage * 10, impactVector);
                    useGameStore.getState().spawnSparks([pos.x, pos.y, pos.z], Math.floor(finalDamage * 5), '#FFAA00');
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
                    const targetWeightMult = (isPlayer ? opponentConfig.armor.weight : config.armor.weight) / 100;
                    
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
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.42, 0.42, 0.3, 16]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
            </mesh>
            <mesh castShadow position={[-0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.1, 0.1, 0.4, 8]} />
              <meshStandardMaterial color="#555" metalness={0.8} />
            </mesh>
            {/* Visual contrast radial bolt indicators */}
            {[0, 1, 2, 3].map((b) => {
              const angle = (b * Math.PI) / 2;
              return (
                <mesh 
                  key={b} 
                  castShadow 
                  position={[0.16, Math.cos(angle) * 0.22, Math.sin(angle) * 0.22]}
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
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.42, 0.42, 0.3, 16]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
            </mesh>
            <mesh castShadow position={[0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.1, 0.1, 0.4, 8]} />
              <meshStandardMaterial color="#555" metalness={0.8} />
            </mesh>
            {[0, 1, 2, 3].map((b) => {
              const angle = (b * Math.PI) / 2;
              return (
                <mesh 
                  key={b} 
                  castShadow 
                  position={[-0.16, Math.cos(angle) * 0.22, Math.sin(angle) * 0.22]}
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
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.42, 0.42, 0.3, 16]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
            </mesh>
            <mesh castShadow position={[-0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.1, 0.1, 0.4, 8]} />
              <meshStandardMaterial color="#555" metalness={0.8} />
            </mesh>
            {[0, 1, 2, 3].map((b) => {
              const angle = (b * Math.PI) / 2;
              return (
                <mesh 
                  key={b} 
                  castShadow 
                  position={[0.16, Math.cos(angle) * 0.22, Math.sin(angle) * 0.22]}
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
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.42, 0.42, 0.3, 16]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
            </mesh>
            <mesh castShadow position={[0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.1, 0.1, 0.4, 8]} />
              <meshStandardMaterial color="#555" metalness={0.8} />
            </mesh>
            {[0, 1, 2, 3].map((b) => {
              const angle = (b * Math.PI) / 2;
              return (
                <mesh 
                  key={b} 
                  castShadow 
                  position={[-0.16, Math.cos(angle) * 0.22, Math.sin(angle) * 0.22]}
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
    </>
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
  const dummyObj = useMemo(() => new THREE.Object3D(), []);

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
        const stretch = Math.max(1.0, speedSq * 0.015);
        dummyObj.scale.set(p.size, p.size, p.size * stretch);
        
        if (speedSq > 0.1) {
          dummyObj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.vel.clone().normalize());
        } else {
          dummyObj.quaternion.set(0, 0, 0, 1);
        }
        
        dummyObj.updateMatrix();
        sparksMeshRef.current.setMatrixAt(i, dummyObj.matrix);

        const fade = Math.max(0, 1 - (p.age / p.maxAge));
        const col = p.color.clone().multiplyScalar(fade * 3.5);
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

    if (smokeMeshRef.current) {
      const count = smokeParticles.current.length;
      smokeMeshRef.current.count = count;
      for (let i = 0; i < count; i++) {
        const p = smokeParticles.current[i];
        dummyObj.position.copy(p.pos);
        const pct = p.age / p.maxAge;
        const size = p.startSize + (p.targetSize - p.startSize) * pct;
        dummyObj.scale.set(size, size, size);
        dummyObj.rotation.set(p.rot * 0.25, p.rot, p.rot * 0.45);
        dummyObj.updateMatrix();
        smokeMeshRef.current.setMatrixAt(i, dummyObj.matrix);

        // color shifting
        let r = 0.25, g = 0.25, b = 0.25;
        let intensity = 1.0;
        if (p.isFire) {
          if (pct < 0.25) {
            r = 1.0; g = 0.95; b = 0.6; intensity = 3.2;
          } else if (pct < 0.55) {
            r = 1.0; g = 0.38; b = 0.02; intensity = 2.0;
          } else {
            r = 0.15; g = 0.15; b = 0.15; intensity = 0.55;
          }
        } else {
          const shade = 0.15 + 0.15 * (1.0 - pct);
          r = shade; g = shade; b = shade; intensity = 0.75;
        }

        const fade = Math.max(0, 1 - pct);
        const col = new THREE.Color(r, g, b).multiplyScalar(intensity * fade);
        smokeMeshRef.current.setColorAt(i, col);
      }
      if (count > 0) {
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

      <instancedMesh ref={sparksMeshRef} args={[undefined, undefined, 400]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} blending={THREE.AdditiveBlending} transparent opacity={0.9} />
      </instancedMesh>

      <instancedMesh ref={smokeMeshRef} args={[undefined, undefined, 200]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial 
          toneMapped={false} 
          roughness={0.95} 
          metalness={0.02} 
          transparent 
          opacity={0.35} 
          blending={THREE.NormalBlending}
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
  const settings = useGameStore(s => s.settings);

  return (
    <group>
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
  const battleStatus = useGameStore(s => s.battleStatus);
  const matchCount = useGameStore(s => s.matchCount);
  const settings = useGameStore(s => s.settings);
  const [debugPhysics, setDebugPhysics] = useState(false);

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
    <div className="absolute inset-0 z-0 bg-[#121212]">
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
          <mesh position={[0, 0, -15.02]}>
            <boxGeometry args={[30.1, 0.08, 0.08]} />
            <meshBasicMaterial color="#00E5FF" toneMapped={false} />
          </mesh>
          {/* Orange front light tube */}
          <mesh position={[0, 0, 15.02]}>
            <boxGeometry args={[30.1, 0.08, 0.08]} />
            <meshBasicMaterial color="#FF5500" toneMapped={false} />
          </mesh>
          {/* Cyan/Blue left light tube */}
          <mesh position={[-15.02, 0, 0]}>
            <boxGeometry args={[0.08, 0.08, 30.1]} />
            <meshBasicMaterial color="#00E5FF" toneMapped={false} />
          </mesh>
          {/* Orange right light tube */}
          <mesh position={[15.02, 0, 0]}>
            <boxGeometry args={[0.08, 0.08, 30.1]} />
            <meshBasicMaterial color="#FF5500" toneMapped={false} />
          </mesh>
        </group>
        
        <ContactShadows position={[0, 0.02, 0]} opacity={0.6} scale={50} blur={2.5} far={5} />

        <Physics timeStep={1 / 60} interpolate updatePriority={-1} debug={debugPhysics} gravity={[0, -29.43, 0]}>
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
            <mesh position={[0, 1.25, -15.5]} receiveShadow castShadow>
              <boxGeometry args={[30, 2.5, 1]} />
              <meshStandardMaterial color="#2d2d2d" roughness={0.9} />
            </mesh>
            
            <CuboidCollider args={[15, 2.5, 0.5]} position={[0, 1.25, 15.5]} friction={0.9} restitution={0.12} />
            <mesh position={[0, 1.25, 15.5]} receiveShadow castShadow>
              <boxGeometry args={[30, 2.5, 1]} />
              <meshStandardMaterial color="#2d2d2d" roughness={0.9} />
            </mesh>
            
            <CuboidCollider args={[0.5, 2.5, 15]} position={[-15.5, 1.25, 0]} friction={0.9} restitution={0.12} />
            <mesh position={[-15.5, 1.25, 0]} receiveShadow castShadow>
              <boxGeometry args={[1, 2.5, 30]} />
              <meshStandardMaterial color="#2d2d2d" roughness={0.9} />
            </mesh>
            
            <CuboidCollider args={[0.5, 2.5, 15]} position={[15.5, 1.25, 0]} friction={0.9} restitution={0.12} />
            <mesh position={[15.5, 1.25, 0]} receiveShadow castShadow>
              <boxGeometry args={[1, 2.5, 30]} />
              <meshStandardMaterial color="#2d2d2d" roughness={0.9} />
            </mesh>
          </RigidBody>

          {/* Interactive Bots */}
          <Bot 
            key={matchCount + '-player'}
            position={[0, 0.5, 6]} 
            color="#444" 
            isSpinning={activeWeapon} 
            isPlayer={true} 
            bodyRef={playerRef} 
            targetRef={opponentRef}
          />
          <Bot 
            key={matchCount + '-opponent'}
            position={[0, 0.5, -6]} 
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
    </div>
  );
};
