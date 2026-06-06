<script setup lang="ts">
import { ref, onMounted } from 'vue'
import DiceScene from './components/DiceScene.vue'
import DiceControls from './components/DiceControls.vue'
import { useShake } from './composables/useShake'

const mode = ref<'preview' | 'roll'>('preview')
const dieCount = ref(1)
const selectedDieIndex = ref(0)
const dieType = ref<'D6' | 'D20'>('D6')
const results = ref<number[]>([])
const sceneRef = ref<InstanceType<typeof DiceScene>>()
const appRef = ref<HTMLDivElement>()

function doRoll() {
  if (mode.value !== 'roll') return
  sceneRef.value?.roll()
}

function enterRoll() { mode.value = 'roll' }
function backToPreview() { mode.value = 'preview'; results.value = [] }
function onResults(r: number[]) { results.value = r }
function onSelectDie(i: number) { selectedDieIndex.value = i }
function onSelectDieType(t: 'D6' | 'D20') { dieType.value = t }

useShake(doRoll)

onMounted(() => {
  const el = appRef.value!
  let ty = 0, tt = 0

  el.addEventListener('touchstart', (e: TouchEvent) => {
    ty = e.touches[0].clientY; tt = Date.now()
  }, { passive: true })

  el.addEventListener('touchend', (e: TouchEvent) => {
    if (mode.value !== 'roll') return
    const dy = ty - e.changedTouches[0].clientY
    const dt = Date.now() - tt
    if (dy > 55 && dt < 400) { doRoll(); return }
    if (Math.abs(dy) < 15 && dt < 280) doRoll()
  }, { passive: true })
})
</script>

<template>
  <div ref="appRef" class="app">
    <DiceScene
      ref="sceneRef"
      :mode="mode"
      :selected-die-index="selectedDieIndex"
      :die-count="dieCount"
      :die-type="dieType"
      @select-die="onSelectDie"
      @results="onResults"
    />
    <DiceControls
      :mode="mode"
      :die-count="dieCount"
      :results="results"
      :selected-die-index="selectedDieIndex"
      :die-type="dieType"
      @roll="doRoll"
      @add="dieCount = Math.min(6, dieCount + 1)"
      @remove="dieCount = Math.max(1, dieCount - 1)"
      @select-die="onSelectDie"
      @select-die-type="onSelectDieType"
      @enter-roll="enterRoll"
      @back-to-preview="backToPreview"
    />
  </div>
</template>

<style scoped>
.app {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
}
</style>
