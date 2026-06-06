import * as THREE from 'three'
import { PIP_POSITIONS, DICE_COLLECTION, type DieConfig } from './useDice'

// ── Font ─────────────────────────────────────────────────────────────────────

const TEXT_FONT = 'Aladin'

export async function preloadFonts(): Promise<void> {
  await document.fonts.load(`bold 48px "${TEXT_FONT}"`)
}

// ── Seeded RNG (xorshift32) ───────────────────────────────────────────────────

export function seededRand(seed: number): () => number {
  let s = (seed ^ 0xdeadbeef) >>> 0
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5
    return (s >>> 0) / 0xffffffff
  }
}

// ── Glitter flakes ────────────────────────────────────────────────────────────

export interface GlitterFlake {
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

export function getGlitterFlakes(dieIdx: number, faceNum: number): GlitterFlake[] {
  const key = `${dieIdx}_${faceNum}`
  if (flakeCache.has(key)) return flakeCache.get(key)!
  const rand = seededRand(dieIdx * 1000 + faceNum * 7)
  const flakes = generateGlitterFlakes(256, rand)
  flakeCache.set(key, flakes)
  return flakes
}

// ── Canvas pip helpers ────────────────────────────────────────────────────────

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

function makeResinLayer(ctx: CanvasRenderingContext2D, colors: string[], rand: () => number, S: number) {
  ctx.save()
  ctx.filter = `blur(${Math.round(S * 0.16)}px)`
  for (let i = 0; i < 10; i++) {
    const color = colors[Math.floor(rand() * colors.length)]
    const cx = rand() * S
    const cy = rand() * S
    const rx = rand() * S * 0.45 + S * 0.1
    const ry = rand() * S * 0.35 + S * 0.08
    const angle = rand() * Math.PI
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.globalAlpha = rand() * 0.45 + 0.25
    ctx.fill()
    ctx.restore()
  }
  ctx.restore()
  ctx.globalAlpha = 1.0
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
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = color; ctx.fill()
}

// ── Face diffuse textures ─────────────────────────────────────────────────────

function makeFaceTex(n: number, cfg: DieConfig, dieIdx: number, glitterFlakes?: GlitterFlake[]): THREE.CanvasTexture {
  const S = 256
  const canvas = document.createElement('canvas')
  canvas.width = S; canvas.height = S
  const ctx = canvas.getContext('2d')!
  const isGlass = cfg.faceColor.startsWith('rgba(') || ((cfg.physical?.opacity ?? 1) < 1)

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

  if (cfg.resinColors) {
    const rand = seededRand(dieIdx * 3000 + n * 17)
    makeResinLayer(ctx, cfg.resinColors, rand, S)
  }

  if (cfg.glitterSurface && glitterFlakes) makeGlitterLayer(ctx, glitterFlakes)

  if (cfg.pipStyle === 'text') {
    const fontSize = Math.round(S * 0.58)
    ctx.font = `bold ${fontSize}px "${TEXT_FONT}", sans-serif`
    ctx.fillStyle = cfg.pipColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(n), S / 2, S / 2)
  } else {
    const pips = PIP_POSITIONS[n]
    for (const [fx, fy] of pips) {
      const cx = fx * S, cy = fy * S, r = S * 0.075 * (cfg.pipScale ?? 1.0)
      if (isGlass) makeGlassPip(ctx, cx, cy, r, cfg.pipColor)
      else makeStandardPip(ctx, cx, cy, r, cfg.pipColor)
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const textureCache = new Map<number, THREE.CanvasTexture[]>()

export function getDieTextures(idx: number): THREE.CanvasTexture[] {
  if (textureCache.has(idx)) return textureCache.get(idx)!
  const cfg = DICE_COLLECTION[idx]
  const textures = [1, 2, 3, 4, 5, 6].map(n => {
    const flakes = cfg.glitterSurface ? getGlitterFlakes(idx, n) : undefined
    return makeFaceTex(n, cfg, idx, flakes)
  })
  textureCache.set(idx, textures)
  return textures
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
  const sparkleV = Math.round(0.04 * 255)
  for (const f of getGlitterFlakes(dieIdx, faceNum)) {
    const x = Math.round(f.x), y = Math.round(f.y), r = Math.round(f.r)
    ctx.fillStyle = `rgb(${sparkleV},${sparkleV},${sparkleV})`
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
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

const roughnessCache = new Map<number, THREE.CanvasTexture[]>()

export function getDieRoughnessMaps(dieIdx: number): THREE.CanvasTexture[] {
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

// ── Normal maps ───────────────────────────────────────────────────────────────

function makePipHeightData(faceNum: number, cfg: DieConfig, S: number): Float32Array {
  const canvas = document.createElement('canvas')
  canvas.width = S; canvas.height = S
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, S, S)
  ctx.fillStyle = '#ffffff'
  if (cfg.pipStyle === 'text') {
    const fontSize = Math.round(S * 0.58)
    ctx.font = `bold ${fontSize}px "${TEXT_FONT}", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(faceNum), S / 2, S / 2)
  } else {
    const r = S * 0.086 * (cfg.pipScale ?? 1.0)
    for (const [fx, fy] of PIP_POSITIONS[faceNum]) {
      ctx.beginPath()
      ctx.arc(fx * S, fy * S, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  const img = ctx.getImageData(0, 0, S, S)
  const data = new Float32Array(S * S)
  for (let i = 0; i < S * S; i++) data[i] = img.data[i * 4] / 255
  // 4-pass box blur to widen and smooth the bevel
  for (let pass = 0; pass < 4; pass++) {
    const tmp = data.slice()
    for (let y = 1; y < S - 1; y++) {
      for (let x = 1; x < S - 1; x++) {
        data[y * S + x] = (
          tmp[(y-1)*S+(x-1)] + tmp[(y-1)*S+x] + tmp[(y-1)*S+(x+1)] +
          tmp[ y   *S+(x-1)] + tmp[ y   *S+x] + tmp[ y   *S+(x+1)] +
          tmp[(y+1)*S+(x-1)] + tmp[(y+1)*S+x] + tmp[(y+1)*S+(x+1)]
        ) / 9
      }
    }
  }
  return data
}

function applyEngravingNormals(imgData: Uint8ClampedArray, S: number, heightData: Float32Array, strength: number) {
  const clamp = (v: number) => Math.max(0, Math.min(S - 1, v))
  const H = (x: number, y: number) => heightData[clamp(y) * S + clamp(x)]
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (H(x, y) < 0.02) continue // outside pip region, keep existing normal
      // Sobel kernel
      const dX = (H(x+1,y-1) + 2*H(x+1,y) + H(x+1,y+1)) - (H(x-1,y-1) + 2*H(x-1,y) + H(x-1,y+1))
      const dY = (H(x-1,y+1) + 2*H(x,y+1) + H(x+1,y+1)) - (H(x-1,y-1) + 2*H(x,y-1) + H(x+1,y-1))
      // Standard height→normal (nx=-dX). Applied with negative normalScale → engraved look.
      const nx = -dX * strength
      const ny = -dY * strength
      const nz = 1.0
      const len = Math.sqrt(nx*nx + ny*ny + nz*nz)
      const i = (y * S + x) * 4
      imgData[i]   = Math.round((nx/len * 0.5 + 0.5) * 255)
      imgData[i+1] = Math.round((ny/len * 0.5 + 0.5) * 255)
      imgData[i+2] = Math.round((nz/len * 0.5 + 0.5) * 255)
      imgData[i+3] = 255
    }
  }
}

function makeGlitterNormalMap(faceNum: number, dieIdx: number, pipScale: number, cfg: DieConfig): THREE.CanvasTexture {
  const S = 256
  const canvas = document.createElement('canvas')
  canvas.width = S; canvas.height = S
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgb(128,128,255)'
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
  const imgN = ctx.getImageData(0, 0, S, S), dN = imgN.data
  if (cfg.pipEngraving) {
    // Engrave pip/text shapes into the normal map
    const heightData = makePipHeightData(faceNum, cfg, S)
    applyEngravingNormals(dN, S, heightData, 3.5)
  } else {
    // Reset pip areas to flat neutral (no engraving)
    const pipR = S * 0.086 * pipScale
    const pipR2N = (pipR + 2) * (pipR + 2)
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
  }
  ctx.putImageData(imgN, 0, 0)
  return new THREE.CanvasTexture(canvas)
}

function makePipEngravingNormalMap(faceNum: number, cfg: DieConfig): THREE.CanvasTexture {
  const S = 256
  const canvas = document.createElement('canvas')
  canvas.width = S; canvas.height = S
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgb(128,128,255)'
  ctx.fillRect(0, 0, S, S)
  const imgN = ctx.getImageData(0, 0, S, S)
  const heightData = makePipHeightData(faceNum, cfg, S)
  applyEngravingNormals(imgN.data, S, heightData, 3.5)
  ctx.putImageData(imgN, 0, 0)
  return new THREE.CanvasTexture(canvas)
}

const normalMapCache = new Map<number, THREE.CanvasTexture[]>()

export function getDieNormalMaps(dieIdx: number): THREE.CanvasTexture[] | null {
  const cfg = DICE_COLLECTION[dieIdx]
  if (!cfg.glitterSurface && !cfg.pipEngraving) return null
  if (normalMapCache.has(dieIdx)) return normalMapCache.get(dieIdx)!
  const ps = cfg.pipScale ?? 1.0
  const maps = cfg.glitterSurface
    ? [1, 2, 3, 4, 5, 6].map(n => makeGlitterNormalMap(n, dieIdx, ps, cfg))
    : [1, 2, 3, 4, 5, 6].map(n => makePipEngravingNormalMap(n, cfg))
  normalMapCache.set(dieIdx, maps)
  return maps
}

// ── Metalness maps ────────────────────────────────────────────────────────────

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

const metalnessCache = new Map<number, THREE.CanvasTexture[]>()

export function getDieMetalnessMaps(dieIdx: number): THREE.CanvasTexture[] | null {
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

// ── Transmission maps (opaque pips on transmissive body) ─────────────────────

function makeTransmissionMap(n: number, cfg: DieConfig): THREE.CanvasTexture {
  const S = 128
  const canvas = document.createElement('canvas')
  canvas.width = S; canvas.height = S
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, S, S)
  ctx.fillStyle = '#000000'
  if (cfg.pipStyle === 'text') {
    const fontSize = Math.round(S * 0.58)
    ctx.font = `bold ${fontSize}px "${TEXT_FONT}", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(n), S / 2, S / 2)
  } else {
    const r = S * 0.086 * (cfg.pipScale ?? 1.0)
    for (const [fx, fy] of PIP_POSITIONS[n]) {
      ctx.beginPath()
      ctx.arc(fx * S, fy * S, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  return new THREE.CanvasTexture(canvas)
}

const transmissionMapCache = new Map<number, THREE.CanvasTexture[]>()

export function getDieTransmissionMaps(dieIdx: number): THREE.CanvasTexture[] | null {
  const cfg = DICE_COLLECTION[dieIdx]
  if (!cfg.physical || (cfg.physical.transmission ?? 0) <= 0) return null
  if (transmissionMapCache.has(dieIdx)) return transmissionMapCache.get(dieIdx)!
  const maps = [1, 2, 3, 4, 5, 6].map(n => makeTransmissionMap(n, cfg))
  transmissionMapCache.set(dieIdx, maps)
  return maps
}

// ── D20 body textures (single material, full-body effects) ────────────────────

const D20_S = 512

function getD20Flakes(dieIdx: number): GlitterFlake[] {
  const key = `d20_${dieIdx}`
  if (flakeCache.has(key)) return flakeCache.get(key)!
  const flakes = generateGlitterFlakes(D20_S, seededRand(dieIdx * 9000 + 1))
  flakeCache.set(key, flakes)
  return flakes
}

function makeD20BodyTex(dieIdx: number): THREE.CanvasTexture {
  const cfg = DICE_COLLECTION[dieIdx]
  const canvas = document.createElement('canvas')
  canvas.width = D20_S; canvas.height = D20_S
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = cfg.faceColor
  ctx.fillRect(0, 0, D20_S, D20_S)
  if (cfg.resinColors) {
    const rand = seededRand(dieIdx * 3000 + 999)
    makeResinLayer(ctx, cfg.resinColors, rand, D20_S)
  }
  if (cfg.glitterSurface) makeGlitterLayer(ctx, getD20Flakes(dieIdx))
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeD20GlitterNormalMap(dieIdx: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = D20_S; canvas.height = D20_S
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgb(128,128,255)'
  ctx.fillRect(0, 0, D20_S, D20_S)
  for (const f of getD20Flakes(dieIdx)) {
    const nz = Math.sqrt(Math.max(0.01, 1 - f.tiltX * f.tiltX - f.tiltY * f.tiltY))
    const r = Math.round((f.tiltX * 0.5 + 0.5) * 255)
    const g = Math.round((f.tiltY * 0.5 + 0.5) * 255)
    const b = Math.round((nz   * 0.5 + 0.5) * 255)
    const fx = Math.round(f.x), fy = Math.round(f.y), fr = Math.round(f.r)
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(fx - fr, fy - fr, fr * 2, fr * 2)
  }
  return new THREE.CanvasTexture(canvas)
}

function makeD20GlitterRoughnessMap(dieIdx: number): THREE.CanvasTexture {
  const cfg = DICE_COLLECTION[dieIdx]
  const bodyR = cfg.physical?.roughness ?? cfg.standard?.roughness ?? 0.22
  const bodyV = Math.round(bodyR * 255)
  const canvas = document.createElement('canvas')
  canvas.width = D20_S; canvas.height = D20_S
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = `rgb(${bodyV},${bodyV},${bodyV})`
  ctx.fillRect(0, 0, D20_S, D20_S)
  const sparkleV = Math.round(0.04 * 255)
  for (const f of getD20Flakes(dieIdx)) {
    const fx = Math.round(f.x), fy = Math.round(f.y), fr = Math.round(f.r)
    ctx.fillStyle = `rgb(${sparkleV},${sparkleV},${sparkleV})`
    ctx.fillRect(fx - fr, fy - fr, fr * 2, fr * 2)
  }
  return new THREE.CanvasTexture(canvas)
}

export interface D20Textures {
  map: THREE.CanvasTexture | null
  normalMap: THREE.CanvasTexture | null
  roughnessMap: THREE.CanvasTexture | null
}

const d20TexCache = new Map<number, D20Textures>()

export function getD20Textures(dieIdx: number): D20Textures {
  if (d20TexCache.has(dieIdx)) return d20TexCache.get(dieIdx)!
  const cfg = DICE_COLLECTION[dieIdx]
  const hasEffects = cfg.resinColors || cfg.glitterSurface
  const result: D20Textures = {
    map:          hasEffects ? makeD20BodyTex(dieIdx) : null,
    normalMap:    cfg.glitterSurface ? makeD20GlitterNormalMap(dieIdx) : null,
    roughnessMap: cfg.glitterSurface ? makeD20GlitterRoughnessMap(dieIdx) : null,
  }
  d20TexCache.set(dieIdx, result)
  return result
}

// ── Cache disposal ────────────────────────────────────────────────────────────

export function disposeTextureCaches() {
  textureCache.forEach(ts => ts.forEach(t => t.dispose()))
  roughnessCache.forEach(ms => ms.forEach(t => t.dispose()))
  normalMapCache.forEach(ms => ms.forEach(t => t.dispose()))
  metalnessCache.forEach(ms => ms.forEach(t => t.dispose()))
  transmissionMapCache.forEach(ms => ms.forEach(t => t.dispose()))
  d20TexCache.forEach(d => { d.map?.dispose(); d.normalMap?.dispose(); d.roughnessMap?.dispose() })
  textureCache.clear()
  roughnessCache.clear()
  normalMapCache.clear()
  metalnessCache.clear()
  transmissionMapCache.clear()
  d20TexCache.clear()
}
