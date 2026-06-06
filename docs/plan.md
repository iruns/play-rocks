# Dice Roller — Plan

## Stack
- **Vue 3** (Composition API) + Vite
- **Three.js** (tree-shaken, ~300–400KB) for 3D rendering
- **GSAP** for animation sequencing
- **DeviceMotion API** for shake input
- **Hammer.js** for swipe/tap gestures

## Visual Approach
- Dice: Three.js `RoundedBoxGeometry` (slight bevel, ~1.5× more realistic than sharp cube)
- Materials: `MeshStandardMaterial` with metalness/roughness + env map for reflections, specular highlights via point lights
- Tray: Three.js plane with frosted glass shader (or DOM overlay with `backdrop-filter`)
- Ambient + directional lights for depth; per-die shadow casting

## Faked Physics (no physics lib)
Roll sequence is fully pre-computed before animation starts:

1. **Result pick**: random face determined instantly
2. **Path planning**: each die gets randomized arc path across tray
3. **Fake collisions**:
   - Sample die positions at each timestep along planned paths
   - If two dice within 1.5× diameter: inject deflection impulse into both paths (reflect velocity component + add spin delta)
   - Tray wall hits: reflect velocity on boundary
   - All deterministic, ~50 lines of math, runs in <1ms
4. **Animation**: GSAP plays pre-computed paths; rotation tumbles randomly, eases into result face at end

Fudge factor: early deflection threshold makes near-misses look like real bounces. At normal roll speeds, pass-through is unnoticeable.

## Dice Geometry
- **d6**: `RoundedBoxGeometry` with `bevelSegments: 3` — easy, looks great
- **d4 / d8 / d10 / d12 / d20**: standard Three.js polyhedra geometries (`TetrahedronGeometry`, `OctahedronGeometry`, etc.) — no rounding (custom beveled polyhedra too complex for MVP)
- Face numbers: canvas texture per face, baked at init

## Input Modes
| Input | Action |
|-------|--------|
| Tap button / swipe up | Roll all dice |
| Shake (DeviceMotion) | Roll all dice |
| Long-press die | Remove die |
| Tap + icon | Add die |

## Component Structure
```
App.vue
├── DiceScene.vue       # Three.js canvas, owns renderer + scene + camera
│   └── useDice.ts      # die state, path planner, animation controller
├── DiceControls.vue    # add/remove, dice type selector
└── useShake.ts         # DeviceMotion wrapper, emits 'shake'
```

## Bundle Target
~400KB gzipped (Three.js core + addons tree-shaken, GSAP, Hammer)

## MVP Scope
1. d6 only, rounded box, tap/swipe/shake to roll, faked collisions
2. Multi-dice + type picker (d4–d20)
3. Polish: haptics (`navigator.vibrate`), sound, result history
