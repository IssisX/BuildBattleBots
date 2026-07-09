
import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, Html } from '@react-three/drei';
import * as THREE from 'three';
import { PlacedBotPart, ResolvedPartTransform, BotPartDefinition } from '../../types';
import { PART_TEMPLATES } from '../../lib/partsCatalog';

interface WorkshopCanvasProps {
  parts: PlacedBotPart[];
  selectedSocketId: string | null;
  onSelectSocket: (id: string | null) => void;
  resolvedTransforms: ResolvedPartTransform[];
}

const PartMesh = ({ part, worldPos, worldRot, def }: { part: PlacedBotPart, worldPos: [number, number, number], worldRot: [number, number, number], def: BotPartDefinition }) => {
  const [w, h, d] = def.dimensions || (def as any).size || [1, 1, 1];
  const color = part.color || def.color || '#888';
  
  return (
    <group position={worldPos} rotation={worldRot}>
      {def.visualKind === 'box' && (
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
        </mesh>
      )}
      {def.visualKind === 'cylinder' && (
        part.definitionId === 'weapon_drum' ? (
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
        ) : (
          <group name="WheelSpinGroup" rotation={(def.category === 'wheel' || (def as any).type === 'wheel') ? [0, 0, Math.PI / 2] : [0, 0, 0]}>
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[w, w, d, 24]} />
              <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
            </mesh>
            {/* Wheel details for premium visual look */}
            {(def.category === 'wheel' || (def as any).type === 'wheel') && (
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
        )
      )}
      {def.visualKind === 'wedge' && (
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
        </mesh>
      )}
      {def.visualKind === 'slope' && (
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
        </mesh>
      )}
      {def.visualKind === 'capsule' && (
        <mesh castShadow receiveShadow rotation={[0, 0, Math.PI/2]}>
          <capsuleGeometry args={[w/2, h, 16, 16]} />
          <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
        </mesh>
      )}
      {!def.visualKind && (
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
        </mesh>
      )}
      
      {def.colliders && def.colliders.map((col, idx) => (
        <group key={`col-${idx}`} position={col.localPosition} rotation={col.localRotation}>
          <lineSegments>
            <edgesGeometry args={[
              col.kind === 'box' || col.kind === 'wedge' ? new THREE.BoxGeometry(col.dimensions[0], col.dimensions[1], col.dimensions[2]) :
              col.kind === 'cylinder' ? new THREE.CylinderGeometry(col.dimensions[0], col.dimensions[0], col.dimensions[1], 16) :
              new THREE.CapsuleGeometry(col.dimensions[0], col.dimensions[1], 8, 16)
            ]} />
            <lineBasicMaterial color="#00ffcc" transparent opacity={0.3} />
          </lineSegments>
        </group>
      ))}

      <lineSegments>
        <edgesGeometry args={[
          (def.visualKind === 'cylinder' || def.shape === 'cylinder') ? new THREE.CylinderGeometry(w, w, d, 24) : new THREE.BoxGeometry(w, h, d)
        ]} />
        <lineBasicMaterial color="black" linewidth={2} transparent opacity={0.5} />
      </lineSegments>
    </group>
  );
};

const SocketsOverlay = ({ 
  parts, 
  resolvedTransforms,
  selectedSocketId, 
  onSelectSocket 
}: WorkshopCanvasProps) => {
  const [hoveredSocketId, setHoveredSocketId] = React.useState<string | null>(null);
  return (
    <>
      {parts.map(part => {
        const tr = resolvedTransforms.find(r => r.instanceId === part.instanceId);
        if (!tr) return null;
        const def = PART_TEMPLATES.find(t => t.templateId === part.definitionId);
        if (!def) return null;

        return (
          <group key={`sockets-${part.instanceId}`} position={tr.world.position} rotation={tr.world.rotation}>
            {def.connectionPoints.map(cp => {
              const isSelected = selectedSocketId === `${part.instanceId}:${cp.id}`;
              const isOccupied = parts.some(p => p.parentInstanceId === part.instanceId && p.parentSocketId === cp.id);
              
              return (
                <mesh
                  key={cp.id}
                  position={[cp.x || 0, cp.y || 0, cp.z || 0]}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSocket(`${part.instanceId}:${cp.id}`);
                  }}
                  onPointerOver={(e) => {
                    e.stopPropagation();
                    document.body.style.cursor = 'pointer';
                    setHoveredSocketId(`${part.instanceId}:${cp.id}`);
                  }}
                  onPointerOut={(e) => {
                    document.body.style.cursor = 'default';
                    setHoveredSocketId(null);
                  }}
                >
                  <sphereGeometry args={[isSelected ? 0.08 : hoveredSocketId === `${part.instanceId}:${cp.id}` ? 0.06 : 0.05, 16, 16]} />
                  <meshBasicMaterial 
                    color={isSelected ? '#FF5500' : isOccupied ? '#1976D2' : hoveredSocketId === `${part.instanceId}:${cp.id}` ? '#FFB74D' : '#ffffff'} 
                    transparent 
                    opacity={isSelected || hoveredSocketId === `${part.instanceId}:${cp.id}` ? 1 : isOccupied ? 0.8 : 0.4} 
                  />
                  
                  {isSelected && (
                    <mesh>
                      <ringGeometry args={[0.1, 0.12, 32]} />
                      <meshBasicMaterial color="#FF5500" side={THREE.DoubleSide} />
                    </mesh>
                  )}
                  
                  {(isSelected || hoveredSocketId === `${part.instanceId}:${cp.id}`) && (
                    <Html position={[0, 0.15, 0]} center>
                      <div className="bg-black/80 border border-[#FFB74D] text-[#FFB74D] text-[10px] font-mono px-2 py-0.5 rounded whitespace-nowrap pointer-events-none z-50">
                        {cp.socketType.toUpperCase()} SOCKET
                      </div>
                    </Html>
                  )}
                </mesh>
              );
            })}
          </group>
        );
      })}
    </>
  );
};

