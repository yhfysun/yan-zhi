<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Clock3, Lightbulb, MessageCircle, Sparkles, Volume2, X } from 'lucide-vue-next';
import { api } from '../../api/client';

type PathStep = {
  id: string;
  kind: 'phonics' | 'roots' | 'grammar' | 'story' | 'speaking';
  title: string;
  goal: string;
  minutes: number;
  explanation: string;
  pattern?: string;
  tip: string;
  examples: Array<{ en: string; zh: string }>;
  task: string;
};
type PathStage = {
  id: string;
  title: string;
  subtitle: string;
  level: string;
  steps: PathStep[];
};

const emit = defineEmits<{ practice: []; scenes: []; 'focus-change': [active: boolean] }>();
const stages = ref<PathStage[]>([]);
const stageIndex = ref(0);
const stepIndex = ref(0);
const loading = ref(true);
const error = ref('');
const focusing = ref(false);
let previousBodyOverflow = '';
const stage = computed(() => stages.value[stageIndex.value] || null);
const step = computed(() => stage.value?.steps[stepIndex.value] || null);
const totalSteps = computed(() => stages.value.reduce((sum, item) => sum + item.steps.length, 0));
const completedSteps = computed(() =>
  stages.value.slice(0, stageIndex.value).reduce((sum, item) => sum + item.steps.length, 0) + stepIndex.value,
);
const progress = computed(() => totalSteps.value ? Math.round((completedSteps.value / totalSteps.value) * 100) : 0);
const kindLabel: Record<PathStep['kind'], string> = {
  phonics: '自然拼读',
  roots: '词根词缀',
  grammar: '句型语法',
  story: '故事阅读',
  speaking: '口语输出',
};

function unwrap<T>(response: unknown): T | null {
  if (response && typeof response === 'object' && 'data' in response) return (response as { data: T }).data;
  return null;
}

async function loadPath() {
  loading.value = true;
  error.value = '';
  try {
    const response = await api.get<{ data: PathStage[] }>('/learning/path');
    stages.value = unwrap<PathStage[]>(response) || [];
    if (!stages.value.length) error.value = '学习路线暂时为空';
  } catch (e) {
    error.value = e instanceof Error ? e.message : '学习路线加载失败';
  } finally {
    loading.value = false;
  }
}

function selectStage(index: number) {
  closeFocus();
  stageIndex.value = Math.max(0, Math.min(stages.value.length - 1, index));
  stepIndex.value = 0;
}

function openFocus(index = stepIndex.value) {
  stepIndex.value = Math.max(0, Math.min((stage.value?.steps.length || 1) - 1, index));
  focusing.value = true;
  emit('focus-change', true);
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
}

function closeFocus() {
  if (!focusing.value) return;
  focusing.value = false;
  emit('focus-change', false);
  document.body.style.overflow = previousBodyOverflow;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeFocus();
}

function moveStep(delta: number) {
  if (!stage.value) return;
  const next = stepIndex.value + delta;
  if (next >= 0 && next < stage.value.steps.length) {
    stepIndex.value = next;
    return;
  }
  const nextStage = stageIndex.value + delta;
  if (nextStage < 0 || nextStage >= stages.value.length) return;
  stageIndex.value = nextStage;
  stepIndex.value = delta > 0 ? 0 : stages.value[nextStage].steps.length - 1;
}

function speak(text: string) {
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.86;
  synth.speak(utterance);
}

function restorePosition() {
  try {
    const saved = JSON.parse(localStorage.getItem('yz.learning.path.position') || 'null') as { stage?: string; step?: string } | null;
    if (!saved) return;
    const si = stages.value.findIndex((item) => item.id === saved.stage);
    if (si < 0) return;
    const ti = stages.value[si].steps.findIndex((item) => item.id === saved.step);
    stageIndex.value = si;
    stepIndex.value = Math.max(0, ti);
  } catch { /* 本地进度损坏时从第一课开始 */ }
}

watch([stageIndex, stepIndex], () => {
  try {
    localStorage.setItem('yz.learning.path.position', JSON.stringify({
      stage: stage.value?.id || '',
      step: step.value?.id || '',
    }));
  } catch { /* 隐私模式不阻止学习 */ }
});

onMounted(async () => {
  window.addEventListener('keydown', onKeydown);
  await loadPath();
  restorePosition();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  if (focusing.value) emit('focus-change', false);
  document.body.style.overflow = previousBodyOverflow;
});
</script>

