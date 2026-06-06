<template>
  <div
    ref="containerRef"
    class="scene-container"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import gsap from 'gsap'
import {
  TRAY_W, TRAY_H, DIE_SIZE, HALF_DIE,
  FACE_FOR_MATERIAL, FACE_ROTATIONS, PIP_POSITIONS,
  DICE_COLLECTION, type DieConfig, type DiePath,
  planRoll,
} from '../composables/useDice'

const props = defineProps<{ mode: 'preview' | 'roll'; selectedDieIndex: number; dieCount: number }>()
const emit = defineEmits<{
  (e: 'selectDie', index: number): void
  (e: 'results', results: number[]): void
}>()

const containerRef = ref<HTMLDivElement>()

let renderer: THREE.WebGLRenderer
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let rafId: number
let lastTime = 0
let isRolling = false
let currentRollDieIndex = -1
let controls: InstanceType<typeof OrbitControls> | null = null

interface PreviewDie {
  group: THREE.Group
  mesh: THREE.Mesh
  particles?: THREE.Points
  rotSpeed: [number, number, number]
}
let previewDice: PreviewDie[] = []
let selectionRing: THREE.Mesh | null = null
let rollDice: THREE.Mesh[] = []
let trayObjects: THREE.Object3D[] = []

const textureCache = new Map<number, THREE.CanvasTexture[]>()
const roughnessCache = new Map<number, THREE.CanvasTexture[]>()
const normalMapCache = new Map<number, THREE.CanvasTexture[]>()
const metalnessCache = new Map<number, THREE.CanvasTexture[]>()

// ── Seeded RNG (xorshift32) ────────────────────────────────────────────────────
function seededRand(seed: number): () => number {
  let s = (seed ^ 0xdeadbeef) >>> 0
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5
    return (s >>> 0) / 0xffffffff
  }
}

interface GlitterFlake {
  x: number; y: number; r: number
  tiltX: number; tiltY: number
  isStar: boolean; color: string; alpha: number
}

const GLITTER_COLORS = ['#ffd700', '#ffe066', '#dde0ff', '#aac4ff', '#ff80c8', '#80ffee', '#ffffff', '#c880ff']
const STAR_COLORS    = ['#ffffa0', '#ffffff', '#ffccee', '#c0f0ff', '#ffd0a0']

function generateGlitterFlakes(size: number, rand: () => number): GlitterFlake[] {
  const flakes: GlitterFlake[] = []
  for (let i = 0; i < 700; i++) {
    const angle = rand() * Math.PI * 2, tilt = rand() * 0.88 + 0.12
    flakes.push({
      x: rand() * size, y: rand() * size, r: rand() * 1.5 + 0.5,
      tiltX: Math.cos(angle) * tilt, tiltY: Math.sin(angle) * tilt,
      isStar: false,
      color: GLITTER_COLORS[Math.floor(rand() * GLITTER_COLORS.length)],
      alpha: rand() * 0.9 + 0.1,
    })
  }
  for (let i = 0; i < 50; i++) {
    const angle = rand() * Math.PI * 2, tilt = rand() * 0.85 + 0.15
    flakes.push({
      x: rand() * size, y: rand() * size, r: rand() * 2 + 1.5,
      tiltX: Math.cos(angle) * tilt, tiltY: Math.sin(angle) * tilt,
      isStar: true,
      color: STAR_COLORS[Math.floor(rand() * STAR_COLORS.length)],
      alpha: rand() * 0.8 + 0.2,
    })
  }
  return flakes
}

const flakeCache = new Map<string, GlitterFlake[]>()
function getGlitterFlakes(dieIdx: number, faceNum: number): GlitterFlake[] {
  const key = `${dieIdx}_${faceNum}`
  if (flakeCache.has(key)) return flakeCache.get(key)!
  const rand = seededRand(dieIdx * 1000 + faceNum * 7)
  const flakes = generateGlitterFlakes(256, rand)
  flakeCache.set(key, flakes)
  return flakes
}
const raycaster = new THREE.Raycaster()
const ndcPointer = new THREE.Vector2()
let pointerDownPos = { x: 0, y: 0 }

