// 嵌套 AGENTS.md 发现的行为级测试（2026-10-19，对标 Codex 的分层规则）。
//
// 守住的语义：
//   ① 根 AGENTS.md 不算"嵌套"（由 loadProjectRules 单独收，source 保持 'AGENTS.md'）；
//   ② 子目录 AGENTS.md 被收进来，且大小写不敏感（agents.md 也认）；
//   ③ node_modules / 隐藏目录不进入（大仓库里到处是 node_modules）；
//   ④ 深度上限（>3 层不遍历）——否则每 60s 一次的发现会退化成全树遍历。
import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ★ 必须在 import llm-task-manager 之前设好 DATA_DIR（该模块加载时会初始化 db）
vi.hoisted(() => {
  const fs = require('node:fs') as typeof import('node:fs');
  const os = require('node:os') as typeof import('node:os');
  const path = require('node:path') as typeof import('node:path');
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-rules-'));
});

const { discoverNestedAgents } = await import('../src/llm-task-manager.js');

let WS = '';

function writeFile(rel: string, content = 'rules') {
  const p = path.join(WS, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf-8');
}

beforeAll(() => {
  WS = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-ws-'));
  writeFile('AGENTS.md');                                     // 根：不算嵌套
  writeFile('packages/ui/AGENTS.md');                         // 深度 2 → 收
  writeFile('apps/server/agents.md');                         // 小写文件名 → 收
  writeFile('node_modules/pkg/AGENTS.md');                    // 跳过
  writeFile('.hidden/AGENTS.md');                             // 隐藏目录跳过
  writeFile('a/b/c/d/AGENTS.md');                             // 深度 4 → 超限
  writeFile('src/README.md');                                 // 不是 AGENTS.md
});

describe('discoverNestedAgents', () => {
  it('★★ 收子目录 AGENTS.md（含小写文件名），按相对路径可辨识来源', () => {
    const found = discoverNestedAgents(WS).map((p) => path.relative(WS, p).replace(/\\/g, '/')).sort();
    expect(found).toContain('packages/ui/AGENTS.md');
    expect(found).toContain('apps/server/agents.md');
  });

  it('★ 根 AGENTS.md 不算嵌套（避免与 loadProjectRules 的 ① 重复注入）', () => {
    const found = discoverNestedAgents(WS).map((p) => path.relative(WS, p).replace(/\\/g, '/'));
    expect(found).not.toContain('AGENTS.md');
  });

  it('★ node_modules 与隐藏目录不进入；非 AGENTS.md 文件不误收', () => {
    const found = discoverNestedAgents(WS).map((p) => path.relative(WS, p).replace(/\\/g, '/'));
    expect(found.some((p) => p.includes('node_modules'))).toBe(false);
    expect(found.some((p) => p.startsWith('.hidden'))).toBe(false);
    expect(found.some((p) => p.endsWith('README.md'))).toBe(false);
  });

  it('★ 深度上限：超过 3 层不遍历（防止全树扫描）', () => {
    const found = discoverNestedAgents(WS).map((p) => path.relative(WS, p).replace(/\\/g, '/'));
    expect(found.some((p) => p.startsWith('a/b/c/d'))).toBe(false);
  });
});
