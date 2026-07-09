import sys
content = open('src/components/Arena3D.tsx').read()
content = content.replace(
"""          </group>
          {/* Back Right */}
          {damageComponents?.right?.visualState !== 'detached' && (""",
"""          </group>
          )}
          {/* Back Right */}
          {damageComponents?.right?.visualState !== 'detached' && ("""
)
content = content.replace(
"""          </group>
          {/* Back Left */}
          {damageComponents?.left?.visualState !== 'detached' && (""",
"""          </group>
          )}
          {/* Back Left */}
          {damageComponents?.left?.visualState !== 'detached' && ("""
)

open('src/components/Arena3D.tsx', 'w').write(content)
