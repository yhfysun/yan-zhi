// SecConsole 命令行（命令中枢）的**源码契约**测试（2026-10-16）。
//
// ★ 为什么是源码契约而不是挂载：SecConsole 是 93KB 的自绘控制台，挂载要吃
//   useChat / 一堆 store / 路由上下文 —— 挂起来测的是夹具，不是它。
//   而这里要钉的恰恰是**结构性事实**（有没有另起一条执行链、人工闸门的入口还在不在），
//   这类事实"读它自己的源码"验证最直接。
// ★ 断言前先剥注释：本文件的注释里就写着 planCommandInput / runTool 这些名字，
//   扫注释会**假通过**（本仓在 migration 测试里踩过这个坑）。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAW = readFileSync(resolve(__dirname, 'SecConsole.vue'), 'utf8');

/** 剥掉行注释与块注释（保留代码本身） */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const SRC = stripComments(RAW);

describe('★ 命令行：与聊天框的面板同源，不另起执行链', () => {
  it('有命令行入口（输入框 + 运行按钮 + /help 提示）', () => {
    expect(SRC).toContain('sec-cmdbar');
    expect(SRC).toContain('submitCommand');
    expect(SRC).toContain('cmdPlaceholder');
  });

  it('★ 解析与执行都复用命令中枢（planCommandInput / commandsStore.runTool）', () => {
    expect(SRC, '解析必须用同一份 planCommandInput（否则命令行的语义与面板会分叉）')
      .toContain('planCommandInput');
    expect(SRC, '执行必须走命令总线的 runTool（它就是 POST /plugin/sec-lab/run + withGuard）')
      .toContain('commandsStore.runTool');
  });

  it('★ 不走通用工具端点（那个不过 permissionMode、也没有 sec 护栏）', () => {
    expect(SRC).not.toContain('/api/tools/builtin/execute');
    expect(SRC).not.toContain('executeBuiltinTool');
  });

  it('危险 / 需确认的命令先弹确认（与「▶ 执行」按钮的确认口径一致）', () => {
    expect(SRC).toMatch(/def\.confirm\s*\|\|/);
    expect(SRC).toContain("def.danger === 'S'");
    // 确认后给工具补 confirmed（lab 类工具的 schema 要求它，否则用户只会收到一句报错）
    expect(SRC).toContain('confirmed: true');
  });

  it('/help 在控制台里有出口（帮助由 CommandDef 自动生成，不手写清单）', () => {
    expect(SRC).toContain('formatHelp');
  });
});

describe('★ AI 模式输入框工具条（对齐运维模式 P0-1）', () => {
  it('会话内模型切换：下拉 + 解析函数，发送用解析后的平台/模型', () => {
    expect(SRC).toContain('sec-ai-toolbar');
    expect(SRC).toContain('secModelId');
    expect(SRC).toContain('resolveSecModel');
    expect(SRC, '发送必须使用解析结果，不能绕过它直读默认模型')
      .toContain('const { platform, model } = resolved');
  });

  it('执行权限浮层保留交战模式，且开启前必须人工确认', () => {
    expect(SRC).toContain('toggleEngagement');
    expect(SRC).toContain('开启交战模式');
    expect(SRC).toContain('engagementMode');
  });

  it('「执行」已接命令总线：/命令 与 @剧本 不经过模型', () => {
    expect(SRC).toContain('secAiAction');
    expect(SRC).toContain('runSecCommandFromAi');
    expect(SRC, '/ 或 @ 必须走命令直执行分支')
      .toMatch(/content\.startsWith\('\/'\)\s*\|\|\s*content\.startsWith\('@'\)/);
    expect(SRC, '直执行仍复用 submitCommand（同一套 guard/审计）').toContain('await submitCommand()');
    expect(SRC, '执行按钮不能再是永久禁用占位').not.toContain('disabled title="P1 开放');
  });

  it('工具条显示当前授权目标数量（提醒只对已授权目标动手）', () => {
    expect(SRC).toContain('sec-ai-scope-hint');
    expect(SRC).toContain('个授权目标');
  });

  it('P2 后台执行：提交后不订阅 SSE，服务端继续跑、任务列表可见', () => {
    expect(SRC).toContain('secBackground');
    expect(SRC).toContain('已提交后台任务');
    expect(SRC, '后台分支必须在 subscribeSecTask 之前').toMatch(/if \(secBackground\.value\)[\s\S]{0,400}?pushSecLocal[\s\S]{0,200}?return;[\s\S]{0,120}?await subscribeSecTask/);
  });

  it('★ ExecutionGate：三档审批 + 待批面板 + 批准/拒绝入口', () => {
    expect(SRC).toContain('approvalMode');
    expect(SRC).toContain('changeApprovalMode');
    expect(SRC, '三档必须都出现在界面上').toContain('auto_review');
    expect(SRC).toContain('full_access');
    expect(SRC).toContain('decideExecutionApproval');
    expect(SRC, '审批走独立路由').toContain('/approvals/decide');
    expect(SRC, '待批面板').toContain('EXECUTION GATE');
    expect(SRC, '批准票一次性提示').toContain('只对这一次、完全相同的参数有效');
  });
});

