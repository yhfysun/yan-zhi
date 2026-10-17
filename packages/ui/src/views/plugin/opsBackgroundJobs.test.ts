// 后台 AI 任务 P2 UI 契约（2026-10-17）
// ★ 本仓组件测试是纯文本契约（node 环境无 DOM），判据一律剥注释后再匹配。
//
// 守护的东西：
//   ① 输入框工具条有「后台」，提交链路 = /llm/tasks → 登记 ops agent job；
//   ② 后台执行不占用本窗口的流式状态（不设 chatStreaming、不订阅 SSE）；
//   ③ 任务中心能渲染 agent 任务（执行中预览、完成后结果、历史摘要）；
//   ④ 文件面板重开/外部提交靠轮询活动任务接回来，卸载要停掉定时器。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ')
   .replace(/^[ \t]*\/\/.*$/gm, ' ')
   .replace(/<!--[\s\S]*?-->/g, ' ');

const CONSOLE = strip(readFileSync(resolve(__dirname, 'OpsConsole.vue'), 'utf8'));
const SFTP = strip(readFileSync(resolve(__dirname, 'SftpPanel.vue'), 'utf8'));
const MENU = readFileSync(resolve(__dirname, '../../styles/menu.css'), 'utf8');

describe('OpsConsole · 后台执行入口', () => {
  it('工具条「后台」是模式切换，提交时走 sendBackground', () => {
    expect(CONSOLE).toMatch(/@click="w\.chatMode = 'background'">后台</);
    const submit = CONSOLE.match(/function submitWinChat\(w: OpsWin\)[\s\S]*?\n\}/);
    expect(submit, '找不到 submitWinChat').toBeTruthy();
    expect(submit![0]).toMatch(/mode === 'background'[\s\S]{0,80}sendBackground/);
    expect(CONSOLE).toContain('sendBackground(w)');
  });

  it('★ 提交链路：先建 LLM 任务，再登记 ops agent job', () => {
    const fn = CONSOLE.match(/async function sendBackground\(w: OpsWin\)[\s\S]*?\n\}/);
    expect(fn, '找不到 sendBackground').toBeTruthy();
    const body = fn![0];
    expect(body).toMatch(/await resolveWinModel\(w\)/);
    expect(body).toMatch(/api\.post<any>\('\/llm\/tasks'/);
    expect(body).toMatch(/api\.post<\{ jobId: string \}>\('\/plugin\/ops-shell\/jobs\/agent'/);
    // 复用运行中任务时注入即可，不重复登记
    expect(body).toMatch(/taskRes\.data\.reused/);
  });

  it('★ 后台执行不占本窗口的流：不设 chatStreaming、不订阅 SSE', () => {
    const fn = CONSOLE.match(/async function sendBackground\(w: OpsWin\)[\s\S]*?\n\}/);
    const body = fn![0];
    expect(body).not.toMatch(/subscribeWinTask/);
    expect(body).not.toMatch(/chatStreaming = true/);
    expect(body).not.toMatch(/chatAborts\.set/);
  });

  it('切回对话视图时补齐后台任务写入的回复', () => {
    expect(CONSOLE).toMatch(/if \(w\.conversationId && !w\.chatStreaming\) void loadWinMessages\(w\)/);
  });
});

describe('任务中心 · agent 任务（P2）', () => {
  it('任务类型支持 agent，并有预览/结果渲染', () => {
    expect(SFTP).toMatch(/kind: 'upload' \| 'download' \| 'delete' \| 'agent'/);
    expect(SFTP).toMatch(/t\.kind === 'agent'/);
    expect(SFTP).toContain('stp-agent-preview');
    expect(SFTP).toContain('stp-agent-result');
    expect(SFTP).toMatch(/function agentPreview\(/);
    expect(SFTP).toMatch(/function agentResult\(/);
  });

  it('agent 任务不画百分比进度条（没有字节口径）', () => {
    expect(SFTP).toMatch(/v-if="t\.kind !== 'delete' && t\.kind !== 'agent'"/);
  });

  it('★ 轮询活动任务接回后台任务，卸载停掉定时器', () => {
    expect(SFTP).toMatch(/api\.get<Array<Record<string, unknown> & \{ id\?: string \}>>\('\/plugin\/ops-shell\/sftp\/jobs\/active'\)/);
    expect(SFTP).toMatch(/setInterval\(\(\) => \{ void loadActiveJobs\(\); void loadTaskHistory\(\); \}, 4000\)/);
    expect(SFTP).toMatch(/clearInterval\(activeJobsTimer\)/);
    // 外部任务不抢焦点
    expect(SFTP).toMatch(/\{ open: false \}/);
  });

  it('agent 结果/预览样式在全局任务弹层作用域内', () => {
    expect(MENU).toContain('.sftp-task-popper .stp-agent-preview');
    expect(MENU).toContain('.sftp-task-popper .stp-agent-result');
  });
});
