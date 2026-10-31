/**
 * 被控端「远控中」悬浮卡片（独立渲染入口，与主窗口/采集窗口解耦）。
 *
 * 为什么是独立入口而不是主窗口里的组件：
 *  - 主窗口可以被最小化/隐藏到托盘，被其他应用全屏盖住；卡片必须始终可见。
 *  - 绝不能复用 useRcHostSignaling：那是**单例 host WS**，第二条连接会把采集窗口顶掉，
 *    直接摧毁正在进行的 WebRTC 会话（服务端只保留一条 hostConn）。
 * 因此这里只吃主进程推来的状态（session-state IPC），不发任何远控信令。
 */
interface RcCardState {
  active?: boolean;
  device?: string;
  since?: number;
  via?: string;
  collapsed?: boolean;
  edge?: string;
}

interface RcCardBridge {
  rcCardState?: () => Promise<RcCardState>;
  rcCardDisconnect?: () => Promise<{ ok?: boolean; error?: string }>;
  rcCardHide?: () => Promise<{ ok?: boolean }>;
  onRcCardState?: (cb: (s: RcCardState) => void) => () => void;
  onRcCardDock?: (cb: (d: { edge?: string; collapsed?: boolean }) => void) => () => void;
}

const electron = (): RcCardBridge | null =>
  (window as unknown as { electronAPI?: RcCardBridge }).electronAPI || null;

const deviceEl = document.getElementById('device') as HTMLElement | null;
const timeEl = document.getElementById('time') as HTMLElement | null;
const badgeEl = document.getElementById('badge') as HTMLElement | null;
const stopBtn = document.getElementById('stop') as HTMLButtonElement | null;
const minBtn = document.getElementById('min') as HTMLButtonElement | null;

/** 会话起始时刻（服务端 grantedAt；缺省用本地时间兜底，断线重连也不会重置） */
let since = Date.now();
let ticker: number | null = null;

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function tick(): void {
  if (timeEl) timeEl.textContent = fmt(Date.now() - since);
}

function startTicker(): void {
  if (ticker !== null) return;
  tick();
  ticker = window.setInterval(tick, 1000);
}

function applyState(s: RcCardState | null | undefined): void {
  const active = !!(s && s.active);
  if (!active) {
    // 会话结束：主进程随后会隐藏窗口；这里先把内容清干净，避免闪一帧旧设备名
    document.body.classList.remove('collapsed');
    if (ticker !== null) {
      clearInterval(ticker);
      ticker = null;
    }
    return;
  }
  const via = String(s?.via || '');
  if (deviceEl) deviceEl.textContent = String(s?.device || '未知设备');
  if (badgeEl) {
    const text = via === 'open' ? '免确认直连' : via === 'trusted' ? '信任设备' : '';
    badgeEl.textContent = text;
    badgeEl.hidden = !text;
  }
  since = Number(s?.since) || Date.now();
  startTicker();
}

function applyDock(d: { edge?: string; collapsed?: boolean } | null | undefined): void {
  document.body.classList.toggle('collapsed', !!(d && d.collapsed));
}

const api = electron();

api?.onRcCardState?.((s) => applyState(s));
api?.onRcCardDock?.((d) => applyDock(d));

void (async () => {
  try {
    const s = await api?.rcCardState?.();
    if (s) {
      applyState(s);
      applyDock(s);
    }
  } catch {
    /* 主进程未就绪：等下一轮推送 */
  }
})();

minBtn?.addEventListener('click', () => {
  void api?.rcCardHide?.();
});

stopBtn?.addEventListener('click', () => {
  if (!stopBtn) return;
  stopBtn.disabled = true;
  stopBtn.textContent = '断开中…';
  void (async () => {
    try {
      const res = await api?.rcCardDisconnect?.();
      if (res && res.ok) {
        stopBtn.textContent = '已断开';
        return;
      }
      stopBtn.textContent = res?.error ? '断开失败' : '无法断开';
      stopBtn.title = String(res?.error || '');
      // 失败可重试（例如采集窗口正在重建）
      window.setTimeout(() => {
        stopBtn.disabled = false;
        stopBtn.textContent = '断开';
      }, 2500);
    } catch (e) {
      stopBtn.textContent = '断开失败';
      stopBtn.title = (e as Error)?.message || String(e);
      window.setTimeout(() => {
        stopBtn.disabled = false;
        stopBtn.textContent = '断开';
      }, 2500);
    }
  })();
});
