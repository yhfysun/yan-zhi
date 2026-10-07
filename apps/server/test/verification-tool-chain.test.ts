// 短信验证码工具链 · 三段核验 + 安全登记（防「注册了但模型看不到」这类静默失效）。
//
// 本项目最常见的缺陷形态是**静默失效**：注册了、实现了、单测是绿的，但模型根本调不到。
// 工具链是三段，断在任一段都不报错：
//   ① 注册  api-tools/*.ts schema + api-tool-executor.ts 的 SUPPORTED_API_TOOLS + case
//   ② 挂载  agent.builtin_tool_ids / alwaysApiTools
//   ③ 进 tool list  buildToolsForBackend() 产出、模型真正看到的 function 列表 ←★ 唯一作数的判据
//
// 本测试用临时库跑真实 seed，逐个打三段；并钉死「读类工具不进 WRITE_TOOLS」。
import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  const os = require('node:os') as typeof import('node:os');
  const path = require('node:path') as typeof import('node:path');
  const fs = require('node:fs') as typeof import('node:fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-vchain-'));
  process.env.DATA_DIR = dir;
});

const TOOLS = ['api_verification_code_latest', 'api_verification_code_list'];

describe('短信验证码工具链 · 三段核验', () => {
  it('① 注册：getApiToolRegistry 里有 schema', async () => {
    const { getApiToolRegistry } = await import('@yan-zhi/core');
    const reg = getApiToolRegistry();
    const all = [...reg.values()].flatMap((l: any[]) => l.map((t) => t.name));
    for (const t of TOOLS) expect(all, `未注册 ${t}`).toContain(t);
    // verification 模块确实存在且非空
    const mod = reg.get('verification' as any);
    expect(Array.isArray(mod) && mod.length).toBeGreaterThan(0);
  });

  it("①' 执行清单：SUPPORTED_API_TOOLS 覆盖（漏登记 = 配置层过滤 = 模型看不到）", async () => {
    const { SUPPORTED_API_TOOLS } = await import('../src/mcp/api-tool-executor.js');
    for (const t of TOOLS) expect(SUPPORTED_API_TOOLS.has(t), `执行清单缺 ${t}`).toBe(true);
  });

  it('② 挂载：默认助手 builtin_tool_ids 含这两个工具', async () => {
    const { db } = await import('../src/db.js');
    const row = db.prepare('SELECT builtin_tool_ids FROM agent WHERE id = ?').get('a_default_assistant') as any;
    const ids: string[] = JSON.parse(row?.builtin_tool_ids || '[]');
    for (const t of TOOLS) expect(ids, `默认助手未挂载 ${t}`).toContain(t);
  });

  it('③ 模型实际收到的 tool list ← 唯一作数的判据', async () => {
    const { buildToolsForBackend } = await import('../src/llm-task-manager.js');
    const names = buildToolsForBackend('a_default_assistant', 'guest', {}).map((t: any) => t.function.name);
    for (const t of TOOLS) expect(names, `模型看不到 ${t}`).toContain(t);
  });
});

describe('短信验证码工具 · 安全登记（读类，不得进写清单）', () => {
  it('★ 读类工具不进 WRITE_TOOLS（否则只读会话被误拦）', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../src/tool-permission.ts', import.meta.url), 'utf8'),
    );
    const block = src.slice(src.indexOf('const WRITE_TOOLS'), src.indexOf('const READONLY_SAFE_TOOLS'));
    for (const t of TOOLS) expect(block, `${t} 不该出现在 WRITE_TOOLS`).not.toContain(t);
  });
});