// @vitest-environment jsdom
/**
 * lite 档只有 office 一个可见模式时，顶栏仍必须保留“办公”定位按钮。
 * 回归：hasChoice=false 曾把整个 el-popover 隐藏，导致用户离开 /chat 后无路可回。
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createApp, ref, computed, nextTick, type App } from 'vue';
import ElementPlus from 'element-plus';
import * as Icons from '@element-plus/icons-vue';

const push = vi.fn();

vi.mock('../../stores/mode', () => {
  const office = {
    key: 'office', label: '办公模式', icon: 'ChatDotRound', desc: '办公', route: '/chat',
  };
  return {
    activeMode: ref('office'),
    allModeDefs: computed(() => [office]),
    visibleModeDefs: computed(() => [office]),
    setMode: vi.fn(),
    modeRoute: () => '/chat',
  };
});

vi.mock('../../stores/plugin', () => ({
  usePluginStore: () => ({ loaded: true, plugins: [], refresh: vi.fn(async () => {}) }),
}));

vi.mock('../../utils/modeWindow', () => ({ isModeWindow: () => false }));
vi.mock('../../api/client', () => ({ isCapacitor: false }));
vi.mock('../../composables/useTitleBarOverlay', () => ({ titleBarOverlayOpen: ref(false) }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/settings' }),
  useRouter: () => ({ push }),
}));

let ModeSwitcher: any;
let app: App | null = null;

beforeAll(async () => {
  ModeSwitcher = (await import('./ModeSwitcher.vue')).default;
});

describe('ModeSwitcher · lite 单模式', () => {
  it('只有 office 时仍显示“办公”按钮，点击回到 /chat', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp(ModeSwitcher);
    for (const [k, c] of Object.entries(Icons)) app.component(k, c as any);
    app.use(ElementPlus);
    app.mount(host);
    await nextTick();

    const button = host.querySelector('.mode-switcher') as HTMLButtonElement | null;
    expect(button, '单模式也必须保留办公定位按钮').toBeTruthy();
    expect(button?.textContent?.trim()).toBe('办公');

    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(push).toHaveBeenCalledWith('/chat');

    app.unmount();
    app = null;
    host.remove();
  });
});
