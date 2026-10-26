/**
 * 经验条目 detail 长度守门（2026-10-26）。
 *
 * ★★★ 实测故障（任务 ba426984）：抖音采集任务写下的两条经验
 *   （`.yan-zhi/experience/sites/creator.douyin.com.md`）都在 500 字处被切断 ——
 *   一条停在「缺 item」，另一条停在「坑3：」，**恰恰是可直接照做的参数与坑位**。
 *   前面大段是背景描述，真正省时间的是尾部操作细节 ⇒ 上限 500 → 900。
 *
 * 同时钉死"仍必须有上限"：不能因为放宽就把一条经验写成长文撑爆文件
 * （注入侧只有 3000 字预算，文件无限长会让命中率与可读性一起塌）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendExperienceEntry } from '../src/services/experience';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-exp-'));
});

afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* 沙箱拦截时忽略 */ }
});

describe('经验条目 detail 长度', () => {
  it('★★★ 900 字以内的操作细节必须完整落盘（不再停在"缺 item"）', async () => {
    const tail = '缺 item_id 时改用 work_list 先取 id';
    const detail = 'A'.repeat(850) + tail; // 尾部才是可照做的细节
    const r = await appendExperienceEntry(tmp, { kind: 'step', topic: 'sites/demo', title: '取数路径', detail } as any);
    expect(r.ok).toBe(true);
    const md = fs.readFileSync(r.path, 'utf-8');
    expect(md, '★ 关键操作细节被截断 → 下次还得从头摸索').toContain(tail);
  });

  it('★★ 超长 detail 仍要压平截断（上限不能取消）', async () => {
    const r = await appendExperienceEntry(tmp, { kind: 'pit', topic: 'sites/demo2', title: '超长坑', detail: 'B'.repeat(5000) } as any);
    expect(r.ok).toBe(true);
    const md = fs.readFileSync(r.path, 'utf-8');
    expect(md.length, '★ 无上限 → 单条经验就能撑爆文件，注入预算形同虚设').toBeLessThan(2000);
  });
});
