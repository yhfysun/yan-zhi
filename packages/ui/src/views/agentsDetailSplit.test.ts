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
