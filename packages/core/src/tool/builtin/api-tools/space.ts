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
        '可选值：parent 父任务（独立的父任务目录：下面挂子目录，各子目录各自设工作类型）/ ' +
        'novel_rewrite 小说改写 / novel_tuiwen 小说推文 / translate 翻译 / script_copy 脚本文案 / audiobook 有声小说 / dubbing 配音 / ' +
        'comic 漫画绘本 / ppt_deck PPT 生成 / short_drama 短剧 / longform 长文写作 / ' +
        'douyin_ops 抖音运营（父任务：一个目录管多条线，每条任务再选 douyin_traffic 抖音引流 或 douyin_sell 抖音图文带货）。' +
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
            // ★ 刻意**不写 enum**（2026-10-14 配置表化）：任务类型已搬进 task_type 表，
            //   用户/模型自建的类型也要能传进来 —— 写死 enum 会让"刚建的类型设不上"。
            //   合法性由服务端按「库行 ∪ 内置」校验，非法值会回可选清单。
            description:
              '任务类型 id（key）。内置：parent 父任务（独立的父任务目录，下面挂子目录）/ ' +
              'novel_rewrite 小说改写 / novel_tuiwen 小说推文 / translate 翻译 / ' +
              'script_copy 脚本文案 / audiobook 有声小说 / dubbing 配音 / comic 漫画绘本 / ppt_deck PPT 生成 / ' +
              'short_drama 短剧 / longform 长文写作 / douyin_ops 抖音运营（父任务：一个目录管多条线）/ ' +
              'douyin_traffic 抖音引流 / douyin_sell 抖音图文带货 / ' +
              'shop_ops 店铺运营（父任务：一个目录管多类店铺任务）/ shop_selection 跨境选品分析 / ' +
              'shop_listing Listing 优化 / shop_ads 广告与利润 / shop_sourcing 1688 货源与铺货 / ' +
              'shop_transit 中转仓与头程 / shop_service 客服与售后；' +
              '也接受自建类型的 key（先 api_task_type_list 看看有哪些）。' +
              '传 null 或空串表示改回通用。写给父任务类型（parent/douyin_ops/shop_ops）的目录，每条任务再选子线',
          },
        },
        required: ['taskType'],
      },
    },
  ]);
}
