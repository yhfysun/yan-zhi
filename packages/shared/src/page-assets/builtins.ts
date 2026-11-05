import { PAGE_ASSET_CAPABILITIES, type PageAssetSpec } from './types';

const COMMON_PUBLISH_VIDEO_INPUT = {
  type: 'object' as const,
  required: ['mediaPaths', 'title', 'body'],
  properties: {
    mediaPaths: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: '本地媒体文件绝对路径，第一项作为视频文件',
    },
    title: { type: 'string' as const, minLength: 1, maxLength: 100, description: '作品标题' },
    body: { type: 'string' as const, minLength: 1, maxLength: 2000, description: '作品描述或正文' },
    collectionName: { type: 'string' as const, description: '可选合集名称' },
    submit: { type: 'boolean' as const, description: '是否点击最终发布；默认 false' },
  },
};

const COMMON_PUBLISH_OUTPUT = {
  type: 'object' as const,
  properties: {
    recipe: { type: 'string' as const },
    submitted: { type: 'boolean' as const },
    verified: { type: 'boolean' as const },
  },
};

export const BUILTIN_PAGE_ASSETS: PageAssetSpec[] = [
  {
    apiVersion: 'page-asset/v1',
    kind: 'PageAsset',
    id: 'social.douyin.creator',
    title: '抖音创作者中心',
    platform: 'douyin',
    scope: 'public',
    status: 'active',
    version: 2,
    capabilities: [
      PAGE_ASSET_CAPABILITIES.publishVideo,
      PAGE_ASSET_CAPABILITIES.createComment,
    ],
    match: {
      hosts: ['creator.douyin.com'],
      routes: [
        '/creator-micro/content/upload',
        '/creator-micro/interactive/comment',
      ],
    },
    instructions: [
      '优先执行已声明的 operation，不要在页面里临时重写发布配方。',
      'submit=false 时只做上传和填写，不点击发布。',
      '需要改封面、修描述或确认合集时，先准备草稿，再用 submit-current 提交当前页；不要用 publish-video submit=true 重跑上传。',
    ],
    operations: [
      {
        id: 'publish-video',
        title: '发布视频',
        capability: PAGE_ASSET_CAPABILITIES.publishVideo,
        description: '上传视频、填写标题和描述、可选选择合集，并可按 submit 控制是否发布。',
        confirmation: 'required',
        inputSchema: COMMON_PUBLISH_VIDEO_INPUT,
        outputSchema: COMMON_PUBLISH_OUTPUT,
        executor: {
          kind: 'recipe',
          recipeId: 'douyin-publish-video',
          paramMap: {
            videoPath: '$input.mediaPaths[0]',
            title: '$input.title',
            description: '$input.body',
            collectionName: '$input.collectionName',
            submit: '$input.submit',
          },
        },
        assertions: ['recipe.ok === true', 'submit=false 时 recipe.submitted === false'],
      },
      {
        id: 'submit-current',
        title: '提交当前草稿',
        capability: PAGE_ASSET_CAPABILITIES.publishVideo,
        description: '只点击当前发布页的「发布」并核验结果；不导航、不上传、不修改标题/描述/合集/封面。',
        confirmation: 'required',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        outputSchema: COMMON_PUBLISH_OUTPUT,
        executor: {
          kind: 'recipe',
          recipeId: 'douyin-submit-current',
          paramMap: {
            submit: true,
          },
        },
        assertions: ['recipe.ok === true', 'recipe.submitted === true'],
      },
      {
        id: 'set-cover',
        title: '设置自定义封面',
        description: '在视频已上传的发布页设置封面；失败时不得重新上传视频。',
        confirmation: 'required',
        inputSchema: {
          type: 'object',
          required: ['coverPath'],
          properties: {
            coverPath: { type: 'string', minLength: 1 },
          },
        },
        executor: {
          kind: 'recipe',
          recipeId: 'douyin-set-cover',
          paramMap: {
            coverPath: '$input.coverPath',
          },
        },
      },
      {
        id: 'post-comment',
        title: '发布引导评论',
        capability: PAGE_ASSET_CAPABILITIES.createComment,
        confirmation: 'required',
        inputSchema: {
          type: 'object',
          required: ['videoTitle', 'comment'],
          properties: {
            videoTitle: { type: 'string', minLength: 1 },
            comment: { type: 'string', minLength: 1 },
          },
        },
        executor: {
          kind: 'recipe',
          recipeId: 'douyin-post-comment',
          paramMap: {
            videoTitle: '$input.videoTitle',
            comment: '$input.comment',
          },
        },
      },
      {
        id: 'upgrade-topics',
        title: '升级话题 chip',
        description: '把作品描述中的纯文本话题升级为真话题；不保存作品。',
        confirmation: 'required',
        inputSchema: {
          type: 'object',
          required: ['editUrl', 'topics'],
          properties: {
            editUrl: { type: 'string', minLength: 8 },
            topics: { type: 'array', items: { type: 'string' } },
          },
        },
        executor: {
          kind: 'recipe',
          recipeId: 'douyin-insert-topics',
          paramMap: {
            editUrl: '$input.editUrl',
            topics: '$input.topics',
          },
        },
      },
    ],
  },
  {
    apiVersion: 'page-asset/v1',
    kind: 'PageAsset',
    id: 'social.kuaishou.creator',
    title: '快手创作者服务平台',
    platform: 'kuaishou',
    scope: 'public',
    status: 'active',
    version: 1,
    capabilities: [PAGE_ASSET_CAPABILITIES.publishVideo],
    match: {
      hosts: ['cp.kuaishou.com'],
      routes: ['/article/publish/video'],
    },
    instructions: [
      '快手发布页的「发布」文本不唯一，配方失败时不要重复导航清空已上传内容。',
      'submit=false 时只能停留在发布前状态。',
    ],
    operations: [
      {
        id: 'publish-video',
        title: '发布视频',
        capability: PAGE_ASSET_CAPABILITIES.publishVideo,
        description: '上传视频、填写作品描述，并可按 submit 控制是否发布。',
        confirmation: 'required',
        inputSchema: COMMON_PUBLISH_VIDEO_INPUT,
        outputSchema: COMMON_PUBLISH_OUTPUT,
        executor: {
          kind: 'recipe',
          recipeId: 'kuaishou-publish-video',
          paramMap: {
            videoPath: '$input.mediaPaths[0]',
            description: '$input.body',
            submit: '$input.submit',
          },
        },
        assertions: ['recipe.ok === true', 'submit=false 时 recipe.submitted === false'],
      },
    ],
  },
  {
    apiVersion: 'page-asset/v1',
    kind: 'PageAsset',
    id: 'social.xiaohongshu.creator',
    title: '小红书创作服务平台',
    platform: 'xiaohongshu',
    scope: 'public',
    status: 'draft',
    version: 1,
    capabilities: [PAGE_ASSET_CAPABILITIES.publishNote],
    match: {
      hosts: ['creator.xiaohongshu.com'],
      routes: ['/publish/publish'],
    },
    instructions: [
      '当前仅登记能力边界，尚未完成真实页面锚点与发布链路验证。',
      '小红书平台风控严格，自动发布必须保持关闭，验证前不得激活。',
    ],
    operations: [],
  },
];
