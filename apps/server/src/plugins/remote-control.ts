// remote-control 内置插件：远控本机（WebRTC 视频主通道 + C# 代理 JPEG 回退 + 输入注入）。
// 形态与 computer-use 一致（manifest + 入口模块），默认 disabled 注册，需在插件管理页手动开启。
// 实现：视频走被控端 Electron 渲染层 getDisplayMedia → Chrome WebRTC 栈（LAN UDP 直连），
//       信令经本插件 WS 中转；输入统一走常驻 C# 代理进程（user32，<10ms）。
// 配对模型（向日葵式）：被控端展示授权码（随机生成 / 用户自定义）→ 控制端输入 →
//       新设备需被控端弹窗确认（可勾选「信任此设备」入白名单）→ 白名单设备免确认直连。
// 护栏：desktop-input 权限声明 / 输入滑动窗口限流（触顶降级只读）/ 危险组合键黑名单（与
//       computer-use 共用 cu-shared）/ 本应用自身窗口点击默认拒绝 / 全链路审计 /
//       急停（POST /panic：杀代理进程 + 断所有会话）/ 会话独占 + 空闲超时。
// 鉴权分工：控制端凭授权码/设备令牌（pair 换 token）；管理面（看码/改码/白名单/确认）
//       是被控端主人，走 license 门禁；控制端两个无 header 通道（/pair、/session/ws）
//       已加入 license-guard 豁免清单（guard 开启时也不拦，本插件自带配对鉴权）。
import crypto from 'node:crypto';
import { getPluginManager } from '@yan-zhi/core';
import type { PluginManifest, PluginModule, PluginContext, PluginWebSocket } from '@yan-zhi/core';
import { pushPluginAudit } from '../services/plugin-audit.js';
import { assertComboAllowed } from './cu-shared.js';
import {
  RemoteControlAgent,
  generatePairCode,
  normalizePairCode,
  newDeviceToken,
  selfProcNames,
} from './remote-control-agent.js';

export const remoteControlManifest: PluginManifest = {
  id: 'remote-control',
  name: '远程控制',
  version: '0.1.0',
  category: '操作',
  description:
    '手机 / 局域网浏览器实时观看并操作本机：WebRTC 低延迟画面（硬编）+ 鼠标键盘注入，放大全屏后隐藏全部界面，如同直接操作电脑。' +
    '配对采用授权码（随机生成、可自定义），新设备首次连接需本机确认，信任设备加入白名单后免确认。' +
    '护栏：输入限流（触顶降级只读观看）、危险组合键黑名单、本应用窗口点击保护、Ctrl+Alt+Esc 急停一键断流、全量审计；默认关闭，需手动开启',
  permissions: ['desktop-input'],
  contributes: {},
  config: {
    type: 'object',
    properties: {
      maxInputs: { type: 'number', description: '10 分钟窗口内最大输入条数（触顶后本会话降级为只读观看）', default: 2000 },
      allowSelfWindowClick: { type: 'boolean', description: '允许操作本应用自身窗口（默认禁止）', default: false },
      allowExternalSubnet: { type: 'boolean', description: '允许非内网网段发起配对（默认拒绝）', default: false },
      idleTimeoutMin: { type: 'number', description: '会话空闲自动断开（分钟）', default: 30 },
    },
  },
};

// ---------------------------------------------------------------------------
// 纯逻辑（导出供单测）
// ---------------------------------------------------------------------------

export interface StoredPairCode {
  mode: 'temp' | 'custom';
  /** 当前生效的授权码（展示与比对都用归一化前原样） */
  current: string;
  custom?: string;
  updatedAt: number;
}

export interface WhitelistEntry {
  deviceId: string;
  deviceToken: string;
  name: string;
  addedAt: number;
  lastUsedAt: number;
}

/** 滑动窗口限流器（输入频控 / 配对频控共用） */
export class SlidingWindowLimiter {
  private times: number[] = [];
  constructor(
    private cap: number,
    private windowMs = 10 * 60_000,
  ) {}
  hit(now = Date.now()): boolean {
    this.prune(now);
    if (this.times.length >= this.cap) return false;
    this.times.push(now);
    return true;
  }
  allow(now = Date.now()): boolean {
    this.prune(now);
    return this.times.length < this.cap;
  }
  get count(): number {
    this.prune();
    return this.times.length;
  }
  private prune(now = Date.now()): void {
    const cutoff = now - this.windowMs;
    while (this.times.length && this.times[0] <= cutoff) this.times.shift();
  }
}

