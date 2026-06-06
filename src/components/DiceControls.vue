<template>
  <div class="controls">
    <!-- Preview mode -->
    <template v-if="mode === 'preview'">
      <div class="die-strip">
        <button
          v-for="(die, i) in DICE_COLLECTION"
          :key="die.id"
          class="die-pill"
          :class="{ selected: i === selectedDieIndex }"
          @click="emit('selectDie', i)"
        >
          {{ die.name }}
        </button>
      </div>
      <button class="btn-roll btn-enter" @click="emit('enterRoll')">
        <span class="label">Roll with {{ DICE_COLLECTION[selectedDieIndex].name }}</span>
        <span class="hint">tap · swipe · shake</span>
      </button>
    </template>

    <!-- Roll mode -->
    <template v-else>
      <div class="results">
        <transition-group name="badge">
          <span v-for="(r, i) in results" :key="i" class="badge">{{ r }}</span>
        </transition-group>
        <span v-if="results.length > 1" class="total">= {{ total }}</span>
      </div>
      <div class="row">
        <button class="btn-back" @click="emit('backToPreview')" title="Choose die">←</button>
        <button class="btn-round" :disabled="dieCount <= 1" @click="emit('remove')">−</button>
        <button class="btn-roll" @click="emit('roll')">
          <span class="label">{{ dieCount }}d6</span>
          <span class="hint">{{ DICE_COLLECTION[selectedDieIndex].name }}</span>
        </button>
        <button class="btn-round" :disabled="dieCount >= 6" @click="emit('add')">+</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { DICE_COLLECTION } from '../composables/useDice'

const props = defineProps<{
  mode: 'preview' | 'roll'
  dieCount: number
  results: number[]
  selectedDieIndex: number
}>()

const emit = defineEmits<{
  (e: 'roll'): void
  (e: 'add'): void
  (e: 'remove'): void
  (e: 'selectDie', i: number): void
  (e: 'enterRoll'): void
  (e: 'backToPreview'): void
}>()

const total = computed(() => props.results.reduce((a, b) => a + b, 0))
</script>

<style scoped>
.controls {
  padding: 14px 20px max(14px, env(safe-area-inset-bottom));
  background: rgba(12, 14, 28, 0.84);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}

/* ── Preview strip ─────────── */
.die-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  width: 100%;
  padding-bottom: 2px;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.die-strip::-webkit-scrollbar { display: none; }

.die-pill {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.65);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.3px;
  cursor: pointer;
  touch-action: manipulation;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.die-pill.selected {
  background: rgba(79, 127, 255, 0.25);
  border-color: #4f7fff;
  color: #fff;
}
.die-pill:not(.selected):active {
  background: rgba(255,255,255,0.13);
}

.btn-enter {
  width: 100%;
  max-width: 340px;
}

/* ── Results ───────────────── */
.results {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
}

.badge {
  width: 36px; height: 36px;
  border-radius: 8px;
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.18);
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 700;
  color: #f0e8d5;
  font-family: ui-monospace, monospace;
}

.total {
  color: rgba(255,255,255,0.45);
  font-size: 15px; font-weight: 500; letter-spacing: 0.5px;
}

/* ── Row ───────────────────── */
.row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-back {
  width: 44px; height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.75);
  font-size: 20px; cursor: pointer;
  touch-action: manipulation;
  transition: background 0.15s;
  &:active { background: rgba(255,255,255,0.15); }
}

.btn-round {
  width: 44px; height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.2);
  background: rgba(255,255,255,0.08);
  color: #fff; font-size: 22px; line-height: 1;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  touch-action: manipulation;
  &:disabled { opacity: 0.3; cursor: default; }
  &:not(:disabled):active { background: rgba(255,255,255,0.18); }
}

.btn-roll {
  flex: 1; max-width: 200px; height: 52px;
  border-radius: 26px; border: none;
  background: linear-gradient(135deg, #4f7fff 0%, #7c3aed 100%);
  color: #fff; cursor: pointer;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 1px;
  transition: transform 0.1s, box-shadow 0.15s;
  box-shadow: 0 4px 20px rgba(79, 127, 255, 0.35);
  touch-action: manipulation;
  &:active { transform: scale(0.97); box-shadow: 0 2px 10px rgba(79, 127, 255, 0.25); }
}

.label { font-size: 17px; font-weight: 700; letter-spacing: 0.5px; }
.hint  { font-size: 10px; opacity: 0.65; letter-spacing: 0.8px; text-transform: uppercase; }

.badge-enter-active, .badge-leave-active { transition: all 0.25s ease; }
.badge-enter-from, .badge-leave-to { opacity: 0; transform: scale(0.6) translateY(6px); }
</style>
