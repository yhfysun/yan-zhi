// 短信验证码转发（Android 原生插件）TS 包装。
//
// 职责分工：
//   原生（SmsForwardPlugin.java）= 拿短信（BroadcastReceiver + RECEIVE_SMS 权限）；
//   本模块 = 把拿到的短信上报到后端（地址/令牌来自用户在设置页的配置）。
//   ★ 不在原生直接发 HTTP：后端地址与令牌的唯一真相源在 JS 侧（mobile_api_base / pairToken），
//     原生再存一份必然与 JS 侧漂移。
import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';

export interface SmsPayload {
  sender: string;
  body: string;
  code: string;
  receivedAt: number;
}

interface SmsForwardPluginApi {
  checkPermissions(): Promise<{ sms: string }>;
  requestPermissions(): Promise<{ sms: string }>;
  start(): Promise<{ listening: boolean }>;
  stop(): Promise<{ listening: boolean }>;
  isListening(): Promise<{ listening: boolean }>;
  getLast(): Promise<{ sms: SmsPayload | null }>;
  addListener(
    eventName: 'smsReceived',
    listener: (payload: SmsPayload) => void,
  ): Promise<PluginListenerHandle>;
}

const SmsForward = registerPlugin<SmsForwardPluginApi>('SmsForward');

export const SMS_FORWARD_ENABLED_KEY = 'sms_forward_enabled';
export const SMS_FORWARD_UPSTREAM_KEY = 'sms_forward_upstream';
export const SMS_FORWARD_TOKEN_KEY = 'sms_forward_token';
/** 上报过的短信指纹（sender+body 哈希式拼接），避免同一条重复 POST */
const SMS_FORWARD_SEEN_KEY = 'sms_forward_seen';

export function isSmsForwardSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function readLocal(key: string): string {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function writeLocal(key: string, v: string) {
  try {
    if (v) localStorage.setItem(key, v);
    else localStorage.removeItem(key);
  } catch { /* ignore */ }
}

export function getSmsForwardConfig() {
  return {
    enabled: readLocal(SMS_FORWARD_ENABLED_KEY) === '1',
    upstream: readLocal(SMS_FORWARD_UPSTREAM_KEY),
    token: readLocal(SMS_FORWARD_TOKEN_KEY),
  };
}

export function setSmsForwardConfig(cfg: { enabled?: boolean; upstream?: string; token?: string }) {
  if (cfg.enabled !== undefined) writeLocal(SMS_FORWARD_ENABLED_KEY, cfg.enabled ? '1' : '');
  if (cfg.upstream !== undefined) writeLocal(SMS_FORWARD_UPSTREAM_KEY, cfg.upstream.trim().replace(/\/+$/, ''));
  if (cfg.token !== undefined) writeLocal(SMS_FORWARD_TOKEN_KEY, cfg.token.trim());
}

/** 已上报指纹集合（最多保留 50 条，防 localStorage 无限增长） */
function loadSeen(): string[] {
  try {
    const raw = localStorage.getItem(SMS_FORWARD_SEEN_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveSeen(arr: string[]) {
  try { localStorage.setItem(SMS_FORWARD_SEEN_KEY, JSON.stringify(arr.slice(-50))); } catch { /* ignore */ }
}
function fingerprint(p: SmsPayload): string {
  return `${p.sender || ''}|${p.body || ''}`;
}

/** 上报一条短信到配置的后端。成功返回 true。 */
export async function reportSms(p: SmsPayload): Promise<boolean> {
  const { upstream, token } = getSmsForwardConfig();
  if (!upstream) return false;
  const seen = loadSeen();
  const fp = fingerprint(p);
  if (seen.includes(fp)) return true; // 已报过，视为成功（幂等）
  try {
    const res = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-pair-token': token },
      body: JSON.stringify({
        code: p.code,
        body: p.body,
        sender: p.sender,
        deviceName: Capacitor.getPlatform(),
        pairToken: token,
      }),
    });
    if (!res.ok) return false;
    seen.push(fp);
    saveSeen(seen);
    return true;
  } catch {
    return false;
  }
}

let listenerHandle: PluginListenerHandle | null = null;

/**
 * 启动短信转发：申请权限 → 开始监听 → 绑定上报回调。
 * 返回是否成功启动（含原因）。
 */
export async function startSmsForward(): Promise<{ ok: boolean; reason?: string }> {
  if (!isSmsForwardSupported()) return { ok: false, reason: '仅 Android 端支持短信转发' };
  const { upstream } = getSmsForwardConfig();
  if (!upstream) return { ok: false, reason: '请先填写上报地址' };

  let perm = await SmsForward.checkPermissions().catch(() => ({ sms: 'prompt' }));
  if (perm.sms !== 'granted') {
    perm = await SmsForward.requestPermissions().catch(() => ({ sms: 'denied' }));
  }
  if (perm.sms !== 'granted') return { ok: false, reason: '未授予短信权限' };

  try {
    await SmsForward.start();
  } catch (e) {
    return { ok: false, reason: (e as Error)?.message || '启动监听失败' };
  }

  // 泛型 addListener 的 TS 类型较宽松，这里显式收窄
  if (!listenerHandle) {
    listenerHandle = (await SmsForward.addListener('smsReceived', (payload) => {
      void reportSms(payload);
    })) as PluginListenerHandle;
  }
  // 补拿最近一条（WebView 可能晚于广播启动）
  const last = await SmsForward.getLast().catch(() => ({ sms: null }));
  if (last?.sms) void reportSms(last.sms);
  return { ok: true };
}

/** 停止短信转发。 */
export async function stopSmsForward(): Promise<void> {
  if (!isSmsForwardSupported()) return;
  try { await SmsForward.stop(); } catch { /* ignore */ }
  if (listenerHandle) {
    try { await listenerHandle.remove(); } catch { /* ignore */ }
    listenerHandle = null;
  }
}

/** App 启动时若已开启过转发，自动恢复监听（否则用户每次重启 App 都要手动开）。 */
export async function resumeSmsForwardIfEnabled(): Promise<void> {
  if (!isSmsForwardSupported()) return;
  const { enabled, upstream } = getSmsForwardConfig();
  if (!enabled || !upstream) return;
  await startSmsForward();
}