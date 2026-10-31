/**
 * 店铺平台 API 客户端注册表（2026-10-22）。
 * 插件只认这个入口：拿凭据字段、拿能力矩阵、做连通性自检。
 * 新平台接入 = 新增一个 client 文件 + 在这里登记一行，不需要改插件。
 */
import type { PlatformApiCapability, PlatformApiClient, PlatformCredentialField } from './types.js';
import { shopifyPlatformClient } from './shopify.js';
import { tiktokPlatformClient } from './tiktok.js';
import { winitPlatformClient } from './winit.js';
import { amazonPlatformClient } from './amazon.js';
import { taobaoPlatformClient } from './taobao.js';
import { pddPlatformClient } from './pdd.js';
import { ali1688PlatformClient } from './ali1688.js';
import { douyinPlatformClient } from './douyin.js';
import { kuaishouPlatformClient } from './kuaishou.js';

export * from './types.js';

const CLIENTS = new Map<string, PlatformApiClient>([
  [shopifyPlatformClient.id, shopifyPlatformClient],
  [tiktokPlatformClient.id, tiktokPlatformClient],
  [winitPlatformClient.id, winitPlatformClient],
  [amazonPlatformClient.id, amazonPlatformClient],
  [taobaoPlatformClient.id, taobaoPlatformClient],
  [pddPlatformClient.id, pddPlatformClient],
  [ali1688PlatformClient.id, ali1688PlatformClient],
  [douyinPlatformClient.id, douyinPlatformClient],
  [kuaishouPlatformClient.id, kuaishouPlatformClient],
]);

/** 测试/未来插件注册用：同 id 覆盖 */
export function registerPlatformApiClient(client: PlatformApiClient): void {
  CLIENTS.set(client.id, client);
}

export function platformApiOf(platformId: string): PlatformApiClient | undefined {
  return CLIENTS.get(platformId);
}

/** 该平台的凭据字段（没有 API 客户端 = 空数组，前端回落整段 JSON 输入） */
export function platformCredentialFieldsOf(platformId: string): PlatformCredentialField[] {
  return platformApiOf(platformId)?.credentialFields ?? [];
}

/** 该平台已实现的 API 能力 */
export function platformCapabilitiesOf(platformId: string): readonly PlatformApiCapability[] {
  return platformApiOf(platformId)?.capabilities ?? [];
}

export function listPlatformApiClients(): PlatformApiClient[] {
  return [...CLIENTS.values()];
}