<template>
  <section class="lp-path">
    <header class="lp-path-head">
      <div>
        <span class="lp-path-kicker"><Sparkles :size="13" /> 零基础学习主线</span>
        <h2>每次只学一个点，马上开口用</h2>
        <p>自然拼读 → 词根词缀 → 句型语法 → 故事输入 → 真实交流</p>
      </div>
      <div class="lp-path-actions">
        <button type="button" class="lp-path-action" @click="emit('scenes')"><BookOpen :size="14" /> 场景练习</button>
        <button type="button" class="lp-path-action primary" @click="emit('practice')"><MessageCircle :size="14" /> 自由发挥</button>
      </div>
    </header>

    <div class="lp-path-progress">
      <span>总进度</span>
      <div><i :style="{ width: progress + '%' }"></i></div>
      <b>{{ completedSteps }} / {{ totalSteps }}</b>
    </div>

    <nav class="lp-path-stages" aria-label="英语学习阶段">
      <button
        v-for="(item, index) in stages"
        :key="item.id"
        type="button"
        :class="{ active: index === stageIndex, done: index < stageIndex }"
        @click="selectStage(index)"
      >
        <span>{{ String(index + 1).padStart(2, '0') }}</span>
        <b>{{ item.title }}</b>
        <small>{{ item.level }}</small>
      </button>
    </nav>

    <p v-if="loading" class="lp-path-hint">正在准备学习路线…</p>
    <p v-else-if="error" class="lp-path-hint error">{{ error }}</p>

    <template v-else-if="stage">
      <div class="lp-path-stage-head">
        <div>
          <span>{{ stage.level }}</span>
          <h3>{{ stage.title }}</h3>
          <p>{{ stage.subtitle }}</p>
        </div>
        <div class="lp-path-step-tabs" role="tablist" aria-label="阶段课程">
          <button
            v-for="(item, index) in stage.steps"
            :key="item.id"
            type="button"
            role="tab"
            :aria-selected="index === stepIndex"
            :class="{ active: index === stepIndex, done: index < stepIndex }"
            @click="openFocus(index)"
          >
            <CheckCircle2 v-if="index < stepIndex" :size="12" />
            <span v-else>{{ index + 1 }}</span>
            {{ item.title }}
          </button>
        </div>
      </div>

      <div class="lp-path-step-list">
        <button
          v-for="(item, index) in stage.steps"
          :key="item.id"
          type="button"
          @click="openFocus(index)"
        >
          <span>{{ String(index + 1).padStart(2, '0') }}</span>
          <div>
            <b>{{ item.title }}</b>
            <p>{{ item.goal }}</p>
          </div>
          <small>{{ item.minutes }} 分钟</small>
          <ArrowRight :size="15" />
        </button>
      </div>
    </template>

    <p class="lp-path-method">
      路线吸收自然拼读、词根词缀、结构语法、可理解输入和情景输出等公开学习方法，课程文本为原创改写；
      延伸视频请优先选择原作者公开发布的内容。
    </p>

    <section
      v-if="focusing && stage && step"
      class="lp-path-immersive"
      role="dialog"
      aria-modal="true"
      :aria-label="`${stage.title} · ${step.title}`"
      tabindex="-1"
    >
      <header class="lp-path-immersive-head">
        <button type="button" class="lp-path-back" @click="closeFocus"><ArrowLeft :size="14" /> 返回路线</button>
        <div>
          <span>{{ stage.title }}</span>
          <i>/</i>
          <b>{{ step.title }}</b>
        </div>
        <button type="button" aria-label="关闭当前课程" @click="closeFocus"><X :size="15" /></button>
      </header>
      <div class="lp-path-immersive-layout">
        <nav class="lp-path-immersive-rail" aria-label="本阶段课程">
          <span>{{ stage.level }}</span>
          <button
            v-for="(item, index) in stage.steps"
            :key="item.id"
            type="button"
            :class="{ active: index === stepIndex, done: index < stepIndex }"
            @click="stepIndex = index"
          >
            <i>{{ index < stepIndex ? '✓' : String(index + 1).padStart(2, '0') }}</i>
            <div><b>{{ item.title }}</b><small>{{ kindLabel[item.kind] }}</small></div>
          </button>
        </nav>
        <main class="lp-path-immersive-main">
          <div class="lp-path-paper">
            <div class="lp-path-paper-head">
              <p>{{ kindLabel[step.kind] }} · {{ stage.title }}</p>
              <h1>{{ step.title }}</h1>
              <span><Clock3 :size="13" /> 约 {{ step.minutes }} 分钟 · {{ step.goal }}</span>
            </div>
            <div class="lp-path-paper-body">
              <div v-if="step.pattern" class="lp-path-pattern">
                <span>今天只记这个结构</span>
                <b>{{ step.pattern }}</b>
                <button type="button" aria-label="朗读句型" @click="speak(step.pattern)"><Volume2 :size="14" /></button>
              </div>
              <p class="lp-path-explanation">{{ step.explanation }}</p>
              <div class="lp-path-examples">
                <div v-for="example in step.examples" :key="example.en">
                  <p>{{ example.en }}</p>
                  <small>{{ example.zh }}</small>
                  <button type="button" aria-label="朗读例句" @click="speak(example.en)"><Volume2 :size="13" /></button>
                </div>
              </div>
              <div class="lp-path-tip"><Lightbulb :size="14" /><span>{{ step.tip }}</span></div>
              <div class="lp-path-task">
                <span>现在动手</span>
                <p>{{ step.task }}</p>
                <button type="button" @click="emit('practice')">去自由表达 <ArrowRight :size="14" /></button>
              </div>
            </div>
          </div>
          <footer class="lp-path-footer">
            <button type="button" :disabled="stageIndex === 0 && stepIndex === 0" @click="moveStep(-1)">
              <ArrowLeft :size="14" /> 上一课
            </button>
            <span>第 {{ stageIndex + 1 }} 阶段 · {{ stepIndex + 1 }}/{{ stage.steps.length }}</span>
            <button type="button" class="primary" :disabled="stageIndex === stages.length - 1 && stepIndex === stage.steps.length - 1" @click="moveStep(1)">
              下一课 <ArrowRight :size="14" />
            </button>
          </footer>
        </main>
      </div>
    </section>
  </section>
