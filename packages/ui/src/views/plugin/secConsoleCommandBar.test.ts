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

describe('★ 收敛边界：8 个 Tab 与人工闸门都必须还在', () => {
  it('★ attack_sim 的人工触发通道不能被收敛掉（丢了它该工具直接不可用）', () => {
    // HUMAN_ONLY_TOOLS 依赖 requester='human'，而它由 /run 路由注入 ——
    // "人工点击"的那个入口就在演练 Tab（postRun('attack_sim') + 二次确认弹窗）。
    expect(SRC).toContain("postRun('attack_sim'");
    expect(SRC).toContain('simConfirm');
  });

  it('8 个 Tab 仍在（本次只加命令行，**没有**做"收敛为命令行 + 运行卡"那一步）', () => {
    const i = RAW.indexOf('const TABS');
    const tabBlock = RAW.slice(i, i + 1400);
    const nums = [...tabBlock.matchAll(/num:\s*'(\d+)'/g)].map((m) => m[1]);
    expect(nums).toEqual(['01', '02', '03', '04', '05', '06', '07', '08']);
  });

  it('左栏三件（任务 / 授权目录 / 脉冲）与交战模式开关都还在', () => {
    expect(SRC).toContain('TaskListSection');
    expect(SRC, '授权目录列表').toContain('sec-scope-row');
    expect(SRC, '交战模式开关').toContain('engagementMode');
  });
});
