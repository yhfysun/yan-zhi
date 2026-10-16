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
import { createApp, h, nextTick, type App } from 'vue';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';
import ConsoleShell from '../../components/console/ConsoleShell.vue';

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
});
