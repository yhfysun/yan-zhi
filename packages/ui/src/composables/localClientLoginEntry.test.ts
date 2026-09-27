/**
 * 本机单机端（桌面 Electron + 移动 Capacitor）身份区 —— 守门测试。
 *
 * ★★★ 背景（2026-09-27 用户：「移动端不应该也是默认登录？」）：
 *
 *   这是**同一根因的第三个表现**，前两次各修了一半，所以这次把判据钉死：
 *     · 2026-09-23 —— 「不应该默认登录 guest 账号」→ guest 不算登录态；
 *     · 2026-09-27 —— 「桌面端不该引导登录」→ 桌面端改中性「本机」头像；
 *     · 2026-09-27 —— 「移动端不该引导登录」→ 移动端漏了，本轮补上。
 *
 *   根因：`auth.ts` 的 `loadUser()` 此前只对 `isElectron` 取 guest token
 *   → 移动端 `user` 恒为 null → 所有「未登录 → 登录入口」的 `v-else` 分支
 *   在**移动端稳定渲染** → 用户看到的就是「移动端要我登录」。
 *
 *   而移动端与桌面端一样跑**内嵌后端**（`@capawesome/capacitor-nodejs` 起的
 *   127.0.0.1:3001），后端 `authMiddleware` 恒定把身份置为 guest（全库 seed 数据
 *   `user_id` 都是 guest）—— 身份是**本机自带的**，不是用户登进来的。
 *   → 两端该同判，判据是「身份是否本机自带」= `isLocalClient`，不是 `isElectron`。
 *
 * 判据（三层，缺一层就会出现"某个端在引导登录"）：
 *   ① 本机单机端的判定必须覆盖**两端**（只写 isElectron = 移动端漏网）；
 *   ② `loadUser` 必须按它取 guest token（不算登录态，但要有本机身份）；
 *   ③ 三处身份区（App.vue 移动顶栏 / ChatTopbar / SideNav）的「登录入口」分支
 *      都必须排除本机单机端。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const UI_SRC = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(UI_SRC, p), 'utf8');
/** 去注释，避免被说明性注释绊倒（本项目踩过：注释里的示例会让断言假绿/假红）。 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const CLIENT = strip(read('api/client.ts'));
const AUTH = strip(read('stores/auth.ts'));
const APP = strip(read('App.vue'));
const TOPBAR = strip(read('components/chat/ChatTopbar.vue'));
const SIDENAV = strip(read('components/SideNav.vue'));

describe('本机单机端判定：必须覆盖桌面 + 移动两端', () => {
  it('★★ isLocalClient = 桌面 ∪ 移动（只写 isElectron 就是移动端漏网）', () => {
    expect(CLIENT, '★★ 缺 isLocalClient 判定').toMatch(/export const isLocalClient\s*=/);
    const line = CLIENT.match(/export const isLocalClient\s*=\s*([^;]+);/)?.[1] || '';
    expect(line, '★★ isLocalClient 未包含桌面端').toMatch(/isElectron/);
    expect(line, '★★ isLocalClient 未包含移动端（Capacitor 漏网 → 移动端渲染登录入口）')
      .toMatch(/isCapacitor/);
  });

  it('★★ loadUser 必须按 isLocalClient 取 guest token（而不是只认 isElectron）', () => {
    const fn = AUTH.slice(AUTH.indexOf('async function loadUser'));
    const body = fn.slice(0, fn.indexOf('async function login'));
    expect(body, '★★ loadUser 仍只对桌面端取 guest（移动端 user 恒 null → 渲染登录入口）')
      .toMatch(/if \(isLocalClient\)/);
    expect(body, '★ 未再直接以 isElectron 判定身份来源').not.toMatch(/if \(isElectron\)/);
    expect(body, '★ 取 guest 的分支不见了').toMatch(/\/auth\/guest/);
  });
});

describe('三处身份区：本机单机端不得渲染「登录入口」', () => {
  it('★★ App.vue 移动顶栏：登录按钮必须排除本机单机端', () => {
    expect(APP, '★★ App.vue 缺本机身份分支（移动端看不到任何身份入口）')
      .toMatch(/v-else-if="isLocalClient"/);
    expect(APP, '★ 本机分支里没有中性头像').toMatch(/mobile-user-avatar is-local/);
    // 「登录」按钮必须是最后兜底的 v-else（只有 Web 端能落到）
    expect(APP, '★★ 登录按钮不再是兜底 v-else（本机单机端会落到它）')
      .toMatch(/<button v-else class="mobile-user-avatar"[^>]*@click="\$router\.push\('\/login'\)"/);
    // 本机分支不得是"登录入口"语义
    const localBranch = APP.slice(
      APP.indexOf('v-else-if="isLocalClient"'),
      APP.indexOf('<button v-else class="mobile-user-avatar"'),
    );
    expect(localBranch, '★★ 本机身份分支仍指向 /login（死入口）').not.toMatch(/\/login/);
    expect(localBranch, '★ 本机身份分支显示了 guest（内部数据归属身份，不该暴露）')
      .not.toMatch(/authStore\.user/);
  });

  it('★★ ChatTopbar：移动端登录链接必须排除本机单机端', () => {
    expect(TOPBAR, '★★ ChatTopbar 缺本机身份分支').toMatch(/isMobile && isLocalClient/);
    // 登录 router-link 只能落在 Web 的 v-else-if
    const loginIdx = TOPBAR.indexOf('to="/login"');
    const localIdx = TOPBAR.indexOf('isMobile && isLocalClient');
    expect(localIdx, '★ 本机分支必须排在登录链接之前（否则前者不生效）')
      .toBeGreaterThan(-1);
    expect(localIdx, '★★ 顺序反了：登录分支会先命中').toBeLessThan(loginIdx);
  });

  it('★★ SideNav：两处登录入口（竖排侧栏 + Web dock）都要排除本机单机端', () => {
    const loginEntries = SIDENAV.match(/push\('\/login'\)/g) || [];
    const localBranches = SIDENAV.match(/v-else-if="isLocalClient"/g) || [];
    expect(loginEntries.length, '★ 登录入口数量变了，复核是否有新增未覆盖的入口')
      .toBeGreaterThanOrEqual(2);
    expect(localBranches.length, `★★ 本机分支有 ${localBranches.length} 处，应 ≥ 登录入口数 ${loginEntries.length}`)
      .toBeGreaterThanOrEqual(loginEntries.length);
    // 旧写法（isElectron ? undefined : push) 必须已消失 —— 它在移动端渲染成死入口
    expect(SIDENAV, '★★ 仍有 isElectron ? undefined : push(\'/login\')（移动端会渲染登录入口）')
      .not.toMatch(/isElectron \? undefined/);
  });
});