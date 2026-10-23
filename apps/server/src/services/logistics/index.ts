// 物流服务商注册表：platform id → 客户端。
//
// ★ 新增一家服务商只需两步：
//   ① 在 services/logistics/ 下新建客户端（实现 LogisticsClient）；
//   ② 在这里登记 + 在 shop-ops 的 SHOP_PLATFORMS 里把 integration.client 改成 'ready'。
//   控制台的凭据表单完全由客户端声明的 credentials 驱动，不需要改前端。
import { sfClient } from './sf.js';
import { yunExpressClient } from './yunexpress.js';
import { jdClient } from './jd.js';
import { cainiaoClient } from './cainiao.js';
import { fourpxClient } from './fourpx.js';
import type { CredentialField, LogisticsClient } from './types.js';

export * from './types.js';

export const LOGISTICS_CLIENTS: Record<string, LogisticsClient> = {
  'sf-express': sfClient,
  yunexpress: yunExpressClient,
  'jd-logistics': jdClient,
  cainiao: cainiaoClient,
  '4px': fourpxClient,
};

/** 按 platform id 取客户端；未实现的返回 undefined（调用方据此提示"客户端未接"） */
export function logisticsClientOf(platformId: string): LogisticsClient | undefined {
  return LOGISTICS_CLIENTS[platformId];
}

/** 该平台的凭据字段（未实现客户端时返回空数组，表单退化为"仅登记"） */
export function credentialFieldsOf(platformId: string): CredentialField[] {
  return LOGISTICS_CLIENTS[platformId]?.credentials ?? [];
}
