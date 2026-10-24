/** IM 平台标识，取值与 im_connector.provider 一致。 */
export type ImPlatform = 'feishu' | 'wechat' | 'wechat-personal' | 'dingtalk';

export const IM_PLATFORMS: readonly ImPlatform[] = [
  'feishu',
  'wechat',
  'wechat-personal',
  'dingtalk',
];

export interface ImFilePayload {
  name?: string;
  path?: string;
  data?: string;
  mimeType?: string;
}

export interface ImSendInput {
  to: string;
  content?: string;
  file?: ImFilePayload;
  receiveIdType?: string;
}

/**
 * 消息在收件人客户端上的展示身份。
 * USER_NATIVE：以用户本人身份发出；APP_PROXY：以企业应用身份发出。
 */
export type ImSendingMode = 'USER_NATIVE' | 'APP_PROXY';

export type ImRecipientKind = 'direct' | 'group';

export type ImErrorCode =
  | 'platform_unavailable'
  | 'ambiguous_connector'
  | 'not_linked'
  | 'unsupported_content'
  | 'directory_failed'
  | 'oauth_failed'
  | 'validation_failed'
  | 'send_failed';

export interface ImCapabilities {
  platform: ImPlatform;
  sendingMode: ImSendingMode;
  supportsDirect: boolean;
  supportsGroup: boolean;
  supportsFile: boolean;
  supportsContactSearch: boolean;
  supportsChatList: boolean;
}

export interface ImUserSummary {
  openId: string;
  name: string;
  matchedQuery?: string;
  departmentPath?: string;
}

export interface ImChatSummary {
  chatId: string;
  name: string;
  chatMode?: string;
  description?: string;
}

export type ImSearchStrategy = 'oauth' | 'contacts';

export interface ImContactSearchResult {
  strategy: ImSearchStrategy;
  items: ImUserSummary[];
  elapsedMs: number;
  /** 通讯录遍历时实际扫描的用户数（OAuth 搜索不提供） */
  scannedUsers?: number;
  /** 遍历触达上限，结果可能不完整 */
  truncated?: boolean;
  note?: string;
}

/** 飞书 user_access_token 凭据（加密后存于连接器 config） */
export interface ImFeishuUserToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  refreshExpiresAt?: number;
  scope?: string;
  openId?: string;
  name?: string;
}

export interface ImTestResult {
  provider: ImPlatform;
  ok: true;
  note?: string;
}

/** 连接器可用性（给 Agent 判断"现在能不能发"）。ready=false 时 error 说明原因。 */
export interface ImConnectorStatus {
  connectorId: string;
  name: string;
  platform: ImPlatform;
  enabled: boolean;
  ready: boolean;
  sendingMode: ImSendingMode;
  note?: string;
  error?: string;
  /** 飞书等支持用户态授权的平台：是否已授权（决定找人走 OAuth 还是通讯录） */
  userAuth?: { linked: boolean; name?: string };
}

/** 通讯录/授权类调用的可选回调：刷新出的用户态 token 交由调用方落盘 */
export interface ImDirectoryOptions {
  onUserToken?: (token: ImFeishuUserToken) => void;
}

/** 单平台出站实现。新增平台只需实现本接口并注册，不改动工具层。 */
export interface ImProvider {
  readonly platform: ImPlatform;
  readonly capabilities: ImCapabilities;
  send(config: Record<string, any>, input: ImSendInput): Promise<any>;
  test(config: Record<string, any>): Promise<ImTestResult>;
  /** 按姓名找联系人（需 supportsContactSearch）；strategy=auto 时优先用户态、失败回退通讯录 */
  searchUsers?(
    config: Record<string, any>,
    query: string,
    opts?: { strategy?: 'auto' | ImSearchStrategy; maxResults?: number } & ImDirectoryOptions,
  ): Promise<ImContactSearchResult>;
  /** 列出当前身份可见的会话（需 supportsChatList） */
  listChats?(
    config: Record<string, any>,
    types?: string,
    opts?: ImDirectoryOptions,
  ): Promise<ImChatSummary[]>;
}
