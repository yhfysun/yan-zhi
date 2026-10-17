// 运维 AI 输入框工具条（P0-1）+ 静默权限浮层（P0-2b）UI 契约（2026-10-17）
// ★ 本仓组件测试是纯文本契约（node 环境无 DOM，无 @vue/test-utils），判据一律剥注释后再匹配。
//
// 守护的东西：
//   ① 工具条结构：执行（P1 已接通）/ Agent / 模型下拉 / 权限 / 发送；
//   ② 会话内切模型：发送前解析 w.modelId，平台取自**模型归属**而不是设置里的默认平台；
//   ③ 模型不可用要明确提示并回落默认（不静默跨模型发送）；
//   ④ 静默权限三开关按连接保存，生产连接有红字警告；
//   ⑤ 审计表能区分静默放行（via=silent）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ')
   .replace(/^[ \t]*\/\/.*$/gm, ' ')
   .replace(/<!--[\s\S]*?-->/g, ' ');

const CONSOLE = strip(readFileSync(resolve(__dirname, 'OpsConsole.vue'), 'utf8'));
const SESSION = strip(readFileSync(resolve(__dirname, 'opsSession.ts'), 'utf8'));
const SESSION_RAW = readFileSync(resolve(__dirname, 'opsSession.ts'), 'utf8');

describe('OpsConsole · AI 输入框工具条（P0-1）', () => {
  it('工具条含 Agent / 执行 / 模型下拉 / 发送', () => {
    expect(CONSOLE).toContain('ops-input-toolbar');
    expect(CONSOLE).toMatch(/>执行</);
    // P1 已接通：有输入可点，点后直接写终端（不过模型）
    expect(CONSOLE).toMatch(/<el-button[^>]*:disabled="!w\.chatInput\.trim\(\)"[^>]*@click="execDirect\(w, w\.chatInput\)"[^>]*>执行</);
    expect(CONSOLE).toMatch(/>Agent</);
    expect(CONSOLE).toMatch(/v-model="w\.modelId"/);
    expect(CONSOLE).toMatch(/v-for="m in chatModelOptions"/);
    // 空值 = 跟随设置，仍可一键切回
    expect(CONSOLE).toContain('${defaultModelLabel}');
  });

  it('输入以 / 开头 → 直接执行到终端，不建任务', () => {
    const send = CONSOLE.match(/async function sendWinChat\(w: OpsWin\)[\s\S]*?\n\}/);
    expect(send, '找不到 sendWinChat').toBeTruthy();
    expect(send![0]).toMatch(/content\.startsWith\('\/'\)/);
    expect(send![0]).toMatch(/execDirect\(w, content\)/);
  });

  it('执行指令：生产非只读命令走人工确认（NEED_CONFIRM）', () => {
    const fn = CONSOLE.match(/async function execDirect\(w: OpsWin, raw: string\)[\s\S]*?\n\}/);
    expect(fn, '找不到 execDirect').toBeTruthy();
    expect(fn![0]).toMatch(/await transport\.exec\(command\)/);
    expect(fn![0]).toMatch(/err\.code === 'NEED_CONFIRM'/);
    expect(fn![0]).toMatch(/ElMessageBox\.confirm/);
    expect(fn![0]).toMatch(/transport\.exec\(command, \{ confirmed: true \}\)/);
  });

  it('打开模型下拉时补拉全量清单（ops 页可能只加载过默认平台）', () => {
    expect(CONSOLE).toMatch(/function onModelDropdown\(open: boolean\)/);
    expect(CONSOLE).toMatch(/@visible-change="onModelDropdown"/);
    expect(CONSOLE).toMatch(/platformStore\.loadModels\(\)/);
  });

  it('★ 发送前解析会话模型，平台取自模型归属（不再写死默认平台）', () => {
    const fn = CONSOLE.match(/async function resolveWinModel\(w: OpsWin\)[\s\S]*?\n\}/);
    expect(fn, '找不到 resolveWinModel').toBeTruthy();
    expect(fn![0]).toMatch(/platformStore\.models\.find\(\(m\) => m\.id === selectedId\)/);
    expect(fn![0]).toMatch(/platformStore\.platforms\.find\(\(p\) => p\.id === picked\.platformId\)/);

    const send = CONSOLE.match(/async function sendWinChat\(w: OpsWin\)[\s\S]*?\n\}/);
    expect(send, '找不到 sendWinChat').toBeTruthy();
    expect(send![0]).toMatch(/await resolveWinModel\(w\)/);
    expect(send![0]).toMatch(/platformId: platform\.id/);
    expect(send![0]).toMatch(/modelId: model\.id/);
    // 旧的「写死 settings.defaultPlatformId 找平台」必须已经移除
    expect(send![0]).not.toMatch(/settingsStore\.settings\.defaultPlatformId/);
  });

  it('模型被删/停用 → 明确提示并清回默认（不静默）', () => {
    const fn = CONSOLE.match(/async function resolveWinModel\(w: OpsWin\)[\s\S]*?\n\}/);
    expect(fn![0]).toMatch(/model\.enabled === false/);
    expect(fn![0]).toMatch(/w\.modelId = ''/);
    expect(fn![0]).toMatch(/已回落为设置里的默认模型/);
  });

  it('会话模型只存在窗口状态（不落库）', () => {
    expect(SESSION).toMatch(/modelId\?: string/);
    expect(SESSION_RAW).toMatch(/只存在窗口状态里，不落库/);
    // 不允许把 modelId 写进 localStorage（那张表是“设置”，不是会话态）
    expect(CONSOLE).not.toMatch(/localStorage\.setItem\([^)]*modelId/);
  });
});