const PREVIEW_POS: [number, number, number][] = [
  [-2.2, 0, -1.1], [-0.73, 0, -1.1], [0.73, 0, -1.1], [2.2, 0, -1.1],
  [-2.2, 0, 1.1],  [-0.73, 0, 1.1],  [0.73, 0, 1.1],  [2.2, 0, 1.1],
]

// ── Textures ──────────────────────────────────────────────────────────────────

function getDieTextures(idx: number): THREE.CanvasTexture[] {
  if (textureCache.has(idx)) return textureCache.get(idx)!
  const cfg = DICE_COLLECTION[idx]
  const textures = [1, 2, 3, 4, 5, 6].map(n => {
    const flakes = cfg.glitterSurface ? getGlitterFlakes(idx, n) : undefined
    return makeFaceTex(n, cfg, flakes)
  })
  textureCache.set(idx, textures)
  return textures
}

function makeGlitterLayer(ctx: CanvasRenderingContext2D, flakes: GlitterFlake[]) {
  for (const f of flakes) {
    ctx.globalAlpha = f.alpha
    ctx.fillStyle = f.color
    const x = Math.round(f.x), y = Math.round(f.y), r = Math.round(f.r)
    if (f.isStar) {
      ctx.fillRect(x - r, y - 2, r * 2, 4)
      ctx.fillRect(x - 2, y - r, 4, r * 2)
    } else {
      ctx.fillRect(x - r, y - r, r * 2, r * 2)
    }
  }
  ctx.globalAlpha = 1.0
}

