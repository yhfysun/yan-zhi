// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, ref, type App } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import OfficeWorkbench from './OfficeWorkbench.vue';

const selectedPath = ref('');
const rootDir = ref('/workspace');
const mobile = ref(true);

vi.mock('../../composables/useMobileShell', () => ({
  useMobileShell: () => mobile,
}));

vi.mock('../../composables/office/useWorkspaceFiles', () => ({
  useWorkspaceFiles: () => ({
    selectedPath,
    rootDir,
    refresh: vi.fn(),
    loadRoot: vi.fn(async () => {}),
    revealPath: vi.fn(async () => {}),
  }),
}));

vi.mock('../../composables/useResizable', () => ({
  useResizable: () => ({
    width: ref(264),
    startDrag: vi.fn(),
  }),
}));

vi.mock('../../composables/chat/useChat', () => ({
  useChat: () => ({ showWorkspaceDir: ref(false) }),
}));

vi.mock('../../stores/officeWorkbench', () => ({
  officePanel: ref('manual'),
  officeSelectedFile: ref(''),
  setOfficePanel: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('../../components/MobileModeSwitch.vue', () => ({
  default: { template: '<button>办公</button>' },
}));

vi.mock('../../components/office/WorkspaceFileTree.vue', () => ({
  default: {
    emits: ['select'],
    methods: {
      doCreate() {},
    },
    template: '<button class="stub-file" @click="$emit(\'select\', \'/workspace/demo.md\')">demo.md</button>',
  },
}));

vi.mock('../../components/office/OfficeDocumentView.vue', () => ({
  default: { template: '<div />' },
}));

vi.mock('../../components/FilePreview.vue', () => ({
  default: { template: '<div />' },
}));

vi.mock('../../components/workbench/LeadToggle.vue', () => ({
  default: { template: '<button />' },
}));

vi.mock('../../components/chat/ChatDialogs.vue', () => ({
  default: { template: '<div />' },
}));

vi.mock('../../components/chat/ChatSkillCards.vue', () => ({
  default: { template: '<div />' },
}));

let app: App | null = null;

afterEach(() => {
  app?.unmount();
  app = null;
  document.body.innerHTML = '';
  selectedPath.value = '';
  mobile.value = true;
});

describe('OfficeWorkbench mobile shell', () => {
  it('uses an opaque drawer surface so file names cannot overlap the editor', () => {
    const source = readFileSync(resolve(__dirname, 'OfficeWorkbench.vue'), 'utf8');

    expect(source).toMatch(/\.office-wb\.is-mobile-shell \.wb-tree-shell \{[\s\S]*background: var\(--color-bg, #f8fafc\);/);
    expect(source).toMatch(/\.office-wb\.is-mobile-shell \.office-mobile-bar \{[\s\S]*background: color-mix\(in srgb, var\(--color-bg, #f8fafc\) 94%, #fff\);/);
    expect(source).toMatch(/\.office-wb\.is-mobile-shell \.wb-mobile-actions \{[\s\S]*background: color-mix\(in srgb, var\(--color-bg, #f8fafc\) 94%, #fff\);/);
  });

  it('opens the file drawer and closes it as soon as a file is selected', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp(OfficeWorkbench);
    app.mount(host);
    await nextTick();

    expect(host.querySelector('.office-mobile-bar')).toBeTruthy();
    expect(host.querySelector('.wb-tree-shell')?.classList.contains('open')).toBe(false);

    (host.querySelector('[data-action="open-file-drawer"]') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.wb-tree-shell')?.classList.contains('open')).toBe(true);

    (host.querySelector('.stub-file') as HTMLButtonElement).click();
    await nextTick();
    expect(host.querySelector('.wb-tree-shell')?.classList.contains('open')).toBe(false);
  });
});
