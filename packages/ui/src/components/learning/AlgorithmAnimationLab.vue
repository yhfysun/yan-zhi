<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  ChevronLeft,
  ChevronRight,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-vue-next';
import {
  ALGORITHM_ANIMATION_SCENES,
  type AlgorithmAnimationScene,
} from './algorithm-animations';
import AlgorithmSceneCanvas from './AlgorithmSceneCanvas.vue';

const activeSceneId = ref(ALGORITHM_ANIMATION_SCENES[0].id);
const currentStep = ref(0);
const playing = ref(false);
const speed = ref(1);
let playTimer: ReturnType<typeof setTimeout> | null = null;

const activeScene = computed<AlgorithmAnimationScene>(() =>
  ALGORITHM_ANIMATION_SCENES.find((scene) => scene.id === activeSceneId.value)
  || ALGORITHM_ANIMATION_SCENES[0],
);
const step = computed(() => activeScene.value.steps[currentStep.value]);
const lastStep = computed(() => activeScene.value.steps.length - 1);
const progressLabel = computed(() =>
  `${currentStep.value + 1} / ${activeScene.value.steps.length}`,
);

function clearPlayTimer(): void {
  if (playTimer) clearTimeout(playTimer);
  playTimer = null;
}

function pause(): void {
  playing.value = false;
  clearPlayTimer();
}

function selectScene(sceneId: string): void {
  pause();
  activeSceneId.value = sceneId;
  currentStep.value = 0;
}

function goToStep(index: number): void {
  currentStep.value = Math.max(0, Math.min(lastStep.value, index));
}

function previousStep(): void {
  pause();
  goToStep(currentStep.value - 1);
}

function nextStep(): void {
  pause();
  goToStep(currentStep.value + 1);
}

function reset(): void {
  pause();
  currentStep.value = 0;
}

function togglePlay(): void {
  if (playing.value) {
    pause();
    return;
  }
  if (currentStep.value >= lastStep.value) currentStep.value = 0;
  playing.value = true;
}

function scheduleNext(): void {
  clearPlayTimer();
  if (!playing.value) return;
  playTimer = setTimeout(() => {
    if (currentStep.value < lastStep.value) {
      currentStep.value += 1;
      return;
    }
    playing.value = false;
  }, 1100 / speed.value);
}

watch([playing, currentStep, activeSceneId, speed], scheduleNext);

onBeforeUnmount(clearPlayTimer);
</script>

<template>
  <section class="algorithm-animation-lab" aria-labelledby="algorithm-animation-title">
    <header class="animation-head">
      <div>
        <span><Sparkles :size="15" />原理动画</span>
        <h2 id="algorithm-animation-title">让数据自己动起来</h2>
        <p>先看状态怎么变，再盯住每一步为什么可以这样做。十组演示覆盖数组、链表、栈队列、树、图、堆、哈希、动态规划和双指针。</p>
      </div>
      <div class="animation-head-count">
        <b>{{ ALGORITHM_ANIMATION_SCENES.length }}</b>
        <span>组可单步动画</span>
        <small>{{ activeScene.steps.length }} 帧 · {{ activeScene.category }}</small>
      </div>
    </header>

    <div class="animation-shell">
      <nav aria-label="选择算法动画">
        <button
          v-for="scene in ALGORITHM_ANIMATION_SCENES"
          :key="scene.id"
          type="button"
          :aria-pressed="scene.id === activeScene.id"
          :data-algorithm-animation="scene.id"
          @click="selectScene(scene.id)"
        >
          <i>{{ scene.category }}</i>
          <b>{{ scene.title }}</b>
          <small>{{ scene.steps.length }} 帧</small>
        </button>
      </nav>

      <main>
        <header class="animation-scene-head">
          <div>
            <span>{{ activeScene.category }}</span>
            <h3>{{ activeScene.title }}</h3>
            <p>{{ activeScene.story }}</p>
          </div>
          <div>
            <span>先问一句</span>
            <b>{{ activeScene.question }}</b>
            <small>{{ activeScene.complexity }}</small>
          </div>
        </header>

        <AlgorithmSceneCanvas :frame="step.frame" />

        <section class="animation-explanation" aria-live="polite" aria-atomic="true">
          <div>
            <span>第 {{ progressLabel }} 帧</span>
            <h4>{{ step.title }}</h4>
          </div>
          <p>{{ step.narration }}</p>
          <small><b>不变量：</b>{{ step.invariant }}</small>
        </section>

        <div class="animation-controls">
          <div class="animation-buttons">
            <button type="button" :disabled="currentStep === 0" aria-label="上一帧" @click="previousStep">
              <ChevronLeft :size="17" />
            </button>
            <button type="button" class="animation-play" :aria-label="playing ? '暂停动画' : '播放动画'" @click="togglePlay">
              <Pause v-if="playing" :size="17" />
              <Play v-else :size="17" />
              <span>{{ playing ? '暂停' : '播放' }}</span>
            </button>
            <button type="button" :disabled="currentStep === lastStep" aria-label="下一帧" @click="nextStep">
              <ChevronRight :size="17" />
            </button>
            <button type="button" aria-label="重置动画" @click="reset">
              <RotateCcw :size="16" />
            </button>
          </div>

          <label class="animation-progress">
            <span>进度</span>
            <input
              v-model.number="currentStep"
              type="range"
              min="0"
              :max="lastStep"
              step="1"
              :aria-valuetext="`${progressLabel}：${step.title}`"
              @input="pause"
            />
            <b>{{ progressLabel }}</b>
          </label>

          <label class="animation-speed">
            <Gauge :size="15" />
            <span>速度</span>
            <select v-model.number="speed" aria-label="动画播放速度">
              <option :value="0.5">0.5×</option>
              <option :value="1">1×</option>
              <option :value="1.5">1.5×</option>
              <option :value="2">2×</option>
            </select>
          </label>
        </div>

        <footer class="animation-code">
          <div>
            <span>把动画翻成代码</span>
            <b>{{ activeScene.complexity }}</b>
          </div>
          <pre><code>{{ activeScene.code }}</code></pre>
        </footer>
      </main>
    </div>
  </section>
