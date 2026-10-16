// @vitest-environment jsdom
// 控制台通用外壳（components/console/ConsoleShell.vue）的迁移守门测试。
//
// 为什么要有它：2026-10-16 把运维与店铺两个控制台的外壳抽出来共用时，
// **布局回归 typecheck 与业务单测都抓不到**（只有目视能看出侧栏塌了/折叠条跑位）。
// 这里把「两个插槽都渲染、折叠能收起、宽度变量挂在对的节点上、右键转出来」钉住 ——
// 剩下真正靠眼睛的部分（间距、分隔条手感）仍需真机看一眼。
//
// ★ 挂载方式跟随仓库既有做法（createApp + ElementPlus），本包没有 @vue/test-utils。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp, h, nextTick, type App } from 'vue';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';
import ConsoleShell from '../../components/console/ConsoleShell.vue';

const SHELL_SRC = readFileSync(resolve(__dirname, '../../components/console/ConsoleShell.vue'), 'utf8');

interface Mounted { host: HTMLElement; app: App }

function mountShell(extra: Record<string, unknown> = {}): Mounted {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(ConsoleShell as never, { storageKey: 'test_aside_shell', defaultWidth: 260, ...extra }, {
      aside: () => h('div', { class: 'probe-aside' }, '左栏内容'),
      default: () => h('div', { class: 'probe-main' }, '主区内容'),
    }),
  });
  app.use(ElementPlus);
  for (const [name, comp] of Object.entries(Icons)) app.component(name, comp as never);
  app.mount(host);
  return { host, app };
}

const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

describe('ConsoleShell · 控制台通用外壳', () => {
  it('两个插槽分别渲染进左栏与主区', () => {
    const { host, app } = mountShell();
    expect(host.querySelector('.cs-aside .probe-aside')).not.toBeNull();
    expect(host.querySelector('.cs-main .probe-main')).not.toBeNull();
    app.unmount();
  });

  it('★ 折叠条收起左栏与分隔条，主区仍在', async () => {
    const { host, app } = mountShell();
    const aside = () => host.querySelector('.cs-aside') as HTMLElement;
    expect(aside().style.display).not.toBe('none');
    expect(host.querySelector('.rs-handle')).not.toBeNull();

    click(host.querySelector('.cs-aside-toggle')!);
    await nextTick();
    expect(aside().style.display).toBe('none');
    expect((host.querySelector('.probe-main') as HTMLElement).style.display).not.toBe('none');

    click(host.querySelector('.cs-aside-toggle')!);
    await nextTick();
    expect(aside().style.display).not.toBe('none');
    app.unmount();
  });

  it('★ 宽度变量挂在布局节点上，折叠时归零（折叠条定位靠它）', async () => {
    const { host, app } = mountShell();
    const style = () => (host.querySelector('.cs-layout') as HTMLElement).getAttribute('style') || '';
    expect(style()).toContain('--cs-aside-w: 260px');

    click(host.querySelector('.cs-aside-toggle')!);
    await nextTick();
    expect(style()).toContain('--cs-aside-w: 0px');
    app.unmount();
  });

  it('★ 左栏右键转成事件（运维用它做「空白处右键新建」）', async () => {
    let fired = 0;
    const { host, app } = mountShell({ onAsideContextmenu: () => { fired++; } });
    host.querySelector('.cs-aside')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await nextTick();
    expect(fired).toBe(1);
    app.unmount();
  });

  it('★ 宽度按 storageKey 隔离（同一个 key 会让两种模式互相覆盖宽度）', () => {
    // useResizable 的行为：初始化**读**持久化值（写发生在拖动时），故这里预置再断言读回
    localStorage.setItem('yz_resize_ops_aside', '300');
    const a = mountShell({ storageKey: 'ops_aside' });
    expect((a.host.querySelector('.cs-layout') as HTMLElement).getAttribute('style')).toContain('300px');
    a.app.unmount();

    // 换成店铺的 key：读不到运维那把宽度，回落默认值（说明两边不串）
    localStorage.setItem('yz_resize_shop_aside', '200');
    const b = mountShell({ storageKey: 'shop_aside', defaultWidth: 260 });
    expect((b.host.querySelector('.cs-layout') as HTMLElement).getAttribute('style')).toContain('200px');
    b.app.unmount();

    localStorage.removeItem('yz_resize_ops_aside');
    localStorage.removeItem('yz_resize_shop_aside');
  });

  it('★★ 分隔条样式必须来自**非 scoped** 块（父组件渲染的文件面板分隔条也要吃得到）', () => {
    // 真机事故（2026-10-16）：把 .rs-handle 收进 scoped 块后，运维文件面板那条分隔条由
    // **父组件 OpsConsole** 渲染（`.ops-body > .rs-handle-right`），scoped 的 data-v 属性
    // 跨不过去 ⇒ 实测 width:0 / cursor:auto：既看不见也拖不动（面板宽度调不了）。
    // 它此前靠只随聊天页加载的 chat.css 里一份同名全局规则顶着 —— 冷启动直接进运维时同样失效。
    const scopedBlock = SHELL_SRC.slice(SHELL_SRC.indexOf('<style scoped>'), SHELL_SRC.indexOf('</style>'));
    expect(scopedBlock, '★ .rs-handle 又跑回 scoped 块里了（父组件渲染的分隔条会整条失效）')
      .not.toMatch(/^\s*\.rs-handle\b/m);

    const globalBlock = SHELL_SRC.slice(SHELL_SRC.lastIndexOf('<style>'));
    expect(globalBlock, '★ 缺非 scoped 的 .rs-handle 基座规则').toMatch(/\.rs-handle\s*\{/);
    expect(globalBlock, '★ 缺 7px 命中宽度（会缩成 0，拖不动）').toMatch(/flex:\s*0 0 7px/);
    expect(globalBlock, '★ 缺 col-resize 光标（用户看不出这里能拖）').toMatch(/cursor:\s*col-resize/);
  });
});
