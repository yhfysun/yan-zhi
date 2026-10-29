<!--
  游戏执行条（P2，2026-10-29）

  为什么是"条"而不是面板：游戏主体要占满画面，任何常驻大面板都会挡操作。
  这条贴在浏览器视图下沿，做四件事：
    · 读状态：调 browser_observe（引擎/场景/可交互节点），压成一行
    · 一键开跑：按键序列 + 轮数 → browser_run_loop，一次调用跑完整段
    · 置顶：默认关（切到别的应用不该一直挡在前面）
    · 急停：发一次 Esc —— 主进程 run_loop 收到即中止并释放按键

  ★ 不做轮询：每次交互才发一次请求，避免空烧 IPC 与脚本预算。
-->
<template>
  <div class="game-bar">
    <span class="dot" :class="dotClass"></span>
    <span class="state">{{ stateText }}</span>

    <button class="gb-btn" :disabled="busy" @click="readState">读状态</button>
    <span class="readout" :title="readout">{{ readout }}</span>

    <span class="spacer"></span>

    <input v-model="seq" class="gb-input gb-input--seq" spellcheck="false"
           title="按键序列：Down / Space*800（长按）/ Right+Up*600（斜向），逗号分隔"
           placeholder="Down,Left" />
    <input v-model.number="rounds" class="gb-input gb-input--num" type="number" min="1" max="200"
           title="轮数" />
    <button class="gb-btn gb-btn--go" :disabled="busy" @click="runPlan">开跑</button>

    <button class="gb-btn" :disabled="!cw || busy" :title="pinned ? '取消置顶，别挡住其它应用' : '置顶，切到别的应用也不被遮住'"
            @click="togglePin">{{ pinned ? '取消置顶' : '置顶' }}</button>
    <button class="gb-stop" :disabled="busy" @click="panic">急停 Esc</button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { parseKeySequence } from '../../utils/gamePlan';

interface ObserveResult {
  engines?: string[];
  canvases?: Array<{ p?: string; w?: number; h?: number }>;
  nodes?: { scene?: string; visited?: number; interactives?: unknown[] } | null;
  grid?: string[] | null;
  notes?: string[];
  error?: string;
}

interface LoopResult {
  steps?: number;
  rounds?: number;
  elapsedMs?: number;
  aborted?: string | null;
  results?: Record<string, unknown>;
  error?: string;
}

const api = (window as any).electronAPI?.browserView;
const cw = (window as any).electronAPI?.childWindow;
const busy = ref(false);
const pinned = ref(false);
const stateText = ref('未读取');
const readout = ref('点「读状态」看引擎与场景（不截图）');
const hasError = ref(false);
/** 按键序列（语法见 title 与 parseKeySequence） */
const seq = ref('Down,Left');
const rounds = ref(10);

const dotClass = computed(() => (busy.value ? 'busy' : hasError.value ? 'err' : 'ok'));

async function activeTabId(): Promise<string | number | null> {
  try {
    const r = await api.ensureActiveTab('page');
    // ★ 主进程的 ensureActiveTab 可能直接返回 tabId 字符串（'tab-1'），也可能返回对象 ——
    //   只认 r.tabId 会让这里恒为 null（实测：执行条一直显示"还没有打开页面"）。
    if (typeof r === 'string' || typeof r === 'number') return r;
    return (r && (r.tabId ?? r.id)) ?? null;
  } catch { return null; }
}

async function readState() {
  if (!api) return;
  busy.value = true;
  hasError.value = false;
  try {
    const id = await activeTabId();
    if (id == null) { stateText.value = '还没有打开页面'; readout.value = '先在上方地址栏输入网址，再点「读状态」'; hasError.value = true; return; }
    const r: ObserveResult = await api.action(id, 'observe', {});
    if (r?.error) { stateText.value = '读取失败'; readout.value = r.error.slice(0, 120); hasError.value = true; return; }
    const engine = (r.engines && r.engines[0]) || '无引擎特征';
    const scene = r.nodes?.scene ? `场景 ${r.nodes.scene}` : '无场景信息';
    const nodes = r.nodes?.interactives ? `可交互 ${r.nodes.interactives.length}` : '';
    const cv = r.canvases && r.canvases[0] ? `画布 ${r.canvases[0].w}×${r.canvases[0].h}` : '';
    stateText.value = `${engine} · ${scene}`;
    readout.value = [cv, nodes, r.grid ? '有网格' : '无网格'].filter(Boolean).join(' · ') || '（空）';
  } catch (e: any) {
    stateText.value = '读取异常';
    readout.value = String(e?.message || e).slice(0, 120);
    hasError.value = true;
  } finally {
    busy.value = false;
  }
}

/**
 * 一键开跑：把「按键序列 + 轮数」变成一次 run_loop 调用。
 * 一次调用跑完整段是硬要求 —— 逐步调用每步都有 IPC 往返与页面稳定等待，
 * 而 run_script 同页 22 次就熔断，一局游戏撑不过十几步。
 */