</template>

<style scoped>
.algorithm-animation-lab {
  display: grid;
  gap: 12px;
}
.animation-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding: 15px;
  border: 1px solid var(--color-border);
  border-left: 3px solid #b45309;
  border-radius: 8px;
  background:
    linear-gradient(110deg, color-mix(in srgb, #f59e0b 7%, var(--color-surface)), var(--color-surface) 58%);
}
.animation-head > div:first-child { min-width: 0; }
.animation-head > div:first-child > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #b45309;
  font-size: 9px;
  font-weight: 700;
}
.animation-head h2 { margin: 5px 0; font-size: 21px; }
.animation-head p { margin: 0; max-width: 700px; color: var(--color-text-secondary); font-size: 11px; line-height: 1.75; }
.animation-head-count {
  display: grid;
  min-width: 132px;
  justify-items: end;
  padding-left: 18px;
  border-left: 1px solid var(--color-border);
}
.animation-head-count b { color: #b45309; font-size: 30px; line-height: 1; }
.animation-head-count span { margin-top: 4px; color: var(--color-text-secondary); font-size: 9px; }
.animation-head-count small { margin-top: 6px; color: var(--color-text-tertiary); font-size: 8px; }

.animation-shell {
  display: grid;
  min-height: 620px;
  grid-template-columns: 210px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface) 92%, transparent);
}
.animation-shell > nav {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 5px;
  overflow-y: auto;
  padding: 10px;
  border-right: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-muted) 52%, var(--color-surface));
}
.animation-shell > nav button {
  display: grid;
  min-height: 58px;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 3px 8px;
  align-content: center;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.animation-shell > nav button:hover { background: color-mix(in srgb, var(--color-surface) 76%, transparent); }
.animation-shell > nav button[aria-pressed="true"] {
  border-color: color-mix(in srgb, #b45309 46%, var(--color-border));
  background: var(--color-surface);
  box-shadow: inset 2px 0 0 #b45309;
}
.animation-shell > nav button i {
  grid-column: 1 / -1;
  color: var(--color-text-tertiary);
  font-size: 8px;
  font-style: normal;
}
.animation-shell > nav button b { min-width: 0; overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.animation-shell > nav button small { color: var(--color-text-tertiary); font-size: 8px; }
.animation-shell > nav button[aria-pressed="true"] i,
.animation-shell > nav button[aria-pressed="true"] b { color: #b45309; }

.animation-shell > main {
  min-width: 0;
  padding: 16px;
}
.animation-scene-head {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(190px, .8fr);
  gap: 14px;
  align-items: start;
  margin-bottom: 11px;
}
.animation-scene-head > div:first-child > span { color: #b45309; font-size: 8px; font-weight: 700; }
.animation-scene-head h3 { margin: 3px 0 5px; font-size: 18px; }
.animation-scene-head p { margin: 0; color: var(--color-text-secondary); font-size: 10px; line-height: 1.65; }
.animation-scene-head > div:last-child {
  display: grid;
  gap: 4px;
  padding: 9px 11px;
  border-left: 2px solid color-mix(in srgb, #b45309 54%, var(--color-border));
  background: color-mix(in srgb, #f59e0b 5%, transparent);
}
.animation-scene-head > div:last-child span { color: var(--color-text-tertiary); font-size: 8px; }
.animation-scene-head > div:last-child b { color: var(--color-text); font-size: 10px; line-height: 1.55; }
.animation-scene-head > div:last-child small { color: var(--color-primary); font-size: 8px; }

.animation-explanation {
  display: grid;
  grid-template-columns: minmax(160px, .45fr) minmax(0, 1fr);
  gap: 8px 18px;
  margin-top: 10px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-surface) 95%, var(--color-bg-muted));
}
.animation-explanation > div > span { color: #b45309; font-size: 8px; font-weight: 700; }
.animation-explanation h4 { margin: 3px 0 0; font-size: 14px; }
.animation-explanation > p { margin: 0; color: var(--color-text-secondary); font-size: 11px; line-height: 1.7; }
.animation-explanation > small {
  grid-column: 1 / -1;
  padding-top: 7px;
  border-top: 1px solid color-mix(in srgb, var(--color-border) 65%, transparent);
  color: var(--color-text-tertiary);
  font-size: 9px;
  line-height: 1.6;
}
.animation-explanation > small b { color: var(--color-primary); }

.animation-controls {
  display: grid;
  grid-template-columns: auto minmax(150px, 1fr) auto;
  gap: 10px;
  align-items: center;
  margin-top: 10px;
}
.animation-buttons { display: flex; align-items: center; gap: 5px; }
.animation-buttons button {
  display: inline-flex;
  min-width: 38px;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
}
.animation-buttons button:disabled { opacity: .38; cursor: not-allowed; }
.animation-buttons .animation-play {
  min-width: 82px;
  border-color: color-mix(in srgb, #0f766e 52%, var(--color-border));
  color: #0f766e;
  font-size: 9px;
  font-weight: 700;
}
.animation-progress { display: grid; grid-template-columns: auto minmax(72px, 1fr) auto; gap: 8px; align-items: center; color: var(--color-text-tertiary); font-size: 8px; }
.animation-progress input { width: 100%; accent-color: #0f766e; }
.animation-progress b { min-width: 38px; color: var(--color-text-secondary); font-size: 8px; text-align: right; }
.animation-speed {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--color-text-tertiary);
  font-size: 8px;
}
.animation-speed select {
  min-height: 36px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text);
  padding: 0 7px;
  font: inherit;
  font-size: 9px;
}

.animation-code {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 12px;
  margin-top: 10px;
  padding: 11px;
  border-radius: 7px;
  background: #12201d;
  color: #d9eee8;
}
.animation-code > div { display: grid; align-content: start; gap: 5px; }
.animation-code span { color: #8fb9ae; font-size: 8px; }
.animation-code b { color: #5eead4; font-size: 9px; line-height: 1.55; }
.animation-code pre { min-width: 0; margin: 0; overflow-x: auto; }
.animation-code code { font: 9px/1.65 ui-monospace, "SFMono-Regular", Consolas, monospace; white-space: pre; }

.animation-shell button:focus-visible,
.animation-controls input:focus-visible,
.animation-speed select:focus-visible {
  outline: 2px solid #b45309;
  outline-offset: 2px;
}

@media (max-width: 1100px) {
  .animation-head { align-items: flex-start; flex-direction: column; }
  .animation-head-count {
    grid-template-columns: auto auto minmax(0, 1fr);
    align-items: baseline;
    justify-items: start;
    gap: 6px;
    width: 100%;
    padding: 8px 0 0;
    border-top: 1px solid var(--color-border);
    border-left: 0;
  }
  .animation-head-count b { font-size: 23px; }
  .animation-head-count span,
  .animation-head-count small { margin: 0; }
  .animation-head-count small { text-align: right; }
  .animation-shell { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
  .animation-shell > nav {
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 8px;
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
  }
  .animation-shell > nav button { flex: 0 0 132px; min-height: 52px; }
  .animation-scene-head { grid-template-columns: 1fr; }
  .animation-scene-head > div:last-child { grid-template-columns: auto minmax(0, 1fr); align-items: center; }
  .animation-scene-head > div:last-child small { grid-column: 1 / -1; }
}

@media (max-width: 620px) {
  .animation-head { padding: 12px; }
  .animation-head h2 { font-size: 18px; }
  .animation-head p { font-size: 10px; }
  .animation-shell { min-height: 0; }
  .animation-shell > main { padding: 10px; }
  .animation-scene-head h3 { font-size: 16px; }
  .animation-explanation { grid-template-columns: 1fr; }
  .animation-explanation > small { grid-column: 1; }
  .animation-controls { grid-template-columns: 1fr auto; }
  .animation-buttons { grid-column: 1 / -1; justify-content: space-between; }
  .animation-buttons button { min-width: 44px; min-height: 44px; }
  .animation-buttons .animation-play { flex: 1; }
  .animation-progress { min-width: 0; }
  .animation-speed select { min-height: 44px; }
  .animation-code { grid-template-columns: 1fr; }
  .animation-code code { font-size: 8px; }
}

@media (prefers-reduced-motion: reduce) {
  .animation-shell > nav button { transition: none; }
}
</style>
