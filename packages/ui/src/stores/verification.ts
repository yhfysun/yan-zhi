/** 短信验证码 store —— 移动端同网转发 → 桌面端消费。
 *
 *  背景（用户诉求）：某些登录/校验流程要短信验证码，而手机就在手边、移动端也在运行。
 *  链路：Android 端收到短信 → 提取验证码 → POST 本节点 /api/verification-codes →
 *        本 store 轮询 /latest，桌面端界面直接显示可取用；Agent 侧另走 api_verification_code_* 工具。
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client';

export interface VerificationCodeItem {
  id: string;
  code: string;
  body: string;
  sender: string;
  source: string;
  deviceName: string;
  createdAt: number;
  expiresAt: number;
  remainingMs: number;
}

export const useVerificationStore = defineStore('verification', () => {
  const latest = ref<VerificationCodeItem | null>(null);
  const list = ref<VerificationCodeItem[]>([]);
  const pairToken = ref('');
  const loading = ref(false);

  let timer: ReturnType<typeof setInterval> | null = null;

  function unwrap<T>(r: { data: T } | { error: string }): T | null {
    if (r && 'data' in r) return r.data;
    return null;
  }

  /** 拉取最新一条 + 最近列表 + 配对令牌。 */
  async function refresh(): Promise<void> {
    loading.value = true;
    try {
      const [rList, rPair] = await Promise.all([
        api.get<any>('/verification-codes?limit=10'),
        api.get<any>('/verification-codes/pair'),
      ]);
      const items = unwrap<any[]>(rList);
      list.value = Array.isArray(items) ? items : [];
      latest.value = list.value[0] || null;
      const p = unwrap<{ token: string }>(rPair);
      if (p?.token) pairToken.value = p.token;
    } finally {
      loading.value = false;
    }
  }

  /** 清空全部验证码记录。 */
  async function clear(): Promise<number> {
    const r = await api.delete<any>('/verification-codes');
    const d = unwrap<{ removed: number }>(r);
    await refresh();
    return d?.removed || 0;
  }

  /** 重新生成配对令牌（旧令牌立即失效，移动端需重新填）。 */
  async function resetPairToken(): Promise<string> {
    const r = await api.post<any>('/verification-codes/pair/reset', {});
    const d = unwrap<{ token: string }>(r);
    if (d?.token) pairToken.value = d.token;
    return d?.token || '';
  }

  /** 开启轮询（面板可见时调用）。间隔 3s：验证码时效短，要近乎实时。 */
  function startPolling(intervalMs = 3000): void {
    stopPolling();
    void refresh();
    timer = setInterval(() => { void refresh(); }, intervalMs);
  }

  function stopPolling(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { latest, list, pairToken, loading, refresh, clear, resetPairToken, startPolling, stopPolling };
});