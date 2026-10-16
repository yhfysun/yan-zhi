// 页面指令库（P1）——服务端 CRUD + 当前页匹配。
//
// 匹配逻辑不在这里（在 utils/pageCommand.ts，纯函数、可单测）；本 store 只管：
//   ① 拉取/增删改（失败是返回值不是异常：apiFetch 的口径，见 api/client.ts 注释）；
//   ② 把"库不可用"如实暴露成 warning，而不是装作"这个站点没有指令"（静默失败最招人恨）。

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/client';
import { matchPageCommands, type PageCommand } from '../utils/pageCommand';

export interface PageCommandInput {
  name: string;
  description?: string | null;
  /** 'task'（自然语言任务描述）| 'script'（页面脚本；P2 起可用） */
  kind?: 'task' | 'script';
  body: string;
  match_host?: string;
  match_url?: string | null;
  /**
   * 仅脚本型有意义：显式 `true` 表示"信任此指令（不再每次确认）"。
   * ★ 服务端只在收到 trust:true 时才会把 need_confirm 置 0，且仅限用户自建指令 ——
   *   内置/导入来源永远每次确认（内容会随版本变，信任的应是当时那段脚本）。
   */
  trust?: boolean;
}

/** 一次脚本执行的上报（审计：只报元信息，不报结果内容） */
export interface PageCommandRunReport {
  status: 'ok' | 'error' | 'aborted';
  started_at: number;
  ended_at: number;
  tab_id?: string;
  url?: string;
  host?: string;
  /** 结果摘要（用 utils/pageCommand 的 digestOf 生成），不是结果本身 */
  result_digest?: string;
  error?: string;
}

/** 审计行（GET /page-commands/runs） */
export interface PageCommandRun {
  id: string;
  command_id: string;
  command_name?: string | null;
  command_kind?: string;
  url?: string | null;
  host?: string | null;
  started_at: number;
  ended_at?: number | null;
  duration_ms?: number | null;
  status: string;
  result_digest?: string | null;
  error?: string | null;
}

type Ok<T> = { ok: true; row: T };
type Fail = { ok: false; msg: string };

export const usePageCommandsStore = defineStore('page-commands', () => {
  const list = ref<PageCommand[]>([]);
  /** 是否已经成功拉过一次（避免每次开面板都打接口） */
  const loaded = ref(false);
  const loading = ref(false);
  /** 服务端告警（如表未初始化 / 读库失败）；非空时 UI 必须如实提示 */
  const warning = ref('');

  async function load(force = false): Promise<void> {
    if (loading.value) return;
    if (loaded.value && !force) return;
    loading.value = true;
    try {
      const r: any = await api.get('/page-commands');
      if (r && 'error' in r) { warning.value = `指令库不可用：${r.error}`; return; }
      const rows = Array.isArray(r?.data) ? r.data : [];
      list.value = rows as PageCommand[];
      warning.value = String(r?.warning || '');
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function create(input: PageCommandInput): Promise<Ok<PageCommand> | Fail> {
    // kind 由调用方给（P2 起可以是 'script'）；trust 只有显式 true 才会让服务端把 need_confirm 置 0
    const r: any = await api.post('/page-commands', { ...input, kind: input.kind || 'task' });
    if (r && 'error' in r) return { ok: false, msg: String(r.error) };
    const row = r?.data as PageCommand;
    if (row) list.value = [...list.value, row];
    return { ok: true, row };
  }

  async function update(
    id: string,
    patch: Partial<PageCommandInput> & { enabled?: boolean },
  ): Promise<Ok<PageCommand> | Fail> {
    const r: any = await api.patch(`/page-commands/${encodeURIComponent(id)}`, patch);
    if (r && 'error' in r) return { ok: false, msg: String(r.error) };
    const row = r?.data as PageCommand;
    if (row) list.value = list.value.map((c) => (c.id === id ? { ...c, ...row } : c));
    return { ok: true, row };
  }

  async function remove(id: string): Promise<{ ok: true } | Fail> {
    const r: any = await api.delete(`/page-commands/${encodeURIComponent(id)}`);
    if (r && 'error' in r) return { ok: false, msg: String(r.error) };
    list.value = list.value.filter((c) => c.id !== id);
    return { ok: true };
  }

  /** 使用计数（P3 统计用）：失败静默 —— 它不是用户要的结果，不该弹错 */
  function markUsed(id: string): void {
    void api.post(`/page-commands/${encodeURIComponent(id)}/used`).then((r: any) => {
      if (r && 'error' in r) console.warn('[page-commands] 使用计数失败:', r.error);
    }, () => { /* 网络失败忽略 */ });
  }

  /**
   * 上报一次脚本执行（审计）。失败只 console.warn：**审计不该阻断用户拿结果**，
   * 但也不能静默（服务端日志 + 控制台都留痕，排障时能看出"审计库没写进去"）。
   */
  function reportRun(id: string, report: PageCommandRunReport): void {
    void api.post(`/page-commands/${encodeURIComponent(id)}/runs`, report).then((r: any) => {
      if (r && 'error' in r) console.warn('[page-commands] 审计上报失败:', r.error);
    }, () => console.warn('[page-commands] 审计上报失败：网络不可达'));
  }

  /** 读执行记录（审计查询）：失败返回空数组 + 让调用方决定怎么提示 */
  async function listRuns(commandId?: string, limit = 20): Promise<{ rows: PageCommandRun[]; warning: string }> {
    const q = new URLSearchParams();
    if (commandId) q.set('commandId', commandId);
    q.set('limit', String(limit));
    const r: any = await api.get(`/page-commands/runs?${q.toString()}`);
    if (r && 'error' in r) return { rows: [], warning: `执行记录读取失败：${r.error}` };
    return { rows: (Array.isArray(r?.data) ? r.data : []) as PageCommandRun[], warning: String(r?.warning || '') };
  }

  /** 当前页命中的指令（已按"URL 正则 → 站点专属 → 全局"排好序） */
  function matched(url: string): PageCommand[] {
    return matchPageCommands(list.value, url);
  }

  return { list, loaded, loading, warning, load, create, update, remove, markUsed, reportRun, listRuns, matched };
});
