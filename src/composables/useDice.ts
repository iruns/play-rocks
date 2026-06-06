export const TRAY_W = 7
export const TRAY_H = 10
export const DIE_SIZE = 0.85
export const HALF_DIE = DIE_SIZE / 2

export interface Keyframe {
  t: number
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
}

export type DiePath = Keyframe[]

// BoxGeometry material index order: +X(0), -X(1), +Y(2), -Y(3), +Z(4), -Z(5)
// Assigned face numbers:              3       4      1      6      2      5
export const FACE_FOR_MATERIAL = [3, 4, 1, 6, 2, 5]

export const PREVIEW_POS: [number, number, number][] = [
  [-2.2, 0, -1.1],
  [-0.73, 0, -1.1],
  [0.73, 0, -1.1],
  [2.2, 0, -1.1],
  [-2.2, 0, 1.1],
  [-0.73, 0, 1.1],
  [0.73, 0, 1.1],
  [2.2, 0, 1.1],
]

// Euler (rx, ry, rz) to orient each face number upward (+Y world)
export const FACE_ROTATIONS: Record<
  number,
  [number, number, number]
> = {
  1: [0, 0, 0],
  2: [-Math.PI / 2, 0, 0],
  3: [0, 0, Math.PI / 2],
  4: [0, 0, -Math.PI / 2],
  5: [Math.PI / 2, 0, 0],
  6: [Math.PI, 0, 0],
}

export const PIP_POSITIONS: Record<
  number,
  [number, number][]
> = {
  1: [[0.5, 0.5]],
  2: [
    [0.3, 0.7],
    [0.7, 0.3],
  ],
  3: [
    [0.3, 0.7],
    [0.5, 0.5],
    [0.7, 0.3],
  ],
  4: [
    [0.3, 0.3],
    [0.7, 0.3],
    [0.3, 0.7],
    [0.7, 0.7],
  ],
  5: [
    [0.3, 0.3],
    [0.7, 0.3],
    [0.5, 0.5],
    [0.3, 0.7],
    [0.7, 0.7],
  ],
  6: [
    [0.3, 0.25],
    [0.7, 0.25],
    [0.3, 0.5],
    [0.7, 0.5],
    [0.3, 0.75],
    [0.7, 0.75],
  ],
}

export interface DieConfig {
  /** Unique identifier used for caching and lookup. */
  id: string
  /** Display name shown in the UI. */
  name: string
  /** CSS color for the face canvas background (hex or rgba). rgba triggers glass-pip mode. */
  faceColor: string
  /** CSS color for pip fill. */
  pipColor: string
  /** Standard (non-PBR) material params. Use when no special optical effects are needed. */
  standard?: {
    /** Surface roughness: 0 = mirror, 1 = fully diffuse. */
    roughness?: number
    /** Metalness: 0 = dielectric, 1 = metal. */
    metalness?: number
    /** Base tint color as a hex number (e.g. 0xff0000). */
    color?: number
  }
  /** MeshPhysicalMaterial params. Use for glass, crystal, iridescent, or clearcoat effects. */
  physical?: {
    /**
     * Glass-like light transmission (0–1). 1 = fully see-through.
     * Pip areas are kept fully opaque via a transmissionMap.
     */
    transmission?: number
    /** Alpha-based opacity (0–1). Use for simple transparency without refraction. */
    opacity?: number
    /**
     * Surface roughness (0–1). Also controls transmission blur:
     * 0 = perfectly clear glass, higher values = frosted/blurry see-through.
     */
    roughness?: number
    /** Metalness: 0 = dielectric, 1 = metal. */
    metalness?: number
    /** Physical depth of the volume in world units. Affects transmission color absorption. */
    thickness?: number
    /** Index of refraction (e.g. 1.0 = air, 1.5 = glass, 2.4 = diamond). Affects light bending. */
    ior?: number
    /** Iridescence intensity (0–1): thin-film interference rainbow effect. */
    iridescence?: number
    /** IOR of the iridescent thin film layer. */
    iridescenceIOR?: number
    /** Base tint color as a hex number (e.g. 0xff0000). */
    color?: number
    /** Clearcoat layer intensity (0–1): adds a glossy lacquer on top of the base material. */
    clearcoat?: number
    /** Roughness of the clearcoat layer: 0 = mirror finish, 1 = satin. */
    clearcoatRoughness?: number
  }
  /** Adds randomised metallic glitter flakes to the face texture. */
  glitterSurface?: boolean
  /** CSS color array for a partially-mixed resin swirl effect on the face. */
  resinColors?: string[]
  /** Pip rendering style: 'dots' (default) or 'text' (draws the number). */
  pipStyle?: 'dots' | 'text'
  /** Multiplier for environment map contribution. Higher = more reflective. */
  envMapIntensity?: number
  /** Scale multiplier applied to pip radius (default 1.0). */
  pipScale?: number
  /** Roughness override for pip areas in the roughness map. */
  pipRoughness?: number
  /** Metalness override for pip areas in the metalness map. */
  pipMetalness?: number
}