function makeBodyGlitter(): THREE.Points {
  const count = 350
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const half = DIE_SIZE * 0.42
  for (let i = 0; i < count; i++) {
    pos[i*3]   = (Math.random() - 0.5) * 2 * half
    pos[i*3+1] = (Math.random() - 0.5) * 2 * half
    pos[i*3+2] = (Math.random() - 0.5) * 2 * half
    const t = Math.random()
    if (t < 0.4)      { col[i*3]=1;    col[i*3+1]=0.84; col[i*3+2]=0.0 }
    else if (t < 0.7) { col[i*3]=0.78; col[i*3+1]=0.84; col[i*3+2]=0.92 }
    else              { col[i*3]=1;    col[i*3+1]=0.5;  col[i*3+2]=0.78 }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color',    new THREE.BufferAttribute(col, 3))
  const mat = new THREE.PointsMaterial({
    size: 0.065, vertexColors: true,
    transparent: true, opacity: 0.92,
    sizeAttenuation: true, depthWrite: false,
  })
  return new THREE.Points(geo, mat)
}

function makeGlassPip(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.globalAlpha = 0.72
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx - r*0.25, cy - r*0.25, r*0.35, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.globalAlpha = 1.0
  ctx.fill()
}

function makeStandardPip(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.beginPath(); ctx.arc(cx + 2, cy + 2, r, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill()
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = color; ctx.fill()
  ctx.beginPath(); ctx.arc(cx - r*0.3, cy - r*0.3, r*0.35, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill()
}

function makeFaceTex(n: number, cfg: DieConfig, glitterFlakes?: GlitterFlake[]): THREE.CanvasTexture {
  const S = 256
  const canvas = document.createElement('canvas')
  canvas.width = S; canvas.height = S
  const ctx = canvas.getContext('2d')!
  const isGlass = cfg.faceColor.startsWith('rgba(') || (cfg.physical?.transmission ?? 0) > 0 || ((cfg.physical?.opacity ?? 1) < 1)

  if (!isGlass) {
    ctx.fillStyle = cfg.faceColor
    ctx.fillRect(0, 0, S, S)
    const g1 = ctx.createRadialGradient(S/2, S/2, S*0.28, S/2, S/2, S*0.72)
    g1.addColorStop(0, 'rgba(255,255,255,0.0)'); g1.addColorStop(1, 'rgba(0,0,0,0.12)')
    ctx.fillStyle = g1; ctx.fillRect(0, 0, S, S)
    const g2 = ctx.createRadialGradient(S*0.28, S*0.22, 0, S*0.28, S*0.22, S*0.38)
    g2.addColorStop(0, 'rgba(255,255,255,0.22)'); g2.addColorStop(1, 'rgba(255,255,255,0.0)')
    ctx.fillStyle = g2; ctx.fillRect(0, 0, S, S)
  }

  if (cfg.glitterSurface && glitterFlakes) makeGlitterLayer(ctx, glitterFlakes)

  const pips = PIP_POSITIONS[n]
  for (const [fx, fy] of pips) {
    const cx = fx * S, cy = fy * S, r = S * 0.075 * (cfg.pipScale ?? 1.0)
    if (isGlass) makeGlassPip(ctx, cx, cy, r, cfg.pipColor)
    else makeStandardPip(ctx, cx, cy, r, cfg.pipColor)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// ── Materials / Mesh ──────────────────────────────────────────────────────────

function buildMaterials(dieIdx: number): THREE.Material[] {
  const cfg = DICE_COLLECTION[dieIdx]
  const textures = getDieTextures(dieIdx)
  const roughnessMaps = getDieRoughnessMaps(dieIdx)
  const normalMaps = getDieNormalMaps(dieIdx)
  const metalnessMaps = getDieMetalnessMaps(dieIdx)
  const envI = cfg.envMapIntensity ?? 1.2

  return FACE_FOR_MATERIAL.map(faceNum => {
    const map = textures[faceNum - 1]
    const roughnessMap = roughnessMaps[faceNum - 1]
    const normalMap = normalMaps?.[faceNum - 1]
    const metalnessMap = metalnessMaps?.[faceNum - 1]
    if (cfg.physical) {
      const p = cfg.physical
      const params: THREE.MeshPhysicalMaterialParameters = {
        map, roughnessMap, envMapIntensity: envI,
        roughness: 1.0,
        metalness: p.metalness ?? 0.0,
      }
      if (metalnessMap) { params.metalnessMap = metalnessMap; params.metalness = 1.0 }
      if (p.color !== undefined)         params.color          = new THREE.Color(p.color)
      if (p.transmission !== undefined)  { params.transmission = p.transmission; params.thickness = p.thickness ?? 0.85; params.transparent = true }
      if (p.iridescence !== undefined)   { params.iridescence  = p.iridescence; params.iridescenceIOR = p.iridescenceIOR ?? 1.5 }
      if (p.clearcoat !== undefined)     { params.clearcoat    = p.clearcoat;   params.clearcoatRoughness = p.clearcoatRoughness ?? 0.05 }
      if (p.opacity !== undefined && p.opacity < 1) { params.opacity = p.opacity; params.transparent = true; params.depthWrite = false }
      if (normalMap) { params.normalMap = normalMap; params.normalScale = new THREE.Vector2(0.85, 0.85) }
      return new THREE.MeshPhysicalMaterial(params)
    }
    const s = cfg.standard ?? {}
    const sp: THREE.MeshStandardMaterialParameters = {
      map, roughnessMap, envMapIntensity: envI,
      roughness: 1.0,
      metalness: s.metalness ?? 0.04,
    }
    if (metalnessMap) { sp.metalnessMap = metalnessMap; sp.metalness = 1.0 }
    if (s.color !== undefined) sp.color = new THREE.Color(s.color)
    if (normalMap) { sp.normalMap = normalMap; sp.normalScale = new THREE.Vector2(0.85, 0.85) }
    return new THREE.MeshStandardMaterial(sp)
  })
}

function makeDieMesh(dieIdx: number): THREE.Mesh {
  const cfg = DICE_COLLECTION[dieIdx]
  const geo = new RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 4, 0.07)
  const mats = buildMaterials(dieIdx)
  const mesh = new THREE.Mesh(geo, mats)
  mesh.castShadow = true
  if (cfg.glitterBody) {
    const pts = makeBodyGlitter()
    mesh.add(pts)
  }
  return mesh
}

function disposeMesh(mesh: THREE.Mesh) {
  mesh.geometry.dispose()
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  mats.forEach((m: THREE.Material) => m.dispose())
  for (const child of mesh.children) {
    if (child instanceof THREE.Points) {
      child.geometry.dispose()
      ;(child.material as THREE.Material).dispose()
    }
  }
}

// ── Roughness maps ────────────────────────────────────────────────────────────

function makePipRoughnessMap(n: number, bodyRoughness: number, pipScale = 1.0): THREE.CanvasTexture {
  const S = 128
  const canvas = document.createElement('canvas')
  canvas.width = S; canvas.height = S
  const ctx = canvas.getContext('2d')!
  const bodyV = Math.round(bodyRoughness * 255)
  ctx.fillStyle = `rgb(${bodyV},${bodyV},${bodyV})`
  ctx.fillRect(0, 0, S, S)
  const pipV = Math.round(0.88 * 255)
  const r = S * 0.086 * pipScale
  for (const [fx, fy] of PIP_POSITIONS[n]) {
    ctx.beginPath()
    ctx.arc(fx * S, fy * S, r, 0, Math.PI * 2)
    ctx.fillStyle = `rgb(${pipV},${pipV},${pipV})`
    ctx.fill()
  }
  return new THREE.CanvasTexture(canvas)
}

function makeGlitterRoughnessMap(faceNum: number, bodyRoughness: number, dieIdx: number, pipScale: number): THREE.CanvasTexture {
  const S = 256
  const canvas = document.createElement('canvas')
  canvas.width = S; canvas.height = S
  const ctx = canvas.getContext('2d')!
  const bodyV = Math.round(bodyRoughness * 255)
  ctx.fillStyle = `rgb(${bodyV},${bodyV},${bodyV})`
  ctx.fillRect(0, 0, S, S)
  // glitter flakes: very low roughness → catch strong specular highlight
  const sparkleV = Math.round(0.04 * 255)
  for (const f of getGlitterFlakes(dieIdx, faceNum)) {
    const x = Math.round(f.x), y = Math.round(f.y), r = Math.round(f.r)
    ctx.fillStyle = `rgb(${sparkleV},${sparkleV},${sparkleV})`
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // pip areas: matte, hard-edged via ImageData to avoid antialiased specular rim
  const pipV = Math.round(0.88 * 255), pipR = S * 0.086 * pipScale
  const imgR = ctx.getImageData(0, 0, S, S), dR = imgR.data
  const pipR2 = pipR * pipR
  for (const [fx, fy] of PIP_POSITIONS[faceNum]) {
    const cx = Math.round(fx * S), cy = Math.round(fy * S)
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const dx = px - cx, dy = py - cy
        if (dx*dx + dy*dy <= pipR2) {
          const i = (py * S + px) * 4
          dR[i] = dR[i+1] = dR[i+2] = pipV; dR[i+3] = 255
        }
      }
    }
  }
  ctx.putImageData(imgR, 0, 0)
  return new THREE.CanvasTexture(canvas)
}

function makeGlitterNormalMap(faceNum: number, dieIdx: number, pipScale: number): THREE.CanvasTexture {
  const S = 256
  const canvas = document.createElement('canvas')
  canvas.width = S; canvas.height = S
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgb(128,128,255)'   // flat tangent-space normal
  ctx.fillRect(0, 0, S, S)
  for (const f of getGlitterFlakes(dieIdx, faceNum)) {
    const nz = Math.sqrt(Math.max(0.01, 1 - f.tiltX * f.tiltX - f.tiltY * f.tiltY))
    const r = Math.round((f.tiltX * 0.5 + 0.5) * 255)
    const g = Math.round((f.tiltY * 0.5 + 0.5) * 255)
    const b = Math.round((nz   * 0.5 + 0.5) * 255)
    const fx = Math.round(f.x), fy = Math.round(f.y), fr = Math.round(f.r)
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(fx - fr, fy - fr, fr * 2, fr * 2)
  }
  // pip areas: reset to flat normal, hard-edged via ImageData
  const pipR = S * 0.086 * pipScale
  const imgN = ctx.getImageData(0, 0, S, S), dN = imgN.data
  const pipR2N = (pipR + 2) * (pipR + 2)  // +2 ensures full coverage at pip edge
  for (const [fx, fy] of PIP_POSITIONS[faceNum]) {
    const cx = Math.round(fx * S), cy = Math.round(fy * S)
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const dx = px - cx, dy = py - cy
        if (dx*dx + dy*dy <= pipR2N) {
          const i = (py * S + px) * 4
          dN[i] = 128; dN[i+1] = 128; dN[i+2] = 255; dN[i+3] = 255
        }
      }
    }
  }
  ctx.putImageData(imgN, 0, 0)
  return new THREE.CanvasTexture(canvas)
}

function getDieRoughnessMaps(dieIdx: number): THREE.CanvasTexture[] {
  if (roughnessCache.has(dieIdx)) return roughnessCache.get(dieIdx)!
  const cfg = DICE_COLLECTION[dieIdx]
  const bodyR = cfg.physical?.roughness ?? cfg.standard?.roughness ?? 0.22
  const ps = cfg.pipScale ?? 1.0
  const maps = [1, 2, 3, 4, 5, 6].map(n =>
    cfg.glitterSurface
      ? makeGlitterRoughnessMap(n, bodyR, dieIdx, ps)
      : makePipRoughnessMap(n, bodyR, ps)
  )
  roughnessCache.set(dieIdx, maps)
  return maps
}

function getDieNormalMaps(dieIdx: number): THREE.CanvasTexture[] | null {
  if (!DICE_COLLECTION[dieIdx].glitterSurface) return null
  if (normalMapCache.has(dieIdx)) return normalMapCache.get(dieIdx)!
  const ps = DICE_COLLECTION[dieIdx].pipScale ?? 1.0
  const maps = [1, 2, 3, 4, 5, 6].map(n => makeGlitterNormalMap(n, dieIdx, ps))
  normalMapCache.set(dieIdx, maps)
  return maps
}

function makeMetalnessMap(faceNum: number, bodyMetalness: number, pipMetalness: number, pipScale: number): THREE.CanvasTexture {
  const S = 128
  const canvas = document.createElement('canvas')
  canvas.width = S; canvas.height = S
  const ctx = canvas.getContext('2d')!
  const bodyV = Math.round(bodyMetalness * 255)
  ctx.fillStyle = `rgb(${bodyV},${bodyV},${bodyV})`
  ctx.fillRect(0, 0, S, S)
  const pipR = S * 0.086 * pipScale
  const img = ctx.getImageData(0, 0, S, S), d = img.data
  const pipV = Math.round(pipMetalness * 255)
  const pipR2 = pipR * pipR
  for (const [fx, fy] of PIP_POSITIONS[faceNum]) {
    const cx = Math.round(fx * S), cy = Math.round(fy * S)
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const dx = px - cx, dy = py - cy
        if (dx*dx + dy*dy <= pipR2) {
          const i = (py * S + px) * 4
          d[i] = d[i+1] = d[i+2] = pipV; d[i+3] = 255
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0)
  return new THREE.CanvasTexture(canvas)
}

function getDieMetalnessMaps(dieIdx: number): THREE.CanvasTexture[] | null {
  const cfg = DICE_COLLECTION[dieIdx]
  if (cfg.pipMetalness === undefined) return null
  if (metalnessCache.has(dieIdx)) return metalnessCache.get(dieIdx)!
  const bodyM = cfg.standard?.metalness ?? cfg.physical?.metalness ?? 0.04
  const pipM = cfg.pipMetalness
  const ps = cfg.pipScale ?? 1.0
  const maps = [1, 2, 3, 4, 5, 6].map(n => makeMetalnessMap(n, bodyM, pipM, ps))
  metalnessCache.set(dieIdx, maps)
  return maps
}

// ── Gradient backdrop ─────────────────────────────────────────────────────────

function makeGradientBg(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 512
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 380)
  g.addColorStop(0, '#28294e')
  g.addColorStop(0.6, '#1a1c38')
  g.addColorStop(1, '#10111e')
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512)
  return new THREE.CanvasTexture(c)
}

