// 会话录制 UI 契约（2026-10-16）
// ★ 本仓组件测试是纯文本契约（node 环境无 DOM，无 @vue/test-utils），判据一律剥注释后再匹配。
//
// 守护的东西：
//   ① 回放只重放输出事件（type=o）——把输入事件也写一遍会在屏幕上重复一遍命令；
//   ② 回放不做本地 .cast 解析（服务端解析好再下发，两份解析必然漂移）；
//   ③ 删除录像必须先确认（文件删了就没了）；
//   ④ 「录制中」标识只在真的录制时出现（默认开启，用户有权知道）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ')
   .replace(/^[ \t]*\/\/.*$/gm, ' ')
   .replace(/<!--[\s\S]*?-->/g, ' ');

const read = (...p: string[]) => strip(readFileSync(resolve(__dirname, ...p), 'utf8'));
const CONSOLE = read('OpsConsole.vue');
const PANEL = read('../../components/ops/OpsRecordingsPanel.vue');
const PLAYER = read('../../components/ops/OpsRecordingPlayer.vue');

describe('OpsConsole · 录像入口', () => {
  it('顶层有「录像」Tab，渲染录像面板', () => {
    expect(CONSOLE).toMatch(/<el-tab-pane label="录像" name="rec">/);
    expect(CONSOLE).toMatch(/<OpsRecordingsPanel ref="recPanelRef" \/>/);
  });

  it('mode 的联合类型包含 rec（否则 tab 切不过去）', () => {
    const m = CONSOLE.match(/ref<([^>]+)>\('main'\)/);
    expect(m, '找不到 mode ref').toBeTruthy();
    expect(m![1]).toContain("'rec'");
  });

  it('切到录像 Tab 时刷新列表（会话结束后列表要跟着更新）', () => {
    const fn = CONSOLE.match(/function onTabChange\(name: string\)[\s\S]*?\n\}/);
    expect(fn, '找不到 onTabChange').toBeTruthy();
    expect(fn![0]).toMatch(/name === 'rec'/);
    expect(fn![0]).toMatch(/recPanelRef\.value\?\.load\(\)/);
  });

  it('终端头只在「已连上且正在录制」时显示录制标识', () => {
    expect(CONSOLE).toMatch(/v-if="w\.view === 'term' && w\.termOpen && w\.termRecording"/);
    expect(CONSOLE).toMatch(/class="ops-rec-chip"/);
  });

  it('录制状态来自服务端 ready 帧，断开/释放时清掉', () => {
    expect(CONSOLE).toMatch(/w\.termRecording = !!msg\.recording/);
    // 断开后不清会让用户以为还在录。
    // ★ 2026-10-16：断线路径不再自己置标志位，而是走统一收尾 markTermDisconnected →
    //   disposeTerminal（清 termRecording 在那里）。断言改成钉住这条**链路**，
    //   而不是数 `w.termRecording = false` 的出现次数 —— 数次数会随重构无意义地漂移。
    const dis = CONSOLE.match(/function disposeTerminal\(w: OpsWin\)[\s\S]*?\n\}/)?.[0] ?? '';
    expect(dis, '找不到 disposeTerminal').not.toBe('');
    expect(dis, '释放时未清录制标识（用户会以为还在录）').toMatch(/w\.termRecording = false/);
    expect(CONSOLE, 'WS 断开未走统一收尾').toMatch(/else markTermDisconnected\(w\)/);
  });
});

describe('OpsRecordingsPanel · 列表', () => {
  it('从 /recordings 取元数据，并接收服务端的录制开关状态', () => {
    expect(PANEL).toMatch(/api\.get<RecordingMeta\[\]>\('\/plugin\/ops-shell\/recordings'\)/);
    expect(PANEL).toMatch(/typeof flag === 'boolean'/);
  });

  it('★ 删除前必须确认（.cast 删了不可恢复）', () => {
    const fn = PANEL.match(/async function remove\(row: RecordingMeta\)[\s\S]*?\n\}/);
    expect(fn, '找不到 remove').toBeTruthy();
    expect(fn![0]).toMatch(/ElMessageBox\.confirm/);
    expect(fn![0]).toMatch(/api\.delete\(`\/plugin\/ops-shell\/recordings\/\$\{row\.id\}`\)/);
    // 确认要发生在删除之前
    expect(fn![0].indexOf('ElMessageBox.confirm')).toBeLessThan(fn![0].indexOf('api.delete'));
  });

  it('回放交给播放器组件，带上连接名与开始时间作为标题', () => {
    expect(PANEL).toMatch(/playerRef\.value\?\.open\(row\.id, /);
    expect(PANEL).toMatch(/<OpsRecordingPlayer ref="playerRef" \/>/);
  });

  it('被截断的录像在列表里标出来（别让人以为录全了）', () => {
    expect(PANEL).toMatch(/row\.truncated/);
    expect(PANEL).toMatch(/已截断/);
  });
});

describe('OpsRecordingPlayer · 回放', () => {
  it('★ 只重放输出事件：输入事件是给命令审计的，重放会在屏幕上重复', () => {
    const fn = PLAYER.match(/function writeUpTo\(t: number\)[\s\S]*?\n\}/);
    expect(fn, '找不到 writeUpTo').toBeTruthy();
    expect(fn![0]).toMatch(/if \(e\.type === 'o'\)/);
    expect(fn![0]).not.toMatch(/'i'/);
  });

  it('★ 不做本地 .cast 解析，向服务端要解析好的事件', () => {
    expect(PLAYER).toMatch(/recordings\/\$\{id\}\/play/);
  });

  it('拖动进度条先清屏再快进重放（否则画面会叠上一遍）', () => {
    const fn = PLAYER.match(/function onSeek\(v: number\)[\s\S]*?\n\}/);
    expect(fn, '找不到 onSeek').toBeTruthy();
    expect(fn![0]).toMatch(/term\?\.reset\(\)/);
    expect(fn![0]).toMatch(/idx = 0/);
    expect(fn![0].indexOf('term?.reset()')).toBeLessThan(fn![0].indexOf('idx = 0'));
  });

  it('进度条只在松手时重放（拖拽中每帧重放会卡死）', () => {
    expect(PLAYER).toMatch(/@change="onSeek"/);
    expect(PLAYER).not.toMatch(/@input="onSeek"/);
  });

  it('关闭弹窗时停表并销毁 xterm（不然定时器还在跑）', () => {
    const fn = PLAYER.match(/function onClosed\(\)[\s\S]*?\n\}/);
    expect(fn, '找不到 onClosed').toBeTruthy();
    expect(fn![0]).toMatch(/pause\(\)/);
    expect(fn![0]).toMatch(/term\?\.dispose\(\)/);
  });

  it('回放终端不接受键盘输入（回放中敲键没有意义）', () => {
    expect(PLAYER).toMatch(/disableStdin: true/);
  });
});
