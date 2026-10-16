// SFTP 双栏右键菜单契约（2026-10-16）
// ★ 本仓组件测试是纯文本契约（node 环境无 DOM，无 @vue/test-utils），判据一律剥注释后再匹配。
//
// 背景（用户实报）：「目录管理里面右击删除/重命名/复制都没了？目录和文件都要支持」。
// 根因：① 本地栏**整个没有 @contextmenu**；② 删除对目录是坏的（后端 rmdir 非空必失败，
// 而菜单对目录也显示删除）；③ 两栏都没有「复制」。
// 所以这里逐条钉死：两个栏都挂右键、目录和文件都能拿到这些操作。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ')
   .replace(/^[ \t]*\/\/.*$/gm, ' ')
   .replace(/<!--[\s\S]*?-->/g, ' ');
const SRC = strip(readFileSync(resolve(__dirname, 'SftpPanel.vue'), 'utf8'));

describe('SFTP · 两个栏都要有右键菜单', () => {
  it('★ 本地栏挂上了右键（历史上这里整块缺失）', () => {
    expect(SRC).toMatch(/@contextmenu\.prevent="onLocalListCtx"/);
    expect(SRC).toMatch(/@contextmenu\.prevent\.stop="onLocalCtx\(e, \$event\)"/);
    expect(SRC).toMatch(/function onLocalCtx\(e: LocalEntry, ev: MouseEvent\)/);
    expect(SRC).toMatch(/function onLocalListCtx\(ev: MouseEvent\)/);
  });

  it('远程栏的右键仍在（回归）', () => {
    expect(SRC).toMatch(/@contextmenu\.prevent="onListCtx"/);
    expect(SRC).toMatch(/@contextmenu\.prevent\.stop="onRemoteCtx\(e, \$event\)"/);
  });

  it('★ 菜单按 pane 分叉（两栏共用一份状态，避免又漏一栏）', () => {
    expect(SRC).toMatch(/ctx\.pane === 'remote'/);
    expect(SRC).toMatch(/function openCtx\(ev: MouseEvent, pane: CtxPane/);
  });
});

describe('SFTP · 目录和文件都要支持这些操作', () => {
  it('★ 两栏都有「复制到另一端」，且目录同样可用', () => {
    expect(SRC).toMatch(/>复制到本地</);
    expect(SRC).toMatch(/>复制到远程</);
    // 复制项不能对目录设 v-if 排除
    expect(SRC).not.toMatch(/v-if="!ctx\.isDir"[^>]*>复制到/);
    expect(SRC).toMatch(/function copyCtxToOther\(\)/);
  });

  it('★ 重命名 / 删除对目录也显示（旧实现里它们对目录是坏的）', () => {
    expect(SRC).not.toMatch(/v-if="!ctx\.isDir"[^>]*>重命名</);
    expect(SRC).not.toMatch(/v-if="!ctx\.isDir"[^>]*>删除</);
    expect(SRC).toMatch(/>重命名</);
    expect(SRC).toMatch(/>删除</);
  });

  it('备份仍只对文件（备份是文件级操作，目录不支持）', () => {
    expect(SRC).toMatch(/v-if="!ctx\.isDir"[^>]*>备份</);
  });

  it('两栏都有新建目录', () => {
    expect((SRC.match(/>新建目录</g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('SFTP · 删除要如实告知', () => {
  it('★ 文案不再说「仅支持文件与空目录」（目录现在连内容一起删）', () => {
    expect(SRC).not.toMatch(/仅支持文件与空目录/);
    expect(SRC).toMatch(/目录会连同\*\*全部内容\*\*一起删除/);
  });

  it('★ 本地删除要显式带 recursive（后端拿它当第二道闸）', () => {
    expect(SRC).toMatch(/local\/delete', \{[\s\S]{0,80}recursive: true/);
  });

  it('重命名 / 删除按 pane 走到正确的后端路由', () => {
    expect(SRC).toMatch(/\/plugin\/ops-shell\/local\/rename/);
    expect(SRC).toMatch(/\/plugin\/ops-shell\/sftp\/rename/);
    expect(SRC).toMatch(/\/plugin\/ops-shell\/local\/delete/);
    expect(SRC).toMatch(/\/plugin\/ops-shell\/sftp\/unlink/);
  });

  it('多选时按整批处理（ctxNames 而不是只看右键那一项）', () => {
    expect(SRC).toMatch(/function ctxNames\(\)/);
    expect(SRC).toMatch(/const names = ctxNames\(\);/);
  });
});

describe('SFTP · 打开目录要认栏位', () => {
  it('★ openCtxDir 按 pane 分别跳本地 / 远程（只改远程会让本地「打开」失灵）', () => {
    const fn = SRC.match(/function openCtxDir\(\)[\s\S]*?\n\}/);
    expect(fn, '找不到 openCtxDir').toBeTruthy();
    expect(fn![0]).toMatch(/ctx\.value\.pane === 'local'/);
    expect(fn![0]).toMatch(/loadLocal\(\)/);
    expect(fn![0]).toMatch(/loadRemote\(\)/);
  });
});