// ── Preview mode ──────────────────────────────────────────────────────────────

function setupPreview() {
  scene.background = makeGradientBg()
  DICE_COLLECTION.forEach((_, i) => {
    const [px, py, pz] = PREVIEW_POS[i]
    const group = new THREE.Group()
    group.position.set(px, py, pz)
    const mesh = makeDieMesh(i)
    group.add(mesh)
    group.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI * 2, Math.random() * Math.PI)
    const rotSpeed: [number, number, number] = [
      (Math.random() - 0.5) * 0.5,
      Math.random() * 0.55 + 0.25,
      (Math.random() - 0.5) * 0.35,
    ]
    scene.add(group)
    previewDice.push({ group, mesh, rotSpeed })
  })

  const ringGeo = new THREE.RingGeometry(0.52, 0.68, 48)
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x4f7fff, side: THREE.DoubleSide, transparent: true, opacity: 0.75 })
  selectionRing = new THREE.Mesh(ringGeo, ringMat)
  selectionRing.rotation.x = -Math.PI / 2
  scene.add(selectionRing)
  updateRingAndGlow()
}

function clearPreview() {
  scene.background = new THREE.Color(0x16192b)
  previewDice.forEach(pd => {
    scene.remove(pd.group)
    disposeMesh(pd.mesh)
  })
  previewDice = []
  if (selectionRing) {
    scene.remove(selectionRing)
    selectionRing.geometry.dispose()
    ;(selectionRing.material as THREE.Material).dispose()
    selectionRing = null
  }
}