export const DICE_COLLECTION: DieConfig[] = [
  {
    id: 'ivory',
    name: 'Ivory',
    faceColor: '#f0e8d5',
    pipColor: '#1c1c1c',
    standard: { roughness: 0.22, metalness: 0.04 },
    envMapIntensity: 1.2,
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    faceColor: '#111111',
    pipColor: '#ffffff',
    standard: {
      roughness: 0.14,
      metalness: 0.08,
      color: 0x111111,
    },
    envMapIntensity: 1.6,
  },
  {
    id: 'ruby',
    name: 'Ruby',
    faceColor: '#5a0000',
    pipColor: '#ffd700',
    standard: {
      roughness: 0.18,
      metalness: 0.05,
      color: 0x5a0000,
    },
    envMapIntensity: 1.4,
  },
  {
    id: 'rosegold',
    name: 'Rose Gold',
    faceColor: '#c97b5a',
    pipColor: '#fff0e8',
    standard: {
      roughness: 0.1,
      metalness: 0.88,
      color: 0xc97b5a,
    },
    envMapIntensity: 2.2,
  },
  {
    id: 'ice',
    name: 'Arctic Ice',
    faceColor: '#c8e4fc',
    pipColor: '#ffffff',
    physical: {
      transmission: 0.95,
      thickness: 1.4,
      roughness: 0.5,
      metalness: 0.0,
      ior: 1.31,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      color: 0x9ac8f4,
    },
    envMapIntensity: 2.0,
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    faceColor: '#080018',
    pipColor: '#ffcc40',
    pipScale: 1.2,
    physical: {
      iridescence: 1.0,
      iridescenceIOR: 1.5,
      roughness: 0.1,
      metalness: 0.15,
      color: 0x080018,
    },
    envMapIntensity: 1.8,
  },
  {
    id: 'glitter',
    name: 'Glitter',
    faceColor: '#12102a',
    pipColor: '#ffffff',
    pipRoughness: 0.85,
    pipMetalness: 0.04,
    standard: {
      roughness: 0.2,
      metalness: 0.92,
      color: 0x12102a,
    },
    glitterSurface: true,
    envMapIntensity: 2.8,
  },
  {
    id: 'crystal',
    name: 'Crystal',
    faceColor: '#d8eeff',
    pipColor: '#ffffff',
    physical: {
      transmission: 0.92,
      thickness: 0.85,
      roughness: 0.2,
      metalness: 0.0,
      ior: 1.45,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      color: 0xeef6ff,
    },
    resinColors: [
      '#9922ee',
      '#00ddbb',
      '#ff33aa',
      '#2255ff',
      '#ffffff',
    ],
    glitterSurface: true,
    pipStyle: 'text',
    envMapIntensity: 2.4,
  },
]

