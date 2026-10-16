// @vitest-environment node
// 自绘右键菜单（`.ctx-menu`）必须活在**全局引入**的样式表里 —— 这条守门测试来自一次真机事故。
//
// 事故（2026-10-16）：`.ctx-menu` 的基座样式（position/z-index/背景/边框）原本写在 `views/chat.css`，
//   而 chat.css 只由 `views/Chat.vue` 的 `<style src="./chat.css">` 引入 ⇒ **只有访问过聊天页，
//   全应用的右键菜单才有样式**。冷启动直接进运维（模式被记住，聊天页从没加载）时，
//   `.ctx-menu` 退化成 `position: static` 的无样式块，被 Teleport 追加到 body 末尾：
//   视口外 + `body { overflow: hidden }` ⇒ 菜单既看不见也点不到，用户报「右击菜单并没有出现」。
//   ★ 之所以要做成测试：这一条**挂载测试与截图都抓不到**（jsdom 不跑级联、也不管样式表从哪来），
//     只有「规则在不在全局表里」这个静态事实能被钉住。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const UI_SRC = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(UI_SRC, p), 'utf8');
const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('`.ctx-menu` 样式必须在全局样式表（浮层不随路由懒加载）', () => {
  const APP = read('App.vue');
  const MENU_CSS = stripCssComments(read('styles/menu.css'));
  const CHAT_CSS = stripCssComments(read('views/chat.css'));

  it('★ App.vue 顶层以 @import 引入 styles/menu.css（无 scoped，应用起步即生效）', () => {
    // App.vue 的样式块必须是全局的：scoped 会给选择器加 data-v-*，
    // 而 .ctx-menu 是 Teleport 到 body 的，带属性选择器就一条都匹配不上。
    expect(APP, '★ App.vue 的 <style> 被改成 scoped 了（Teleport 出来的菜单会全部失配）')
      .toMatch(/<style>\s*\n\s*@import/);
    expect(APP, '★ 缺全局引入 styles/menu.css').toMatch(/@import\s+'\.\/styles\/menu\.css'/);
  });

  it('★ 基座规则在 styles/menu.css：fixed 定位 + 高层级（否则会落到 body 末尾/被内容盖住）', () => {
    const m = MENU_CSS.match(/\.ctx-menu\s*\{[^}]*\}/);
    expect(m, '★ styles/menu.css 里找不到 `.ctx-menu { ... }` 基座规则').not.toBeNull();
    const base = m![0];
    expect(base, '★ 缺 position: fixed（缺了会变成文档流里的块，落在页面底部）').toMatch(/position:\s*fixed/);
    expect(base, '★ 缺 z-index（缺了会被 z-index:1 的 .main-content 盖住）').toMatch(/z-index:\s*\d{3,}/);
  });

  it('★ 子菜单规则同样在全局表里（隔层选择器，漏了会退化成裸 li）', () => {
    expect(MENU_CSS).toMatch(/\.ctx-menu \.ctx-submenu > li \{/);
    expect(MENU_CSS).toMatch(/\.ctx-menu \.ctx-submenu > li:hover/);
    expect(MENU_CSS).toMatch(/\.ctx-menu \.ctx-submenu > li > \.el-icon/);
  });

  it('★★ 懒加载视图样式里不许再定义 .ctx-menu（这是本次事故的复发口）', () => {
    // views/chat.css 只随聊天路由加载；任何共用浮层写进去 = 没访问过聊天页的窗口全瞎
    expect(CHAT_CSS, '★★ views/chat.css 又定义了 .ctx-menu —— 请放回 styles/menu.css（全局引入）')
      .not.toMatch(/\.ctx-menu\s*[>{]/);
  });
});