function updateRingAndGlow() {
  if (!selectionRing || previewDice.length === 0) return
  const [px, , pz] = PREVIEW_POS[props.selectedDieIndex]
  selectionRing.position.set(px, -0.44, pz)
  previewDice.forEach((pd, i) => {
    const mats = Array.isArray(pd.mesh.material) ? pd.mesh.material : [pd.mesh.material]
    const sel = i === props.selectedDieIndex
    mats.forEach((m: any) => {
      m.emissive?.set(sel ? 0x1a1a5a : 0x000000)
      if ('emissiveIntensity' in m) m.emissiveIntensity = sel ? 1.0 : 0.0
    })
  })
}

// ── Roll mode ─────────────────────────────────────────────────────────────────

function buildTray() {
  const tray = new THREE.Mesh(
    new THREE.PlaneGeometry(TRAY_W, TRAY_H),
    new THREE.MeshStandardMaterial({ color: 0x1e4d2b, roughness: 0.92, metalness: 0.0 }),
  )
  tray.rotation.x = -Math.PI / 2
  tray.receiveShadow = true
  scene.add(tray); trayObjects.push(tray)

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3d2510, roughness: 0.65, metalness: 0.18 })
  const wallH = 0.38
  const defs: [number, number, number, number, number, number][] = [
    [TRAY_W + 0.3, wallH, 0.14, 0, wallH/2,  TRAY_H/2 + 0.07],
    [TRAY_W + 0.3, wallH, 0.14, 0, wallH/2, -TRAY_H/2 - 0.07],
    [0.14, wallH, TRAY_H, -TRAY_W/2 - 0.07, wallH/2, 0],
    [0.14, wallH, TRAY_H,  TRAY_W/2 + 0.07, wallH/2, 0],
  ]
  for (const [w, h, d, x, y, z] of defs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat)
    wall.position.set(x, y, z); wall.castShadow = true; wall.receiveShadow = true
    scene.add(wall); trayObjects.push(wall)
  }
}