describe('★ 收敛边界：Tab 数下降，但功能与人工闸门一个都不能少', () => {
  it('★ attack_sim 的人工触发通道不能被收敛掉（丢了它该工具直接不可用）', () => {
    // HUMAN_ONLY_TOOLS 依赖 requester='human'，而它由 /run 路由注入 ——
    // "人工点击"的那个入口就是「高级表单 · 演练」里的「▶ 演练」按钮（postRun('attack_sim') + 二次确认）。
    // 收敛把演练**折叠**进「终端」，但入口本身必须还在。
    expect(SRC).toContain("postRun('attack_sim'");
    expect(SRC).toContain('simConfirm');
  });

  it('★ Tab 从 8 收敛到 3（终端 / 结果 / 环境）——界面不再随能力增长', () => {
    const i = RAW.indexOf('const TABS');
    const tabBlock = RAW.slice(i, i + 1400);
    const nums = [...tabBlock.matchAll(/num:\s*'(\d+)'/g)].map((m) => m[1]);
    expect(nums).toEqual(['01', '02', '03']);
  });

  it('★ 收敛只改信息架构：四个动作面降级为「高级表单」，一个都没删', () => {
    expect(SRC, '用 <details> 折叠').toContain('sec-adv');
    // 每个表单自己的入口按钮都还在（沿用原按钮文案，避免"收敛"变成"删功能"）
    for (const label of ['▶ 执行', '▶ 演练', '▶ 运行', '▶ 狩猎', '▶ 部署靶场']) {
      expect(SRC, `表单入口「${label}」不能被收敛掉`).toContain(label);
    }
  });

  it('★ 命令行的结果落在**运行卡**里（终端页首块），不在某个表单下面', () => {
    const cards = [...SRC.matchAll(/sec-frame-out sec-runcard/g)];
    expect(cards.length, '运行卡有且只有一块').toBe(1);
  });

  it('控制台接了 /target（焦点目标）与 /playbook（自定义剧本）两条内置命令', () => {
    expect(SRC, '焦点目标分支').toContain("step.def.run === 'target'");
    expect(SRC, '自定义剧本分支').toContain("step.def.run === 'playbook'");
    expect(SRC, '进页面时拉取用户剧本').toContain('loadUserPlaybooks');
  });

  it('左栏三件（任务 / 授权目录 / 脉冲）与交战模式开关都还在', () => {
    expect(SRC).toContain('TaskListSection');
    expect(SRC, '授权目录列表').toContain('sec-scope-row');
    expect(SRC, '交战模式开关').toContain('engagementMode');
  });
});

describe('★ 扫描入口卡（2026-10-30）：只拼命令，不另起执行链', () => {
  it('四张卡由 SCAN_ENTRIES 渲染（元数据在 utils/scanEntries，可单测）', () => {
    expect(SRC).toContain('SCAN_ENTRIES');
    expect(SRC).toContain('sec-scan-card');
    expect(SRC).toContain('pickScanCard');
    expect(SRC).toContain('activeScan');
  });

  it('★ 点击后拼命令并交给 submitCommand —— 与命令行同一条链', () => {
    expect(SRC).toContain('buildScanCommand');
    const fn = /async function runScanCard\(\)[\s\S]*?\n}/.exec(SRC)?.[0] || '';
    expect(fn, 'runScanCard 必须存在').toBeTruthy();
    expect(fn, '必须调用 submitCommand（否则绕过剧本展开/确认/结果落卡）').toContain('submitCommand()');
    expect(fn, '卡片里不能直接发请求').not.toMatch(/\bfetch\s*\(|api\.(post|get)\s*\(/);
  });

  it('卡片区在终端页、且位于运行卡之前（结果仍落运行卡）', () => {
    const scanIdx = SRC.indexOf('sec-scan-cards');
    const runCardIdx = SRC.indexOf('sec-frame-out sec-runcard');
    expect(scanIdx).toBeGreaterThan(-1);
    expect(runCardIdx).toBeGreaterThan(scanIdx);
  });

  it('本地路径用系统对话框选，空目标禁用「开始扫描」', () => {
    expect(SRC, '浏览按钮').toContain('browseScanTarget');
    expect(SRC, '目录选择走桌面端对话框').toContain('showOpenDir');
    expect(SRC, '空目标禁用').toContain('scanTargetMissing');
  });

  it('结果页可导出 Markdown 报告（交给智能体逐项修复）', () => {
    expect(SRC).toContain('exportFindingsReport');
    expect(SRC).toContain('/export/report');
    expect(SRC, '桌面端落盘走系统保存框').toContain('saveFile');
  });

  it('★「导出本次扫描」把当前 jobId 传给导出接口（不是导全量）', () => {
    expect(SRC, 'jobId 来自 /run 响应，需要本地记住').toContain('lastJobId');
    expect(SRC, 'runTool 返回后要记录 jobId').toContain('r.jobId');
    expect(SRC, '导出调用必须带 jobId 参数').toMatch(/exportFindingsReport\(lastJobId\)/);
    expect(SRC, '没有 jobId 时按钮禁用').toMatch(/:disabled="!lastJobId"/);
    expect(SRC, '带 jobId 走同一导出端点').toMatch(/jobId\s*\?\s*\{\s*jobId\s*\}\s*:\s*\{\s*\}/);
  });
});
