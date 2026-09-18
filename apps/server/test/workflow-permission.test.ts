/**
 * 工作流在只读会话下的权限判定（tool-permission.ts 的 checkWorkflowPermission）。
 *
 * 为什么必须钉：这是一个**真实的权限绕过面**。
 * 工作流模式的会话可以设成「只读」，但运行台是绕过会话主体直接起 DAG 的 ——
 * 若只在工具层按前缀拦，会有两个方向的错：
 *   - 全放：只读会话点一下就能跑写文件的流水线（短剧流水线要落图/音频/字幕）
 *   - 全禁：纯取数的流水线（只读 LLM + code）被一刀切误伤
 * 所以按**实际节点内容**判：tool 节点查写工具清单、sub_agent 保守拒绝、code 表达式查危险模式。
 */
import { describe, it, expect } from 'vitest';
import { checkWorkflowPermission, checkToolPermission } from '../src/tool-permission';

const wfOf = (nodes: any[]) => ({ nodes });

describe('checkWorkflowPermission · 非只读模式', () => {
  it('default / full 一律放行（权限收窄只针对 readonly）', () => {
    const wf = wfOf([{ id: 'n', type: 'tool', config: { toolName: 'file_write' } }]);
    expect(checkWorkflowPermission('default', wf)).toEqual({ allowed: true });
    expect(checkWorkflowPermission('full', wf)).toEqual({ allowed: true });
  });
});

describe('checkWorkflowPermission · 只读模式', () => {
  it('★ 含写文件节点 → 拒绝，并指出是哪个节点、哪个工具', () => {
    const wf = wfOf([
      { id: 'n_llm', type: 'llm', config: { modelId: 'm' } },
      { id: 'n_write', type: 'tool', config: { toolName: 'file_write' } },
    ]);
    const v = checkWorkflowPermission('readonly', wf, 'wf_a_x');
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain('n_write');
    expect(v.reason).toContain('file_write');
    expect(v.reason).toContain('wf_a_x');
  });

  it('★★ 媒体生成工具（api_image_generate / api_tts_speak / api_srt_generate）→ 拒绝', () => {
    // 实测踩到的漏洞：这些工具**不在写清单里**，按黑名单判会放行，
    // 于是只读会话能跑短剧流水线并落图片/音频/字幕文件。
    // 改用白名单后这里必须拒绝。
    for (const name of ['api_image_generate', 'api_tts_speak', 'api_srt_generate', 'media_compose']) {
      const v = checkWorkflowPermission('readonly', wfOf([{ id: 'd_img', type: 'tool', config: { toolName: name } }]));
      expect(v.allowed).toBe(false);
      expect(v.reason).toContain(name);
    }
  });

  it('★ 纯取数流水线（只读 LLM + code + 只读工具）→ 放行（不该被一刀切误伤）', () => {
    const wf = wfOf([
      { id: 'i', type: 'input', config: {} },
      { id: 'l', type: 'llm', config: { modelId: 'm', systemPrompt: '总结' } },
      { id: 'c', type: 'code', config: { expression: 'return ctx.get("l");' } },
      { id: 't', type: 'tool', config: { toolName: 'api_kb_search' } },
      { id: 'o', type: 'output', config: { key: 'result' } },
    ]);
    expect(checkWorkflowPermission('readonly', wf)).toEqual({ allowed: true });
  });

  it('code 节点里写文件（fs.writeFileSync）→ 拒绝', () => {
    const wf = wfOf([{ id: 'c1', type: 'code', config: { expression: 'const fs=require("fs"); fs.writeFileSync("a.txt","x");' } }]);
    const v = checkWorkflowPermission('readonly', wf);
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain('c1');
  });

  it('code 节点里执行系统命令（child_process / execSync）→ 拒绝', () => {
    for (const expr of ['const cp = require("child_process"); cp.execSync("rm -rf x")', 'execSync("dir")']) {
      const v = checkWorkflowPermission('readonly', wfOf([{ id: 'c', type: 'code', config: { expression: expr } }]));
      expect(v.allowed).toBe(false);
    }
  });

  it('sub_agent 节点 → 保守拒绝（子流程可能写）', () => {
    const v = checkWorkflowPermission('readonly', wfOf([{ id: 'sub', type: 'sub_agent', config: { subAgentId: 'a_x' } }]));
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain('sub');
  });

  it('★ memory_write 节点 → 拒绝（直接写记忆库，比 tool 节点隐蔽）', () => {
    const v = checkWorkflowPermission('readonly', wfOf([{ id: 'mem', type: 'memory_write', config: { agentId: 'a_x' } }]));
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain('mem');
  });

  it('task_plan / ask_user 这类纯展示工具 → 放行（无副作用，不该误伤）', () => {
    const v = checkWorkflowPermission('readonly', wfOf([
      { id: 'p', type: 'tool', config: { toolName: 'task_plan' } },
      { id: 'a', type: 'tool', config: { toolName: 'ask_user' } },
    ]));
    expect(v.allowed).toBe(true);
  });

  it('memory_read 节点 → 放行（只读语义）', () => {
    const v = checkWorkflowPermission('readonly', wfOf([{ id: 'mr', type: 'memory_read', config: { topK: 3 } }]));
    expect(v.allowed).toBe(true);
  });

  it('tool 节点引用 mcp_ / custom_ 工具 → 拒绝（副作用不可判定）', () => {
    for (const name of ['mcp_fs__write', 'custom_abc_danger']) {
      const v = checkWorkflowPermission('readonly', wfOf([{ id: 't', type: 'tool', config: { toolName: name } }]));
      expect(v.allowed).toBe(false);
    }
  });

  it('★ 定义不可读（null / 空节点）→ 保守拒绝，绝不放行', () => {
    expect(checkWorkflowPermission('readonly', null).allowed).toBe(false);
    expect(checkWorkflowPermission('readonly', wfOf([])).allowed).toBe(false);
  });

  it('snake_case 工具名写法也认（历史数据 tool_name）', () => {
    const v = checkWorkflowPermission('readonly', wfOf([{ id: 't', type: 'tool', config: { tool_name: 'file_write' } }]));
    expect(v.allowed).toBe(false);
  });
});

describe('checkToolPermission · wf_ 前缀兜底', () => {
  it('★ wf_ 属于不可控来源 → 只读下按前缀也拒（信息不足时的保守默认）', () => {
    // 实际放行由 checkWorkflowPermission 按内容判定；这里验证「拿不到内容也不会漏放」
    const v = checkToolPermission('readonly', 'wf_a_wf_drama_pipeline');
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain('wf_');
  });

  it('非只读模式下 wf_ 不受影响', () => {
    expect(checkToolPermission('default', 'wf_a_wf_drama_pipeline')).toEqual({ allowed: true });
  });
});