function clearTray() {
  trayObjects.forEach(obj => {
    scene.remove(obj)
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      const ms = Array.isArray(obj.material) ? obj.material : [obj.material]
      ms.forEach((m: THREE.Material) => m.dispose())
    }
  })
  trayObjects = []
}

function syncRollCount(n: number) {
  if (currentRollDieIndex !== props.selectedDieIndex) {
    rollDice.forEach(m => { scene.remove(m); disposeMesh(m) })
    rollDice = []
    currentRollDieIndex = props.selectedDieIndex
  }
  while (rollDice.length < n) {
    const mesh = makeDieMesh(props.selectedDieIndex)
    scene.add(mesh); rollDice.push(mesh)
  }
  while (rollDice.length > n) {
    const mesh = rollDice.pop()!
    scene.remove(mesh); disposeMesh(mesh)
  }
  placeAtRest()
}

function setupRoll() {
  buildTray()
  syncRollCount(props.dieCount)
}

function clearRoll() {
  rollDice.forEach(m => { scene.remove(m); disposeMesh(m) })
  rollDice = []
  currentRollDieIndex = -1
  clearTray()
}

function placeAtRest() {
  const n = rollDice.length
  rollDice.forEach((mesh, i) => {
    const cols = Math.min(n, 3)
    const col = i % cols, row = Math.floor(i / cols)
    mesh.position.set(
      (col - (Math.min(n, 3) - 1) / 2) * 1.4,
      HALF_DIE,
      (row - Math.floor((n - 1) / 3) / 2) * 1.4,
    )
    const [rx, ry, rz] = FACE_ROTATIONS[1]
    mesh.rotation.set(rx, ry, rz)
  })
}

