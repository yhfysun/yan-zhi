// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import LearningSelect from './LearningSelect.vue';

const mounted: App[] = [];

async function mountSelect(props: Record<string, unknown>): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp(LearningSelect, props);
  mounted.push(app);
  app.mount(host);
  await nextTick();
  return host;
}

afterEach(() => {
  for (const app of mounted.splice(0)) app.unmount();
  document.body.innerHTML = '';
});

describe('LearningSelect · App 内分组下拉', () => {
  it('★ 点击触发器打开 listbox，分组展示选项，选择后回传值并关闭', async () => {
    const onChange = vi.fn();
    const selected = ref('a');
    const groups = [
      { label: '阶段一', options: [{ value: 'a', label: '课程 A' }, { value: 'b', label: '课程 B' }] },
      { label: '阶段二', options: [{ value: 'c', label: '课程 C' }] },
    ];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(defineComponent({
      setup: () => () => h(LearningSelect, {
        value: selected.value,
        ariaLabel: '选择课程',
        groups,
        onChange: (value: string | number) => {
          selected.value = String(value);
          onChange(value);
        },
      }),
    }));
    mounted.push(app);
    app.mount(host);
    await nextTick();

    const trigger = host.querySelector('[role="combobox"]') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.click();
    await nextTick();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const listbox = host.querySelector('[role="listbox"]');
    expect(listbox?.textContent).toContain('阶段一');
    expect(listbox?.textContent).toContain('阶段二');

    (host.querySelector('[data-value="c"]') as HTMLButtonElement).click();
    await nextTick();
    expect(onChange).toHaveBeenCalledWith('c');
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    expect(trigger.textContent).toContain('课程 C');
  });

  it('★ 键盘可打开、越过禁用项并确认选择', async () => {
    const onChange = vi.fn();
    const host = await mountSelect({
      value: 'a',
      ariaLabel: '选择阶段',
      options: [
        { value: 'a', label: '阶段一' },
        { value: 'b', label: '阶段二', disabled: true },
        { value: 'c', label: '阶段三' },
      ],
      onChange,
    });

    const trigger = host.querySelector('[role="combobox"]') as HTMLButtonElement;
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await nextTick();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await nextTick();
    expect(onChange).toHaveBeenCalledWith('c');
  });
});
