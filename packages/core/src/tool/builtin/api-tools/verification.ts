import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerVerificationTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('verification', [
    {
      name: 'api_verification_code_latest',
      description:
        '读取最新的短信验证码。当用户要求「帮我看下验证码」「验证码是多少」「取一下短信码」，或某个登录/校验流程需要用户提供手机验证码时使用。'
        + '验证码由用户手机上的言智移动端在收到短信后自动转发到本节点，有效期约 5 分钟。'
        + '返回 null 表示当前没有可用验证码（没收到、已过期或移动端未开启转发）。',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'number', description: '最多返回几条最近验证码（默认 1，上限 10）' } },
        required: [],
      },
    },
    {
      name: 'api_verification_code_list',
      description: '列出最近的多条短信验证码（未过期，按时间倒序），用于用户连收多条短信、需要挑选或回看的场景',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'number', description: '返回条数（默认 10，上限 50）' } },
        required: [],
      },
    },
  ]);
}