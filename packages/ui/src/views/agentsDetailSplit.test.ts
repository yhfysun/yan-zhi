// P1-2 Agents 列表 + 右侧详情守门测试（2026-11-02）
//   ① 表单主体已抽出，弹窗与右侧面板共用；
//   ② 宽屏进详情、窄屏仍走弹窗；
//   ③ 详情可拖拽引宽并记忆（useResizable）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../..');
const readRepo = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const AGENTS = strip(readRepo('packages/ui/src/views/Agents.vue'));
const DIALOG = strip(readRepo('packages/ui/src/components/AgentEditDialog.vue'));
const FORM = strip(readRepo('packages/ui/src/components/AgentEditForm.vue'));

describe('P1-2 智能体列表 + 右侧详情', () => {
  it('表单主体抽到 AgentEditForm，弹窗只做壳', () => {
    expect(FORM).toMatch(/defineExpose\(\{ save: handleSave, remove: handleDelete, reset: handleReset \}\)/);
    expect(FORM).not.toMatch(/modelValue/);
    expect(DIALOG).toMatch(/<AgentEditForm/);
    expect(DIALOG).toMatch(/formRef/);
  });

  it('宽屏进右侧详情，窄屏回落弹窗', () => {
    expect(AGENTS).toMatch(/useResizable\('agents_detail'/);
    expect(AGENTS).toMatch(/agent-detail-pane/);
    expect(AGENTS).toMatch(/detailOpen/);
    expect(AGENTS).toMatch(/function openAgent/);
    expect(AGENTS).toMatch(/if \(wide\.value\) \{ detailAgentId\.value = agent\.id; return; \}/);
    expect(AGENTS).toMatch(/editAgent\(agent\);/);
  });

  it('详情仍复用弹窗的同一套底部动作（保存 / 删除 / 恢复默认）', () => {
    expect(AGENTS).toMatch(/detailFormRef\?\.save\(\)/);
    expect(AGENTS).toMatch(/detailFormRef\?\.remove\(\)/);
    expect(AGENTS).toMatch(/detailFormRef\?\.reset\(\)/);
  });
});

describe('P1-2 工具参数详情右侧面板', () => {
  const TOOLS = strip(readRepo('packages/ui/src/views/ToolMarket.vue'));
  it('宽屏用右侧容器，窄屏保留弹窗', () => {
    expect(TOOLS).toMatch(/tool-detail-pane/);
    expect(TOOLS).toMatch(/useResizable\('tools_detail'/);
    expect(TOOLS).toMatch(/v-if="!wide"/);
    expect(TOOLS).toMatch(/detailOpen/);
  });
});

describe('P1-2 授权页分组 + 详情', () => {
  const LIC = strip(readRepo('packages/ui/src/views/LicenseManage.vue'));

  it('左侧分组可拖拽，右侧详情自滚', () => {
    expect(LIC).toMatch(/<PageFrame/);
    expect(LIC).toMatch(/useResizable\('license_nav'/);
    expect(LIC).toMatch(/lic-nav-item/);
    expect(LIC).toMatch(/activeSection/);
    expect(LIC).toMatch(/lic-detail/);
  });
});

describe('P1-2 插件列表 + 右侧详情', () => {
  const PM = strip(readRepo('packages/ui/src/components/plugin/PluginManager.vue'));
  const PAGE = strip(readRepo('packages/ui/src/views/PluginsPage.vue'));

  it('宽屏用右侧容器，窄屏保留弹窗', () => {
    expect(PM).toMatch(/useResizable\('plugins_detail'/);
    expect(PM).toMatch(/pm-detail-pane/);
    expect(PM).toMatch(/detailPaneOpen/);
    expect(PM).toMatch(/v-if="!wide"/);
  });

  it('详情是结构化信息，原始 JSON 折叠', () => {
    expect(PM).toMatch(/contributionRows/);
    expect(PM).toMatch(/detailManifest/);
    expect(PM).toMatch(/pm-detail-raw/);
  });

  it('插件页接入 PageFrame 并自行管理滚动', () => {
    expect(PAGE).toMatch(/<PageFrame/);
    expect(PAGE).toMatch(/:scroll="false"/);
    expect(PM).toMatch(/\.pm-main/);
  });
});

describe('P1-2 Skill 本地商城右侧编辑', () => {  const SKILLS = strip(readRepo('packages/ui/src/views/skill-market/LocalSkillMarket.vue'));
  const SKILLS_HOST = strip(readRepo('packages/ui/src/views/Skills.vue'));

  it('宽屏在右侧容器编辑，窄屏保留弹窗', () => {
    expect(SKILLS).toMatch(/useResizable\('skills_detail'/);
    expect(SKILLS).toMatch(/skill-detail-pane/);
    expect(SKILLS).toMatch(/detailOpen/);
    expect(SKILLS).toMatch(/if \(wide\.value\) \{ detailSkillId\.value = s\.id; showEditor\.value = false; \}/);
  });

  it('本地商城由外层容器限高，否则面板无法撑满视口', () => {
    expect(SKILLS_HOST).toMatch(/class="skills-host"/);
    expect(SKILLS_HOST).toMatch(/\.skills-host\.is-local > \*/);
  });
});