// ── Roll animation ────────────────────────────────────────────────────────────

function getFinalQuat(face: number): THREE.Quaternion {
  const [rx, ry, rz] = FACE_ROTATIONS[face]
  const faceQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz))
  const spinQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2)
  return spinQ.multiply(faceQ)
}

function animateDie(mesh: THREE.Mesh, path: DiePath, face: number, dur: number) {
  const finalQ = getFinalQuat(face)
  const proxy = { t: 0 }
  const BS = 0.75
  gsap.to(proxy, {
    t: 1, duration: dur, ease: 'power2.out',
    onUpdate() {
      const t = proxy.t
      const kf = path[Math.min(Math.floor(t * path.length), path.length - 1)]
      if (t < BS) {
        mesh.position.set(kf.x, kf.y, kf.z)
        mesh.rotation.set(kf.rx, kf.ry, kf.rz)
      } else {
        const e = ((t - BS) / (1 - BS))
        const sm = e * e * (3 - 2 * e)
        mesh.position.set(kf.x, kf.y + (HALF_DIE - kf.y) * sm, kf.z)
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(kf.rx, kf.ry, kf.rz))
        q.slerp(finalQ, sm)
        mesh.rotation.setFromQuaternion(q)
      }
    },
  })
}

function roll() {
  if (isRolling || props.mode !== 'roll') return
  isRolling = true
  const { results, paths } = planRoll(props.dieCount)
  const dur = 1.9
  rollDice.forEach((mesh, i) => animateDie(mesh, paths[i], results[i], dur))
  setTimeout(() => { isRolling = false; emit('results', results) }, dur * 1000)
}

defineExpose({ roll })

// ── Camera ────────────────────────────────────────────────────────────────────

