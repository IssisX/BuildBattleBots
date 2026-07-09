import sys
content = open('src/components/Arena3D.tsx').read()

target1 = """          {/* Front Right */}
          <group ref={frontRightWheelRef} position={[0.9, 0.4, -0.6]}>"""
replace1 = """          {/* Front Right */}
          {damageComponents?.right?.visualState !== 'detached' && (
          <group ref={frontRightWheelRef} position={[0.9, 0.4, -0.6]}>"""

target2 = """            {[0, 1, 2, 3].map((b) => {
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
          </group>"""
replace2 = """            {[0, 1, 2, 3].map((b) => {
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
          )}"""

target3 = """          {/* Front Left */}
          <group ref={frontLeftWheelRef} position={[-0.9, 0.4, -0.6]}>"""
replace3 = """          {/* Front Left */}
          {damageComponents?.left?.visualState !== 'detached' && (
          <group ref={frontLeftWheelRef} position={[-0.9, 0.4, -0.6]}>"""

target4 = """            {[0, 1, 2, 3].map((b) => {
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
          {/* Back Right */}"""
replace4 = """            {[0, 1, 2, 3].map((b) => {
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
          {/* Back Right */}"""

target5 = """          {/* Back Right */}
          <group ref={backRightWheelRef} position={[0.9, 0.4, 0.6]}>"""
replace5 = """          {/* Back Right */}
          {damageComponents?.right?.visualState !== 'detached' && (
          <group ref={backRightWheelRef} position={[0.9, 0.4, 0.6]}>"""

target6 = """            {[0, 1, 2, 3].map((b) => {
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
          {/* Back Left */}"""
replace6 = """            {[0, 1, 2, 3].map((b) => {
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
          {/* Back Left */}"""

target7 = """          {/* Back Left */}
          <group ref={backLeftWheelRef} position={[-0.9, 0.4, 0.6]}>"""
replace7 = """          {/* Back Left */}
          {damageComponents?.left?.visualState !== 'detached' && (
          <group ref={backLeftWheelRef} position={[-0.9, 0.4, 0.6]}>"""

target8 = """            {[0, 1, 2, 3].map((b) => {
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
        </group>
        )}
                </group>"""
replace8 = """            {[0, 1, 2, 3].map((b) => {
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
                </group>"""

open('src/components/Arena3D.tsx', 'w').write(
    content
    .replace(target1, replace1)
    .replace(target2, replace2)
    .replace(target3, replace3)
    .replace(target4, replace4)
    .replace(target5, replace5)
    .replace(target6, replace6)
    .replace(target7, replace7)
    .replace(target8, replace8)
)
