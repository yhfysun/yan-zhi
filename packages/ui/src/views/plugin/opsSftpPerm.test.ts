// SFTP 远程权限管理契约（2026-10-22）
// ★ 本仓组件测试是纯文本契约（node 环境无 DOM），判据一律剥注释后再匹配。
//
// 用户要求：「运维模式，服务器文件新增权限管理功能可以改变目录及其文件的权限」。
// 这里钉死四件事：列表能看到权限位、右键能进权限编辑、八进制与 rwx 勾选联动、
// 目录能选择递归应用；另外后端契约（mode 走八进制字符串、生产要 confirmed）也不能掉。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ')
   .replace(/^[ \t]*\/\/.*$/gm, ' ')
   .replace(/<!--[\s\S]*?-->/g, ' ');
const SRC = strip(readFileSync(resolve(__dirname, 'SftpPanel.vue'), 'utf8'));

describe('SFTP · 权限列', () => {
  it('★ 远程列表显示权限位（后端早就返回 mode，前端此前完全没用）', () => {
    expect(SRC).toMatch(/class="sftp-cols-head is-remote"/);
    expect(SRC).toMatch(/>权限</);
    expect(SRC).toMatch(/\{\{ fmtMode\(e\.mode\) \}\}/);
  });

  it('★ fmtMode 把 mode 转成 rwx 串，并处理 setuid/setgid/sticky', () => {
    const fn = SRC.match(/function fmtMode\(mode: number\): string \{[\s\S]*?\n\}/);
    expect(fn, '找不到 fmtMode').toBeTruthy();
    expect(fn![0]).toMatch(/0o7777/);
    expect(fn![0]).toMatch(/'r' : '-'/);
    expect(fn![0]).toMatch(/0o4000/);
    expect(fn![0]).toMatch(/0o2000/);
    expect(fn![0]).toMatch(/0o1000/);
  });

  it('本地栏不加权限列（Windows 无 POSIX 权限位）', () => {
    // 权限单元格只出现在 is-remote 的远程行里
    const modeCells = SRC.match(/class="sftp-mode"/g) ?? [];
    expect(modeCells).toHaveLength(1);
  });
});

describe('SFTP · 右键进入权限编辑', () => {
  it('★ 远程栏右键菜单有「权限…」且目录与文件都可用', () => {
    expect(SRC).toMatch(/openPermDialog\(\); closeCtx\(\)">权限…</);
    // 不能对目录设 v-if 排除（目录正是最常改权限的对象）
    expect(SRC).not.toMatch(/v-if="!ctx\.isDir"[^>]*>权限…</);
  });

  it('只在远程栏出现（本地栏菜单块里没有权限项）', () => {
    const localBlock = SRC.split('<!-- 本地栏 -->')[1] ?? '';
    expect(localBlock).not.toMatch(/openPermDialog/);
  });
});

describe('SFTP · 权限编辑弹窗', () => {
  it('★ 八进制输入与 rwx 勾选双向联动', () => {
    expect(SRC).toMatch(/const PERM_GROUPS = \[/);
    expect(SRC).toMatch(/const PERM_BITS = \[/);
    expect(SRC).toMatch(/function togglePerm\(g: PermGroupKey, mask: number\)/);
    expect(SRC).toMatch(/function permBit\(g: PermGroupKey, mask: number\): boolean/);
    expect(SRC).toMatch(/v-model="perm\.draft"/);
  });

  it('★ 非法八进制时禁用确定按钮', () => {
    expect(SRC).toMatch(/const permValid = computed\(\(\) => permOctal\.value !== null\)/);
    expect(SRC).toMatch(/:disabled="!permValid"/);
    expect(SRC).toMatch(/\^\[0-7\]\{1,4\}\$/);
  });

  it('★ 目录可勾选递归应用到全部下级，并说明会跳过软链', () => {
    expect(SRC).toMatch(/v-if="perm\.isDir" v-model="perm\.recursive"/);
    expect(SRC).toMatch(/递归应用到目录内所有文件与子目录/);
    expect(SRC).toMatch(/软链接会被跳过/);
  });

  it('★ 提交走 /sftp/chmod，mode 以八进制字符串发送', () => {
    expect(SRC).toMatch(/\/plugin\/ops-shell\/sftp\/chmod/);
    const fn = SRC.match(/async function submitPerm\(\)[\s\S]*?\n\}/);
    expect(fn, '找不到 submitPerm').toBeTruthy();
    expect(fn![0]).toMatch(/connectionId: props\.connectionId/);
    expect(fn![0]).toMatch(/mode,/);
    expect(fn![0]).toMatch(/recursive/);
    expect(fn![0]).toMatch(/confirmed: isProd/);
  });

  it('生产连接提交前二次确认', () => {
    const fn = SRC.match(/async function submitPerm\(\)[\s\S]*?\n\}/);
    expect(fn![0]).toMatch(/if \(isProd\)/);
    expect(fn![0]).toMatch(/ElMessageBox\.confirm/);
  });

  it('部分失败要如实回报（成功数 + 第一条失败原因）', () => {
    const fn = SRC.match(/async function submitPerm\(\)[\s\S]*?\n\}/);
    expect(fn![0]).toMatch(/failed\.length/);
    expect(fn![0]).toMatch(/ElMessage\.warning/);
  });
});
