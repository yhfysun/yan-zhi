/** Marketplace 商城协议类型 */

/** 商城类型 */
export type MarketplaceType = 'skill' | 'agent' | 'tool';

/** 远程源认证类型 */
export type AuthType = 'none' | 'bearer' | 'api-key' | 'basic';

/** 远程商城源 */
export interface RemoteMarketplaceSource {
  id: string;
  name: string;
  type: MarketplaceType;
  baseUrl: string;
  authType: AuthType;
  authConfigEnc?: string;
  enabled: boolean;
  createdAt: number;
}

/** 通用商城分页列表响应 */
export interface MarketplaceListResponse<T> {
  success: boolean;
  data: {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
  };
}

/** 通用商城详情响应 */
export interface MarketplaceDetailResponse<T> {
  success: boolean;
  data: T;
}

/** 商城节点信息（握手响应） */
export interface MarketplaceNodeInfo {
  name: string;
  version: string;
  capabilities: MarketplaceType[];
}

/** Skill 商城项 */
export interface MarketplaceSkillItem {
  id: string;
  name: string;
  description?: string;
  author?: string;
  category?: string;
  triggers?: string[];
  installs: number;
  createdAt: number;
}

/** Agent 商城项 */
export interface MarketplaceAgentItem {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  version: number;
  createdAt: number;
}

/** Tool 商城项 */
export interface MarketplaceToolItem {
  id: string;
  name: string;
  description?: string;
  runtime: string;
  inputSchema: unknown;
}

/** CustomTool */
export interface CustomTool {
  id: string;
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  runtime: 'node' | 'python' | 'java';
  entry: string;
  code: string;
  dependencies?: string[];
  timeout?: number;
  env?: Record<string, string>;
  enabled: boolean;
  source: 'local' | 'remote';
  remoteSourceId?: string;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}
