/**
 * 桌面端身份区（头像 / 登录入口）—— 守门测试。
 *
 * ★ 这里连着修了两次，把两次的教训都钉住：
 *
 * 第一次（错误）：看到桌面端有个「登录」按钮点了被路由弹回，就直接把桌面端的登录入口删了。
 *   → 结果桌面端**什么身份入口都没有了**。因为：
 *       · `authStore.isLoggedIn` 在桌面端恒 false（guest 不算登录态，2026-09-23 的决策）；
 *       · 桌面端 `SideNav` 也不渲染（`v-if="isMobile"`）。
 *     删掉之后两头都进不去 —— 比修复前更糟。**用户要的是"头像"，不是"删掉按钮"。**
 *
 * 第二次（正解）：桌面端渲染**中性"本机"头像**（不叫登录、不引导登录），
 *   Web/移动端保留「未登录 → 登录入口」。
 *
 * 判据（三层都要成立，缺一层就会出现"某个端没有身份入口"）：
 *   ① 桌面端必须有头像（不能是登录按钮，也不能什么都没有）；
 *   ② 桌面端头像不得暴露 guest 这个内部身份；
 *   ③ 桌面端头像不得是"登录入口"语义（点了要进 /login 就是错的）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const UI_SRC = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(UI_SRC, p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const TOPBAR = read('components/WebTopBar.vue');
const TOPBAR_CODE = strip(TOPBAR);
const ROUTER = read('router/index.ts');
const AUTH = read('stores/auth.ts');
const APP = read('App.vue');

/** 身份区片段（从"身份区"注释到主题切换按钮），隔离出三个分支 */
function identityBlock(): string {
  const start = TOPBAR_CODE.indexOf('title-avatar');
  const end = TOPBAR_CODE.indexOf('title-theme-btn');
  expect(start, '★ 找不到身份区（title-avatar）').toBeGreaterThan(-1);
  return TOPBAR_CODE.slice(Math.max(0, start - 600), end);
}

/**
 * ★ 2026-10-21 修：断言**不得写死前一个分支的条件**。
 *
 * 原来的断言是 `v-else-if="isElectron"` / `v-else class="title-login-btn"`，
 * 而身份区现在是三分支（已登录 / 桌面端本机 / 其他端登录入口），
 * 第三个分支自然是 `v-else-if="!modeLocked"` 而不是 `v-else` ——
 * 于是三条断言全红，但**实现完全正确**（红的是测试的假设，不是代码）。
 *
 * 判据：只看"该分支自身条件"，不关心它前面挂了几句 v-if。
 * ★ 条件必须**恰好是** `!modeLocked && isElectron`（不接受额外表达式）——
 *   否则 `isElectron && false` 这种把桌面端分支关掉的改动会漏网（已用变异验证过）。
 */
const ELECTRON_BRANCH = /v-else-if="!modeLocked && isElectron"/;

describe('桌面端身份区：必须有头像，且不得是登录入口', () => {
  it('★★ 桌面端必须有身份头像（不能只剩"登录"按钮，也不能什么都没有）', () => {
    const block = identityBlock();
    expect(block, '★★ 桌面端没有身份分支（用户看不到任何身份入口）').toMatch(ELECTRON_BRANCH);
    expect(block, '★★ 桌面端分支里没有头像').toMatch(/title-avatar/);
  });

  it('★★ 桌面端头像不得暴露 guest 内部身份', () => {
    const block = identityBlock();
    // 桌面端分支用"本机"表述，而不是把 user.username（=guest）摆出来
    expect(block, '★★ 桌面端头像显示了 guest（内部数据归属身份，摆出来像"被登录成陌生账号"）')
      .not.toMatch(/is-local[\s\S]{0,200}?authStore\.user\?\.username/);
    expect(TOPBAR_CODE, '★ 缺"本机"表述').toMatch(/localIdentityTitle/);
    expect(TOPBAR_CODE, '★ localIdentityTitle 的取值不应是 guest').toMatch(/localIdentityTitle = computed\(\(\) => '本机'\)/);
  });

  it('★★ 桌面端头像不得是登录入口（点了不能跳 /login）', () => {
    const block = identityBlock();
    const start = block.search(ELECTRON_BRANCH);
    const localBranch = block.slice(start);
    expect(localBranch.slice(0, 400), '★★ 桌面端头像仍跳 /login（就是"点了被弹回"的死按钮）')
      .not.toMatch(/'\/login'/);
    // 路由侧仍然声明桌面端无登录概念 —— UI 必须与它一致
    expect(ROUTER, '★ 路由未声明"桌面端无登录概念"（前提变了，需重新评估）')
      .toMatch(/isElectron && to\.path === '\/login'/);
  });

  it('★ Web/移动端保留登录入口（未来接用户体系要用）', () => {
    const block = identityBlock();
    expect(block, '★ 登录按钮被整体删除（Web 端没有登录入口了）').toMatch(/title-login-btn/);
    // 含 !isElectron 或落在桌面端分支之后（v-else-if="!modeLocked"）——关键是桌面端拿不到它
    expect(block, '★ 登录按钮无条件渲染（桌面端又会出现死按钮）')
      .toMatch(/v-else(?:-if)?="[^"]*"[^>]*class="title-login-btn"/);
    // 更强的判据：桌面端分支（isElectron）必须出现在登录按钮之前，否则桌面端会先命中登录
    const electronIdx = block.search(ELECTRON_BRANCH);
    const loginIdx = block.indexOf('title-login-btn');
    expect(electronIdx, '★★ isElectron 分支必须在登录按钮之前（顺序反了桌面端会落到登录按钮）')
      .toBeLessThan(loginIdx);
  });

  it('★★ guest 不算登录态（三条分支的前提，不能回归）', () => {
    expect(AUTH, '★★ isLoggedIn 退化成 !!user（guest 会被当成已登录）')
      .toMatch(/isLoggedIn = computed\(\(\) => !!user\.value && !isGuestIdentity\(user\.value\)\)/);
    // 桌面端没有 SideNav，所以 WebTopBar 是唯一身份入口 —— 这条是"必须给头像"的理由
    expect(APP, '★ SideNav 渲染条件变了（若桌面端也会渲染 SideNav，本测试前提需复核）')
      .toMatch(/<SideNav v-if="isMobile" \/>/);
  });

  it('★ 桌面端头像下拉给常用入口，但不提供"退出登录"', () => {
    const block = identityBlock();
    // 从桌面端分支起，截到该 el-dropdown 结束（不能用固定字数 —— 菜单项增删会误判）
    const start = block.search(ELECTRON_BRANCH);
    expect(start, '★ 找不到桌面端身份分支').toBeGreaterThan(-1);
    const rest = block.slice(start);
    const menuEnd = rest.indexOf('</el-dropdown>');
    const menu = menuEnd > 0 ? rest.slice(0, menuEnd) : rest;
    expect(menu, '★ 桌面端头像下拉缺设置入口').toMatch(/command="\/settings"/);
    expect(menu, '★ 桌面端头像下拉缺记忆管理入口').toMatch(/command="\/memory"/);
    expect(menu, '★★ 桌面端头像下拉出现"退出登录"（没有登录态可退，点了会造成困扰）')
      .not.toMatch(/退出登录/);
  });
});