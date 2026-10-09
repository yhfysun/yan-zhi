import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerExperienceTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('experience', [
    {
      name: 'api_experience_read',
      description: '读取领域经验档案（自进化经验层：坑/步骤/事实）。topic 省略时返回全部档案索引；指定 topic（如 sites/mp.weixin.qq.com、dev-打包）时返回该档案全文',
      inputSchema: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: '档案主题，即文件名（不含 .md），如 sites/mp.weixin.qq.com、dev-排障。省略返回索引' },
        },
        required: [],
      },
    },
    {
      name: 'api_experience_write',
      description: '写入一条任务经验（自进化）。遇到「查了半天才搞定的坑」「验证出的好做法」「重要环境事实」时**当场**调用记录，别等任务结束。topic 决定归档文件，同一主题重复经验会自动计数合并',
      inputSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['pit', 'step', 'fact'], description: 'pit=踩过的坑(附规避)；step=验证过的做法/步骤；fact=环境/配置/路径事实' },
          topic: { type: 'string', description: '档案主题（文件名）：浏览器站点用 sites/<域名>，开发类 dev-<主题>，部署 ops-<主题>，办公流程 workflow-<主题>' },
          title: { type: 'string', description: '一句话标题（要具体，能区分于其它条目）' },
          detail: { type: 'string', description: '坑的规避方法 / 步骤详情 / 事实说明（≤500字）' },
          source: { type: 'string', description: '可选，来源说明（哪个任务/场景验证的）' },
        },
        required: ['kind', 'topic', 'title'],
      },
    },
  ]);
}
