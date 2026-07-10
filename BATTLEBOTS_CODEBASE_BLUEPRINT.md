# BattleBots Combat Arena: Codebase Blueprint & Architecture Reference

This document provides a comprehensive technical overview of the **BattleBots Combat Arena** codebase. It covers the folder structures, the hierarchical parts tree, the damage and impact physics engine, the 3D graphics pipeline, and the central state store.

This blueprint serves as a fully complete context injection document for any external developer, developer agent, or language model to understand the core functionality, mechanics, and structures of this application without reading the entire codebase.

---

## 1. Directory Structure and Architectural Map

```text
/
├── src/
│   ├── App.tsx                   # Main entrypoint, routes, and layout shell.
│   ├── index.css                 # Global CSS importing Tailwind utility layers.
│   ├── main.tsx                  # ReactDOM bootstrapper.
│   ├── store.ts                  # Central Zustand state store (game state, match engine, saving).
│   ├── types.ts                  # Global TypeScript contracts, definitions, and types.
│   │
│   ├── combat/                   # Damage calculation and physics mechanics
│   │   ├── DamageSystem.ts       # Impact handler, multi-layer degradation, fatigue solver.
│   │   └── DamageTypes.ts        # Typed materials, impact severities, tuning constants.
│   │
│   ├── lib/                      # Core utility libraries and sub-systems
│   │   ├── audio.ts              # Procedural audio engine, spatial impact sounds, volume tuning.
│   │   ├── auto-builder.ts       # Symmetric modular bot generator.
│   │   ├── firebase.ts           # Firestore db connection & auth.
│   │   ├── partsCatalog.ts       # Definition repository of all robot segments & coordinates.
│   │   ├── presets.ts            # Default bot configurations (Viper, Titan, Razor, Tombstone).
│   │   ├── utils.ts              # General layout and math helpers.
│   │   └── validation.ts         # Hierarchical structural validator (orphans, cycles, weight).
│   │
│   └── components/               # Core view modules
│       ├── Arena3D.tsx           # React Three Fiber 3D simulator, particle systems, user controls.
│       ├── BuildABotWorkshop.tsx # Graphical part-building garage workspace.
│       ├── ConfigurationPanel.tsx# Arena physics tuning panel (speed, dampening, multiplier).
│       ├── Controls.tsx          # Keyboard/Gamepad instruction overlays.
│       ├── FleetWorkbench.tsx    # Saved custom blueprints workbench.
│       ├── HUD.tsx               # Battle status overlays (health dials, speedometers, timers).
│       ├── Telemetry.tsx         # Real-time event log & damage telemetry monitor.
│       └── TouchControls.tsx     # On-screen virtual joysticks for mobile gameplay.
```

---

## 2. Framework & Technology Stack

The application is built on top of a highly responsive, single-page, full-stack framework:
1. **Frontend Core**: **React 18** with **Vite** and **TypeScript** (type-safe component trees).
2. **Global State**: **Zustand** (`src/store.ts`) for rapid, non-reactive physical and modular state updates.
3. **3D Render Layer**: **React Three Fiber (R3F)** and `@react-three/drei` (built on **Three.js**).
4. **Layout & Styling**: **Tailwind CSS** (vibrant theme, dark slate aesthetic, glassmorphic panels).
5. **Durable Persistence**: **Firebase Firestore** for cloud blueprints sync, coupled with **Local Storage** for local cache recovery.

---

## 3. Central Game State Store (`src/store.ts`)

The central store manages both structural customization and operational fight states. It is built using Zustand and exposes the `useGameStore` hook.

### Key Store Responsibilities:
- **Game Mode Management**: Switches the active viewport between `'menu' | 'countdown' | 'battle' | 'ended'`.
- **Match Controller**: Starts/stops matches, monitors victory conditions (KO timer), triggers countdown sequences, and records the `MatchHistoryEntry`.
- **Blueprints Sync**: Pulls or pushes custom `CustomBotConfig` records from the `ai-studio-battlebotscombat` Firestore collection based on current authentication state, with a fallback to `localStorage` (`battlebot_custom_config_v2`).
- **Real-Time Telemetry Log**: Streams live event alerts, damage, and impact announcements.
- **Tuning Settings**: Manages `GameSettings` (grip multipliers, restitution, damage scales, performance and detail modes).

---

## 4. The Hierarchical Part-Tree Schema (`src/types.ts`)

A BattleBot is represented as a tree structure of interconnected rigid parts, defined in `CustomBotConfig`.

### Structural Interfaces

