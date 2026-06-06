import { onMounted, onUnmounted } from 'vue'

export function useShake(onShake: () => void, threshold = 14) {
  let last = { x: 0, y: 0, z: 0 }
  let cooldown = false

  function handle(e: DeviceMotionEvent) {
    if (cooldown) return
    const a = e.accelerationIncludingGravity
    if (!a) return
    const dx = (a.x ?? 0) - last.x
    const dy = (a.y ?? 0) - last.y
    const dz = (a.z ?? 0) - last.z
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) > threshold) {
      onShake()
      cooldown = true
      setTimeout(() => { cooldown = false }, 1200)
    }
    last = { x: a.x ?? 0, y: a.y ?? 0, z: a.z ?? 0 }
  }

  onMounted(() => window.addEventListener('devicemotion', handle))
  onUnmounted(() => window.removeEventListener('devicemotion', handle))
}