export const WorkshopCanvas = ({ parts, selectedSocketId, onSelectSocket, resolvedTransforms }: WorkshopCanvasProps) => {
  const com = useMemo(() => {
    let totalMass = 0;
    let sumX = 0, sumY = 0, sumZ = 0;
    parts.forEach(p => {
      const tr = resolvedTransforms.find(r => r.instanceId === p.instanceId);
      const def = PART_TEMPLATES.find(t => t.templateId === p.definitionId);
      if (tr && def) {
        totalMass += def.mass;
        sumX += tr.world.position[0] * def.mass;
        sumY += tr.world.position[1] * def.mass;
        sumZ += tr.world.position[2] * def.mass;
      }
    });
    if (totalMass === 0) return [0, 0, 0] as [number, number, number];
    return [sumX / totalMass, sumY / totalMass, sumZ / totalMass] as [number, number, number];
  }, [parts, resolvedTransforms]);

  return (
    <Canvas shadows camera={{ position: [0, 3, 5], fov: 45 }}>
      <color attach="background" args={['#080808']} />
      <fog attach="fog" args={['#080808', 5, 20]} />
      
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow shadow-bias={-0.001} />
      <pointLight position={[-5, 5, -5]} intensity={0.5} color="#00E5FF" />
      
      <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2 + 0.1} minDistance={2} maxDistance={10} />
      
      <Grid 
        infiniteGrid 
        fadeDistance={20} 
        sectionColor="#333333" 
        cellColor="#1a1a1a" 
        position={[0, -0.2, 0]} 
      />
      
      <Environment preset="city" />
      
      <group position={[0, 0, 0]}>
        {parts.map(part => {
          const tr = resolvedTransforms.find(r => r.instanceId === part.instanceId);
          if (!tr) return null;
          const def = PART_TEMPLATES.find(t => t.templateId === part.definitionId);
          if (!def) return null;
          return <PartMesh key={part.instanceId} part={part} worldPos={tr.world.position} worldRot={tr.world.rotation} def={def as any} />;
        })}
        
        <SocketsOverlay 
          parts={parts}
          resolvedTransforms={resolvedTransforms}
          selectedSocketId={selectedSocketId} 
          onSelectSocket={onSelectSocket} 
        />

        <mesh position={com}>
          <octahedronGeometry args={[0.1]} />
          <meshBasicMaterial color="#00E676" wireframe />
          <Html position={[0, 0.15, 0]} center>
             <div className="text-[#00E676] text-[8px] font-mono whitespace-nowrap opacity-60">CoM</div>
          </Html>
        </mesh>
      </group>
    </Canvas>
  );
};