describe('OpsConsole · 右下角只留一个悬浮切换钮（2026-10-17）', () => {
  it('不再渲染第二个视图切换浮动钮：主导方胶囊已覆盖对话 ⇄ 主视图', () => {
    expect(CONSOLE).not.toContain('ops-view-fab');
    expect(CONSOLE).not.toMatch(/function cycleWinView/);
  });

  it('输入工具条 / 命令行右侧留白，悬浮胶囊不会压住「发送」', () => {
    expect(CONSOLE).toMatch(/\.ops-input-toolbar \{[^}]*padding: 0 56px 2px 6px/);
    expect(CONSOLE).toMatch(/\.ops-cmdline \{[^}]*padding: 5px 56px 5px 8px/);
  });
});

describe('OpsConsole · 静默权限浮层（P0-2b）', () => {
  it('三档开关各自绑定 saveSilent，按连接 PUT 保存', () => {
    for (const key of ["'read'", "'write'", "'exec'"]) {
      expect(CONSOLE).toContain(`saveSilent(w, ${key}, $event === true)`);
    }
    expect(CONSOLE).toMatch(/api\.put<OpsConn>\(`\/plugin\/ops-shell\/connections\/\$\{c\.id\}\/silent`, \{ silent: next \}\)/);
  });

  it('档位语义与「默认全关」写在界面上', () => {
    expect(CONSOLE).toContain('静默读取文件');
    expect(CONSOLE).toContain('静默修改文件');
    expect(CONSOLE).toContain('静默执行命令');
    expect(CONSOLE).toContain('默认全关');
  });

  it('★ 生产连接必须有红字警告', () => {
    expect(CONSOLE).toMatch(/isProdConn\(connOf\(w\)\)/);
    expect(CONSOLE).toMatch(/ops-perm-warn/);
    expect(CONSOLE).toContain('跳过人工审批');
    expect(CONSOLE).toContain('via=silent');
  });

  it('审计表能区分静默放行', () => {
    expect(CONSOLE).toMatch(/row\.via === 'silent'/);
    expect(CONSOLE).toMatch(/interface AuditEntry[^}]*via\?: 'silent'/);
  });
});
