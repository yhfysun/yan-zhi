// 页面指令的**导入校验**（2026-10-16 · 方案 §P3-2：导入 / 导出 / 团队共享）。
//
// ★ 为什么抽成纯模块（而不是写在路由里）：
//   导入是**外部数据入口**，而里面藏着一条安全规则 —— **导入进来的脚本永远要确认**：
//     · 别人给的脚本指令，"信任"是给不出来的（用户信任的应该是自己写的那段脚本）；
//     · 这条规则必须可测、且必须只有一份实现（否则"导出再导入"就能绕过 P2 的双层门控）。
//   所以放在 core 里由路由调用，测试真跑（见 page-command-import.test.ts）。
//
// ★ 与后端写入校验同口径（apps/server/src/routes/page-commands.ts 的 normalizeInput）：
//   长度上限、host 通配格式、URL 正则可编译 —— 两处口径不一致会让"能导入但不能新建"这种怪现象。

export interface ImportedPageCommand {
  name: string;
  description: string | null;
  kind: 'task' | 'script';
  body: string;
  match_host: string;
  match_url: string | null;
  /** ★ 恒为 1：导入来源永不免确认（脚本尤其） */
  need_confirm: number;
}

export interface ImportSkip { name: string; reason: string }
export interface ImportResult {
  commands: ImportedPageCommand[];
  skipped: ImportSkip[];
}

export const IMPORT_MAX_NAME = 60;
export const IMPORT_MAX_DESC = 200;
export const IMPORT_MAX_TASK_BODY = 4000;
export const IMPORT_MAX_SCRIPT_BODY = 64000;
export const IMPORT_MAX_URL_PATTERN = 200;
/** 单次导入条数上限（防止把一份畸形文件塞成上万条） */
export const IMPORT_MAX_ITEMS = 200;

/** 站点匹配串：'*' / 'example.com' / '*.example.com' */
export function isValidMatchHost(h: string): boolean {
  if (h === '*') return true;
  return /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(h);
}

/**
 * 校验并归一一份导入数据。
 * 接受 `{ version, commands: [...] }` 或裸数组；逐条校验，坏的**跳过并给出原因**（不整份拒绝 ——
 * 用户拿到一份 20 条的文件，不该因为第 3 条写错就全都导不进来）。
 */
export function sanitizeImportedCommands(raw: unknown, maxItems = IMPORT_MAX_ITEMS): ImportResult {
  const list = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' && Array.isArray((raw as any).commands) ? (raw as any).commands : null);
  if (!list) return { commands: [], skipped: [{ name: '(整份数据)', reason: '格式不对：应为指令数组或 { commands: [...] }' }] };

  const out: ImportedPageCommand[] = [];
  const skipped: ImportSkip[] = [];
  for (const item of list.slice(0, maxItems)) {
    const raw0 = (item || {}) as any;
    const label = String(raw0.name ?? '(未命名)').slice(0, 40);
    try {
      // 内置来源不导入（内置指令随版本走，导入一份副本只会造成"改了不生效"的困惑）
      if (String(raw0.source || '') === 'builtin') { skipped.push({ name: label, reason: '内置指令不需导入（随版本更新）' }); continue; }

      const name = String(raw0.name ?? '').trim();
      if (!name) { skipped.push({ name: label, reason: '缺少名称' }); continue; }
      if (name.length > IMPORT_MAX_NAME) { skipped.push({ name: label, reason: `名称超过 ${IMPORT_MAX_NAME} 字` }); continue; }

      const kind = String(raw0.kind ?? 'task').trim() || 'task';
      if (kind !== 'task' && kind !== 'script') { skipped.push({ name: label, reason: `未知类型 ${kind}` }); continue; }

      const body = String(raw0.body ?? '').trim();
      const limit = kind === 'script' ? IMPORT_MAX_SCRIPT_BODY : IMPORT_MAX_TASK_BODY;
      if (!body) { skipped.push({ name: label, reason: '缺少内容' }); continue; }
      if (body.length > limit) { skipped.push({ name: label, reason: `内容超过 ${limit} 字` }); continue; }

      const matchHost = String(raw0.match_host ?? '*').trim().toLowerCase() || '*';
      if (!isValidMatchHost(matchHost)) { skipped.push({ name: label, reason: `站点匹配不合法：${matchHost}` }); continue; }

      let matchUrl: string | null = null;
      const rawPattern = raw0.match_url == null ? '' : String(raw0.match_url).trim();
      if (rawPattern) {
        if (rawPattern.length > IMPORT_MAX_URL_PATTERN) { skipped.push({ name: label, reason: `URL 正则超过 ${IMPORT_MAX_URL_PATTERN} 字` }); continue; }
        try { new RegExp(rawPattern); } catch { skipped.push({ name: label, reason: `URL 正则不合法：${rawPattern}` }); continue; }
        matchUrl = rawPattern;
      }

      const description = raw0.description == null ? null : String(raw0.description).trim().slice(0, IMPORT_MAX_DESC);

      out.push({
        name, description, kind, body, match_host: matchHost, match_url: matchUrl,
        // ★ 恒 1：导入来源永不免确认。文件里写 need_confirm:0 也没用 —— 这是导入侧的安全边界。
        need_confirm: 1,
      });
    } catch (e: any) {
      skipped.push({ name: label, reason: `解析失败：${e?.message || e}` });
    }
  }
  if (list.length > maxItems) {
    skipped.push({ name: `(其余 ${list.length - maxItems} 条)`, reason: `单次最多导入 ${maxItems} 条` });
  }
  return { commands: out, skipped };
}

/** 导出用：把库里的行整理成可分享的 JSON（只带可移植字段，不带 id/归属/统计） */
export function toExportPayload(rows: any[]): { version: number; exportedAt: string; commands: any[] } {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    commands: (rows || []).map((r) => ({
      name: r.name,
      description: r.description ?? null,
      kind: r.kind === 'script' ? 'script' : 'task',
      body: r.body,
      match_host: r.match_host || '*',
      match_url: r.match_url || null,
      // 导出**不带** need_confirm：导入侧一律强制确认（见上），带过去只会误导
    })),
  };
}
