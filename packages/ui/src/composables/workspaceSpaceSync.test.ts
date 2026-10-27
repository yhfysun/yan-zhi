/**
 * 「会话绑了空间，工作目录却没跟过去」回归测试（用户实报，2026-10-23）
 *
 * 现场：用户在「小说推文 / 第二本」空间里发第一条消息，大模型全程按「第一本」干活，
 * 「+ → 工作目录」显示的也还是第一本。
 *
 * 根因链（本文件钉住的三处）：
 *   ① 工作目录是**全局单份设置**，新建任务只绑 conversation.space_id，没同步它；
 *   ② 前端把这份全局值当「显式下发」传给后端，后端按「显式 > 空间目录」取值
 *      → 提示词、工具相对路径、资源面板全落在上一个目录；
 *   ③ 「无参新建任务」（侧栏 +）原先只在显式传了 spaceId 时才同步目录，这条路径完全没同步。
 *
 * 修法：凡是"会话归属某个空间"的地方统一走 syncWorkspaceDirToSpace（设置 + server 同源）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const UI_SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(UI_SRC, p), 'utf8');
const stripComments = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const CODE_CHAT = stripComments(read('composables/chat/useChat.ts'));
const CODE_PANEL = stripComments(read('components/BrowserPanel.vue'));

describe('① 工作目录必须跟随空间（单一出口）', () => {
  it('★★★ 存在 syncWorkspaceDirToSpace 统一出口，且同时改设置与 server 默认 cwd', () => {
    expect(CODE_CHAT).toMatch(/async function syncWorkspaceDirToSpace\(/);
    const i = CODE_CHAT.indexOf('async function syncWorkspaceDirToSpace(');
    const seg = CODE_CHAT.slice(i, i + 600);
    expect(seg, '★ 只改设置不推 server → 服务端工具仍按旧目录兜底').toMatch(/pushWorkspaceDir\(/);
    expect(seg, '★ 没写 settings.workspaceDir → + 菜单仍显示旧目录').toMatch(/settingsStore\.update\(\{\s*workspaceDir/);
  });

  it('★★★ 无参新建任务（侧栏 +）回落当前选中空间并把目录一起对齐', () => {
    const i = CODE_CHAT.indexOf('async function startNewChat(');
    const seg = CODE_CHAT.slice(i, i + 5000);
    expect(seg, '★ 无参路径没回落 currentSpaceId → 新任务在空间里、目录却还是上一个')
      .toMatch(/activeMode\.value === 'office' \? spaceStore\.currentSpaceId/);
    expect(seg, '★ 回落出了空间却没同步目录').toMatch(/syncWorkspaceDirToSpace\(dirSpaceId\)/);
  });

  it('★★★ 草稿发送新建的会话（两条分支）都同步目录', () => {
    const hits = CODE_CHAT.match(/if \(spaceId\) await syncWorkspaceDirToSpace\(spaceId\);/g) || [];
    expect(hits.length, '★ 草稿发送/无平台两条建会话分支少一处 → 仍会按旧目录跑').toBeGreaterThanOrEqual(2);
  });

  it('★★★ 点开已有会话时把目录对齐到该会话的空间', () => {
    const i = CODE_CHAT.indexOf('async function selectConv(');
    const seg = CODE_CHAT.slice(i, i + 4000);
    expect(seg).toMatch(/syncWorkspaceDirToSpace\(sp\.id\)/);
  });

  it('★★★ 点开没有工作目录的会话（未归类空间）时目录回到「未设置」', () => {
    const i = CODE_CHAT.indexOf('async function selectConv(');
    const seg = CODE_CHAT.slice(i, i + 4000);
    // 2026-10-27 用户实报：点开没有工作目录的任务，顶栏还显示上一个任务的目录 ——
    //   根因是 selectConv 只同步了"会话归属空间"的一半，未归类会话直接留了旧全局目录。
    expect(seg, '★ 未归类会话没清目录 → 顶栏继续挂着上一个任务的目录')
      .toMatch(/else if \(conv && activeMode\.value !== 'shop'\)\s*\{\s*await syncWorkspaceDirToSpace\(null\);/);
    // 空间没绑目录时也要 sync（sync 内部取 sp.dirPath || ''，等价于清空），不能只在 dirPath 存在时才调
    expect(seg, '★ 空间没绑目录时又跳过同步 → 目录残留')
      .not.toMatch(/if \(sp\.dirPath\) await syncWorkspaceDirToSpace/);
  });
});

describe('② 浏览器已收工就解除输入锁（否则 pageAgent 走了还禁用）', () => {
  it('★★★ inputLocked 必须含"浏览器空闲"判据，而不是只看任务在跑', () => {
    const i = CODE_PANEL.indexOf('const inputLocked');
    const seg = CODE_PANEL.slice(i, i + 400);
    expect(seg, '★ 只认 convTaskRunning → pageAgent 收工后主任务继续跑，预览浏览器一直禁用')
      .toMatch(/browserIdleNow/);
  });

  it('★★★ 空闲判据与接管条同一个宽限常量', () => {
    const i = CODE_PANEL.indexOf('const browserIdleNow');
    const seg = CODE_PANEL.slice(i, i + 300);
    expect(seg).toMatch(/BROWSER_LIVE_GRACE_MS/);
  });
});