```typescript
export type Vec3 = [number, number, number];

export interface PlacedBotPart {
  instanceId: string;         // Unique instance identifier (e.g., "core_0", "wheel_left_f")
  definitionId: string;       // References templateId in partsCatalog (e.g., "core_heavy")
  localPosition: Vec3;        // Relative coordinate [X, Y, Z] relative to its parent's attachment socket
  localRotation: Vec3;        // Euler angles [pitch, yaw, roll] in radians
  parentInstanceId?: string;   // Undefined ONLY for the root chassis
  parentSocketId?: string;     // Socket ID on the parent this part is attached to
  color?: string;             // Custom part color (hex)
}

export interface CustomBotConfig {
  id: string;                 // Bot unique ID
  name: string;               // Display name
  schemaVersion: number;      // Integer schema tracker (always 1)
  rootPartId: string;         // Usually "core_0"
  parts: PlacedBotPart[];     // Flat array representing the hierarchical tree
  createdAt: number;
  updatedAt: number;
}
```

### Coordinate & Assembly Constraints
1. **Local Axis Layout**:
   - `+X` = Right, `-X` = Left.
   - `+Y` = Up, `-Y` = Down.
   - `+Z` = Rear/Back, `-Z` = Front (facing the opponent).
2. **Socket Attachment Rule**: For any attached part, `localPosition` MUST exactly match the coordinates defined on its parent's attachment socket.
3. **Validation (`src/lib/validation.ts`)**:
   - Compiles and checks for cycles, floating orphan parts, weight boundaries (up to 250kg limit), center of mass alignment, and locomotion capability (must have at least 2 wheels touching ground bounds).

---

## 5. The Parts Catalog (`src/lib/partsCatalog.ts`)

Every component references a static part template, detailing mass, connection sockets, shapes, visual indicators, and colliders.

### Part Categories
- **Chassis (Cores)**: Exposes structural attachment sockets (`wheel`, `weapon`, `armor`, `any`).
  - `core_feather`: Light agile frame, 4 mounting sockets.
  - `core_compact` (Interceptor): Lightweight alloy, supports 2-wheel setups.
  - `core_heavy` (Titan): Sturdy steel core with 4 wheel mounts and extra side/rear armor sockets.
  - `core_behemoth`: Massive 6-wheel chassis, dual front weapon slots, top accessory mount.
- **Locomotion (Wheels)**:
  - `wheel_all_terrain`: Highly-treaded rubber tire with standard physical friction.
  - `wheel_slick`: Drag race slick for top speed, lower drift friction.
  - `wheel_omni`: Allows lateral sliding vectors.
  - `wheel_tread`: Massive tank track (highest pushing torque).
- **Weapons**:
  - `weapon_spinner`: High-RPM kinetic tooth bar.
  - `weapon_drum`: Heavy rotating cylinder causing massive vertical upward force.
  - `weapon_flipper`: Pneumatic shovel that launches opponents in the vertical axis.
  - `weapon_hammer`: Heavy overhead hammer causing deep crush damage.
  - `weapon_pickaxe`: Highly concentrated piercing tip.
- **Armor / Wedges**:
  - `armor_panel`: Flat carbon composite sheet.
  - `armor_ablative`: Ceramic block designed to break and absorb heavy vertical loads.
  - `armor_spike`: Cone shape, redirects incoming kinetic impact vectors.
  - `armor_wedge`: Smooth sloped wedge designed to slip under flat chassis.

---

## 6. Combat and Damage Mechanics (`src/combat/`)

The damage module simulates realistic metal degradation, armor penetration, mechanical fatigue, and material reactions.

### Material Dynamics (`src/combat/DamageTypes.ts`)
Each component is backed by specific materials with unique values:
- **Steel** (Hardness: `1.0`, Ring Frequency: `1200Hz`, Spark Yield: `0.8`)
- **Aluminum** (Hardness: `0.6`, Ring Frequency: `1800Hz`, Spark Yield: `0.3`)
- **Rubber** (Hardness: `0.1`, Ring Frequency: `0Hz`, Spark Yield: `0.0`)
- **ArmorPlate** (Hardness: `1.5`, Ring Frequency: `800Hz`, Spark Yield: `1.0`)
- **WeaponSteel** (Hardness: `1.8`, Ring Frequency: `1000Hz`, Spark Yield: `0.9`)
- **Composite** (Hardness: `0.8`, Ring Frequency: `500Hz`, Spark Yield: `0.1`)

