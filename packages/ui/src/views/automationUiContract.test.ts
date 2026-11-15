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

  it('★ AI Builder 留在自动化模式内：右栏内嵌对话，不整页 push /chat', () => {
    const at = view.indexOf('async function openBuilder()');
    const body = view.slice(at, view.indexOf('async function closeBuilder()', at));
    // /chat 是 office 路由，跳过去会让脚本工作台与「会话归属 mode=rpa」错位（用户实报）。
    expect(body, 'openBuilder 不得再跳办公模式聊天页').not.toContain('/chat/');
    expect(view).not.toContain('useRouter');
    // createConversation 只建行、不切当前会话：必须 selectConv 才会 loadHistory + 绑定 Builder 提示词。
    expect(body).toContain('chat.selectConv(convId)');
    expect(body).toContain('builderOpen.value = true');
    expect(body.indexOf('createConversation')).toBeLessThan(body.indexOf('builderOpen.value = true'));
    expect(body.indexOf('builderOpen.value = true')).toBeLessThan(body.indexOf('chat.selectConv(convId)'));
    expect(view).toContain('class="rpa-chat"');
    expect(view).toContain('<ChatMessageList');
    expect(view).toContain('<ChatInputArea');
    expect(view, '输入区的设置弹窗要有承载，否则点了没反应').toContain('<ChatDialogs');
  });

  it('★ 按钮 hover 守门：通用 hover 不得刷掉主按钮底色（白底白字回归）', () => {
    // .rpa-btn:hover:not(:disabled) 特异性 (0,3,0) 高于 .rpa-btn.primary (0,2,0)，
    // 不排除 .primary 就会把紫底刷成 #F0F2F7、白字只剩 1.12:1 对比度（用户截图实报）。
    expect(view).toContain('.rpa-btn:hover:not(:disabled):not(.primary):not(.publish)');
    expect(view).toContain('.rpa-btn.primary:hover:not(:disabled) {');
    expect(view).toContain('.rpa-btn.ghost { background: transparent; }');
    expect(view).not.toContain('filter: brightness(1.04)');
    // 生效层由 scripts/rpa-button-hover-smoke.cjs 真 Chromium 量 computed style 验证。
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
