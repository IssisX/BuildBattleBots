const fs = require('fs');
let arena = fs.readFileSync('src/components/Arena3D.tsx', 'utf8');

const visualsCode = `
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
`;

arena = arena.replace('const Bot = ({ ', visualsCode + '\nconst Bot = ({ ');

arena = arena.replace('        <group ref={visualRootRef}>', '        <group ref={visualRootRef}>\n          <BotDamageVisuals botId={isPlayer ? "player" : "opponent"} />');

fs.writeFileSync('src/components/Arena3D.tsx', arena);
