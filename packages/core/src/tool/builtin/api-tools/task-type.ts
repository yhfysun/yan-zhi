import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

/**
 * 任务类型配置工具（2026-10-14 配置表化）。
 *
 * ★★ 为什么要有这套工具（用户明确诉求）：
 *   "这样大模型自己就能创建类型和智能体和 skill 挂载啊……我就能在自己应用里让大模型创建啊，
 *    而且这样也不用改代码重新打包"。
 *   此前任务类型写死在代码里（shared 的 TASK_TYPES），要加一种流程只能改代码 + 发版 + 重新打包。
 *   搬进 task_type 表后，模型可以：
 *     ① api_task_type_create 建一个类型（流程步骤 + 绑智能体 + 挂 skill + 可选父类型）；
 *     ② 需要专属人格时先用 api_agent_create 建智能体、api_agent_update 挂 skill / 工具；
 *     ③ api_space_set_task_type 把这个类型绑到某个目录上。
 *   一条链路走完 = 用户说一句"给这个目录建个按 XX 流程走的模式"，应用里就多一种任务模式。
 */
export function registerTaskTypeTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('task-type', [
    {
      name: 'api_task_type_list',
      description:
        '列出全部任务类型（含内置与自建）。想知道"有哪些任务流程可选 / 某个类型绑了哪个智能体"时调用它。',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'api_task_type_create',
      description:
        '创建一个任务类型 = 一种可复用的任务流程（不需要改代码、不需要重新打包）。' +
        '完整链路：api_agent_create 建智能体 → api_agent_mount 给它挂工具/Skill/子智能体 → 本工具建类型并绑该智能体 → api_space_set_task_type 绑到目录。' +
        '用户说"给我加一个按XX流程走的模式/目录类型"时调用它。' +
        '★ 参数要点：key 只能用字母数字-_（如 weekly_report）；label 是中文名；' +
        'steps 是执行步骤数组（每项 { title, detail, confirmTool?: "confirm"|"ask", confirmAbout, output?: "01-reference"|"02-work"|"03-output"|"none", batchable?: boolean }，' +
        '标了 confirmTool 的步骤会真的弹向导让用户确认，不标就是模型一路跑到底）；' +
        'agentId 指定该类型自动切到哪个智能体；skillIds 挂该方法论技能；parentKey 挂到已有父类型下（多任务目录的一条线）。' +
        '建完用 api_space_set_task_type 绑到目录上才生效。',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '类型标识（英文，字母/数字/-/_），必填' },
          label: { type: 'string', description: '中文名，必填' },
          summary: { type: 'string', description: '一句话说明（下拉副标题）' },
          guide: { type: 'string', description: '首次选该类型时给用户的引导说明' },
          agentId: { type: 'string', description: '可选：专属智能体 id（与该类型绑定，选类型即切智能体）' },
          skillIds: { type: 'array', items: { type: 'string' }, description: '可选：该方法论技能的 id 列表' },
          parentKey: { type: 'string', description: '可选：父类型 key（挂在父类型下 = 一个目录里的其中一条线）' },
          steps: {
            type: 'array',
            description: '可选：执行步骤（不填 = 父类型/无流程约束）',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                detail: { type: 'string' },
                confirmTool: { type: 'string', enum: ['confirm', 'ask'] },
                confirmAbout: { type: 'string' },
                output: { type: 'string', enum: ['01-reference', '02-work', '03-output', 'none'] },
                batchable: { type: 'boolean' },
              },
              required: ['title'],
            },
          },
        },
        required: ['key', 'label'],
      },
    },
    {
      name: 'api_task_type_update',
      description: '修改**自建**任务类型（内置类型不可改）。可改 label/summary/guide/agentId/skillIds/steps/parentKey/sortOrder。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '类型行 id（形如 tt_<key>）' },
          label: { type: 'string' },
          summary: { type: 'string' },
          guide: { type: 'string' },
          agentId: { type: 'string' },
          skillIds: { type: 'array', items: { type: 'string' } },
          steps: { type: 'array', items: { type: 'object' } },
          parentKey: { type: 'string', description: '传空串表示上提为顶层（脱离父类型）' },
          sortOrder: { type: 'number' },
        },
        required: ['id'],
      },
    },
    {
      name: 'api_task_type_delete',
      description: '删除**自建**任务类型（内置类型不可删）。删父类型时其子类会上提为顶层，不会被一起删掉。',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: '类型行 id（形如 tt_<key>）' } },
        required: ['id'],
      },
    },
  ]);
}
