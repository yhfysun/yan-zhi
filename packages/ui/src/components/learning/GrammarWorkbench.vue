<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronRight, Lightbulb, Volume2, X } from 'lucide-vue-next';
import { api } from '../../api/client';

type GrammarBrief = { id: string; title: string; cefr: string; group: string; rule: string };
type GrammarDetail = GrammarBrief & {
  examples: Array<{ en: string; zh: string }>;
  pairs: Array<{ wrong: string; right: string; why: string }>;
};
type GrammarPhase = 'rule' | 'examples' | 'fix';

const PHASES: Array<{ key: GrammarPhase; label: string; hint: string }> = [
  { key: 'rule', label: '规则', hint: '一句话先看懂' },
  { key: 'examples', label: '例句', hint: '放进真实语境' },
  { key: 'fix', label: '纠错', hint: '找出中式表达' },
];

const emit = defineEmits<{ 'focus-change': [active: boolean] }>();
const list = ref<GrammarBrief[]>([]);
const active = ref<GrammarDetail | null>(null);
const loading = ref(true);
const error = ref('');
const group = ref('全部');
const phaseIndex = ref(0);
const dialogRef = ref<HTMLElement | null>(null);
let previousBodyOverflow = '';
let lastFocusTrigger: HTMLElement | null = null;

const groups = computed(() => ['全部', ...new Set(list.value.map((item) => item.group))]);
const visible = computed(() => group.value === '全部' ? list.value : list.value.filter((item) => item.group === group.value));
const phase = computed(() => PHASES[phaseIndex.value] || PHASES[0]);

function unwrap<T>(response: unknown): T | null {
  if (response && typeof response === 'object' && 'data' in response) return (response as { data: T }).data;
  return null;
}

async function load() {
  loading.value = true;
  try {
    const response = await api.get<{ data: GrammarBrief[] }>('/learning/grammar');
    list.value = unwrap<GrammarBrief[]>(response) || [];
  } catch (e) {
    error.value = e instanceof Error ? e.message : '语法微课加载失败';
  } finally {
    loading.value = false;
  }
}

async function openGrammar(id: string) {
  lastFocusTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  try {
    const response = await api.get<{ data: GrammarDetail }>(`/learning/grammar/${id}`);
    active.value = unwrap<GrammarDetail>(response);
    if (!active.value) return;
    phaseIndex.value = 0;
    emit('focus-change', true);
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    void nextTick(() => dialogRef.value?.focus());
  } catch (e) {
    error.value = e instanceof Error ? e.message : '语法微课加载失败';
  }
}

function closeFocus() {
  if (!active.value) return;
  active.value = null;
  emit('focus-change', false);
  document.body.style.overflow = previousBodyOverflow;
  void nextTick(() => {
    if (lastFocusTrigger?.isConnected) lastFocusTrigger.focus();
    lastFocusTrigger = null;
  });
}

function movePhase(delta: number) {
  const next = phaseIndex.value + delta;
  if (next >= 0 && next < PHASES.length) phaseIndex.value = next;
}

function speak(text: string) {
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.88;
  synth.speak(utterance);
}

function handleKeydown(event: KeyboardEvent) {
  if (!active.value) return;
  if (event.key === 'Escape') {
    closeFocus();
    return;
  }
  if (event.key !== 'Tab' || !dialogRef.value) return;
  const focusable = [...dialogRef.value.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.value)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

void load();
window.addEventListener('keydown', handleKeydown);
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  if (active.value) emit('focus-change', false);
  document.body.style.overflow = previousBodyOverflow;
});
</script>

