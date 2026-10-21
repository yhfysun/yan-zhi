// 物流服务商客户端的最小契约。
//
// ★ 为什么单独一层：shop-ops 只负责"登记一条资源"，不该知道顺丰的签名怎么拼。
//   每家服务商的差异全部收敛到这里，插件侧只按 platform id 取客户端。
//
// ★★ 诚实边界：`client: 'pending'` 的服务商没有实现 —— 开放平台要企业入驻/应用审核/
//   IP 白名单，没有凭据时写了也无法验证，不能假装"已对接"。

/** 凭据字段（控制台按它渲染表单，整组以 JSON 加密存进 connections.secretEnc） */
export interface CredentialField {
  key: string;
  label: string;
  /** placeholder：说明格式，不是真实值 */
  placeholder?: string;
  required?: boolean;
  /** true = 密码框（回显时永远留空） */
  secret?: boolean;
  /** 该字段的说明，渲染在输入框下方 */
  hint?: string;
  /** 有 options 时渲染下拉 */
  options?: Array<{ label: string; value: string }>;
  /** 新建时的初始值（只对非密钥字段有意义） */
  defaultValue?: string;
}

export type LogisticsCredentials = Record<string, string>;

export interface TrackEvent {
  /** 节点时间（服务商原始格式，保持可读） */
  time: string;
  /** 节点描述 */
  description: string;
  /** 发生地（有就填） */
  location?: string;
  /** 节点状态（有就填，如"已签收"） */
  status?: string;
}

export type LogisticsStep = 'creds' | 'network' | 'auth' | 'api' | 'parse';

export interface TrackResult {
  ok: boolean;
  provider: string;
  trackingNo: string;
  events: TrackEvent[];
  /** 服务商返回的说明/原始摘要（成功时可以带摘要，失败时是原因） */
  message?: string;
  step?: LogisticsStep;
}

export interface ProbeResult {
  ok: boolean;
  message: string;
  step?: LogisticsStep;
}

export interface TrackInput {
  trackingNo: string;
  /** 顺丰的"收寄人手机号后四位"校验（可选） */
  phone?: string;
  /** 客户订单号（部分服务商用订单号查询） */
  orderNo?: string;
}

export interface LogisticsClient {
  /** 与 SHOP_PLATFORMS 的 id 一致 */
  id: string;
  /** 凭据字段 */
  credentials: CredentialField[];
  probe(creds: LogisticsCredentials): Promise<ProbeResult>;
  track(creds: LogisticsCredentials, input: TrackInput): Promise<TrackResult>;
}

/** 必填字段校验；返回缺失的 label 列表 */
export function missingFields(client: LogisticsClient, creds: LogisticsCredentials): string[] {
  return client.credentials
    .filter((f) => f.required && !String(creds[f.key] ?? '').trim())
    .map((f) => f.label);
}

/** 统一把网络异常收敛成可读结果（不把 fetch 的英文堆栈直接抛给用户） */
export function netFailure(provider: string, trackingNo: string, e: unknown, step: LogisticsStep = 'network'): TrackResult {
  const msg = e instanceof Error ? e.message : String(e);
  return {
    ok: false, provider, trackingNo, events: [], step,
    message: `请求失败：${msg}`,
  };
}
