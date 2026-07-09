import sys
content = open('src/components/Arena3D.tsx').read()
replace = """                 tangentialVelocity,
                 impulse,
                 contactPoint,
                 normal,
                 [0, 0, 0], // tangent estimation
                 className === 'weapon' ? 'weapon' : 'body',
               const wasDetached = components[hitZone]?.detached;
                 targetComp
               );"""
target = """                 tangentialVelocity,
                 impulse,
                 contactPoint,
                 normal,
                 [0, 0, 0], // tangent estimation
                 className === 'weapon' ? 'weapon' : 'body',
                 targetComp
               );"""
open('src/components/Arena3D.tsx', 'w').write(content.replace(replace, target))