/** 内网地址判定（配对来源限制；loopback + RFC1918 + IPv6 ULA/link-local） */
export function isPrivateRemoteAddr(addr: string): boolean {
  if (!addr) return false;
  let a = addr.trim().toLowerCase();
  if (a.startsWith('::ffff:')) a = a.slice(7);
  if (a === '::1' || a === 'localhost') return true;
  if (a.startsWith('127.') || a.startsWith('10.') || a.startsWith('192.168.')) return true;
  const m = /^172\.(\d+)\./.exec(a);
  if (m) {
    const second = Number(m[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (a.startsWith('fc') || a.startsWith('fd') || a.startsWith('fe80')) return true;
  return false;
}

/** 授权码合法性（自定义码）：归一化后 6-16 位，仅限授权码字符集 */
export function isValidCustomCode(code: string): boolean {
  const n = normalizePairCode(code);
  return n.length >= 6 && n.length <= 16 && /^[a-z2-9]+$/.test(n) && !/[01ilo]/.test(n);
}

const timingEq = (a: string, b: string): boolean => {
  const ba = crypto.createHash('sha256').update(a).digest();
  const bb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ba, bb);
};

export type PairStatus = 'granted' | 'pending';

export interface PairDecisionInput {
  code: string;
  deviceId: string;
  deviceToken?: string;
  hasActiveGranted: boolean;
  stored: StoredPairCode;
  whitelist: WhitelistEntry[];
  remoteAddr: string;
  allowExternalSubnet: boolean;
}

export interface PairDecisionResult {
  ok: boolean;
  error?: string;
  status?: PairStatus;
  /** trusted=true 表示白名单直连（无需被控端确认） */
  trusted?: boolean;
  entry?: WhitelistEntry;
}

/**
 * 配对判定（纯函数）：busy > 白名单直连 > 授权码比对 > 来源网段。
 * 白名单要求 deviceId+deviceToken 双因子匹配，防伪造 deviceId。
 */
export function evaluatePair(input: PairDecisionInput): PairDecisionResult {
  if (!input.allowExternalSubnet && !isPrivateRemoteAddr(input.remoteAddr)) {
    return { ok: false, error: '仅允许内网设备发起配对（如需放开请在插件设置开启 allowExternalSubnet）' };
  }
  if (!input.deviceId || typeof input.deviceId !== 'string' || input.deviceId.length > 64) {
    return { ok: false, error: '缺少有效的设备标识 deviceId' };
  }
  if (input.hasActiveGranted) {
    return { ok: false, error: '已有远控会话进行中（独占），请先在控制端断开或等其结束' };
  }
  const entry = input.whitelist.find((w) => w.deviceId === input.deviceId);
  if (entry && input.deviceToken && timingEq(entry.deviceToken, input.deviceToken)) {
    return { ok: true, status: 'granted', trusted: true, entry };
  }
  const codeOk = normalizePairCode(input.stored.current).length > 0
    && timingEq(normalizePairCode(input.code), normalizePairCode(input.stored.current));
  if (!codeOk) return { ok: false, error: '授权码不正确' };
  return { ok: true, status: 'pending' };
}

/** 输入消息校验（黑名单/形状/范围）。返回 {ok, agentOp} 或 {ok:false, error} */
export function validateInputMsg(msg: Record<string, unknown>): { ok: boolean; error?: string; agentOp?: Record<string, unknown> } {
  const action = String(msg.action || '');
  const num = (v: unknown): number => Number(v);
  const coord = (v: unknown, name: string): string | null => {
    const n = num(v);
    if (!Number.isFinite(n) || n < -1e5 || n > 1e5) return `坐标 ${name} 非法`;
    return null;
  };
  switch (action) {
    case 'click':
    case 'dblclick':
    case 'down':
    case 'up':
    case 'move': {
      for (const k of ['x', 'y']) {
        const bad = coord(msg[k], k);
        if (bad) return { ok: false, error: bad };
      }
      const button = ['left', 'right', 'middle'].includes(String(msg.button)) ? String(msg.button) : 'left';
      const op = action === 'click'
        ? { op: 'click', x: Math.round(num(msg.x)), y: Math.round(num(msg.y)), button, double: false }
        : action === 'dblclick'
          ? { op: 'click', x: Math.round(num(msg.x)), y: Math.round(num(msg.y)), button, double: true }
          : action === 'down'
            ? { op: 'down', x: Math.round(num(msg.x)), y: Math.round(num(msg.y)), button }
            : action === 'up'
              ? { op: 'up', x: Math.round(num(msg.x)), y: Math.round(num(msg.y)), button }
              : { op: 'move', x: Math.round(num(msg.x)), y: Math.round(num(msg.y)) };
      return { ok: true, agentOp: op };
    }
    case 'wheel': {
      for (const k of ['x', 'y']) {
        const bad = coord(msg[k], k);
        if (bad) return { ok: false, error: bad };
      }
      const delta = Math.max(-2000, Math.min(2000, Math.round(num(msg.delta) || -120)));
      return { ok: true, agentOp: { op: 'wheel', x: Math.round(num(msg.x)), y: Math.round(num(msg.y)), delta } };
    }
    case 'key': {
      const keys = Array.isArray(msg.keys) ? msg.keys.map((k) => String(k)) : [];
      try {
        assertComboAllowed(keys);
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
      return { ok: true, agentOp: { op: 'key', keys } };
    }
    case 'type': {
      const text = String(msg.text ?? '');
      if (!text || text.length > 4000) return { ok: false, error: 'text 为空或超长（≤4000）' };
      return { ok: true, agentOp: { op: 'type', text } };
    }
    default:
      return { ok: false, error: `未知输入 action: ${action}` };
  }
}

// ---------------------------------------------------------------------------
// 会话与连接管理（有副作用，activate 内使用）
// ---------------------------------------------------------------------------

interface RcSession {
  id: string;
  confirmId: string;
  status: 'pending' | 'granted' | 'ended';
  deviceId: string;
  deviceName: string;
  trusted: boolean;
  createdAt: number;
  lastActivityAt: number;
  token?: string;
  mode: '' | 'webrtc' | 'jpeg';
  controllerWs: PluginWebSocket | null;
  limiter: SlidingWindowLimiter;
  readOnlyNotified?: boolean;
}

interface HostConn {
  ws: PluginWebSocket;
  /** 决定该连接是否能提供 WebRTC 采集：Electron 渲染层 = true */
  canCapture: boolean;
  alive: boolean;
}

const IDLE_CHECK_MS = 30_000;

// deactivate 钩子需要拿到 activate 闭包里的会话表/代理进程/定时器，
// 通过模块级转发函数衔接（PluginModule.deactivate 与 activate 不共享作用域）。
let deactivateImpl: (() => Promise<void>) | null = null;

export const remoteControlModule: PluginModule = {
  activate: (ctx) => {
    const cfg = (ctx.config || {}) as Record<string, unknown>;
    const maxInputs = Number(cfg.maxInputs) || 2000;
    const allowSelfWindowClick = !!cfg.allowSelfWindowClick;
    const allowExternalSubnet = !!cfg.allowExternalSubnet;
    const idleTimeoutMs = (Number(cfg.idleTimeoutMin) || 30) * 60_000;

    // ---- 存储 ----
    type Storage = PluginContext['storage'];
    const storage: Storage = ctx.storage;
    const whitelisted = new Map<string, WhitelistEntry>();
    const hostKey = crypto.randomUUID().replace(/-/g, '');
    let storedCode: StoredPairCode = { mode: 'temp', current: generatePairCode(), updatedAt: Date.now() };

    const loadState = async (): Promise<void> => {
      const code = await storage.get<StoredPairCode>('paircode');
      if (code?.current) storedCode = code;
      const wl = await storage.get<WhitelistEntry[]>('whitelist');
      if (Array.isArray(wl)) for (const w of wl) whitelisted.set(w.deviceId, w);
    };
    const saveWhitelist = async (): Promise<void> => {
      await storage.set('whitelist', Array.from(whitelisted.values()));
    };
    void loadState().catch((e) => ctx.log('[remote-control] 状态加载失败:', e));

    // ---- 会话 / 连接 ----
    const sessions = new Map<string, RcSession>(); // sessionId → session
    const pendingByConfirm = new Map<string, RcSession>(); // confirmId → pending session
    const controllersByToken = new Map<string, RcSession>(); // session token → granted session
    let hostConn: HostConn | null = null;
    const pairLimiter = new SlidingWindowLimiter(10, 60_000); // 10 次/分钟（防授权码爆破）
    let agent: RemoteControlAgent | null = null;
    let agentStarting: Promise<void> | null = null;
    let panicActive = false;
    let stateDirty = false;

    // ---- 审计 ----
    const audit = async (op: string, detail: Record<string, unknown>): Promise<void> => {
      try {
        await pushPluginAudit(storage, { t: Date.now(), op, detail }, 200);
      } catch {
        /* 审计失败不阻断 */
      }
    };

    const mask = (s: string): string => (s.length <= 4 ? '****' : `${s.slice(0, 2)}****${s.slice(-2)}`);

    // ---- 代理进程 ----
    const ensureAgent = async (): Promise<RemoteControlAgent> => {
      if (agent?.running) return agent;
      if (!agentStarting) {
        agentStarting = (async () => {
          const a = agent ?? new RemoteControlAgent();
          a.onFrame = (buf) => {
            // 回退通道：帧只发给当前 granted 会话
            for (const s of sessions.values()) {
              if (s.status === 'granted' && s.mode === 'jpeg' && s.controllerWs) {
                try {
                  s.controllerWs.send(buf);
                } catch {
                  /* 控制端断了，close 事件会收尾 */
                }
              }
            }
          };
          a.onExit = (code) => {
            ctx.log(`[remote-control] 代理进程退出 code=${code}`);
            agent = null;
          };
          await a.start({ selfNames: selfProcNames(), allowSelf: allowSelfWindowClick });
          agent = a;
        })().finally(() => {
          agentStarting = null;
        });
      }
      await agentStarting;
      if (!agent) throw new Error('远控代理进程启动失败');
      return agent;
    };
    const stopAgent = (): void => {
      try {
        agent?.stop();
      } catch {
        /* ignore */
      }
      agent = null;
    };

    // ---- 会话收发 ----
    const sendWsJson = (ws: PluginWebSocket, data: Record<string, unknown>): void => {
      try {
        ws.send(JSON.stringify(data));
      } catch {
        /* ignore */
      }
    };
    const notifyHost = (data: Record<string, unknown>): void => {
      if (hostConn) sendWsJson(hostConn.ws, data);
    };

    const endSession = async (s: RcSession, reason: string): Promise<void> => {
      if (s.status === 'ended') return;
      s.status = 'ended';
      sessions.delete(s.id);
      if (pendingByConfirm.get(s.confirmId) === s) pendingByConfirm.delete(s.confirmId);
      if (s.token && controllersByToken.get(s.token) === s) controllersByToken.delete(s.token);
      if (s.controllerWs) {
        sendWsJson(s.controllerWs, { type: 'session.ended', reason });
        try {
          s.controllerWs.close();
        } catch {
          /* ignore */
        }
        s.controllerWs = null;
      }
      await audit('session-end', { sessionId: s.id, device: s.deviceName, reason });
      // 没有活动会话时停掉回退采集与代理进程（释放 CPU）
      if (![...sessions.values()].some((x) => x.status === 'granted')) {
        try {
          agent?.fire({ op: 'stream', fps: 0 });
        } catch {
          /* ignore */
        }
        stopAgent();
      }
    };
    const endAll = async (reason: string): Promise<void> => {
      for (const s of [...sessions.values()]) await endSession(s, reason);
    };

    const grantSession = async (s: RcSession, trust: boolean): Promise<void> => {
      s.status = 'granted';
      s.token = newDeviceToken();
      s.lastActivityAt = Date.now();
      controllersByToken.set(s.token, s);
      pendingByConfirm.delete(s.confirmId);
      // 信任 → 写白名单（已有条目则刷新 lastUsedAt；新条目签发长期设备令牌）
      let deviceToken: string | undefined;
      const existing = whitelisted.get(s.deviceId);
      if (existing) {
        existing.lastUsedAt = Date.now();
        await saveWhitelist().catch(() => undefined);
      } else if (trust) {
        deviceToken = newDeviceToken();
        whitelisted.set(s.deviceId, {
          deviceId: s.deviceId,
          deviceToken,
          name: s.deviceName || '未命名设备',
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        });
        await saveWhitelist().catch(() => undefined);
      }
      // WebRTC 有被控端渲染层在场就走主通道；否则回退 JPEG
      s.mode = hostConn?.canCapture ? 'webrtc' : 'jpeg';
      const grantedMsg: Record<string, unknown> = {
        type: 'session.granted',
        sessionId: s.id,
        token: s.token,
        mode: s.mode,
        ...(deviceToken ? { deviceToken } : {}),
      };
      if (s.mode === 'jpeg') {
        try {
          const a = await ensureAgent();
          const info = await a.call({ op: 'screensize' }, 10000);
          s.controllerWs && sendWsJson(s.controllerWs, {
            ...grantedMsg,
            screen: { x: info.x ?? 0, y: info.y ?? 0, w: info.w ?? 0, h: info.h ?? 0 },
          });
          a.fire({ op: 'stream', fps: 10, scale: 1, quality: 60, changedOnly: true });
        } catch (e) {
          ctx.log('[remote-control] JPEG 回退通道启动失败:', (e as Error)?.message);
          await endSession(s, `回退通道启动失败: ${(e as Error)?.message || e}`);
          return;
        }
      } else {
        s.controllerWs && sendWsJson(s.controllerWs, grantedMsg);
        notifyHost({ type: 'rtc.start', sessionId: s.id });
      }
      await audit('session-grant', {
        sessionId: s.id,
        device: s.deviceName,
        trusted: s.trusted,
        mode: s.mode,
        trustSaved: !!deviceToken,
      });
    };

    const handleControllerMessage = async (s: RcSession, raw: string | Buffer, isBinary: boolean): Promise<void> => {
      s.lastActivityAt = Date.now();
      if (isBinary) return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      const type = String(msg.type || '');
      if (s.status !== 'granted') {
        if (type === 'pair.wait') sendWsJson(s.controllerWs!, { type: 'pair.pending', confirmId: s.confirmId });
        return;
      }
      switch (type) {
        case 'rtc.offer':
          if (s.mode === 'webrtc') notifyHost({ type: 'rtc.offer', sessionId: s.id, sdp: String(msg.sdp || '') });
          break;
        case 'rtc.ice':
          if (s.mode === 'webrtc') notifyHost({ type: 'rtc.ice', sessionId: s.id, candidate: msg.candidate });
          break;
        case 'use.jpeg': {
          // WebRTC 起不来时的降级请求
          s.mode = 'jpeg';
          notifyHost({ type: 'rtc.stop', sessionId: s.id });
          try {
            const a = await ensureAgent();
            const info = await a.call({ op: 'screensize' }, 10000);
            sendWsJson(s.controllerWs!, {
              type: 'session.mode', mode: 'jpeg',
              screen: { x: info.x ?? 0, y: info.y ?? 0, w: info.w ?? 0, h: info.h ?? 0 },
            });
            a.fire({ op: 'stream', fps: 10, scale: 1, quality: 60, changedOnly: true });
          } catch (e) {
            await endSession(s, `回退通道启动失败: ${(e as Error)?.message || e}`);
          }
          break;
        }
        case 'set.quality': {
          // JPEG 回退通道的画质档（fps/scale/quality），直接转给代理进程的流参数
          if (s.mode === 'jpeg') {
            try {
              const a = await ensureAgent();
              a.fire({
                op: 'stream',
                fps: Math.max(1, Math.min(20, Number(msg.fps) || 10)),
                scale: Math.max(0.3, Math.min(1, Number(msg.scale) || 1)),
                quality: Math.max(30, Math.min(90, Number(msg.quality) || 60)),
                changedOnly: true,
              });
            } catch {
              /* 代理没起来，忽略（会话结束时统一停） */
            }
          }
          break;
        }
        case 'input': {
          if (panicActive) {
            sendWsJson(s.controllerWs!, { type: 'input.rejected', reason: '急停已触发，输入已冻结' });
            return;
          }
          if (!s.limiter.allow()) {
            if (!s.readOnlyNotified) {
              s.readOnlyNotified = true;
              sendWsJson(s.controllerWs!, {
                type: 'input.rejected',
                reason: `输入频率已达上限（${maxInputs} 条/10 分钟），本会话降级为只读观看`,
                readonly: true,
              });
              await audit('input-limit', { sessionId: s.id, device: s.deviceName });
            }
            return;
          }
          s.limiter.hit();
          const v = validateInputMsg(msg);
          if (!v.ok) {
            sendWsJson(s.controllerWs!, { type: 'input.rejected', reason: v.error });
            return;
          }
          try {
            const a = await ensureAgent();
            a.fire(v.agentOp!);
          } catch (e) {
            sendWsJson(s.controllerWs!, { type: 'input.rejected', reason: `注入失败: ${(e as Error)?.message || e}` });
          }
          break;
        }
        case 'ping':
          sendWsJson(s.controllerWs!, { type: 'pong', t: msg.t ?? 0 });
          break;
        default:
          break;
      }
    };

    const handleHostMessage = async (raw: string | Buffer, isBinary: boolean): Promise<void> => {
      if (isBinary) return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      const type = String(msg.type || '');
      switch (type) {
        case 'rtc.answer': {
          const s = [...sessions.values()].find((x) => x.id === msg.sessionId && x.status === 'granted');
          if (s?.controllerWs) sendWsJson(s.controllerWs, { type: 'rtc.answer', sdp: String(msg.sdp || '') });
          break;
        }
        case 'rtc.ice': {
          const s = [...sessions.values()].find((x) => x.id === msg.sessionId && x.status === 'granted');
          if (s?.controllerWs) sendWsJson(s.controllerWs, { type: 'rtc.ice', candidate: msg.candidate });
          break;
        }
        case 'rtc.ready':
          if (hostConn) hostConn.canCapture = true;
          break;
        case 'rtc.screen': {
          // 被控端渲染层告知采集画面对应的屏幕几何（像素），控制端据此做坐标换算
          const ss = [...sessions.values()].find((x) => x.id === msg.sessionId && x.status === 'granted');
          if (ss?.controllerWs) {
            sendWsJson(ss.controllerWs, {
              type: 'screen.info',
              screen: {
                x: Number(msg.x) || 0,
                y: Number(msg.y) || 0,
                w: Number(msg.w) || 0,
                h: Number(msg.h) || 0,
              },
            });
          }
          break;
        }
        case 'decision': {
          const s = pendingByConfirm.get(String(msg.confirmId || ''));
          if (!s || s.status !== 'pending') return;
          if (String(msg.action) === 'allow') {
            s.trusted = false;
            await grantSession(s, !!msg.trust);
            if (s.controllerWs) sendWsJson(s.controllerWs, { type: 'pair.done' });
            notifyHost({ type: 'session.started', sessionId: s.id, device: s.deviceName, mode: s.mode });
          } else {
            await endSession(s, '被控端拒绝');
          }
          break;
        }
        case 'session.stop': {
          const s = [...sessions.values()].find((x) => x.id === msg.sessionId || msg.all);
          if (s) await endSession(s, '被控端结束会话');
          break;
        }
        case 'ping':
          sendWsJson(hostConn!.ws, { type: 'pong', t: msg.t ?? 0 });
          break;
        default:
          break;
      }
    };

    // ---- WS 路由 ----
    // /session/ws?token=...（granted 控制端）| ?confirmId=...（pending 控制端）| ?role=host&key=...（被控端渲染层）
    ctx.registerWebSocket('/session/ws', (ws, req) => {
      let query: Record<string, string> = {};
      try {
        query = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
      } catch {
        /* ignore */
      }
      if (panicActive) {
        sendWsJson(ws, { type: 'session.ended', reason: '急停已触发，远控已冻结（插件管理页重新启用后可用）' });
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        return;
      }
      // --- 被控端（渲染层 / 宿主 UI）---
      if (query.role === 'host') {
        if (!query.key || !timingEq(query.key, hostKey)) {
          sendWsJson(ws, { type: 'session.ended', reason: 'host key 校验失败' });
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          return;
        }
        if (hostConn) {
          try {
            hostConn.ws.close();
          } catch {
            /* ignore */
          }
        }
        hostConn = { ws, canCapture: false, alive: true };
        sendWsJson(ws, { type: 'host.hello', pending: pendingByConfirm.size });
        for (const s of pendingByConfirm.values()) {
          sendWsJson(ws, { type: 'session.pending', confirmId: s.confirmId, device: s.deviceName });
        }
        ws.on('message', (data: Buffer, isBinary: boolean) => {
          void handleHostMessage(data, isBinary);
        });
        ws.on('close', () => {
          if (hostConn?.ws === ws) hostConn = null;
          // WebRTC 会话失去采集端：结束（控制端可重新配对走 JPEG）
          for (const s of [...sessions.values()]) {
            if (s.status === 'granted' && s.mode === 'webrtc') void endSession(s, '被控端画面源中断');
          }
        });
        ws.on('error', () => {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        });
        return;
      }
      // --- 控制端 ---
      const attach = (s: RcSession, kind: 'granted' | 'pending'): void => {
        if (kind === 'granted' && s.token) controllersByToken.set(s.token, s);
        s.controllerWs = ws;
        if (kind === 'pending') {
          sendWsJson(ws, { type: 'pair.pending', confirmId: s.confirmId });
        } else if (s.token) {
          sendWsJson(ws, { type: 'session.resume', sessionId: s.id, mode: s.mode });
        }
        ws.on('message', (data: Buffer, isBinary: boolean) => {
          void handleControllerMessage(s, data, isBinary);
        });
        ws.on('close', () => {
          if (s.controllerWs === ws) s.controllerWs = null;
          if (s.status === 'granted') void endSession(s, '控制端断开');
        });
        ws.on('error', () => {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        });
      };
      const token = String(query.token || '');
      const confirmId = String(query.confirmId || '');
      if (token && controllersByToken.has(token)) {
        attach(controllersByToken.get(token)!, 'granted');
        return;
      }
      if (confirmId && pendingByConfirm.has(confirmId)) {
        attach(pendingByConfirm.get(confirmId)!, 'pending');
        return;
      }
      sendWsJson(ws, { type: 'session.ended', reason: '会话不存在或已结束，请重新配对' });
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    });

    // ---- HTTP 路由 ----
    ctx.registerBackendRoute((raw) => {
      const r = raw as {
        get: (p: string, h: (req: unknown, res: { json: (d: unknown) => void }) => void) => void;
        post: (p: string, h: (req: unknown, res: { json: (d: unknown) => void }) => void) => void;
        delete: (p: string, h: (req: unknown, res: { json: (d: unknown) => void }) => void) => void;
      };
      const remoteAddr = (req: unknown): string => {
        try {
          return String((req as { socket?: { remoteAddress?: string } })?.socket?.remoteAddress || '');
        } catch {
          return '';
        }
      };
      const hasHostKey = (req: unknown): boolean => {
        const h = (req as { headers?: Record<string, unknown> })?.headers || {};
        const key = typeof h['x-rc-host-key'] === 'string' ? (h['x-rc-host-key'] as string) : '';
        return !!key && timingEq(key, hostKey);
      };
      const readBody = (req: unknown): Promise<Record<string, unknown>> =>
        new Promise((resolve) => {
          const chunks: Buffer[] = [];
          const rq = req as { on?: (ev: string, cb: (d?: Buffer) => void) => void };
          rq.on?.('data', (d?: Buffer) => d && chunks.push(d));
          rq.on?.('end', () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
            } catch {
              resolve({});
            }
          });
        });

      // -- 控制端（license-guard 豁免，鉴权=授权码/设备令牌）--
      r.post('/pair', (req, res) => {
        void (async () => {
          if (getPluginManager().get('remote-control')?.state !== 'enabled') {
            res.json({ error: 'remote-control 插件未启用' });
            return;
          }
          if (panicActive) {
            res.json({ error: '急停已触发，远控已冻结（请在被控端插件管理页重新启用插件）' });
            return;
          }
          if (!pairLimiter.hit()) {
            res.json({ error: '配对尝试过于频繁，请稍后再试' });
            return;
          }
          const body = await readBody(req);
          const deviceId = String(body.deviceId || '').trim();
          const verdict = evaluatePair({
            code: String(body.code || ''),
            deviceId,
            deviceToken: body.deviceToken ? String(body.deviceToken) : undefined,
            hasActiveGranted: [...sessions.values()].some((s) => s.status === 'granted'),
            stored: storedCode,
            whitelist: Array.from(whitelisted.values()),
            remoteAddr: remoteAddr(req),
            allowExternalSubnet,
          });
          if (!verdict.ok) {
            await audit('pair-reject', {
              device: String(body.deviceName || '').slice(0, 40),
              reason: verdict.error,
              addr: mask(remoteAddr(req)),
            });
            res.json({ error: verdict.error });
            return;
          }
          const session: RcSession = {
            id: crypto.randomUUID(),
            confirmId: crypto.randomUUID(),
            status: 'pending',
            deviceId,
            deviceName: String(body.deviceName || '').slice(0, 60) || '未命名设备',
            trusted: !!verdict.trusted,
            createdAt: Date.now(),
            lastActivityAt: Date.now(),
            mode: '',
            controllerWs: null,
            limiter: new SlidingWindowLimiter(maxInputs),
          };
          sessions.set(session.id, session);
          if (verdict.status === 'granted') {
            await grantSession(session, false);
            res.json({
              data: {
                status: 'granted',
                token: session.token,
                mode: session.mode,
                deviceToken: verdict.entry?.deviceToken,
              },
            });
            return;
          }
          pendingByConfirm.set(session.confirmId, session);
          notifyHost({ type: 'session.pending', confirmId: session.confirmId, device: session.deviceName });
          await audit('pair-pending', { sessionId: session.id, device: session.deviceName });
          res.json({ data: { status: 'pending', confirmId: session.confirmId } });
        })().catch((e) => res.json({ error: (e as Error)?.message || String(e) }));
      });

      // -- 管理面（被控端主人；guard 开启时另有 license 门禁）--
      const requireEnabled = (res: { json: (d: unknown) => void }): boolean => {
        if (getPluginManager().get('remote-control')?.state !== 'enabled') {
          res.json({ error: 'remote-control 插件未启用' });
          return false;
        }
        return true;
      };
      r.get('/status', (req, res) => {
        if (!requireEnabled(res)) return;
        res.json({
          data: {
            panic: panicActive,
            mode: hostConn?.canCapture ? 'webrtc-capable' : 'jpeg',
            session: [...sessions.values()].find((s) => s.status === 'granted')
              ? { device: [...sessions.values()].find((s) => s.status === 'granted')!.deviceName }
              : null,
            pendingCount: pendingByConfirm.size,
            // 授权码只在带 host key 的请求里返回（控制端页面不带）
            code: hasHostKey(req) ? storedCode : null,
            whitelistCount: whitelisted.size,
          },
        });
      });
      r.get('/hostkey', (_req, res) => {
        if (!requireEnabled(res)) return;
        res.json({ data: { key: hostKey } });
      });
      r.post('/code/rotate', (_req, res) => {
        if (!requireEnabled(res)) return;
        storedCode = { mode: 'temp', current: generatePairCode(), updatedAt: Date.now() };
        void storage.set('paircode', storedCode).catch(() => undefined);
        void audit('code-rotate', { mode: 'temp' });
        res.json({ data: { code: storedCode } });
      });
      r.post('/code/custom', (req, res) => {
        if (!requireEnabled(res)) return;
        void (async () => {
          const body = await readBody(req);
          const code = String(body.code || '').trim();
          if (!isValidCustomCode(code)) {
            res.json({ error: '授权码需为 6-16 位字母数字（不含 0/1/i/l/o 等易混字符）' });
            return;
          }
          storedCode = { mode: 'custom', current: code, custom: code, updatedAt: Date.now() };
          await storage.set('paircode', storedCode).catch(() => undefined);
          await audit('code-custom', {});
          res.json({ data: { code: storedCode } });
        })().catch((e) => res.json({ error: (e as Error)?.message || String(e) }));
      });
      r.get('/whitelist', (_req, res) => {
        if (!requireEnabled(res)) return;
        res.json({
          data: Array.from(whitelisted.values()).map((w) => ({
            deviceId: w.deviceId, name: w.name, addedAt: w.addedAt, lastUsedAt: w.lastUsedAt,
          })),
        });
      });
      r.delete('/whitelist/:deviceId', (req, res) => {
        if (!requireEnabled(res)) return;
        const id = String((req as { params?: { deviceId?: string } })?.params?.deviceId || '');
        if (whitelisted.delete(id)) {
          void saveWhitelist().catch(() => undefined);
          void audit('whitelist-remove', { deviceId: id });
          res.json({ data: { ok: true } });
        } else {
          res.json({ error: '设备不在白名单' });
        }
      });
      r.get('/audit', (_req, res) => {
        if (!requireEnabled(res)) return;
        void (async () => {
          const ops = (await storage.get<unknown[]>('audit')) || [];
          res.json({ data: { panic: panicActive, ops } });
        })();
      });

      // -- 急停（桌面端 Ctrl+Alt+Esc 会同时打 computer-use 与本插件的 /panic）--
      r.post('/panic', (_req, res) => {
        if (getPluginManager().get('remote-control')?.state !== 'enabled') {
          res.json({ error: 'remote-control 插件未启用，无需急停' });
          return;
        }
        panicActive = true;
        ctx.log('!!! 急停触发（Ctrl+Alt+Esc）：远控会话全部断开，代理进程已终止，插件即将禁用');
        void endAll('急停（Ctrl+Alt+Esc）').then(() => {
          stopAgent();
          // 与 computer-use 同口径：急停后禁用插件，恢复=插件管理页手动重新启用
          return getPluginManager().disable('remote-control').catch(() => undefined);
        });
        void audit('panic', {});
        res.json({ data: { ok: true, message: '急停已生效：远控会话已断开、代理进程已终止（可在插件管理页重新启用）' } });
      });
    });

    // ---- 空闲会话回收 + WS 保活探测 ----
    const idleTimer = setInterval(() => {
      const now = Date.now();
      for (const s of [...sessions.values()]) {
        if (s.status === 'granted' && now - s.lastActivityAt > idleTimeoutMs) {
          void endSession(s, '会话空闲超时，已自动断开');
        } else if (s.status === 'pending' && now - s.createdAt > 30_000) {
          void endSession(s, '被控端确认超时');
        }
      }
    }, IDLE_CHECK_MS);
    if (typeof idleTimer.unref === 'function') idleTimer.unref();

    deactivateImpl = async () => {
      clearInterval(idleTimer);
      panicActive = false;
      try {
        if (hostConn) {
          hostConn.ws.close();
          hostConn = null;
        }
      } catch {
        /* ignore */
      }
      await endAll('插件停用');
      stopAgent();
    };
  },

  deactivate: async () => {
    try {
      await deactivateImpl?.();
    } finally {
      deactivateImpl = null;
    }
  },
};
