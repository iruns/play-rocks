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
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import gsap from 'gsap'
import {
  TRAY_W, TRAY_H, HALF_DIE,
  FACE_ROTATIONS, PREVIEW_POS,
  DICE_COLLECTION, type DiePath,
  planRoll,
} from '../composables/useDice'
import { makeDieMesh, disposeMesh } from '../composables/useDiceMesh'
import { disposeTextureCaches } from '../composables/useDiceTextures'

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

const raycaster = new THREE.Raycaster()
const ndcPointer = new THREE.Vector2()
let pointerDownPos = { x: 0, y: 0 }

// ── Backdrop ──────────────────────────────────────────────────────────────────

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
  disposeTextureCaches()
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