</template>

<style scoped>
.lp-path { display: flex; flex-direction: column; gap: 12px; min-height: 0; color: var(--color-text); }
.lp-path-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
.lp-path-kicker { display: inline-flex; align-items: center; gap: 5px; color: var(--color-primary); font-size: 11px; font-weight: 700; }
.lp-path-head h2 { margin: 5px 0 3px; font-size: 20px; line-height: 1.35; letter-spacing: 0; }
.lp-path-head p { margin: 0; color: var(--color-text-secondary); font-size: 12px; line-height: 1.55; }
.lp-path-actions { display: flex; gap: 7px; flex-wrap: wrap; justify-content: flex-end; }
.lp-path-action, .lp-path-footer button, .lp-path-task button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: 1px solid var(--color-border); border-radius: 7px; background: var(--glass-bg); color: var(--color-text-secondary); padding: 6px 10px; font-size: 11px; cursor: pointer; }
.lp-path-action.primary, .lp-path-footer button.primary, .lp-path-task button { border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border)); background: color-mix(in srgb, var(--color-primary) 15%, var(--glass-bg)); color: var(--color-primary); }
.lp-path-progress { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 9px; color: var(--color-text-tertiary); font-size: 10px; }
.lp-path-progress > div { height: 5px; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, var(--color-text) 10%, transparent); }
.lp-path-progress i { display: block; height: 100%; border-radius: inherit; background: var(--color-primary); }
.lp-path-stages { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 7px; }
.lp-path-stages button { display: grid; grid-template-columns: 24px minmax(0, 1fr); grid-template-areas: "no title" "no level"; gap: 1px 7px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--glass-bg); color: var(--color-text); padding: 7px 8px; text-align: left; cursor: pointer; }
.lp-path-stages button > span { grid-area: no; align-self: center; color: var(--color-text-tertiary); font-size: 10px; font-weight: 700; }
.lp-path-stages button b { grid-area: title; overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.lp-path-stages button small { grid-area: level; color: var(--color-text-tertiary); font-size: 9px; }
.lp-path-stages button.active { border-color: color-mix(in srgb, var(--color-primary) 62%, var(--color-border)); background: color-mix(in srgb, var(--color-primary) 14%, var(--glass-bg)); }
.lp-path-stages button.active > span { color: var(--color-primary); }
.lp-path-stages button.done { opacity: .72; }
.lp-path-stage-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; border-bottom: 1px solid var(--color-border); padding-bottom: 9px; }
.lp-path-stage-head > div:first-child > span { color: var(--color-primary); font-size: 10px; font-weight: 700; }
.lp-path-stage-head h3 { margin: 2px 0; font-size: 16px; }
.lp-path-stage-head p { margin: 0; color: var(--color-text-secondary); font-size: 11px; }
.lp-path-step-tabs { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
.lp-path-step-tabs button { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--color-border); border-radius: 999px; background: var(--glass-bg); color: var(--color-text-tertiary); padding: 4px 8px; font-size: 9px; cursor: pointer; }
.lp-path-step-tabs button.active { border-color: var(--color-primary); color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 13%, var(--glass-bg)); }
.lp-path-step-tabs button.done { color: var(--color-success); }
.lp-path-step-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.lp-path-step-list > button { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto 16px; align-items: center; gap: 9px; min-width: 0; border: 1px solid var(--color-border); border-radius: 8px; background: var(--glass-bg); color: var(--color-text); padding: 11px; text-align: left; cursor: pointer; }
.lp-path-step-list > button:hover { border-color: color-mix(in srgb, var(--color-primary) 58%, var(--color-border)); background: color-mix(in srgb, var(--color-primary) 9%, var(--glass-bg)); }
.lp-path-step-list > button > span { display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: color-mix(in srgb, var(--color-primary) 12%, transparent); color: var(--color-primary); font-size: 10px; font-weight: 700; }
.lp-path-step-list > button > div { min-width: 0; }
.lp-path-step-list b { display: block; overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.lp-path-step-list p { display: -webkit-box; overflow: hidden; margin: 3px 0 0; color: var(--color-text-tertiary); font-size: 9px; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.lp-path-step-list small { color: var(--color-text-tertiary); font-size: 9px; white-space: nowrap; }
.lp-path-focus { display: flex; flex-direction: column; gap: 9px; border: 1px solid color-mix(in srgb, var(--color-primary) 24%, var(--color-border)); border-radius: 10px; background: var(--skin-panel-bg, var(--glass-bg)); padding: 14px; }
.lp-path-focus-meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.lp-path-focus-meta span { border: 1px solid color-mix(in srgb, var(--color-primary) 42%, var(--color-border)); border-radius: 4px; background: color-mix(in srgb, var(--color-primary) 10%, transparent); color: var(--color-primary); padding: 2px 6px; font-size: 9px; font-weight: 700; }
.lp-path-focus-meta i { display: inline-flex; align-items: center; gap: 4px; color: var(--color-text-tertiary); font-size: 9px; font-style: normal; }
.lp-path-focus > h3 { margin: 0; font-size: 19px; line-height: 1.35; }
.lp-path-goal { margin: 0; color: var(--color-text-secondary); font-size: 12px; line-height: 1.6; }
.lp-path-pattern { display: grid; grid-template-columns: minmax(0, 1fr) 28px; gap: 4px 8px; border-left: 3px solid var(--color-primary); background: color-mix(in srgb, var(--color-primary) 7%, var(--glass-bg)); padding: 8px 9px; }
.lp-path-pattern span { grid-column: 1; color: var(--color-text-tertiary); font-size: 9px; }
.lp-path-pattern b { grid-column: 1; color: var(--color-text); font-size: 14px; line-height: 1.5; }
.lp-path-pattern button, .lp-path-examples button { display: inline-grid; place-items: center; border: 1px solid var(--color-border); border-radius: 6px; background: var(--glass-bg); color: var(--color-primary); cursor: pointer; }
.lp-path-pattern button { grid-column: 2; grid-row: 1 / span 2; width: 28px; height: 28px; align-self: center; }
.lp-path-explanation { margin: 0; color: var(--color-text-secondary); font-size: 12px; line-height: 1.75; }
.lp-path-examples { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
.lp-path-examples > div { position: relative; border: 1px solid var(--color-border); border-radius: 7px; background: var(--glass-bg); padding: 8px 36px 8px 9px; }
.lp-path-examples p { margin: 0; font-size: 12px; line-height: 1.6; }
.lp-path-examples small { display: block; margin-top: 3px; color: var(--color-text-tertiary); font-size: 10px; line-height: 1.5; }
.lp-path-examples button { position: absolute; top: 7px; right: 7px; width: 24px; height: 24px; }
.lp-path-tip { display: flex; align-items: flex-start; gap: 6px; color: var(--color-warning); font-size: 11px; line-height: 1.6; }
.lp-path-tip svg { flex: none; margin-top: 1px; }
.lp-path-task { display: flex; align-items: center; gap: 9px; border-top: 1px solid var(--color-border); padding-top: 9px; }
.lp-path-task > span { flex: none; color: var(--color-primary); font-size: 10px; font-weight: 700; }
.lp-path-task p { flex: 1; margin: 0; color: var(--color-text-secondary); font-size: 11px; line-height: 1.55; }
.lp-path-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.lp-path-footer > span { color: var(--color-text-tertiary); font-size: 9px; }
.lp-path-footer button:disabled { opacity: .42; cursor: default; }
.lp-path-hint { margin: 8px 0; color: var(--color-text-tertiary); font-size: 11px; }
.lp-path-hint.error { color: var(--color-danger); }
.lp-path-method { margin: 0; color: var(--color-text-tertiary); font-size: 9px; line-height: 1.55; }
.lp-path-immersive {
  --path-focus-bg: color-mix(in srgb, var(--skin-surface, #0a131a) 82%, #071018);
  --path-focus-panel: color-mix(in srgb, var(--skin-surface-raised, #14212a) 82%, #0d1922);
  --path-focus-line: rgba(172, 211, 214, .17);
  --path-focus-ink: #eef7f5;
  --path-focus-muted: #a4b8b8;
  --path-focus-accent: #46c8b8;
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--path-focus-bg);
  color: var(--path-focus-ink);
  outline: none;
}
.lp-path-immersive-head { flex: 0 0 58px; display: grid; grid-template-columns: auto minmax(0, 1fr) 34px; align-items: center; gap: 18px; padding: 0 22px; border-bottom: 1px solid var(--path-focus-line); background: color-mix(in srgb, var(--path-focus-bg) 94%, transparent); }
.lp-path-back, .lp-path-immersive-head > button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 32px; border: 1px solid var(--path-focus-line); border-radius: 6px; background: var(--path-focus-panel); color: var(--path-focus-muted); padding: 5px 9px; font-size: 11px; cursor: pointer; }
.lp-path-immersive-head > button { width: 32px; padding: 0; }
.lp-path-immersive-head > div { display: flex; align-items: center; gap: 7px; min-width: 0; color: var(--path-focus-muted); font-size: 11px; white-space: nowrap; }
.lp-path-immersive-head > div span, .lp-path-immersive-head > div b { overflow: hidden; text-overflow: ellipsis; }
.lp-path-immersive-head > div i { opacity: .45; font-style: normal; }
.lp-path-immersive-head > div b { color: var(--path-focus-ink); }
.lp-path-immersive-layout { flex: 1; min-height: 0; display: grid; grid-template-columns: 238px minmax(0, 1fr); }
.lp-path-immersive-rail { min-height: 0; overflow-y: auto; padding: 22px 14px; border-right: 1px solid var(--path-focus-line); background: color-mix(in srgb, var(--path-focus-panel) 72%, transparent); }
.lp-path-immersive-rail > span { display: block; margin: 0 9px 10px; color: var(--path-focus-accent); font-size: 9px; font-weight: 700; }
.lp-path-immersive-rail button { display: grid; grid-template-columns: 30px minmax(0, 1fr); align-items: center; gap: 9px; width: 100%; min-height: 56px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--path-focus-muted); padding: 8px 9px; text-align: left; cursor: pointer; }
.lp-path-immersive-rail button i { display: inline-grid; place-items: center; width: 28px; height: 28px; border: 1px solid var(--path-focus-line); border-radius: 50%; font-size: 9px; font-style: normal; }
.lp-path-immersive-rail button div { min-width: 0; }
.lp-path-immersive-rail button b { display: block; overflow: hidden; color: var(--path-focus-ink); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.lp-path-immersive-rail button small { display: block; margin-top: 2px; color: var(--path-focus-muted); font-size: 9px; }
.lp-path-immersive-rail button:hover { border-color: var(--path-focus-line); }
.lp-path-immersive-rail button.active { border-color: color-mix(in srgb, var(--path-focus-accent) 42%, transparent); background: color-mix(in srgb, var(--path-focus-accent) 11%, transparent); box-shadow: inset 2px 0 0 var(--path-focus-accent); }
.lp-path-immersive-rail button.active i, .lp-path-immersive-rail button.done i { border-color: var(--path-focus-accent); color: var(--path-focus-accent); }
.lp-path-immersive-main { min-width: 0; min-height: 0; overflow-y: auto; padding: 24px clamp(18px, 4vw, 58px) 18px; }
.lp-path-paper { width: min(900px, 100%); min-height: calc(100% - 48px); margin: 0 auto; border: 1px solid rgba(255,255,255,.12); border-radius: 8px; background: #f4f7f5; color: #18252b; box-shadow: 0 22px 68px rgba(0,0,0,.28); }
.lp-path-paper-head { padding: 27px 32px 21px; border-bottom: 1px solid rgba(24,37,43,.11); }
.lp-path-paper-head p { margin: 0; color: #0f766e; font-size: 10px; font-weight: 700; }
.lp-path-paper-head h1 { margin: 7px 0 7px; font-size: 27px; line-height: 1.25; letter-spacing: 0; }
.lp-path-paper-head > span { display: inline-flex; align-items: center; gap: 5px; color: #5d6d72; font-size: 11px; line-height: 1.5; }
.lp-path-paper-body { display: flex; flex-direction: column; gap: 14px; padding: 24px 32px 30px; }
.lp-path-immersive .lp-path-pattern { grid-template-columns: minmax(0, 1fr) 32px; border-left-color: #0f766e; background: #e8f2ef; padding: 11px 12px; }
.lp-path-immersive .lp-path-pattern span { color: #5d6d72; font-size: 10px; }
.lp-path-immersive .lp-path-pattern b { color: #18252b; font-size: 17px; }
.lp-path-immersive .lp-path-pattern button, .lp-path-immersive .lp-path-examples button { border-color: rgba(24,37,43,.15); background: #fff; color: #0f766e; }
.lp-path-immersive .lp-path-explanation { color: #3f5157; font-size: 15px; line-height: 1.9; }
.lp-path-immersive .lp-path-examples > div { border-color: rgba(24,37,43,.12); background: #fff; padding: 12px 42px 12px 13px; }
.lp-path-immersive .lp-path-examples p { color: #1f3036; font-size: 15px; line-height: 1.65; }
.lp-path-immersive .lp-path-examples small { color: #64757a; font-size: 11px; }
.lp-path-immersive .lp-path-tip { color: #9a5b12; font-size: 12px; }
.lp-path-immersive .lp-path-task { border-top-color: rgba(24,37,43,.12); }
.lp-path-immersive .lp-path-task > span { color: #0f766e; }
.lp-path-immersive .lp-path-task p { color: #3f5157; font-size: 13px; }
.lp-path-immersive .lp-path-task button { border-color: #0f766e; background: #0f766e; color: #fff; }
.lp-path-immersive-main > .lp-path-footer { width: min(900px, 100%); margin: 12px auto 0; color: var(--path-focus-muted); }
.lp-path-immersive .lp-path-footer button { border-color: var(--path-focus-line); background: var(--path-focus-panel); color: var(--path-focus-muted); }
.lp-path-immersive .lp-path-footer button.primary { border-color: var(--path-focus-accent); background: color-mix(in srgb, var(--path-focus-accent) 16%, var(--path-focus-panel)); color: var(--path-focus-accent); }
@media (max-width: 900px) {
  .lp-path-head, .lp-path-stage-head, .lp-path-task { align-items: flex-start; flex-direction: column; }
  .lp-path-actions, .lp-path-step-tabs { justify-content: flex-start; }
  .lp-path-stages { display: flex; overflow-x: auto; padding-bottom: 3px; }
  .lp-path-stages button { flex: 0 0 128px; }
  .lp-path-step-list { grid-template-columns: 1fr; }
  .lp-path-examples { grid-template-columns: 1fr; }
  .lp-path-immersive-head { grid-template-columns: auto minmax(0, 1fr) 32px; padding: 0 12px; }
  .lp-path-immersive-head > div span, .lp-path-immersive-head > div i { display: none; }
  .lp-path-back { font-size: 0; width: 32px; padding: 0; }
  .lp-path-immersive-layout { grid-template-columns: 1fr; }
  .lp-path-immersive-rail { display: flex; overflow-x: auto; overflow-y: hidden; gap: 6px; padding: 9px 12px; border-right: 0; border-bottom: 1px solid var(--path-focus-line); }
  .lp-path-immersive-rail > span { display: none; }
  .lp-path-immersive-rail button { flex: 0 0 150px; min-height: 44px; }
  .lp-path-immersive-main { padding: 12px; }
  .lp-path-paper-head, .lp-path-paper-body { padding-left: 19px; padding-right: 19px; }
  .lp-path-paper-head h1 { font-size: 23px; }
}
</style>
