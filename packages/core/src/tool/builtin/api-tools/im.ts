import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerImTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('im', [
    {
      name: 'api_im_connector_list',
      description: '列出微信/飞书连接器',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'api_im_connector_create',
      description: '创建微信或飞书连接器',
      inputSchema: {
        type: 'object',
        properties: {
          provider: { type: 'string', enum: ['wechat', 'feishu'] },
          name: { type: 'string' },
          config: { type: 'object' },
          enabled: { type: 'boolean' },
        },
        required: ['provider', 'name'],
      },
    },
    {
      name: 'api_im_connector_update',
      description: '更新微信/飞书连接器配置',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          config: { type: 'object' },
          enabled: { type: 'boolean' },
        },
        required: ['id'],
      },
    },
    {
      name: 'api_im_connector_delete',
      description: '删除微信/飞书连接器',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'api_im_send',
      description: '通过微信/飞书连接器发送文本或文件',
      inputSchema: {
        type: 'object',
        properties: {
          connectorId: { type: 'string' },
          to: { type: 'string' },
          content: { type: 'string' },
          file: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              path: { type: 'string' },
              data: { type: 'string' },
              mimeType: { type: 'string' },
            },
          },
          receiveIdType: { type: 'string' },
        },
        required: ['connectorId', 'to'],
      },
    },
    {
      name: 'api_im_connector_test',
      description: '测试微信/飞书连接器的配置是否可用（凭证是否有效、能否连通）。配置连接器后建议先测试再启用',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: '连接器 id' } },
        required: ['id'],
      },
    },
    {
      name: 'api_im_status',
      description:
        '查询各 IM 连接器的可用状态：ready=true 表示当前能发出消息；ready=false 时 error 说明原因（凭据失效 / 网关未启动 / 连接器已禁用）。发送前建议先查一次。',
      inputSchema: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            enum: ['feishu', 'wechat', 'wechat-personal', 'dingtalk'],
            description: '可选，只查某个平台',
          },
        },
        required: [],
      },
    },
    {
      name: 'api_im_send_message',
      description:
        '按平台发送 IM 消息（统一入口）：传 platform 后自动选用该平台已启用的连接器；同平台有多个连接器时用 connectorId 指定。recipientId 必须是平台原生 ID，禁止猜测：飞书私聊 ou_…、群 oc_…；钉钉群 cid…。text 与 filePath 二选一。',
      inputSchema: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            enum: ['feishu', 'wechat', 'wechat-personal', 'dingtalk'],
            description: '目标平台；与 connectorId 二选一（都有则以 connectorId 为准并校验一致）',
          },
          connectorId: { type: 'string', description: '指定连接器 id（可选）' },
          recipientKind: {
            type: 'string',
            enum: ['direct', 'group'],
            description: '私聊或群聊，默认 direct',
          },
          recipientId: {
            type: 'string',
            description: '平台原生收件人 ID（飞书 ou_/oc_，钉钉群 cid…）',
          },
          text: { type: 'string', description: '文本正文' },
          filePath: { type: 'string', description: '要发送的文件路径（与 text 二选一）' },
        },
        required: ['recipientId'],
      },
    },
    {
      name: 'api_im_contact_search',
      description:
        '按姓名关键词搜 IM 联系人，返回平台原生 ID（飞书 open_id ou_…），可直接用于 api_im_send_message。飞书支持两种策略：oauth（用户授权，走官方搜索，快且准）与 contacts（遍历企业通讯录，无需授权但首次较慢）；默认 auto 优先 oauth，失败自动回退。只给姓名不要猜 ID，先调用本工具。',
      inputSchema: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            enum: ['feishu', 'wechat', 'wechat-personal', 'dingtalk'],
            description: '目标平台；与 connectorId 二选一',
          },
          connectorId: { type: 'string', description: '指定连接器 id（可选）' },
          query: { type: 'string', description: '姓名关键词（≤50 字符）' },
          strategy: {
            type: 'string',
            enum: ['auto', 'oauth', 'contacts'],
            description: '搜索策略，默认 auto',
          },
          maxResults: { type: 'number', description: '最多返回条数，默认 20，上限 50' },
        },
        required: ['query'],
      },
    },
    {
      name: 'api_im_chat_list',
      description:
        '列出当前身份可见的 IM 会话（飞书返回 chat_id oc_… 与群名）。飞书优先用用户授权身份列你自己可见的会话，未授权时退回应用身份（只能看到机器人所在的群）。',
      inputSchema: {
        type: 'object',
        properties: {
          platform: {
            type: 'string',
            enum: ['feishu', 'wechat', 'wechat-personal', 'dingtalk'],
            description: '目标平台；与 connectorId 二选一',
          },
          connectorId: { type: 'string', description: '指定连接器 id（可选）' },
          types: { type: 'string', description: '会话类型过滤，如 group 或 p2p（可选）' },
        },
        required: [],
      },
    },
  ]);
}

