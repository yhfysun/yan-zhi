import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  registerWorkspaceSidebar,
  toggleRegisteredWorkspaceSidebar,
  unregisterWorkspaceSidebar,
  updateWorkspaceSidebar,
  workspaceSidebarAvailable,
  workspaceSidebarCollapsed,
  workspaceSidebarLabel,
} from './workspaceSidebar';

const ROOT = resolve(__dirname, '..');

afterEach(() => {
  unregisterWorkspaceSidebar('test');
});

describe('workspace sidebar contract', () => {
  it('exposes one active desktop sidebar to the shared top bar', () => {
    let collapsed = false;
    registerWorkspaceSidebar({
      key: 'test',
      label: '开发侧栏',
      getCollapsed: () => collapsed,
      toggle: () => { collapsed = !collapsed; },
    });

    expect(workspaceSidebarAvailable.value).toBe(true);
    expect(workspaceSidebarLabel.value).toBe('开发侧栏');
    expect(workspaceSidebarCollapsed.value).toBe(false);

    toggleRegisteredWorkspaceSidebar();
    updateWorkspaceSidebar('test');
    expect(collapsed).toBe(true);
    expect(workspaceSidebarCollapsed.value).toBe(true);
  });

  it('keeps sidebar collapse controls out of individual workbench headers', () => {
    const code = readFileSync(resolve(ROOT, 'views/CodeWorkbench.vue'), 'utf8');
    const workflow = readFileSync(resolve(ROOT, 'views/WorkflowWorkbench.vue'), 'utf8');
    const consoleShell = readFileSync(resolve(ROOT, 'components/console/ConsoleShell.vue'), 'utf8');
    const learning = readFileSync(resolve(ROOT, 'views/LearningV2.vue'), 'utf8');
    const topBar = readFileSync(resolve(ROOT, 'components/WebTopBar.vue'), 'utf8');

    expect(code).not.toContain('class="cp-side-toggle"');
    expect(code).toContain("registerWorkspaceSidebar({\n  key: 'dev'");
    expect(workflow).not.toMatch(/class="wf-icon-btn"[^>]*@click="toggleSidebar"/);
    expect(workflow).toContain("key: 'workflow'");
    expect(consoleShell).toContain('v-if="isMobile"');
    expect(consoleShell).toContain('registerWorkspaceSidebar({');
    expect(learning).not.toContain('class="lv2-ai-brand-toggle"');
    expect(learning).not.toContain('class="lv2-subjects-toggle"');
    expect(learning).toContain("key: 'learning'");
    expect(topBar).toContain('class="title-nav-item title-nav-item--icon workspace-sidebar-toggle"');
    expect(topBar).toContain('workspaceSidebarAvailable.value');
  });
});
