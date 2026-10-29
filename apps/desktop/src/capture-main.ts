/**
 * 远控采集窗口的渲染入口（阶段 1 第 3 步起：持有 host WS 与屏幕采集）。
 *
 * 为什么要有这个窗口：屏幕采集与 WebRTC 编码原先跑在主窗口的渲染进程里，
 * 主窗口一旦被其它应用全屏遮挡，Chromium 会节流渲染器，采集与编码同时停摆，
 * 控制端画面定格在最后一帧（2026-10-27 实报「完全控制不了」）。
 *
 * 本窗口 show:false + backgroundThrottling:false，与主窗口可见性无关。
 * 确认弹窗在本窗口里不可见，通过 IPC 转给主窗口呈现。
 */
import { createApp } from 'vue';
import {
  useRcHostSignaling,
  type RcConfirmRequest,
  type RcConfirmResult,
} from '@yan-zhi/ui/composables/useRcHostSignaling';

type RcCaptureBridge = {
  rcCaptureReady?: (info: Record<string, unknown>) => Promise<unknown>;
  rcNeedConfirm?: (req: RcConfirmRequest) => Promise<RcConfirmResult>;
};

const bridge = (): RcCaptureBridge | null =>
  (window as unknown as { electronAPI?: RcCaptureBridge }).electronAPI || null;

const stateEl = document.getElementById('state');

function setState(text: string): void {
  if (stateEl) stateEl.textContent = text;
}

const App = {
  setup() {
    const signaling = useRcHostSignaling({
      // 采集窗口不可见：确认框必须由主窗口呈现
      requestConfirm: async (req) => {
        const api = bridge();
        if (!api?.rcNeedConfirm) return { allow: false, reason: 'no-bridge' };
        const res = await api.rcNeedConfirm(req);
        return res || { allow: false, reason: 'no-result' };
      },
      notify: (level, text) => {
        // 状态行在 dev 把窗口 show 出来时可见；同时落主进程可收的 console
        setState(text);
        if (level === 'warning') console.warn('[rc-capture]', text);
        else console.log('[rc-capture]', text);
      },
    });
    // 暴露给 CDP 排查用（窗口隐藏，只能通过调试端口看状态）
    (window as unknown as { __rcHost?: unknown }).__rcHost = signaling;
    return () => null;
  },
};

createApp(App).mount('#app');

async function reportReady(): Promise<void> {
  const href = location.href;
  const api = bridge();
  if (!api?.rcCaptureReady) {
    setState(`采集窗口已加载\n${href}\n\n宿主未提供 rcCaptureReady（非桌面端）`);
    return;
  }
  try {
    await api.rcCaptureReady({
      href,
      hasDisplayMedia: typeof navigator.mediaDevices?.getDisplayMedia === 'function',
      devicePixelRatio: window.devicePixelRatio || 1,
      screen: { w: window.screen.width, h: window.screen.height },
    });
    setState(`采集窗口就绪（信令与采集由本窗口持有）\n${href}`);
  } catch (e) {
    setState(`上报失败：${(e as Error)?.message || e}\n${href}`);
  }
}

void reportReady();
