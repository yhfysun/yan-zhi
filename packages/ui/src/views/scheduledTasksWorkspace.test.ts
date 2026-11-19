import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), 'utf8');
}

describe('scheduled task workspace navigation', () => {
  const router = read('../router/index.ts');
  const app = read('../App.vue');
  const sidebar = read('../components/chat/ChatSidebar.vue');
  const officeSidebar = read('../components/office/OfficeAiSidebar.vue');
  const page = read('./ScheduledTasks.vue');

  it('opens scheduled tasks in a dedicated center workspace', () => {
    expect(router).toContain("path: '/scheduled-tasks'");
    expect(router).toContain("component: () => import('../views/ScheduledTasks.vue')");
    expect(sidebar).toContain("void router.push('/scheduled-tasks')");
    expect(officeSidebar).toContain("router.push('/scheduled-tasks')");
    expect(app).toContain("'/scheduled-tasks', '/publish-queue'");
    expect(page).toContain('<ScheduledTaskDialog v-else ref="scheduledPanelRef" />');
    expect(page).toContain('<GoalSchedulePanel v-if="activeKind === \'goal\'" />');
  });

  it('does not render the scheduled task editor inside the task sidebar', () => {
    expect(sidebar).not.toContain("from './ScheduledTaskDialog.vue'");
    expect(sidebar).not.toContain("from './GoalSchedulePanel.vue'");
    expect(sidebar).not.toContain("v-else-if=\"sideTab === 'task'\"");
  });

  it('keeps scheduled and publish pages inside the office shell', () => {
    expect(router).toContain("path: '/publish-queue'");
    expect(officeSidebar).toContain("router.push('/publish-queue')");
    expect(sidebar).toContain("void router.push('/publish-queue')");
    expect(sidebar).not.toContain("from './PublishQueueTab.vue'");
  });

  it('keeps one desktop sidebar toggle in the title bar', () => {
    expect(sidebar).toContain('class="sidebar-collapse-btn"');
    expect(sidebar).toContain('@click="collapseTaskSidebar"');
    expect(sidebar).toMatch(/function collapseTaskSidebar\(\): void \{[\s\S]{0,220}convCollapsed\.value = true/);
    expect(read('../components/WebTopBar.vue')).toContain('class="title-nav-item title-nav-item--icon office-sidebar-toggle"');
    expect(read('../components/office/OfficeAiSidebar.vue')).not.toContain('class="oai-collapse"');
    expect(read('../components/chat/ChatTopbar.vue')).not.toContain('class="chat-sidebar-toggle"');
    expect(read('../components/SideNav.vue')).toContain('class="nav-collapse-top"');
  });
});

describe('learning immersive overlay contract', () => {
  const learning = read('./LearningV2.vue');
  const styles = read('./learning-v2.css');

  it('teleports immersive lesson and studio layers to the document root', () => {
    expect(learning.match(/<Teleport to="body">/g)?.length || 0).toBeGreaterThanOrEqual(2);
    expect(styles).toMatch(/\.lv2-lesson\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/s);
    expect(styles).toMatch(/\.lv2-specialized-study\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/s);
    expect(styles).toMatch(/\.lv2-studio-immersive\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/s);
  });
});