function switchCamera(m: 'preview' | 'roll') {
  if (m === 'preview') {
    camera.position.set(0, 5.5, 6); camera.lookAt(0, 0, 0); camera.fov = 65
  } else {
    camera.position.set(0, 9, 2.5); camera.lookAt(0, 0, 0); camera.fov = 50
  }
  camera.updateProjectionMatrix()
}

// ── Pointer (preview selection) ───────────────────────────────────────────────

function onPointerDown(e: PointerEvent) {
  pointerDownPos = { x: e.clientX, y: e.clientY }
}

function onPointerUp(e: PointerEvent) {
  if (props.mode !== 'preview') return
  const dx = e.clientX - pointerDownPos.x, dy = e.clientY - pointerDownPos.y
  if (dx*dx + dy*dy > 100) return
  const rect = containerRef.value!.getBoundingClientRect()
  ndcPointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  ndcPointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(ndcPointer, camera)
  const hits = raycaster.intersectObjects(previewDice.map(pd => pd.mesh))
  if (hits.length > 0) {
    const idx = previewDice.findIndex(pd => pd.mesh === hits[0].object)
    if (idx >= 0) emit('selectDie', idx)
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  const el = containerRef.value!

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(el.clientWidth, el.clientHeight)
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  el.appendChild(renderer.domElement)

  camera = new THREE.PerspectiveCamera(65, el.clientWidth / el.clientHeight, 0.1, 50)
  switchCamera(props.mode)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x16192b)

  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()

  scene.add(new THREE.AmbientLight(0xfff0e0, 0.55))
  const sun = new THREE.DirectionalLight(0xfff5e0, 2.2)
  sun.position.set(4, 10, 3); sun.castShadow = true
  sun.shadow.mapSize.setScalar(1024)
  sun.shadow.camera.left = -6; sun.shadow.camera.right = 6
  sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8
  sun.shadow.camera.near = 0.1; sun.shadow.camera.far = 25
  sun.shadow.bias = -0.001
  scene.add(sun)
  const fill = new THREE.PointLight(0x7080ff, 1.0, 18)
  fill.position.set(-4, 3, 5); scene.add(fill)
  const rim = new THREE.PointLight(0xff8844, 0.4, 12)
  rim.position.set(3, 2, -4); scene.add(rim)

  props.mode === 'preview' ? setupPreview() : setupRoll()

  window.addEventListener('resize', () => {
    const w = el.clientWidth, h = el.clientHeight
    camera.aspect = w / h; camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  })

  const animate = (time: number) => {
    rafId = requestAnimationFrame(animate)
    const dt = Math.min((time - lastTime) / 1000, 0.1); lastTime = time
    controls?.update()
    if (props.mode === 'preview') {
      previewDice.forEach(pd => {
        pd.group.rotation.x += pd.rotSpeed[0] * dt
        pd.group.rotation.y += pd.rotSpeed[1] * dt
        pd.group.rotation.z += pd.rotSpeed[2] * dt
      })
    }
    renderer.render(scene, camera)
  }
  requestAnimationFrame(animate)
})

watch(() => props.mode, m => {
  if (!scene) return
  if (m === 'preview') { clearRoll(); setupPreview() }
  else { clearPreview(); setupRoll() }
  switchCamera(m)
})

watch(() => props.selectedDieIndex, () => {
  if (!scene) return
  if (props.mode === 'preview') updateRingAndGlow()
  else syncRollCount(props.dieCount)
})

watch(() => props.dieCount, n => {
  if (props.mode === 'roll' && scene) syncRollCount(n)
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  controls?.dispose()
  textureCache.forEach(ts => ts.forEach(t => t.dispose()))
  roughnessCache.forEach(ms => ms.forEach(t => t.dispose()))
  normalMapCache.forEach(ms => ms.forEach(t => t.dispose()))
  metalnessCache.forEach(ms => ms.forEach(t => t.dispose()))
  renderer.dispose()
})
</script>

<style scoped>
.scene-container {
  width: 100%;
  flex: 1;
  display: block;
  overflow: hidden;
  touch-action: none;
}
</style>