async function runPlan() {
  if (!api) return;
  const parsed = parseKeySequence(seq.value);
  if (parsed.error) { stateText.value = '无法开跑'; readout.value = parsed.error; hasError.value = true; return; }
  const n = Math.min(Math.max(Number(rounds.value) || 1, 1), 200);
  const perRound = parsed.steps.reduce((s, st) => s + (st.type === 'hold' ? Math.max(0, st.ms || 0) : 120), 0) + 120;
  const maxSeconds = Math.min(300, Math.max(5, Math.ceil((n * perRound) / 1000) + 5));

  busy.value = true;
  hasError.value = false;
  stateText.value = `运行中 · ${n} 轮`;
  readout.value = `${parsed.steps.length} 个动作/轮`;
  try {
    const id = await activeTabId();
    if (id == null) { stateText.value = '还没有打开页面'; readout.value = '先在上方地址栏输入网址'; hasError.value = true; return; }
    const r: LoopResult = await api.action(id, 'run_loop', {
      steps: parsed.steps,
      rounds: n,
      maxSeconds,
    });
    if (r?.error) { stateText.value = '开跑失败'; readout.value = r.error.slice(0, 120); hasError.value = true; return; }
    const why = r.aborted ? ` · 停止于 ${r.aborted}` : '';
    stateText.value = `完成 ${r.steps ?? 0} 步${why}`;
    const res = r.results && Object.keys(r.results).length
      ? ' · ' + JSON.stringify(r.results).slice(0, 90)
      : '';
    readout.value = `${r.elapsedMs ?? 0}ms${res}`;
  } catch (e: any) {
    stateText.value = '开跑异常';
    readout.value = String(e?.message || e).slice(0, 120);
    hasError.value = true;
  } finally {
    busy.value = false;
  }
}

/**
 * 急停：向页面发一次真实 Esc。
 * 主进程 run_loop 监听 before-input-event，收到 Esc 即置 panic 位 →
 * 循环在下一个 guard 处退出，并在 finally 里释放所有还按着的键。
 */
async function panic() {
  if (!api) return;
  busy.value = true;
  try {
    const id = await activeTabId();
    if (id == null) { stateText.value = '还没有打开页面'; hasError.value = true; return; }
    await api.action(id, 'press', { key: 'Escape', fast: true });
    stateText.value = '已发急停（Esc）';
    readout.value = '进行中的 run_loop 会立即中止并释放按键';
  } catch (e: any) {
    stateText.value = '急停失败';
    readout.value = String(e?.message || e).slice(0, 120);
    hasError.value = true;
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  if (!api) { stateText.value = '仅桌面端可用'; hasError.value = true; return; }
  try { pinned.value = !!(await cw?.isAlwaysOnTop?.()); } catch { /* 老版本主进程无此接口 */ }
});

/** 置顶开关：默认关——切到别的应用时不该一直挡在前面 */
async function togglePin() {
  try {
    const r = await cw?.setAlwaysOnTop?.(!pinned.value);
    if (r && r.ok) pinned.value = !!r.on;
  } catch { /* 静默：置顶是增强能力，失败不影响读状态/急停 */ }
}
</script>

<style scoped>
.game-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px;
  background: var(--yz-bar-bg, #0f151e);
  border-top: 1px solid var(--yz-line, #202936);
  font-size: 11.5px; color: var(--yz-text-2, #cdd6e2);
  flex: none;
}
.dot { width: 7px; height: 7px; border-radius: 50%; background: #4a5666; flex: none; }
.dot.ok { background: #35c98a; }
.dot.busy { background: #e8a33a; animation: gb-pulse 1s infinite; }
.dot.err { background: #ff8d80; }
@keyframes gb-pulse { 50% { opacity: .45; } }
.state { font-weight: 600; white-space: nowrap; }
.readout {
  color: var(--yz-text-3, #8a97ab); overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; max-width: 34vw; font-family: ui-monospace, Consolas, monospace;
}
.spacer { flex: 1; }
.gb-input {
  background: var(--yz-input-bg, #0b1017); border: 1px solid var(--yz-line, #232b37);
  color: var(--yz-text-2, #cdd6e2); font-size: 11.5px; padding: 4px 8px; border-radius: 6px;
  font-family: ui-monospace, Consolas, monospace; height: 26px;
}
.gb-input:focus { outline: none; border-color: #3a4a66; }
.gb-input--seq { width: 132px; }
.gb-input--num { width: 56px; text-align: center; }
.gb-btn, .gb-stop {
  border: 1px solid var(--yz-line, #232b37); background: var(--yz-btn-bg, #12161d);
  color: var(--yz-text-2, #cdd6e2); font-size: 11.5px; padding: 4px 10px;
  border-radius: 6px; cursor: pointer; font-family: inherit; white-space: nowrap;
}
.gb-btn:hover { background: #1b2230; }
.gb-btn:disabled, .gb-stop:disabled { opacity: .5; cursor: default; }
.gb-btn--go { border-color: #2f6e55; background: #0e1b17; color: #7fd4a8; }
.gb-btn--go:hover:not(:disabled) { background: #12241e; }
.gb-stop { border-color: #5c2b2b; background: #2a1618; color: #ff8d80; }
.gb-stop:hover:not(:disabled) { background: #3a1c1e; }
</style>
