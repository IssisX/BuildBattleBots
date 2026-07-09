import sys

content = open('src/components/Arena3D.tsx').read()
start_marker = "{/* Wheels and Motors with Skid Steer rotation refs and outer radial bolts to display coin-like rolling motion clearly */}"
end_marker = "{isCustom && currentBotConfig.customConfig && currentBotConfig.customConfig.parts && ("

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

new_wheels = """        {/* Wheels and Motors with Skid Steer rotation refs and outer radial bolts to display coin-like rolling motion clearly */}
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
        
        <group ref={visualRootRef}>
          <BotDamageVisuals botId={isPlayer ? "player" : "opponent"} />
        """

open('src/components/Arena3D.tsx', 'w').write(content[:start_idx] + new_wheels + content[end_idx:])
