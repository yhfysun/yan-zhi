/**
 * 店铺平台 API 客户端契约（2026-10-22 P1：Shopify 先行，后续淘宝/拼多多/1688/TikTok/万邑通按同一契约接入）。
 *
 * ★ 设计目标：把「凭据结构 / 连通性自检 / 能力矩阵」从插件里抽出来——
 *   插件只负责加解密与审计，平台差异全部收敛到独立客户端。
 * ★ 能力矩阵必须诚实：只把真正实现的动作标进来；没实现的动作由适配器回落 JumpPlan。
 */

/** 凭据字段（与物流服务商的 CredentialField 同形，前端复用同一套表单渲染） */
export interface PlatformCredentialField {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  /** true = 密钥字段：加密存储、永不回显、编辑时留空沿用原值 */
  secret?: boolean;
  hint?: string;
  options?: Array<{ label: string; value: string }>;
  defaultValue?: string;
}

export type PlatformCredentialValues = Record<string, string>;

/** 自检失败要能指出卡在哪一步，不把「签名错」伪装成「网络不通」 */
export type PlatformProbeStep = 'creds' | 'network' | 'auth' | 'rate' | 'api' | 'enterprise';

export interface PlatformApiProbe {
  ok: boolean;
  message: string;
  step?: PlatformProbeStep;
}

/** 已实现的能力（值即动作名，供适配器路由与 UI 展示） */
export type PlatformApiCapability =
  | 'test'
  | 'product.list' | 'product.update' | 'product.price' | 'product.stock' | 'product.listing'
  | 'inventory.get'
  | 'order.list' | 'order.ship';

export interface PlatformApiClient {
  readonly id: string;
  readonly label: string;
  readonly credentialFields: PlatformCredentialField[];
  readonly capabilities: readonly PlatformApiCapability[];
  /** 解析 secretEnc 里的凭据 JSON；不完整/格式错返回 null（由调用方给出可读错误） */
  parseCreds(raw: string): PlatformCredentialValues | null;
  /** 连通性自检：只调用无害只读接口，不产生任何写操作 */
  test(creds: PlatformCredentialValues): Promise<PlatformApiProbe>;
}