export function planRoll(dieCount: number): {
  results: number[]
  paths: DiePath[]
} {
  const results = Array.from({ length: dieCount }, () =>
    Math.ceil(Math.random() * 6)
  )
  const STEPS = 80
  const DT = 1 / STEPS
  const COLL_DIST = DIE_SIZE * 1.5
  const maxX = TRAY_W / 2 - HALF_DIE - 0.05
  const maxZ = TRAY_H / 2 - HALF_DIE - 0.05

  interface SimState {
    x: number
    z: number
    vx: number
    vz: number
    rx: number
    ry: number
    rz: number
    vrx: number
    vry: number
    vrz: number
  }

  const states: SimState[] = Array.from(
    { length: dieCount },
    (_, i) => {
      const angle =
        (i / dieCount) * Math.PI * 2 + Math.random() * 0.5
      const spread = dieCount > 1 ? 1.5 : 0
      return {
        x:
          Math.cos(angle) * spread +
          (Math.random() - 0.5) * 0.5,
        z:
          -(TRAY_H / 3) +
          Math.sin(angle) * spread * 0.5 +
          (Math.random() - 0.5) * 0.5,
        vx: (Math.random() - 0.5) * 12,
        vz: Math.random() * 6 + 4,
        rx: Math.random() * Math.PI * 6,
        ry: Math.random() * Math.PI * 6,
        rz: Math.random() * Math.PI * 6,
        vrx: (Math.random() - 0.5) * 30,
        vry: (Math.random() - 0.5) * 30,
        vrz: (Math.random() - 0.5) * 30,
      }
    }
  )

  const paths: DiePath[] = states.map((s) => [
    {
      t: 0,
      x: s.x,
      y: HALF_DIE + 0.3,
      z: s.z,
      rx: s.rx,
      ry: s.ry,
      rz: s.rz,
    },
  ])

  for (let step = 1; step <= STEPS; step++) {
    const t = step / STEPS

    states.forEach((s) => {
      s.x += s.vx * DT
      s.z += s.vz * DT
    })

    states.forEach((s) => {
      if (s.x < -maxX) {
        s.x = -maxX
        s.vx = Math.abs(s.vx) * 0.6
      }
      if (s.x > maxX) {
        s.x = maxX
        s.vx = -Math.abs(s.vx) * 0.6
      }
      if (s.z < -maxZ) {
        s.z = -maxZ
        s.vz = Math.abs(s.vz) * 0.6
      }
      if (s.z > maxZ) {
        s.z = maxZ
        s.vz = -Math.abs(s.vz) * 0.6
      }
    })

    for (let a = 0; a < dieCount; a++) {
      for (let b = a + 1; b < dieCount; b++) {
        const sa = states[a],
          sb = states[b]
        const dx = sb.x - sa.x,
          dz = sb.z - sa.z
        const dist2 = dx * dx + dz * dz
        if (dist2 < COLL_DIST * COLL_DIST && dist2 > 1e-4) {
          const dist = Math.sqrt(dist2)
          const nx = dx / dist,
            nz = dz / dist
          const relVx = sa.vx - sb.vx,
            relVz = sa.vz - sb.vz
          const dot = relVx * nx + relVz * nz
          if (dot > 0) {
            sa.vx -= dot * nx * 0.9
            sa.vz -= dot * nz * 0.9
            sb.vx += dot * nx * 0.9
            sb.vz += dot * nz * 0.9
            sa.vrx += (Math.random() - 0.5) * 10
            sb.vrx += (Math.random() - 0.5) * 10
            sa.vry += (Math.random() - 0.5) * 10
            sb.vry += (Math.random() - 0.5) * 10
          }
        }
      }
    }

    const friction = 1 - DT * 2.5
    states.forEach((s) => {
      s.vx *= friction
      s.vz *= friction
      s.vrx *= 1 - DT * 1.8
      s.vry *= 1 - DT * 1.8
      s.vrz *= 1 - DT * 1.8
      s.rx += s.vrx * DT
      s.ry += s.vry * DT
      s.rz += s.vrz * DT
    })

    const yBounce =
      t < 0.5 ? Math.sin(t * Math.PI) * 0.25 : 0

    states.forEach((s, i) => {
      paths[i].push({
        t,
        x: s.x,
        y: HALF_DIE + yBounce,
        z: s.z,
        rx: s.rx,
        ry: s.ry,
        rz: s.rz,
      })
    })
  }

  return { results, paths }
}
