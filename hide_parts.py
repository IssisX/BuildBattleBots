import sys
content = open('src/components/Arena3D.tsx').read()

target1 = """          {actualWeaponType !== 'drum' && ("""
replace1 = """          {actualWeaponType !== 'drum' && damageComponents?.rear?.visualState !== 'detached' && ("""

target2 = """          {actualWeaponType === 'hammer' && ("""
replace2 = """          {actualWeaponType === 'hammer' && damageComponents?.front?.visualState !== 'detached' && ("""

target3 = """          {(actualWeaponType === 'spinner' || actualWeaponType === 'saw') && ("""
replace3 = """          {(actualWeaponType === 'spinner' || actualWeaponType === 'saw') && damageComponents?.front?.visualState !== 'detached' && ("""

target4 = """        {!isCustom && (
        <group>
          {/* Front Right */}"""
replace4 = """        {!isCustom && (
        <group>
          {/* Front Right */}"""

open('src/components/Arena3D.tsx', 'w').write(
    content
    .replace(target1, replace1)
    .replace(target2, replace2)
    .replace(target3, replace3)
)
