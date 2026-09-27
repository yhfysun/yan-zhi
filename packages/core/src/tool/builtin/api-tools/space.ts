import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerSpaceTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('space', [
    {
      name: 'api_space_list',
      description: '列出当前用户的所有空间（工作空间）。空间用于把会话按项目/主题归类，可绑定一个工作目录 dirPath',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'api_space_create',
      description: '创建空间：name 为必填；dirPath 可绑定一个本地工作目录，之后该空间下的文件操作默认在此目录',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '空间名称' },
          dirPath: { type: 'string', description: '可选，关联的本地目录绝对路径' },
          description: { type: 'string', description: '可选，空间描述' },
          sortOrder: { type: 'number', description: '可选，排序序号，默认 0（小的在前）' },
        },
        required: ['name'],
      },
    },
    {
      name: 'api_space_update',
      description: '更新空间的名称、工作目录、描述或排序',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          dirPath: { type: 'string' },
          description: { type: 'string' },
          sortOrder: { type: 'number' },
        },
        required: ['id'],
      },
    },
    {
      name: 'api_space_delete',
      description: '删除空间。其下会话不会被删除，只是 space_id 置空、归到"未归类"；工作目录里的实际文件不受影响',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'api_space_set_task_type',
      description:
        '给空间（目录）设置或更改「任务模式」。用户说"这个目录以后都按小说改写/配音/翻译来"时调用它。' +
        '可选值：novel_rewrite 小说改写 / translate 翻译 / script_copy 脚本文案 / audiobook 有声小说 / dubbing 配音 / ' +
        'comic 漫画绘本 / ppt_deck PPT 生成 / short_drama 短剧 / longform 长文写作。' +
        '传 null 或空串 = 改回「通用」（不再按任务流程推进，但**已建的资源目录与文件都会保留**）。' +
        '调用后会建出资源目录骨架（00-source 原始素材 / 01-reference 参考资料 / 02-work 过程产物 / 03-output 最终交付）' +
        '并写入目录的任务元信息 —— 之后该目录下的任务都按这个模式的规则分步推进（含确认点）。' +
        'spaceId 可省略，默认取**当前会话所属空间**。',
      inputSchema: {
        type: 'object',
        properties: {
          spaceId: { type: 'string', description: '空间 id；省略则用当前会话所属空间' },
          taskType: {
            type: 'string',
            description: '任务类型 id；传 null 或空串表示改回通用',
            enum: ['novel_rewrite', 'translate', 'script_copy', 'audiobook', 'dubbing', 'comic', 'ppt_deck', 'short_drama', 'longform'],
          },
        },
        required: ['taskType'],
      },
    },
  ]);
}
