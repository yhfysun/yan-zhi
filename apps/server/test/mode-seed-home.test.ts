// 「模式种子归位」守门（mode-pluginization P4）。
//
// 种子的**定义**必须住在插件目录，基座只做组合 —— 这不是风格问题：
//   · P5 打包按插件裁剪时，物理边界决定"未选模式的种子"能不能被裁掉；
//   · 定义散回基座后，P5 只能靠字符串匹配去删，极易漏（提示词/工具面一起漂）。
//
// 同时钉住**组合顺序**：scene 用数组下标落库（顺序 = 模式选择器次序），agent 用展开位置
// 决定智能体列表次序 —— 归位不能顺手改顺序。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { builtinSceneDefs } from '../src/builtin-scene-defs';
import { builtinTaskModeAgentDefs } from '../src/builtin-task-mode-agents';
import { devModeScene } from '../src/plugins/dev-mode/seed';
import { wfModeScene, wfModeAgentDefs } from '../src/plugins/wf-mode/seed';
import { clipModeAgentDefs, CLIP_AGENT_ID } from '../src/plugins/clip-mode/seed';
import { opsModeScene, opsModeAgentDefs } from '../src/plugins/ops-shell/seed';
import { secModeScene, secModeAgentDefs } from '../src/plugins/sec-lab/seed';
import { shopModeScene, builtinShopAgentDefs } from '../src/plugins/shop-ops/seed';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('种子定义住在插件目录', () => {
  it('dev 场景（code）定义在 plugins/dev-mode/seed.ts', () => {
    expect(devModeScene.key).toBe('code');
    expect(devModeScene.isMode).toBe(true);
    expect(devModeScene.agentId).toBe('a_builtin_code_agent');
  });

  it('wf 场景 + 工作流助手定义在 plugins/wf-mode/seed.ts', () => {
    expect(wfModeScene.key).toBe('wf');
    expect(wfModeScene.isMode).toBe(true);
    expect(wfModeAgentDefs.map((a) => a.id)).toEqual(['a_builtin_workflow_assistant']);
  });

  it('剪辑师定义在 plugins/clip-mode/seed.ts', () => {
    expect(clipModeAgentDefs.map((a) => a.id)).toEqual([CLIP_AGENT_ID]);
    expect(clipModeAgentDefs[0].system_prompt).toContain('剪辑师');
    // 工具面必须真挂上剪辑主战场（否则智能体"能选但剪不了"）
    expect(String(clipModeAgentDefs[0].builtin_tool_ids)).toContain('clip_project');
  });

  it('ops 场景 + 运维助手定义在 plugins/ops-shell/seed.ts', () => {
    expect(opsModeScene.key).toBe('ops');
    expect(opsModeAgentDefs.map((a) => a.id)).toEqual(['a_builtin_ops_agent']);
    // 工具面必须指向插件工具（disabled 时应从 ToolRegistry 注销）
    expect(String(opsModeAgentDefs[0].builtin_tool_ids)).toContain('plugin_ops-shell__ssh_exec');
  });

  it('sec 场景 + 安全主助手与三个子体定义在 plugins/sec-lab/seed.ts', () => {
    expect(secModeScene.key).toBe('sec');
    expect(secModeAgentDefs.map((a) => a.id)).toEqual([
      'a_builtin_sec_agent',
      'a_builtin_sec_recon_agent',
      'a_builtin_sec_web_agent',
      'a_builtin_sec_report_agent',
    ]);
    const main = secModeAgentDefs[0];
    // 主助手必须声明三个子体，否则 list_sub_agents 为空、call_agent 白名单挡掉合法委派
    const subs = String(main.sub_agent_ids);
    for (const id of ['recon', 'web', 'report']) expect(subs).toContain(`a_builtin_sec_${id}_agent`);
  });

  it('shop 场景 + 店铺运营助手定义在 plugins/shop-ops/seed.ts（原 builtin-shop-agents.ts 已删除）', () => {
    expect(shopModeScene.key).toBe('shop');
    expect(builtinShopAgentDefs.map((a) => a.id)).toEqual(['a_builtin_shop_agent']);
  });
});

describe('基座只做组合，顺序不变', () => {
  it('场景落库顺序仍与前端 scenes.ts 一致（shop→code→ops→sec→wf 由 sortOrder 固定）', () => {
    const modeScenes = [shopModeScene, devModeScene, opsModeScene, secModeScene, wfModeScene]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    expect(modeScenes.map((s) => s.key)).toEqual(['shop', 'code', 'ops', 'sec', 'wf']);
    expect(modeScenes.map((s) => s.sortOrder)).toEqual([13, 14, 15, 16, 17]);
    // 基座只留办公岗位卡；模式场景不再静态携带（插件 activate 时补种）
    expect(builtinSceneDefs.map((s) => s.key)).not.toContain('code');
  });

  it('剪辑师不再进基座智能体种子（只由 clip-mode 补种）', () => {
    const ids = builtinTaskModeAgentDefs.map((a) => a.id);
    expect(ids).not.toContain(CLIP_AGENT_ID);
    expect(clipModeAgentDefs.map((a) => a.id)).toEqual([CLIP_AGENT_ID]);
  });

  it('基座源码里不再内联这些定义（防止"搬出去又抄回来"）', () => {
    const agents = read('src/builtin-task-mode-agents.ts');
    expect(agents, '剪辑师定义又出现在基座文件里').not.toMatch(/id: '?a_builtin_clip_agent'?/);
    expect(agents, '剪辑师提示词又抄回基座').not.toContain('## 剪辑 SOP');

    const scenes = read('src/builtin-scene-defs.ts');
    for (const key of ['shop', 'code', 'ops', 'sec', 'wf']) {
      expect(scenes, `${key} 场景又内联回基座`).not.toMatch(new RegExp(`key: '${key}'`));
    }

    const db = read('src/db.ts');
    expect(db, '工作流助手定义又内联回 db.ts').not.toContain('WORKFLOW_ASSISTANT_SYSTEM_PROMPT');
    expect(db, '工作流助手工具列表又内联回 db.ts').not.toContain('WORKFLOW_ASSISTANT_BUILTIN_TOOLS');
    for (const name of ['OPS_AGENT_', 'SEC_AGENT_']) {
      expect(db, `${name}* 常量又内联回 db.ts`).not.toContain(name);
    }
    expect(db, '店铺运营助手又内联回 db.ts').not.toMatch(/builtin-shop-agents/);
    // 运行时补种：基座只提供写入器，插件 activate 时调用
    expect(db).toContain('export function applyBuiltinSeed');
    expect(scenes, '基座场景表又 import 了插件种子（应为运行时补种）').not.toMatch(/^import .*plugins\//m);
  });
});
