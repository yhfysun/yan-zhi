import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const view = readFileSync(resolve(__dirname, 'AutomationWorkbench.vue'), 'utf8');
const modeCatalog = readFileSync(resolve(__dirname, '../../../../build/modes.catalog.json'), 'utf8');
const store = readFileSync(resolve(__dirname, '../stores/automation.ts'), 'utf8');
const localSchema = readFileSync(resolve(__dirname, '../../../../packages/core/src/db/schema.ts'), 'utf8');
const scheduledTaskTool = readFileSync(resolve(__dirname, '../../../../packages/core/src/tool/builtin/api-tools/scheduled-task.ts'), 'utf8');

describe('自动化模式 UI 契约', () => {
  it('使用脚本库 + 时间线 + 检查器的工作台结构', () => {
    expect(view).toContain('class="rpa-library"');
    expect(view).toContain('class="rpa-timeline-panel"');
    expect(view).toContain('class="rpa-inspector"');
    expect(view).toContain('rpa-script-row');
    expect(view).toContain('rpa-step-main');
    expect(view).toContain('rpa-run-card');
  });

  it('提供创建、试运行、发布、运行和 AI Builder 入口', () => {
    expect(view).toContain('新建脚本');
    expect(view).toContain('试运行');
    expect(view).toContain('发布');
    expect(view).toContain('AI 帮我创建');
    expect(view).toContain("agentId: 'a_builtin_rpa_builder'");
    expect(view).toContain('发布后，智能体可以运行这个正式版本');
    expect(view).toContain('v-if="isElectron"');
    expect(view).toContain('添加定时运行');
  });

  it('所有关键交互使用可访问按钮并提供移动端布局', () => {
    expect(view).toContain('aria-label="搜索自动化脚本"');
    expect(view).toContain('aria-label="添加步骤"');
    expect(view).toContain('role="tablist"');
    expect(view).toContain('rpa-mobile-picker');
    expect(view).toContain('@media (max-width: 860px)');
    expect(view).toContain("stepModel.type.startsWith('desktop.')");
  });

  it('模式目录登记 rpa 并通过插件贡献 /automation', () => {
    expect(modeCatalog).toContain('"rpa"');
    expect(modeCatalog).toContain('"route": "/automation"');
    expect(modeCatalog).toContain('"pluginId": "rpa-mode"');
  });

  it('前端 store 只通过脚本级 API 操作，不暴露任意代码运行入口', () => {
    expect(store).toContain("api.get<AutomationScriptRecord[]>('/automation/scripts')");
    expect(store).toContain('/automation/scripts/${encodeURIComponent(id)}/runs');
    expect(store).toContain("api.post(`/automation/runs/${encodeURIComponent(runId)}/cancel`)");
    expect(store).not.toContain('eval(');
    expect(store).not.toContain('new Function');
  });

  it('本地库与定时任务工具都声明 RPA 固定版本字段', () => {
    expect(localSchema).toContain('scheduled_task ADD COLUMN rpa_script_id');
    expect(localSchema).toContain('scheduled_task ADD COLUMN rpa_script_version');
    expect(localSchema).toContain('scheduled_task ADD COLUMN rpa_inputs_json');
    expect(scheduledTaskTool).toContain("enum: ['chat', 'runbook', 'rpa_script']");
    expect(scheduledTaskTool).toContain('rpaScriptId');
    expect(scheduledTaskTool).toContain('rpaInputs');
  });
});