<template>
  <section class="grammar-workbench">
    <header class="grammar-head">
      <div>
        <span>Grammar map</span>
        <h2>语法不是背名称，是把一句话搭稳</h2>
        <p>每个知识点只用三个步骤：先懂规则，再看例句，最后识别真实错误。</p>
      </div>
      <nav class="grammar-filters" aria-label="语法分组">
        <button
          v-for="item in groups"
          :key="item"
          type="button"
          :class="{ active: group === item }"
          @click="group = item"
        >{{ item }}</button>
      </nav>
    </header>

    <p v-if="loading" class="grammar-hint">正在加载语法地图…</p>
    <p v-else-if="error" class="grammar-hint error">{{ error }}</p>
    <div v-else class="grammar-grid">
      <button v-for="item in visible" :key="item.id" type="button" class="grammar-card" @click="openGrammar(item.id)">
        <span>{{ item.group }} · {{ item.cefr }}</span>
        <b>{{ item.title }}</b>
        <p>{{ item.rule }}</p>
        <i>进入微课 <ChevronRight :size="14" /></i>
      </button>
    </div>

    <section
      v-if="active"
      ref="dialogRef"
      class="grammar-focus"
      role="dialog"
      aria-modal="true"
      :aria-label="active.title"
      tabindex="-1"
    >
      <header class="grammar-focus-head">
        <button type="button" class="grammar-back" @click="closeFocus"><ArrowLeft :size="14" /> 返回语法地图</button>
        <div><span>{{ active.group }}</span><i>/</i><b>{{ active.title }}</b></div>
        <button type="button" aria-label="关闭语法微课" @click="closeFocus"><X :size="16" /></button>
      </header>
      <div class="grammar-focus-layout">
        <nav class="grammar-focus-rail" aria-label="语法微课步骤">
          <span>{{ active.cefr }}</span>
          <button
            v-for="(item, index) in PHASES"
            :key="item.key"
            type="button"
            :class="{ active: phaseIndex === index, done: phaseIndex > index }"
            @click="phaseIndex = index"
          >
            <i>{{ phaseIndex > index ? '✓' : String(index + 1).padStart(2, '0') }}</i>
            <div><b>{{ item.label }}</b><small>{{ item.hint }}</small></div>
          </button>
        </nav>
        <main class="grammar-focus-main">
          <article class="grammar-paper">
            <header class="grammar-paper-head">
              <p>{{ active.group }} · {{ phase.label }}</p>
              <h1>{{ active.title }}</h1>
              <span>{{ phase.hint }}</span>
            </header>
            <div class="grammar-paper-body">
              <section v-if="phase.key === 'rule'" class="grammar-stage">
                <div class="grammar-rule"><Lightbulb :size="17" /><p>{{ active.rule }}</p></div>
                <div class="grammar-method">
                  <b>怎么判断</b>
                  <span>先找主语和动作，再看时间词，最后决定动词形式。</span>
                </div>
              </section>

              <section v-else-if="phase.key === 'examples'" class="grammar-stage">
                <header class="grammar-section-head"><BookOpen :size="16" /><span>在例句里看规则</span></header>
                <article v-for="(item, index) in active.examples" :key="item.en" class="grammar-example">
                  <span>{{ String(index + 1).padStart(2, '0') }}</span>
                  <div><p>{{ item.en }}</p><small>{{ item.zh }}</small></div>
                  <button type="button" aria-label="朗读例句" @click="speak(item.en)"><Volume2 :size="14" /></button>
                </article>
              </section>

              <section v-else class="grammar-stage">
                <header class="grammar-section-head"><CheckCircle2 :size="16" /><span>先找错，再看为什么</span></header>
                <article v-for="(item, index) in active.pairs" :key="item.wrong" class="grammar-pair">
                  <span>{{ String(index + 1).padStart(2, '0') }}</span>
                  <div>
                    <p class="wrong"><s>{{ item.wrong }}</s></p>
                    <p class="right">{{ item.right }} <button type="button" aria-label="朗读正确例句" @click="speak(item.right)"><Volume2 :size="13" /></button></p>
                    <small>{{ item.why }}</small>
                  </div>
                </article>
              </section>
            </div>
          </article>
          <footer class="grammar-footer">
            <button type="button" :disabled="phaseIndex === 0" @click="movePhase(-1)"><ArrowLeft :size="14" /> 上一步</button>
            <span>{{ phase.label }} · {{ phaseIndex + 1 }} / {{ PHASES.length }}</span>
            <button v-if="phaseIndex < PHASES.length - 1" type="button" class="primary" @click="movePhase(1)">下一步 <ArrowRight :size="14" /></button>
            <button v-else type="button" class="primary" @click="closeFocus">完成微课 <CheckCircle2 :size="14" /></button>
          </footer>
        </main>
      </div>
    </section>
  </section>
</template>

