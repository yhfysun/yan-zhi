import { ImProviderRegistry } from './registry.js';
import { feishuProvider } from './providers/feishu.js';
import { wecomProvider } from './providers/wecom.js';
import { wechatPersonalProvider } from './providers/wechat-personal.js';
import { dingtalkProvider } from './providers/dingtalk.js';

/** 全部已接平台的出站实现。新增平台在此注册即可，工具层无需改动。 */
export const imProviders = new ImProviderRegistry([
  feishuProvider,
  wecomProvider,
  wechatPersonalProvider,
  dingtalkProvider,
]);

export * from './types.js';
export { ImProviderRegistry } from './registry.js';
