// design_asset_sites 内置工具 —— 免费设计素材站点清单（图标/插画/照片/音效）
// 纯静态信息工具（registry 直执行，无网络调用）：返回站点、许可、下载方式与推荐工作流。
// 下载动作由模型委派 pageAgent（浏览器登录态）或 http_request（Openverse 免鉴权 API）执行。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

const SITES = [
  {
    name: '阿里 iconfont', url: 'https://www.iconfont.cn', kind: '图标', license: '各图标作者授权，大部分可商用（逐个看标注）',
    how: '需登录；搜索关键词 → 选图标 → 下载 SVG/PNG 或复制代码。中文图标最全的首选。',
    best_for: '界面图标、流程节点图标、中文语境图标',
  },
  {
    name: '字节 IconPark', url: 'https://iconpark.oceanengine.com', kind: '图标', license: 'Apache 2.0（可商用）',
    how: '免登录；在线调颜色/线宽/尺寸 → 导出 SVG/PNG。风格统一（一套图标系）。',
    best_for: '成套统一风格的图标、需要自定义颜色的图标',
  },
  {
    name: 'Remix Icon', url: 'https://remixicon.com', kind: '图标', license: 'Apache 2.0（可商用）',
    how: '免登录；搜索 → 下载 SVG/PNG。线面两套风格。',
    best_for: '简洁线条图标',
  },
  {
    name: 'unDraw', url: 'https://undraw.co/illustrations', kind: '插画', license: '自定义许可（可商用、免署名）',
    how: '免登录；选主题色 → 下载 SVG/PNG。扁平人物插画。',
    best_for: '封面配图、概念场景插画',
  },
  {
    name: 'Openverse', url: 'https://openverse.org', kind: '图片聚合（CC 授权）', license: 'CC 各类授权（按图标注）',
    how: '★ 免鉴权 API 直拉：http GET https://api.openverse.org/v1/images/?q=<英文关键词>&license_type=all-cc&page_size=20 → JSON 里取 url/thumbnail/license。可用 http_request 直接调。',
    best_for: '程序化批量找图、真实照片素材',
  },
  {
    name: 'Pixabay', url: 'https://pixabay.com', kind: '照片/插画/视频', license: 'Pixabay 许可（可商用免署名）',
    how: '需登录下载；也有 API（需免费申请 key）。',
    best_for: '高质量真实照片、背景图',
  },
  {
    name: 'Pexels', url: 'https://www.pexels.com', kind: '照片/视频', license: 'Pexels 许可（可商用免署名）',
    how: '需登录下载；API 需免费 key。',
    best_for: '高质量人像/场景照片、视频素材',
  },
  {
    name: 'Freepik', url: 'https://www.freepik.com', kind: '插画/图标/PSD', license: '免费需署名（或订阅免署名）',
    how: '需登录；下载注明出处。',
    best_for: '精美插画与设计模板',
  },
];

export class DesignAssetSitesTool implements BuiltInTool {
  name = 'design_asset_sites';
  description =
    '查询内置的免费设计素材站点清单（图标/插画/照片，含许可与下载方式）：阿里 iconfont、字节 IconPark、unDraw、Openverse（免鉴权 API）等。' +
    '用于给动画/封面/文章找配图：先查本清单选站点，再委派 pageAgent 下载（浏览器站点）或用 http_request 调 Openverse API（免鉴权）。';

  inputSchema = {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['图标', '插画', '照片', '全部'],
        description: '按类型过滤（缺省返回全部）。',
      },
    },
    required: [],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const kind = String(args?.kind || '全部');
    const list = kind === '全部' ? SITES : SITES.filter((s) => s.kind.includes(kind) || kind.includes(s.kind));
    const text = [
      '内置免费设计素材站点清单（按需选站，下载动作委派 pageAgent 或 http_request）：',
      '',
      ...list.map((s, i) =>
        `${i + 1}. ${s.name}（${s.kind}）— ${s.url}\n   许可：${s.license}\n   用法：${s.how}\n   适合：${s.best_for}`),
      '',
      '推荐工作流：图标类用 IconPark/iconfont（SVG 可转 PNG）；真实照片用 Openverse API（http_request 直拉免鉴权）；',
      '插画封面用 unDraw（可调主题色统一品牌感）。下载的素材落到任务产物目录后即可被 anim_compose/demo_compose 引用。',
    ].join('\n');
    return { content: [{ type: 'text', text }] };
  }
}
