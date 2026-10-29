/**
 * 被控端信令 + 采集（阶段 1 第 3 步：可跑在隐藏采集窗口里）。
 *
 * 为什么要有它：屏幕采集与 WebRTC 编码原先跑在主窗口渲染进程里，主窗口一旦被其它
 * 应用全屏遮挡，Chromium 会节流渲染器，采集与编码同时停摆，控制端画面定格在最后一帧
 * （2026-10-27 实报「完全控制不了」）。现在由常驻的隐藏窗口持有信令与采集，
 * 主窗口只负责 UI 与确认弹窗。
 *
 * 与宿主的契约：
 *   - requestConfirm：弹确认框（采集窗口不可见，必须由宿主转交主窗口）
 *   - notify：用户提示（隐藏窗口里无意义，默认落控制台）
 *
 * 重要：host WS 在服务端是单例（hostConn），同一时间只能有一个宿主调用本 composable，
 * 否则两条连接会互相顶掉。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { API_BASE, buildRequestHeaders, wsUrl } from '../api/client';

/** 多显示器：主进程枚举的单屏信息（bounds 为虚拟屏物理像素，与注入坐标同系） */
export interface RcDisplayInfo {
  id: string;
  /** desktopCapturer 的 source id（"screen:0:0"）：部分环境 display_id 为空，按它匹配才可靠 */
  sourceId?: string;
  label: string;
  primary: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RcElectronAPI {
  rcPrivacy?: (on: boolean) => Promise<unknown>;
  rcDisplays?: () => Promise<{ ok: boolean; displays?: RcDisplayInfo[] }>;
  rcSetCaptureDisplay?: (id: string) => Promise<{ ok: boolean }>;
  /** 实际采集到的显示器（选屏可能被主进程回退，渲染层据此回正） */
  rcCapturedDisplay?: () => Promise<{ ok: boolean; displayId?: string; sourceId?: string }>;
  /** 会话开始系统通知（明示原则：远控不静默） */
  rcNotify?: (title: string, body: string) => Promise<unknown>;
  /** 托盘「远控中」状态上报（提示 + 一键断开菜单项随之更新） */
  rcSessionState?: (active: boolean, device: string) => Promise<unknown>;
  /** 托盘一键断开 → 在 host WS 上发 session.stop {all:true} */
  onRcDisconnectAll?: (cb: () => void) => void;
  /** 确认弹窗需要被看见：主窗口抬到前台并短暂置顶 */
  rcRaisePrompt?: (on: boolean) => Promise<unknown>;
  /** 阶段 1：把确认请求转给主窗口（采集窗口本身不可见） */
  rcNeedConfirm?: (req: RcConfirmRequest) => Promise<RcConfirmResult>;
}

const electron = (): RcElectronAPI | null =>
  (window as unknown as { electronAPI?: RcElectronAPI }).electronAPI || null;

/**
 * 只有主窗口承担「被控端 UI」职责；但阶段 1 起信令搬到采集窗口，本模块不再需要
 * 自行判断子窗口 —— 是否启用由宿主传入的 enabled 决定。
 */
const isChildWindow = typeof location !== 'undefined' && /[?&]szwin=1(&|$)/.test(location.hash);

/** 确认请求（配对授权 / 请求操作权限） */
export interface RcConfirmRequest {
  kind: 'pair' | 'input';
  device?: string;
  confirmId?: string;
  sessionId?: string;
  displays?: RcDisplayInfo[];
  defaultDisplayId?: string;
}

export interface RcConfirmResult {
  allow: boolean;
  trust?: boolean;
  readOnly?: boolean;
  displayId?: string;
  reason?: string;
}

export interface RcHostSignalingOptions {
  enabled?: boolean;
  /** 弹确认框。缺省视为拒绝（宁可不连，也不静默放行） */
  requestConfirm?: (req: RcConfirmRequest) => Promise<RcConfirmResult>;
  /** 用户提示；隐藏窗口默认落控制台 */
  notify?: (level: 'info' | 'warning' | 'success', text: string) => void;
}

export function useRcHostSignaling(options: RcHostSignalingOptions = {}) {
  const enabled = options.enabled !== false && !isChildWindow;

  const pluginEnabled = ref(false);
  const connected = ref(false);
  const displays = ref<RcDisplayInfo[]>([]);
  const captureDisplayId = ref('');
  /** 跨公网 ICE 配置（rtc.start 下发；LAN 会话为空数组 = 纯 host candidate 直连） */
  const rtcIceServers = ref<{ urls: string[]; username?: string; credential?: string }[]>([]);

  let hostKey = '';
  let ws: WebSocket | null = null;
  let pollTimer: number | null = null;
  let pingTimer: number | null = null;
  /** 进行中的 WebRTC 连接：sessionId → RTCPeerConnection */
  const pcs = new Map<string, RTCPeerConnection>();
  /** 出帧诊断：sessionId → 周期统计定时器（黑屏排查的唯一可靠证据） */
  const statsTimers = new Map<string, number>();
  const STATS_INTERVAL_MS = 5000;
  /** 连续多少次统计 framesEncoded 不增长 → 判定编码器停滞 */
  const STATS_STALL_TICKS = 3;

  const notify = options.notify ?? ((level, text) => {
    if (level === 'warning') console.warn('[rc-host]', text);
    else console.log('[rc-host]', text);
  });

  function askConfirm(req: RcConfirmRequest): Promise<RcConfirmResult> {
    if (options.requestConfirm) {
      return options.requestConfirm(req).catch(() => ({ allow: false, reason: 'confirm-failed' }));
    }
    return Promise.resolve({ allow: false, reason: 'no-confirm-handler' });
  }

  const fetchJson = async (path: string, init?: RequestInit): Promise<Record<string, unknown>> => {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...(init?.headers || {}), ...buildRequestHeaders() },
    });
    return (await res.json()) as Record<string, unknown>;
  };

  async function ensureHostKey(): Promise<void> {
    if (hostKey) return;
    try {
      const res = await fetchJson('/plugin/remote-control/hostkey', { method: 'GET' });
      if (res.error) return;
      hostKey = String((res.data as { key?: string })?.key || '');
    } catch {
      /* 服务端不可用/插件未注册：轮询下轮再试 */
    }
  }

  async function poll(): Promise<void> {
    try {
      await ensureHostKey();
      if (!hostKey) return;
      const res = await fetchJson('/plugin/remote-control/status', {
        method: 'GET',
        headers: { 'x-rc-host-key': hostKey },
      });
      if (res.error) {
        pluginEnabled.value = false;
        teardownWs();
        return;
      }
      const d = (res.data || {}) as Record<string, unknown>;
      pluginEnabled.value = true;
      syncSessionUi(d.session as Record<string, unknown> | null | undefined);
      const needsWs = !!d.pendingCount || !!d.session;
      if (needsWs && !connected.value) openHostWs();
      else if (!needsWs && connected.value && !pcs.size) teardownWs();
    } catch {
      pluginEnabled.value = false;
    }
  }

  /** 上次通知过的会话设备（只在空 → 有 的跳变时弹系统通知，避免每轮轮询轰炸） */
  let notifiedDevice = '';
  /**
   * 会话明示（护栏 10「明示原则」）+ 托盘「远控中」状态（护栏 13）。
   * 以 /status 轮询为唯一真相源：渲染层重载、会话结束、插件停用都会在下一轮自愈，
   * 不依赖 session.started/ended 消息（白名单直连不经过确认弹窗也覆盖）。
   */
  function syncSessionUi(sess: Record<string, unknown> | null | undefined): void {
    const api = electron();
    if (!api) return;
    const device = String((sess as { device?: string })?.device || '');
    try {
      void api.rcSessionState?.(!!device, device);
      if (device && device !== notifiedDevice) {
        notifiedDevice = device;
        void api.rcNotify?.('远程控制', `${device} 正在远程观看并操作本机（托盘可一键断开）`);
      } else if (!device) {
        notifiedDevice = '';
      }
    } catch { /* ignore */ }
  }

  function openHostWs(): void {
    if (ws) return;
    let sock: WebSocket;
    try {
      sock = new WebSocket(wsUrl(`/plugin/remote-control/session/ws?role=host&key=${encodeURIComponent(hostKey)}`));
    } catch {
      return;
    }
    ws = sock;
    sock.onopen = () => {
      connected.value = true;
      try {
        sock.send(JSON.stringify({ type: 'rtc.ready' }));
      } catch { /* ignore */ }
      pingTimer = window.setInterval(() => {
        try {
          sock.send(JSON.stringify({ type: 'ping', t: Date.now() }));
        } catch { /* ignore */ }
      }, 10_000);
    };
    sock.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      void onMessage(msg);
    };
    sock.onclose = () => {
      connected.value = false;
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      ws = null;
      teardownPcs();
      rtcIceServers.value = [];
      // 会话随 host WS 断开全部结束（服务端同口径）→ 托盘状态立即校正
      try { electron()?.rcSessionState?.(false, ''); } catch { /* ignore */ }
    };
    sock.onerror = () => { /* onclose 统一收尾 */ };
  }

  function teardownWs(): void {
    if (ws) {
      try {
        ws.close();
      } catch { /* ignore */ }
      ws = null;
    }
    connected.value = false;
  }

  async function onMessage(msg: Record<string, unknown>): Promise<void> {
    const type = String(msg.type || '');
    switch (type) {
      case 'host.hello':
        // 待确认会话随后逐条以 session.pending 下发，这里无需处理
        break;
      case 'session.pending':
        // 确认要走宿主 UI（采集窗口不可见），不能阻塞在这里等 —— 交给异步流程
        void handlePending(msg);
        break;
      case 'rtc.start':
        // 会话 granted 且走 WebRTC：等控制端的 rtc.offer。跨公网 ICE 配置随本消息下发
        rtcIceServers.value = Array.isArray(msg.iceServers)
          ? (msg.iceServers as { urls: string[]; username?: string; credential?: string }[])
          : [];
        break;
      case 'rtc.offer':
        await handleOffer(String(msg.sessionId || ''), String(msg.sdp || ''));
        break;
      case 'rtc.stop': {
        const id = String(msg.sessionId || '');
        const conn = pcs.get(id);
        if (conn) {
          try {
            conn.close();
          } catch { /* ignore */ }
          pcs.delete(id);
        }
        break;
      }
      case 'audio.state': {
        // 音频转发开关：启停音频轨道发送（轨道存在但不发数据；关闭≠销毁，重新打开免重协商）
        const conn = pcs.get(String(msg.sessionId || ''));
        const on = !!msg.on;
        for (const sender of conn?.getSenders() || []) {
          if (sender.track?.kind === 'audio') sender.track.enabled = on;
        }
        notify('info', on ? '音频转发已开启' : '音频转发已关闭');
        break;
      }
      case 'privacy.on':
      case 'privacy.off': {
        // 隐私屏：主进程在所有显示器上铺全黑点击穿透窗；仅桌面端可用（Web 宿主无 electronAPI 自动跳过）
        const on = type === 'privacy.on';
        try {
          electron()?.rcPrivacy?.(on);
        } catch { /* ignore */ }
        notify('info', on ? '隐私屏已开启（本机屏幕已遮黑）' : '隐私屏已关闭');
        break;
      }
      case 'input.request':
        // 只读会话里对方请求操作权限：必须本人当场确认，绝不做静默放行
        void (async () => {
          const sessionId = String(msg.sessionId || '');
          const res = await askConfirm({ kind: 'input', sessionId });
          // 严格判定：未明确允许就是拒绝
          if (res.allow === true) {
            try {
              ws?.send(JSON.stringify({ type: 'input.grant', sessionId, allow: true }));
            } catch { /* ignore */ }
          } else {
            try {
              ws?.send(JSON.stringify({ type: 'input.grant', sessionId, allow: false }));
            } catch { /* ignore */ }
          }
        })();
        break;
      case 'displays.request':
        // 控制端主动要清单：重新枚举后回推（原来只在协商完成时推一次，推丢就没了「显示器」入口）
        void refreshDisplays().then(() => announceDisplays(String(msg.sessionId || '')));
        break;
      case 'screen.request':
        // 控制端要画面几何：重新枚举后重发 rtc.screen（不再赌 answer 之后那一次不丢）
        void refreshDisplays().then(() => sendScreenAndDisplays(String(msg.sessionId || '')));
        break;
      case 'display.select':
        // 控制端切换采集显示器：重新采集并 replaceTrack（无需重协商）
        void switchCaptureDisplay(String(msg.sessionId || ''), String(msg.displayId || ''));
        break;
      default:
        break;
    }
  }

  /** 待确认会话：枚举显示器 → 请宿主弹框 → 把结果发回服务端 */
  async function handlePending(msg: Record<string, unknown>): Promise<void> {
    const device = String(msg.device || '未命名设备');
    const confirmId = String(msg.confirmId || '');
    await refreshDisplays();
    const res = await askConfirm({
      kind: 'pair',
      device,
      confirmId,
      displays: displays.value,
      defaultDisplayId: captureDisplayId.value,
    });
    if (res.displayId && displays.value.some((d) => d.id === res.displayId)) {
      captureDisplayId.value = res.displayId;
    }
    if (res.allow) await applyCaptureDisplay(); // 弹窗选的采集源先对主进程生效，随后 handler 按此挑源
    if (!ws || ws.readyState !== 1) return;
    try {
      ws.send(JSON.stringify({
        type: 'decision',
        confirmId,
        action: res.allow ? 'allow' : 'deny',
        trust: res.allow && (res.trust ?? false),
        readOnly: res.allow && (res.readOnly ?? false),
        ...(res.allow && captureDisplayId.value ? { displayId: captureDisplayId.value } : {}),
      }));
    } catch { /* ignore */ }
  }

  /** 显示器枚举（仅 Electron 宿主）：填充弹窗下拉框并把默认选择钉在主屏 */
  async function refreshDisplays(): Promise<void> {
    const api = electron();
    if (!api?.rcDisplays) return;
    try {
      const r = await api.rcDisplays();
      if (r?.ok && Array.isArray(r.displays) && r.displays.length) {
        displays.value = r.displays;
        // 记忆的选择已失效（显示器拔掉）→ 回主屏
        if (!r.displays.some((d) => d.id === captureDisplayId.value)) {
          captureDisplayId.value = (r.displays.find((d) => d.primary) || r.displays[0]).id;
        }
      }
    } catch { /* ignore */ }
  }

  /** 把弹窗/切换菜单选择的采集目标设置给主进程（''=主屏兜底） */
  async function applyCaptureDisplay(): Promise<void> {
    const api = electron();
    if (!api?.rcSetCaptureDisplay) return;
    try {
      // ★ 传 sourceId：部分 Windows/高 DPI 环境 desktopCapturer 的 display_id 是空串，
      //   主进程按 display_id 匹配必然落空 → 静默回采主屏（切副屏无效的直接原因）。
      const d = displays.value.find((x) => x.id === captureDisplayId.value);
      await api.rcSetCaptureDisplay(d?.sourceId || captureDisplayId.value || '');
    } catch { /* ignore */ }
  }

  /**
   * 用采集流的真实尺寸校正当前显示器，返回校正后的 displayId（无匹配返回 ''）。
   *
   * 为什么不能只信 handler 的选择：Electron 在多显示器（尤其混合 DPI）下会出现
   * 「handler 选了副屏、getDisplayMedia 仍返回主屏流」——实测两块屏拿到的都是
   * 1920×1080。此时若几何按所选副屏下发，控制端坐标会整体偏移，表现就是
   * 「切副屏后完全控制不了」。这里以流尺寸为准，宁可回退主屏也不让画面与坐标错位。
   */
  function alignDisplayToStream(track: MediaStreamTrack): string {
    const st = track.getSettings();
    const w = Number(st.width) || 0;
    const h = Number(st.height) || 0;
    if (!w || !h || !displays.value.length) return '';
    const match = displays.value.find((d) => Math.abs(d.w - w) <= 2 && Math.abs(d.h - h) <= 2);
    if (match) {
      captureDisplayId.value = match.id;
      return match.id;
    }
    const primary = displays.value.find((d) => d.primary);
    if (primary) captureDisplayId.value = primary.id;
    return '';
  }

  /** 采集画面对应的屏幕几何（物理像素）+ 显示器清单 → 插件 → 控制端坐标换算 */
  function sendScreenAndDisplays(sessionId: string): void {
    if (!ws || ws.readyState !== 1) return;
    const d = displays.value.find((x) => x.id === captureDisplayId.value)
      || displays.value.find((x) => x.primary)
      || null;
    if (d) {
      ws.send(JSON.stringify({ type: 'rtc.screen', sessionId, x: d.x, y: d.y, w: d.w, h: d.h }));
      ws.send(JSON.stringify({ type: 'displays', sessionId, list: displays.value, current: captureDisplayId.value }));
    } else {
      // 非 Electron 宿主拿不到显示器清单：沿用渲染层 window.screen（主屏假设）
      const dpr = window.devicePixelRatio || 1;
      ws.send(JSON.stringify({
        type: 'rtc.screen',
        sessionId,
        x: 0,
        y: 0,
        w: Math.round(window.screen.width * dpr),
        h: Math.round(window.screen.height * dpr),
      }));
    }
  }

  /** 系统弹条「停止共享」→ 结束会话。用 onended 属性挂接，切换显示器时置 null 防误报 */
  function guardTrackEnd(sessionId: string, track: MediaStreamTrack): void {
    track.onended = () => {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'session.stop', sessionId }));
      teardownPc(sessionId);
    };
  }

  /**
   * 视频采集：走 getDisplayMedia（主进程 handler 按 rcSetCaptureDisplay 选源）。
   *
   * 为什么不用 getUserMedia + chromeMediaSourceId：那条路虽然能精确选屏，
   * 但产出的 track 在 WebRTC 里出不了帧（实测 2026-10-28：JPEG 兼容模式正常、
   * 切到 WebRTC 就黑屏）。这里必须只用会正常编码的采集路径。
   *
   * 选屏的正确性靠 handler：它在请求方没要音频时不会附带 loopback，
   * 从而不会触发「带系统声音就忽略选屏」的 Chromium 行为。
   */
  async function acquireVideoTrack(sourceId: string): Promise<MediaStreamTrack> {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const track = stream.getVideoTracks()[0];
    if (!track) {
      for (const t of stream.getTracks()) t.stop();
      throw new Error('采集流无视频轨');
    }
    const actual = String(track.getSettings().deviceId || '');
    if (sourceId && actual && actual !== sourceId) {
      notify('warning', `采集源被系统回退（期望 ${sourceId}，实际 ${actual}）`);
    }
    return track;
  }

  /**
   * 系统声音（loopback）：只能经 getDisplayMedia 取回来。
   * 它会附带一条主屏视频轨 —— 这里只留音频、视频立刻停掉，避免与指定源的视频轨打架。
   * 拿不到不算失败（无音频设备 / 被策略禁用）。
   */
  async function acquireAudioTrack(): Promise<MediaStreamTrack | null> {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
      const audio = stream.getAudioTracks()[0] || null;
      for (const vt of stream.getVideoTracks()) vt.stop();
      return audio;
    } catch {
      return null;
    }
  }

  /** WebRTC 采集端：指定源取视频 + 单独取系统声音 → 应答 */
  async function handleOffer(sessionId: string, sdp: string): Promise<void> {
    if (!sdp) return;
    try {
      await applyCaptureDisplay();
      await refreshDisplays();
      const target = displays.value.find((x) => x.id === captureDisplayId.value)
        || displays.value.find((x) => x.primary)
        || null;
      // ★ sourceId 只用于「告诉主进程采哪块屏」，拿不到不等于采不了 —— 主进程的
      //   display media handler 会回退主屏。此前这里直接抛错，于是多显示器/高 DPI
      //   环境下 display_id 为空时 WebRTC 永远建不起来，只剩 JPEG：
      //   控制端表现为「一直黑屏、JPEG 正常」（2026-10-28 实报，日志「拿不到采集源 id」）。
      if (target && !target.sourceId) {
        console.warn('[rc-webrtc] 显示器 sourceId 缺失，交主进程回退主屏采集，displayId=', target.id);
      }
      const videoTrack = await acquireVideoTrack(target?.sourceId || '');
      // 采集真正落在哪块屏：以流的真实尺寸为准
      if (!alignDisplayToStream(videoTrack)) {
        notify('warning', '副屏采集不可用（Chromium 返回的仍是主屏），已回退主屏几何');
      }
      // 重连场景同一会话可能已有一条旧连接：先拆再建，避免泄漏
      teardownPc(sessionId);
      // LAN：host candidate 直连无需任何服务器；跨公网：经 STUN 打洞 / TURN 中继（配置随 rtc.start 下发）
      const conn = new RTCPeerConnection(rtcIceServers.value.length ? { iceServers: rtcIceServers.value } : {});
      pcs.set(sessionId, conn);
      // ★ 视频/音频必须进同一个 MediaStream：分两个流时，控制端 ontrack 收到音频事件
      //   的 e.streams[0] 是纯音频流，晚于视频事件到达就会把视频流覆盖掉 → 控制端
      //   播着一条没有视频轨的 stream，永远黑屏（2026-10-28 CDP 实锤 videoTrackCount=0）。
      const sendStream = new MediaStream([videoTrack]);
      conn.addTrack(videoTrack, sendStream);
      // 音频轨道默认不发送（隐私优先：控制端显式开启后才传出系统声音）
      const audioTrack = await acquireAudioTrack();
      // ★ 取系统声音要第二次 getDisplayMedia，而 Windows 的桌面采集底层可能复用
      //   同一条 capture session —— 停掉第二次的视频轨时不排除把第一次的也停掉。
      //   真发生的话表面看是「track live 但编码器不出帧」，最难查。这里立刻抓。
      if (videoTrack.readyState !== 'live') {
        // 连接已建、轨已挂：先拆干净再抛，否则 pcs 里留一条永远不出帧的死连接
        teardownPc(sessionId);
        throw new Error(`取系统声音后视频轨变成 ${videoTrack.readyState}（getDisplayMedia 二次采集冲突）`);
      }
      if (audioTrack) {
        audioTrack.enabled = false;
        conn.addTrack(audioTrack, sendStream);
      }
      conn.onicecandidate = (e) => {
        if (ws && ws.readyState === 1 && e.candidate) {
          ws.send(JSON.stringify({ type: 'rtc.ice', sessionId, candidate: e.candidate.toJSON() }));
        }
      };
      // 屏幕内容：让编码器按「细节优先」并保住帧率 —— 默认降级策略会先砍帧率/分辨率，观感就是卡与糊
      try { (videoTrack as MediaStreamTrack & { contentHint?: string }).contentHint = 'detail'; } catch { /* ignore */ }
      guardTrackEnd(sessionId, videoTrack);
      // 采集源被系统暂停（锁屏 / UAC 遮挡 / 显示器休眠）时轨道会 muted，但连接照样
      // 显示 connected —— 这是「看着连着、画面一动不动」的典型形态，必须留痕。
      videoTrack.addEventListener('mute', () => console.warn('[rc-webrtc] 视频轨 muted（采集源暂停出帧）'));
      videoTrack.addEventListener('unmute', () => console.log('[rc-webrtc] 视频轨恢复出帧'));
      await conn.setRemoteDescription({ type: 'offer', sdp });
      const answer = await conn.createAnswer();
      await conn.setLocalDescription(answer);
      try {
        for (const sender of conn.getSenders()) {
          if (sender.track?.kind !== 'video') continue;
          const p = sender.getParameters();
          p.degradationPreference = 'maintain-framerate';
          await sender.setParameters(p);
        }
      } catch { /* 个别内核不支持该参数：用默认策略 */ }
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'rtc.answer', sessionId, sdp: conn.localDescription?.sdp || answer.sdp }));
        sendScreenAndDisplays(sessionId);
      }
      startStatsWatch(sessionId, conn);
    } catch (e) {
      // 采集/协商失败：不要直接 session.stop（那会把整个会话断掉），把原因转给控制端，
      // 由它立即改用兼容模式（JPEG），用户至少还有画面可用。
      const reason = (e as Error)?.message || '屏幕采集失败';
      notify('warning', `屏幕采集失败，远控将使用兼容模式（JPEG）：${reason}`);
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'rtc.failed', sessionId, reason }));
      }
    }
  }

  /** 把「当前真实采集目标」回推给控制端（切屏失败时让下拉回退到实际画面） */
  function announceDisplays(sessionId: string): void {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: 'displays', sessionId, list: displays.value, current: captureDisplayId.value }));
  }

  /** 采集请求兜底超时：Electron 的 getDisplayMedia 偶发不回调，不能让它把切换流程永远挂住 */
  function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error(msg)), ms);
      p.then(
        (v) => { clearTimeout(t); resolve(v); },
        (e) => { clearTimeout(t); reject(e); },
      );
    });
  }

  /** 会话中切换采集显示器（控制端发起）：重新采集 → replaceTrack（无需重协商）→ 推新几何 */
  async function switchCaptureDisplay(sessionId: string, displayId: string): Promise<void> {
    if (!displayId) return;
    const conn = pcs.get(sessionId);
    if (!conn) {
      // 没有 PeerConnection = 本条信令落到了不持有画面的窗口（或会话已重连）
      announceDisplays(sessionId);
      notify('warning', '当前窗口没有这条远控连接，切屏未执行');
      return;
    }
    captureDisplayId.value = displayId;
    await applyCaptureDisplay();
    // ★ 走完整重协商而不是 replaceTrack：Chromium 桌面流 replaceTrack 后编码器
    //   可能不出帧（2026-10-28 实报「编码器停滞 framesEncoded=4」）。重发 offer 让
    //   handleOffer 按新目标重新采集 + 全新协商，慢 1-2s 但可靠。
    //   handleOffer 开头会 applyCaptureDisplay + 重新对齐几何，无需在这里采集。
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'rtc.restart', sessionId }));
      notify('success', '正在切换显示器…');
    } else {
      notify('warning', '信令已断开，切屏未执行');
    }
  }

  function stopStatsWatch(sessionId: string): void {
    const t = statsTimers.get(sessionId);
    if (t != null) {
      window.clearInterval(t);
      statsTimers.delete(sessionId);
    }
  }

  /**
   * 出帧诊断（2026-10-28 黑屏排查沉淀）：
   * 「控制端黑屏」有三种完全不同的原因，只有下面这行日志能区分 —
   *   ice/conn/dtls 不就绪  → 打洞或中继没通（网络面）
   *   track ended/muted     → 采集源停了（采集面，多半是采集窗口崩了）
   *   framesEncoded 不增长  → 轨道活着但编码器不出帧（编码面）
   * 不留这行证据，每次只能靠重启重连反复试，成本远高于本函数。
   */
  function startStatsWatch(sessionId: string, conn: RTCPeerConnection): void {
    stopStatsWatch(sessionId);
    let frozenTicks = 0;
    let lastEncoded = -1;
    const timer = window.setInterval(() => {
      void (async () => {
        const track = conn.getSenders().find((x) => x.track?.kind === 'video')?.track;
        let framesEncoded: number | null = null;
        let dtls = '';
        try {
          const stats = await conn.getStats();
          stats.forEach((r: Record<string, unknown>) => {
            const type = String(r.type || '');
            if (type === 'outbound-rtp' && r.kind === 'video') framesEncoded = Number(r.framesEncoded);
            else if (type === 'transport') dtls = String(r.dtlsState ?? '');
          });
        } catch { /* 统计失败不影响会话 */ }
        const snapshot = {
          ice: conn.iceConnectionState,
          conn: conn.connectionState,
          dtls,
          framesEncoded,
          track: track ? track.readyState : 'none',
          muted: track ? track.muted : null,
          enabled: track ? track.enabled : null,
        };
        console.log('[rc-webrtc] 发送侧', sessionId.slice(0, 8), JSON.stringify(snapshot));
        if (framesEncoded == null) return;
        // 帧数必须「严格增长」；相等也算停滞（编码器卡死时数字会原地不动）
        if (lastEncoded >= 0 && framesEncoded <= lastEncoded) frozenTicks += 1;
        else frozenTicks = 0;
        lastEncoded = framesEncoded;
        if (frozenTicks < STATS_STALL_TICKS) return;
        frozenTicks = 0;
        const why = track ? `轨道 ${track.readyState}${track.muted ? '·muted' : ''}` : '无视频轨';
        console.warn('[rc-webrtc] 编码器停滞:', JSON.stringify(snapshot));
        notify('warning', `WebRTC 不出帧（framesEncoded 停在 ${framesEncoded}，${why}），控制端会黑屏`);
      })();
    }, STATS_INTERVAL_MS);
    statsTimers.set(sessionId, timer);
  }

  function teardownPc(sessionId: string): void {
    stopStatsWatch(sessionId);
    const conn = pcs.get(sessionId);
    if (conn) {
      try {
        conn.close();
      } catch { /* ignore */ }
      pcs.delete(sessionId);
    }
  }
  function teardownPcs(): void {
    for (const id of [...pcs.keys()]) teardownPc(id);
  }

  /** 诊断用：当前正在推给控制端的视频轨（抓帧确认「采到的到底是不是眼前这块屏」） */
  function getActiveVideoTrack(): MediaStreamTrack | null {
    for (const conn of pcs.values()) {
      const sender = conn.getSenders().find((x) => x.track?.kind === 'video');
      if (sender?.track) return sender.track;
    }
    return null;
  }

  /**
   * 诊断用：WebRTC 发送侧统计。
   * framesEncoded 长期为 0 = 编码器没出帧；iceConnectionState 不是 connected = 打洞/中继没通。
   */
  async function getActiveStats(): Promise<Record<string, unknown> | null> {
    for (const conn of pcs.values()) {
      const out: Record<string, unknown> = {
        iceConnectionState: conn.iceConnectionState,
        connectionState: conn.connectionState,
      };
      try {
        const stats = await conn.getStats();
        stats.forEach((r: Record<string, unknown>) => {
          const type = String(r.type || '');
          if (type === 'outbound-rtp' && r.kind === 'video') {
            out.framesEncoded = r.framesEncoded;
            out.framesSent = r.framesSent;
            out.bytesSent = r.bytesSent;
            out.frameWidth = r.frameWidth;
            out.frameHeight = r.frameHeight;
            out.encoder = r.encoderImplementation;
          } else if (type === 'candidate-pair' && r.state === 'succeeded') {
            out.rtt = r.currentRoundTripTime;
            out.pairBytesSent = r.bytesSent;
          } else if (type === 'transport') {
            out.dtlsState = r.dtlsState;
          }
        });
      } catch { /* 统计失败不影响会话 */ }
      return out;
    }
    return null;
  }

  onMounted(() => {
    if (!enabled) return;
    // 托盘「一键断开」：主进程菜单 → 这里在 host WS 上发 session.stop {all:true}
    electron()?.onRcDisconnectAll?.(() => {
      if (ws && ws.readyState === 1) {
        try {
          ws.send(JSON.stringify({ type: 'session.stop', all: true }));
        } catch { /* ignore */ }
      }
    });
    void poll();
    pollTimer = window.setInterval(() => void poll(), 6000);
  });
  onBeforeUnmount(() => {
    if (!enabled) return;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    // 组件卸载后没人再轮询上报 → 托盘状态必须立刻清掉（防「远控中」角标永久残留）
    try { electron()?.rcSessionState?.(false, ''); } catch { /* ignore */ }
    teardownWs();
    teardownPcs();
  });

  return {
    // 状态
    pluginEnabled,
    connected,
    displays,
    captureDisplayId,
    rtcIceServers,
    // 动作
    refreshDisplays,
    applyCaptureDisplay,
    announceDisplays,
    sendScreenAndDisplays,
    switchCaptureDisplay,
    teardownPc,
    teardownPcs,
    getActiveVideoTrack,
    getActiveStats,
  };
}
