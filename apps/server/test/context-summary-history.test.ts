/**
 * 压缩历史可回溯（D8，2026-10-09）守门测试。
 *
 * 背景：压缩是**增量累积**的（新摘要吸收旧摘要），但读取只认**最新一条**
 *   → "压了什么、压到第几轮"对用户完全不可见（只看到一个"已压缩 N 次"计数）。
 *   `insertMessageSummary` 注释写着"追加不覆盖，保留历史以便回滚/审计"，
 *   而 `deleteMessageSummariesAfter`（回滚）**生产零调用** —— 存了历史却没有读的出口。
 *
 * 本测试钉：
 *   ① 有 list 出口（此前只有"取最新一条"）；
 *   ② 路由齐全（GET 列表 + POST 回滚），且**都做会话归属校验**；
 *   ③ 回滚是**非破坏性**（只删摘要行、不动 message 表）；
 *   ④ 列表要标记"哪条当前生效"（否则用户看不出回退到了哪）；
 *   ⑤ 列表**不返回摘要全文**（可能很长，只给预览）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const DB = strip(read('apps/server/src/db.ts'));
const CONV = strip(read('apps/server/src/routes/conversations.ts'));

describe('① 读出口（此前只有"取最新一条"）', () => {
  it('★★ 必须导出 listMessageSummaries', () => {
    expect(DB, '★ 缺 listMessageSummaries —— 摘要历史存了却没有读的出口')
      .toMatch(/export function listMessageSummaries\(/);
  });

  it('★★ 列表必须按时间倒序 + 有条数上限（不能把全部历史一次拉回）', () => {
    const i = DB.indexOf('export function listMessageSummaries');
    const body = DB.slice(i, i + 700);
    expect(body, '★ 未按时间倒序（用户要先看最近的）').toMatch(/ORDER BY created_at DESC/);
    expect(body, '★ 无条数上限（长会话会把整表拉回）').toMatch(/LIMIT/);
  });

  it('★ 失败必须 fail-safe（返回空数组而非抛错）', () => {
    const i = DB.indexOf('export function listMessageSummaries');
    const body = DB.slice(i, i + 700);
    expect(body, '★ 无 try/catch（表缺失会让整个列表接口 500）').toMatch(/catch/);
    expect(body, '★ 失败未返回空数组').toMatch(/return \[\]/);
  });
});

describe('② 路由齐全且带归属校验', () => {
  it('★★ GET 列表路由存在', () => {
    expect(CONV, '★ 缺 GET /:id/summaries').toMatch(/router\.get\('\/:id\/summaries'/);
  });

  it('★★ POST 回滚路由存在', () => {
    expect(CONV, '★ 缺回滚路由（deleteMessageSummariesAfter 仍是零调用）')
      .toMatch(/router\.post\('\/:id\/summaries\/:summaryId\/rollback'/);
  });

  it('★★ 两条路由都必须校验会话归属（否则可跨会话读/删别人的摘要）', () => {
    for (const [pat, what] of [
      [/router\.get\('\/:id\/summaries'/, 'GET 列表'],
      [/router\.post\('\/:id\/summaries\/:summaryId\/rollback'/, 'POST 回滚'],
    ] as const) {
      const i = CONV.search(pat);
      expect(i, `★ 锚点缺失：${what}`).toBeGreaterThan(-1);
      const body = CONV.slice(i, i + 900);
      expect(body, `★ ${what} 未校验 user_id（跨用户越权）`).toMatch(/AND user_id = \?/);
    }
  });

  it('★★ 回滚前必须校验该摘要属于本会话（跨会话误删）', () => {
    const i = CONV.indexOf("router.post('/:id/summaries/:summaryId/rollback'");
    const body = CONV.slice(i, i + 1200);
    expect(body, '★ 未校验 summaryId 属于本会话 → 可删别的会话的摘要').toMatch(/listMessageSummaries\(cid/);
    expect(body, '★ 不存在时未明确报 404（"删了 0 条"分不清是哪种情况）').toMatch(/404/);
  });
});

describe('③ 回滚必须非破坏性（原文一字未动）', () => {
  it('★★ 回滚只操作 message_summary，不得碰 message 表', () => {
    const i = DB.indexOf('export function deleteMessageSummariesAfter');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const body = DB.slice(i, i + 600);
    expect(body, '★ 回滚动了 message_summary（预期）').toMatch(/DELETE FROM message_summary/);
    expect(body, '★ 回滚碰了 message 表 —— 那会真的删掉对话原文（非破坏性前提被破坏）')
      .not.toMatch(/DELETE FROM message\b/);
  });

  it('★★ 语义必须"含该条及之后"（与注释一致，避免差一条）', () => {
    const i = DB.indexOf('export function deleteMessageSummariesAfter');
    const body = DB.slice(i, i + 600);
    expect(body, '★ 未用 >= since（会把"回退点本身"留下 → 回退不彻底）').toMatch(/created_at >= \?/);
  });
});

describe('④ 列表必须让用户看得出"哪条生效"', () => {
  it('★★ 必须标记 active（读取路径只认最新一条）', () => {
    const i = CONV.indexOf("router.get('/:id/summaries'");
    const body = CONV.slice(i, i + 1000);
    expect(body, '★ 未标记 active → 用户看不出当前用的是哪次压缩').toMatch(/active/);
  });

  it('★ 不得返回摘要全文（可能很长，只给预览）', () => {
    const i = CONV.indexOf("router.get('/:id/summaries'");
    const body = CONV.slice(i, i + 1000);
    expect(body, '★ 返回了摘要全文（长摘要会把列表响应撑大）').toMatch(/preview/);
    expect(body, '★ 直接返回了 summary 全文').not.toMatch(/summary:\s*s\.summary\b/);
  });
});