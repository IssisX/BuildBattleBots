
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
  showSockets?: boolean;
  onSelectPart?: (instanceId: string) => void;
}

const createRoundedBoxGeometry = (w: number, h: number, d: number, radius: number = 0.03, bevel: number = 0.008) => {
  const shape = new THREE.Shape();
  const width = Math.max(0.01, w - radius * 2);
  const height = Math.max(0.01, h - radius * 2);
  const x = -width / 2;
  const y = -height / 2;

  shape.moveTo(x, y + radius);
  shape.lineTo(x, y + height);
  shape.quadraticCurveTo(x, y + height + radius, x + radius, y + height + radius);
  shape.lineTo(x + width, y + height + radius);
  shape.quadraticCurveTo(x + width + radius, y + height + radius, x + width + radius, y + height);
  shape.lineTo(x + width + radius, y + radius);
  shape.quadraticCurveTo(x + width + radius, y, x + width, y);
  shape.lineTo(x + radius, y);
  shape.quadraticCurveTo(x, y, x, y + radius);

  const extrudeSettings = {
    depth: Math.max(0.01, d - bevel * 2),
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 12
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.center();
  return geo;
};

const createWedgeGeometry = (w: number, h: number, d: number) => {
  const shape = new THREE.Shape();
  const bevel = 0.015;
  // Triangular profile on Z-Y plane
  shape.moveTo(-d/2 + bevel, -h/2 + bevel);
  shape.lineTo(d/2 - bevel, -h/2 + bevel);
  shape.lineTo(d/2 - bevel, h/2 - bevel);
  shape.closePath();

  const extrudeSettings = {
    depth: Math.max(0.01, w - bevel * 2),
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: bevel,
    bevelThickness: bevel
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.center();
  geo.rotateY(Math.PI / 2);
  return geo;
};

const PartMesh = ({ part, worldPos, worldRot, def, onSelectPart }: { part: PlacedBotPart, worldPos: [number, number, number], worldRot: [number, number, number], def: BotPartDefinition, onSelectPart?: (id: string) => void }) => {
  const [w, h, d] = def.dimensions || (def as any).size || [1, 1, 1];
  const color = part.color || def.color || '#888';

  const geom = useMemo(() => {
    try {
      if (def.visualKind === 'box' || !def.visualKind) {
        return createRoundedBoxGeometry(w, h, d, Math.min(w, h, d, 0.04), 0.01);
      }
      if (def.visualKind === 'wedge' || def.visualKind === 'slope') {
        return createWedgeGeometry(w, h, d);
      }
    } catch (err) {
      console.error("Failed to construct advanced geometry, falling back.", err);
    }
    return null;
  }, [w, h, d, def.visualKind]);
  
  return (
    <group 
      position={worldPos} 
      rotation={worldRot}
      {...(onSelectPart ? {
        onClick: (e) => {
          e.stopPropagation();
          onSelectPart(part.instanceId);
        }
      } : {})}
    >
      {(def.visualKind === 'box' || !def.visualKind) && geom && (
        <mesh castShadow receiveShadow geometry={geom}>
          <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
        </mesh>
      )}
      {(def.visualKind === 'wedge' || def.visualKind === 'slope') && geom && (
        <mesh castShadow receiveShadow geometry={geom}>
          <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
        </mesh>
      )}
      {/* If advanced geometry failed or was not generated, fall back */}
      {(def.visualKind === 'box' || !def.visualKind) && !geom && (
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
        </mesh>
      )}
      {(def.visualKind === 'wedge' || def.visualKind === 'slope') && !geom && (
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
                {/* Metallic Alloy Rim */}
                <mesh castShadow position={[0, d / 2 + 0.005, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[w * 0.65, w * 0.65, d + 0.01, 16]} />
                  <meshStandardMaterial color="#2a2a2a" metalness={0.9} roughness={0.1} />
                </mesh>
                {/* Chrome Hub Cap */}
                <mesh castShadow position={[0, d / 2 + 0.015, 0]} rotation={[Math.PI / 2, 0, 0]}>
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
      {def.visualKind === 'capsule' && (
        <mesh castShadow receiveShadow rotation={[0, 0, Math.PI/2]}>
          <capsuleGeometry args={[h/2, Math.max(0.01, w - h), 16, 16]} />
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
              const isHovered = hoveredSocketId === `${part.instanceId}:${cp.id}`;
              
              // Determine color based on type and status
              let socketColor = '#ffffff';
              if (isSelected) {
                socketColor = '#FF5500'; // High-contrast select orange
              } else if (isHovered) {
                socketColor = '#FF9100'; // Hover glow orange
              } else if (isOccupied) {
                socketColor = '#424242'; // Neutral dark grey for occupied
              } else {
                switch (cp.socketType) {
                  case 'wheel':
                    socketColor = '#00E5FF'; // Neon Cyan
                    break;
                  case 'weapon':
                    socketColor = '#FF1744'; // Hot Crimson Red
                    break;
                  case 'armor':
                    socketColor = '#FFEA00'; // Electric Gold
                    break;
                  default:
                    socketColor = '#00E676'; // Cyber Green
                }
              }

              const size = isSelected ? 0.08 : isHovered ? 0.065 : 0.045;

              return (
                <group key={cp.id} position={[cp.x || 0, cp.y || 0, cp.z || 0]}>
                  {/* Invisible larger hit target (0.18 units radius, which is 18cm) for extremely easy clicking/tapping */}
                  <mesh
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
                    <sphereGeometry args={[0.18, 16, 16]} />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                  </mesh>

                  {/* Visible glowing node indicator */}
                  <mesh>
                    <sphereGeometry args={[size, 16, 16]} />
                    <meshBasicMaterial 
                      color={socketColor} 
                      transparent 
                      opacity={isSelected || isHovered ? 1.0 : isOccupied ? 0.35 : 0.75} 
                      depthTest={false} // Always render on top so user can see nodes through other parts
                    />
                  </mesh>
                  
                  {isSelected && (
                    <group>
                      <mesh rotation={[Math.PI / 2, 0, 0]}>
                        <ringGeometry args={[0.09, 0.12, 32]} />
                        <meshBasicMaterial color="#FF5500" side={THREE.DoubleSide} transparent opacity={0.8} depthTest={false} />
                      </mesh>
                      <mesh rotation={[0, Math.PI / 2, 0]}>
                        <ringGeometry args={[0.09, 0.12, 32]} />
                        <meshBasicMaterial color="#FF5500" side={THREE.DoubleSide} transparent opacity={0.8} depthTest={false} />
                      </mesh>
                    </group>
                  )}
                  
                  {(isSelected || isHovered) && (
                    <Html position={[0, 0.22, 0]} center>
                      <div className={`flex flex-col items-center p-2 rounded text-[9px] font-mono whitespace-nowrap pointer-events-none z-50 border shadow-2xl backdrop-blur-md transition-all duration-300 ${
                        isSelected 
                          ? 'bg-[#FF5500] text-white border-white/40' 
                          : 'bg-black/90 text-[#FF9100] border-[#FF9100]/30'
                      }`}>
                        <div className="font-bold tracking-wider flex items-center gap-1.5">
                          <span className="opacity-80">[{cp.socketType.toUpperCase()}]</span>
                          <span>{cp.id.replace(/_/g, ' ').toUpperCase()}</span>
                        </div>
                        <div className="text-[8px] opacity-70 mt-1 uppercase font-semibold">
                          {isOccupied ? '⚠️ OCCUPIED' : '🟢 AVAILABLE'}
                        </div>
                      </div>
                    </Html>
                  )}
                </group>
              );
            })}
          </group>
        );
      })}
    </>
  );
};

export const WorkshopCanvas = ({ parts, selectedSocketId, onSelectSocket, resolvedTransforms, showSockets = true, onSelectPart }: WorkshopCanvasProps) => {
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
          return <PartMesh key={part.instanceId} part={part} worldPos={tr.world.position} worldRot={tr.world.rotation} def={def as any} onSelectPart={onSelectPart} />;
        })}
        
        {showSockets && (
          <SocketsOverlay 
            parts={parts}
            resolvedTransforms={resolvedTransforms}
            selectedSocketId={selectedSocketId} 
            onSelectSocket={onSelectSocket} 
          />
        )}

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
