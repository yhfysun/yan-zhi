// 启动加载壳的进度计算（纯函数，主进程与测试共用同一份实现）。
//
// 为什么不用「已等待时间 / 预估总时长」：dev 下 tsx 冷编译实测 60s+，生产可能 2s，
// 线性时间估算必然出现「卡在 99% 不动」或「提前 100% 后又继续转」。
// 这里改为阶段加权 + 阶段内指数衰减：阶段内缓慢逼近该阶段上限，永不提前到 100%，
// 最后一格只由 mainWindow.show() 的真实事件触发。
//
// 三条不变量（splash-progress.test.cjs 真跑钉住）：
//   ① pct 单调不减；② 未进入 done 阶段时 pct 恒 < 100；③ 失败终止后不再接受普通更新。

'use strict';

const PHASES = [
  { id: 'prepare', weight: 8, caption: '正在准备运行环境…' },
  { id: 'backend', weight: 22, caption: '正在启动后端服务…' },
  { id: 'connect', weight: 30, caption: '正在连接后端服务…' },
  { id: 'window', weight: 15, caption: '正在创建主界面…' },
  { id: 'render', weight: 20, caption: '正在加载界面…' },
  { id: 'done', weight: 5, caption: '即将完成…' },
];

// 每个阶段结束时的累计百分比：8 / 30 / 60 / 75 / 95 / 100
const BOUNDARIES = [];
{
  let acc = 0;
  for (const p of PHASES) {
    acc += p.weight;
    BOUNDARIES.push(acc);
  }
}

const DEFAULT_TAU_MS = 6000;
// pct 变化不足该值时不重复发 IPC，避免 150ms 的健康检查轮询刷屏
const MIN_EMIT_DELTA_PCT = 0.4;

function phaseIndex(id) {
  for (let i = 0; i < PHASES.length; i += 1) {
    if (PHASES[i].id === id) return i;
  }
  return -1;
}

/**
 * @param {{now?: () => number, tauMs?: number}} [options] 注入时钟，便于确定性单测
 */
function createBootProgress(options) {
  const opts = options || {};
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
  const tau = opts.tauMs > 0 ? opts.tauMs : DEFAULT_TAU_MS;

  const state = {
    phaseIndex: -1,
    pct: 0,
    lastEmitPct: 0,
    phaseStartAt: now(),
    detail: '',
    terminated: false,
    failure: null,
  };

  function baseOf(i) {
    return i <= 0 ? 0 : BOUNDARIES[i - 1];
  }

  // 衰减曲线只逼近本阶段上限，不触及下一阶段，更不允许提前满格
  function stagePct(i, elapsedMs) {
    if (i === PHASES.length - 1) return 100;
    const base = baseOf(i);
    const weight = PHASES[i].weight;
    const ratio = 1 - Math.exp(-Math.max(0, elapsedMs) / tau);
    return Math.min(base + weight - 1, base + weight * ratio);
  }

  function rounded(v) {
    return Math.round(v * 10) / 10;
  }

  function snapshot() {
    if (state.phaseIndex < 0) return null;
    return {
      phase: PHASES[state.phaseIndex].id,
      pct: rounded(state.pct),
      caption: PHASES[state.phaseIndex].caption,
      detail: state.detail,
      failed: false,
    };
  }

  /** 推进到某阶段；同阶段重复调用用于阶段内进度刷新。返回 null 表示无需推送。 */
  function advance(id, update) {
    if (state.terminated) return null;
    const i = phaseIndex(id);
    if (i < 0 || i < state.phaseIndex) return null; // 绝不倒退

    const o = update || {};
    const t = now();
    const phaseChanged = i !== state.phaseIndex;
    if (phaseChanged) {
      state.phaseIndex = i;
      state.phaseStartAt = t;
    }

    const nextPct = Math.max(state.pct, stagePct(i, t - state.phaseStartAt));
    const nextDetail = typeof o.detail === 'string' ? o.detail : state.detail;
    const shouldEmit = phaseChanged
      || nextPct - state.lastEmitPct >= MIN_EMIT_DELTA_PCT
      || nextDetail !== state.detail;

    state.pct = nextPct;
    state.detail = nextDetail;
    if (!shouldEmit) return null;
    state.lastEmitPct = nextPct;
    return snapshot();
  }

  /** 只更新「当前动作」一行，不推进阶段（Vite 就绪、后端就绪等旁路信号用）。 */
  function detail(text) {
    if (state.terminated || state.phaseIndex < 0) return null;
    // 已完成（done）后不再改写文案，避免后端自愈等旁路事件把满格帧改花
    if (state.phaseIndex === PHASES.length - 1) return null;
    if (typeof text !== 'string' || text === state.detail) return null;
    state.detail = text;
    state.lastEmitPct = state.pct;
    return snapshot();
  }

  /** 阶段内定时刷新：不切换阶段，只按当前阶段耗时推进衰减进度。 */
  function refresh() {
    if (state.terminated || state.phaseIndex < 0) return null;
    const nextPct = Math.max(
      state.pct,
      stagePct(state.phaseIndex, now() - state.phaseStartAt),
    );
    state.pct = nextPct;
    if (nextPct - state.lastEmitPct < MIN_EMIT_DELTA_PCT) return null;
    state.lastEmitPct = nextPct;
    return snapshot();
  }

  /** 失败态：保留当前进度，终止后续一切普通更新（红条不会被冲回蓝色）。 */
  function fail(caption) {
    if (state.terminated) return null;
    state.terminated = true;
    state.failure = {
      phase: state.phaseIndex < 0 ? PHASES[0].id : PHASES[state.phaseIndex].id,
      pct: rounded(state.pct),
      caption: '启动失败',
      detail: typeof caption === 'string' ? caption : '',
      failed: true,
    };
    return state.failure;
  }

  /** splash 创建后主动重放当前状态，避免只依赖渲染层的异步 getLastUpdate。 */
  function current() {
    return state.failure || snapshot();
  }

  return { advance, fail, detail, refresh, current, state };
}

module.exports = {
  PHASES,
  BOUNDARIES,
  createBootProgress,
  DEFAULT_TAU_MS,
};