<style scoped>
.grammar-workbench { display: flex; flex-direction: column; gap: 14px; min-height: 0; color: var(--color-text); }
.grammar-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
.grammar-head > div > span { color: var(--color-primary); font-size: 10px; font-weight: 700; text-transform: uppercase; }
.grammar-head h2 { margin: 4px 0; font-size: 20px; }
.grammar-head p { margin: 0; color: var(--color-text-secondary); font-size: 12px; line-height: 1.6; }
.grammar-filters { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
.grammar-filters button { border: 1px solid var(--color-border); border-radius: 999px; background: var(--glass-bg); color: var(--color-text-tertiary); padding: 4px 9px; font-size: 10px; cursor: pointer; }
.grammar-filters button.active { border-color: var(--color-primary); color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 11%, var(--glass-bg)); }
.grammar-hint { margin: 12px 0; color: var(--color-text-tertiary); font-size: 11px; }
.grammar-hint.error { color: var(--color-danger); }
.grammar-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.grammar-card { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--glass-bg); color: var(--color-text); padding: 11px 12px; text-align: left; cursor: pointer; }
.grammar-card:hover { border-color: color-mix(in srgb, var(--color-primary) 50%, var(--color-border)); background: color-mix(in srgb, var(--color-primary) 6%, var(--glass-bg)); }
.grammar-card > span { color: var(--color-text-tertiary); font-size: 9px; }
.grammar-card b { font-size: 12px; }
.grammar-card p { display: -webkit-box; overflow: hidden; margin: 0; color: var(--color-text-secondary); font-size: 10px; line-height: 1.55; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.grammar-card i { display: inline-flex; align-items: center; gap: 3px; margin-top: 2px; color: var(--color-primary); font-size: 9px; font-style: normal; }
.grammar-focus { --g-bg: #081017; --g-panel: #101a23; --g-line: rgba(180,214,218,.17); --g-ink: #eef6f4; --g-muted: #9fb3b4; --g-accent: #6ea8ff; --g-paper: #f4f6fa; --g-paper-ink: #18232b; --g-paper-muted: #596a72; position: fixed; inset: 0; z-index: 3000; display: flex; flex-direction: column; overflow: hidden; color: var(--g-ink); background: #081017; outline: none; }
.grammar-focus-head { flex: 0 0 58px; display: grid; grid-template-columns: auto minmax(0, 1fr) 32px; align-items: center; gap: 18px; padding: 0 22px; border-bottom: 1px solid var(--g-line); background: var(--g-panel); }
.grammar-focus-head button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 32px; border: 1px solid var(--g-line); border-radius: 6px; background: var(--g-panel); color: var(--g-muted); cursor: pointer; }
.grammar-back { padding: 5px 9px; font-size: 11px; }
.grammar-focus-head > button:last-child { width: 32px; padding: 0; }
.grammar-focus-head > div { display: flex; align-items: center; gap: 7px; min-width: 0; font-size: 11px; }
.grammar-focus-head span,
.grammar-focus-head b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.grammar-focus-head i { opacity: .5; font-style: normal; }
.grammar-focus-layout { flex: 1; min-height: 0; display: grid; grid-template-columns: 220px minmax(0, 1fr); }
.grammar-focus-rail { min-height: 0; overflow-y: auto; padding: 22px 14px; border-right: 1px solid var(--g-line); background: color-mix(in srgb, var(--g-panel) 78%, transparent); }
.grammar-focus-rail > span { display: block; margin: 0 9px 10px; color: var(--g-accent); font-size: 9px; font-weight: 700; }
.grammar-focus-rail button { display: grid; grid-template-columns: 30px minmax(0, 1fr); align-items: center; gap: 9px; width: 100%; min-height: 56px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--g-muted); padding: 8px 9px; text-align: left; cursor: pointer; }
.grammar-focus-rail button i { display: inline-grid; place-items: center; width: 28px; height: 28px; border: 1px solid var(--g-line); border-radius: 50%; font-size: 9px; font-style: normal; }
.grammar-focus-rail button b { display: block; color: var(--g-ink); font-size: 11px; }
.grammar-focus-rail button small { display: block; margin-top: 2px; color: var(--g-muted); font-size: 9px; }
.grammar-focus-rail button.active { border-color: color-mix(in srgb, var(--g-accent) 43%, transparent); background: color-mix(in srgb, var(--g-accent) 12%, transparent); box-shadow: inset 2px 0 0 var(--g-accent); }
.grammar-focus-rail button.active i,
.grammar-focus-rail button.done i { border-color: var(--g-accent); color: var(--g-accent); }
.grammar-focus-main { min-height: 0; overflow-y: auto; padding: 24px clamp(18px, 4vw, 58px) 18px; }
.grammar-paper { width: min(860px, 100%); min-height: calc(100% - 48px); margin: 0 auto; border: 1px solid rgba(255,255,255,.12); border-radius: 8px; background: var(--g-paper); color: var(--g-paper-ink); box-shadow: 0 22px 68px rgba(0,0,0,.28); }
.grammar-paper-head { padding: 27px 32px 21px; border-bottom: 1px solid rgba(24,37,43,.11); }
.grammar-paper-head p { margin: 0; color: #245bdb; font-size: 10px; font-weight: 700; }
.grammar-paper-head h1 { margin: 7px 0; font-size: clamp(25px, 3vw, 36px); line-height: 1.22; }
.grammar-paper-head span { color: var(--g-paper-muted); font-size: 11px; }
.grammar-paper-body { padding: 24px 32px 30px; }
.grammar-stage { display: flex; flex-direction: column; gap: 14px; }
.grammar-rule { display: grid; grid-template-columns: 24px minmax(0, 1fr); align-items: start; gap: 11px; padding: 19px; border-left: 3px solid #245bdb; background: color-mix(in srgb, #245bdb 6%, var(--g-paper)); color: #245bdb; }
.grammar-rule p { margin: 0; color: var(--g-paper-ink); font-size: 18px; line-height: 1.75; }
.grammar-method { padding: 15px; border: 1px solid rgba(24,37,43,.12); border-radius: 7px; }
.grammar-method b { display: block; color: #245bdb; font-size: 11px; }
.grammar-method span { display: block; margin-top: 6px; color: var(--g-paper-muted); font-size: 13px; line-height: 1.75; }
.grammar-section-head { display: flex; align-items: center; gap: 6px; color: #245bdb; font-size: 11px; font-weight: 700; }
.grammar-example,
.grammar-pair { display: grid; grid-template-columns: 34px minmax(0, 1fr) 30px; gap: 12px; align-items: start; padding: 15px; border: 1px solid rgba(24,37,43,.12); border-radius: 7px; background: #fff; }
.grammar-example > span,
.grammar-pair > span { color: #245bdb; font-size: 10px; font-weight: 700; }
.grammar-example p { margin: 0; font-size: 16px; line-height: 1.7; }
.grammar-example small { display: block; margin-top: 5px; color: var(--g-paper-muted); font-size: 11px; }
.grammar-example button,
.grammar-pair button { display: inline-grid; place-items: center; width: 28px; height: 28px; border: 1px solid rgba(24,37,43,.15); border-radius: 6px; background: #fff; color: #245bdb; cursor: pointer; }
.grammar-pair p { margin: 0 0 5px; font-size: 14px; line-height: 1.6; }
.grammar-pair .wrong { color: #d4380d; }
.grammar-pair .right { color: #0f8a3d; }
.grammar-pair small { color: var(--g-paper-muted); font-size: 11px; line-height: 1.65; }
.grammar-footer { width: min(860px, 100%); margin: 12px auto 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.grammar-footer button { display: inline-flex; align-items: center; gap: 5px; min-height: 34px; border: 1px solid var(--g-line); border-radius: 6px; background: var(--g-panel); color: var(--g-muted); padding: 6px 11px; font-size: 11px; cursor: pointer; }
.grammar-footer button.primary { border-color: var(--g-accent); color: var(--g-accent); }
.grammar-footer button:disabled { opacity: .35; cursor: default; }
.grammar-footer span { color: var(--g-muted); font-size: 9px; }
@media (max-width: 900px) {
  .grammar-head { flex-direction: column; }
  .grammar-filters { justify-content: flex-start; }
  .grammar-grid { grid-template-columns: 1fr 1fr; }
  .grammar-focus-layout { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
  .grammar-focus-rail { display: flex; gap: 6px; overflow-x: auto; overflow-y: hidden; padding: 9px 12px; border-right: 0; border-bottom: 1px solid var(--g-line); }
  .grammar-focus-rail > span { display: none; }
  .grammar-focus-rail button { flex: 0 0 142px; min-height: 44px; }
  .grammar-focus-rail button small { display: none; }
  .grammar-focus-main { padding: 12px; }
  .grammar-paper-head,
  .grammar-paper-body { padding-left: 19px; padding-right: 19px; }
}
@media (max-width: 620px) {
  .grammar-grid { grid-template-columns: 1fr; }
  .grammar-focus-head { grid-template-columns: auto minmax(0, 1fr) 32px; gap: 8px; padding: 0 10px; }
  .grammar-back { width: 32px; padding: 0; font-size: 0; }
  .grammar-focus-head > div span,
  .grammar-focus-head > div i { display: none; }
  .grammar-example,
  .grammar-pair { grid-template-columns: 26px minmax(0, 1fr) 28px; gap: 8px; padding: 12px; }
  .grammar-footer button { min-width: 82px; padding: 6px 8px; }
}
</style>