### Component Damage Layers
Parts are structured into sequential nested layers (e.g., `paint` -> `outerArmor` -> `frame`). When a layer's health drops to 0, the next inner layer is exposed.

### The Impact Solver Step-by-Step (`DamageSystem.ts`)

1. **Velocity and Vector Filtering**:
   - Gated rejection: Filters out micro-impacts where normal velocity is $< 1.5$ m/s or impulse is $< 5.0$ Ns.
   - Cooldown hysteresis: Rejects multiple hits on the same component occurring within a $110$ ms window.
2. **Energy Distribution**:
   - **Normal Kinetic Energy**: $E_n = 0.5 \times \text{Impulse} \times V_n$ (Drives deep deformation, penetration, cracking).
   - **Tangential Kinetic Energy**: $E_t = 0.5 \times \text{Impulse} \times V_t$ (Drives scratches, paint scoring, friction, high-density metal sparks).
3. **Obliquity Resolution**:
   - Calculates the angle of impact relative to the surface normal ($0^\circ$ is head-on, $90^\circ$ is a pure graze).
4. **Damage Penetration Loop**:
   - Remaining energy is propagated layer-by-layer:
     $$\text{Effective Absorption} = \text{Base Absorption} \times (0.35 + 0.65 \times (\frac{\text{Integrity}}{\text{Max Integrity}})^{0.7})$$
     $$\Delta\text{Integrity} = -(\text{Energy} \times \text{Effective Absorption}) \times 0.1$$
   - **Overmatch Rule**: If incoming normal energy exceeds the layer's `overmatchThreshold`, absorption limits are bypassed, passing a raw fraction of kinetic energy straight to structural frames.
5. **Fatigue Accumulator**:
   - Sub-threshold hits below the fracture point add small micro-cracks. When accumulated fatigue exceeds `fatigueLimit`, a massive $10\%$ block of absolute integrity is lost.
6. **Mount Rigidity**:
   - High impacts degrade the mounting points (`mountIntegrity`). When mount integrity falls below $30\%$, the component physically wobbles ("loose" state), and at $0\%$, the part detaches entirely and falls into the arena.

---

## 7. 3D Scene and Physics Simulation Loop (`src/components/Arena3D.tsx`)

`Arena3D.tsx` coordinates 3D model loading, CPU billboarding, user interaction, and the render/physics updates.

### Core Rendering Systems:
- **Modular Part Assembler**: Iterates over resolved transforms, setting meshes, material colors, and applying custom shaders or textures (like the scuffed/dented/exposed visual damage states).
- **Physical Controls Polling**: Tracks active keyboard bindings (`WASD` or Arrow keys) and translates gamepad axes into target motor torque and rotational vectors.
- **Weapon Rotation**: Spins weapon meshes up to high angular speed, calculating collision boundaries on intersecting bounding volumes.
- **3D Particle Pipelines**:
  - **Volumetric Smoke**: Rendered via an `InstancedMesh` of planes using a radial alpha gradient texture. Billboards are oriented dynamically on the CPU to face the camera:
    ```typescript
    dummyObj.quaternion.copy(state.camera.quaternion);
    dummyObj.rotateZ(p.rot); // spin variation
    ```
  - **Dynamic Needle Sparks**: High-velocity metallic sparks are drawn via stretched boxes, aligned directly along their velocity vectors:
    ```typescript
    const stretch = Math.max(1.5, speedSq * 0.022);
    dummyObj.scale.set(p.size * 0.25, p.size * 0.25, p.size * stretch);
    dummyObj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.vel.clone().normalize());
    ```
  - **Luminous Fireballs**: High-intensity fire particles mapped to a separate `InstancedMesh` utilizing additive blending (`THREE.AdditiveBlending`) with high emissive color multipliers for deep visual realism.

---

## 8. Integrated UI Components

- **BuildABotWorkshop.tsx**: Provides a visual workspace for adding/removing components, choosing weapon variants, editing part colors, and analyzing live weight, traction, and weapon metrics.
- **FleetWorkbench.tsx**: Standardized interface for saving custom designs, loading predefined configurations, deleting designs, or starting the battle countdown.
- **HUD.tsx**: Elegant screen overlay that tracks bot health, motor RPM, current velocity, remaining match time, and countdowns.
- **Telemetry.tsx**: Live terminal console that displays calculated impact vectors, severity ratings, and component detachments as they happen.
- **ConfigurationPanel.tsx**: Fully featured drawer enabling users to modify physics variables (friction, knockback, damage multipliers, debris lifetime, performance presets).
