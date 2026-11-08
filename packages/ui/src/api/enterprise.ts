import { api } from './client';

export interface TeamRule {
  id: string;
  owner_user_id: string | null;
  name: string;
  description: string | null;
  content: string;
  scope: 'system' | 'expert' | 'user';
  priority: number;
  required: boolean;
  enabled: boolean;
  version: number;
  created_at: number;
  updated_at: number;
}

export interface TeamResourceItem {
  id: string;
  name: string;
  source?: string;
}

export interface TeamResourceCatalog {
  models: TeamResourceItem[];
  skills: TeamResourceItem[];
  agents: TeamResourceItem[];
  tools: TeamResourceItem[];
  plugins: TeamResourceItem[];
  rules: TeamRule[];
  mcp: TeamResourceItem[];
}

export interface QuotaPolicy {
  id: string;
  subject_type: 'user' | 'org';
  subject_id: string;
  subject_name?: string;
  period: 'day' | 'week' | 'month';
  limit_cny: number;
  enabled: number;
}

export interface QuotaAccount {
  id: string;
  subject_type: 'user' | 'org';
  subject_id: string;
  subject_name?: string;
  period: 'day' | 'week' | 'month';
  period_start: number;
  period_end: number;
  limit_cny: number;
  used_cny: number;
  reserved_cny: number;
  status: string;
}

export interface AuditItem {
  id: string;
  actor_user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  method: string | null;
  path: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  trace_id: string | null;
  created_at: number;
}

export interface RuntimeNode {
  id: string;
  owner_user_id: string;
  org_id: string | null;
  name: string;
  platform: string | null;
  arch: string | null;
  version: string | null;
  capabilities: string[];
  status: string;
  last_seen_at: number | null;
  created_at: number;
}

export interface RuntimeTask {
  id: string;
  node_id: string;
  owner_user_id: string;
  conversation_id: string | null;
  task_id: string | null;
  workspace_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
  state: string;
  result: unknown;
  error: string | null;
  exit_code: number | null;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
}

export interface RuntimeWorkspace {
  id: string;
  node_id: string;
  owner_user_id: string;
  name: string;
  path: string | null;
  image: string | null;
  cpu: number | null;
  memory_mb: number | null;
  status: string;
  ports: number[];
  runtime_mode: 'container' | 'directory';
  keep_dir: boolean;
  container_id: string | null;
  container_name: string | null;
  last_error: string | null;
  expires_at: number | null;
  created_at: number;
}

export interface McpProvider {
  id: string;
  name: string;
  description: string | null;
  transport: string;
  url: string;
  auth_mode: 'none' | 'header' | 'oauth';
  header_names: string[];
  oauth_config: Record<string, unknown>;
  has_oauth_client_secret?: boolean;
  enabled: boolean;
}

export interface McpConnector {
  id: string;
  provider_id: string;
  provider_name?: string;
  owner_user_id: string | null;
  name: string;
  description: string | null;
  url: string;
  credential_mode: 'none' | 'centralized' | 'independent';
  tool_policy: Record<string, unknown>;
  has_shared_secret: boolean;
  has_oauth_token: boolean;
  oauth_status: 'not_authorized' | 'pending' | 'authorized' | 'expired' | 'revoked' | 'reauthorization_required';
  oauth_expires_at: number | null;
  oauth_scopes: string[];
  oauth_error: string | null;
  is_public: boolean;
  enabled: boolean;
}

export interface McpOAuthStatus {
  status: string;
  expiresAt: number | null;
  scopes: string[];
  hasToken: boolean;
  message: string;
  authorizationPath: string;
}

export interface StartMcpOAuthResult {
  authorizationUrl: string;
  expiresAt: number;
  status: 'pending';
}

export interface McpTool {
  id: string;
  connector_id: string;
  name: string;
  description: string | null;
  input_schema: Record<string, unknown>;
  enabled: boolean;
  cost_cny: number;
}

export interface DesignResource {
  id: string;
  owner_user_id: string | null;
  kind: 'template' | 'style' | 'design-system' | 'direction';
  name: string;
  description: string | null;
  content: Record<string, unknown>;
  preview_url: string | null;
  tags: string[];
  is_public: boolean;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

export interface EnterpriseOverview {
  counts: Record<string, number>;
  usage: {
    totalCny30d: number;
    totalCalls30d: number;
    usageByDay: Array<{ day: string; cost_cny: number; calls: number }>;
    topModels: Array<{ model_id: string; cost_cny: number; calls: number }>;
  };
  quotas: QuotaAccount[];
  audit: AuditItem[];
}

function unpack<T>(r: { data: T } | { error: string; status?: number }): T | null {
  return 'data' in r ? r.data : null;
}

export const enterpriseApi = {
  async myResources() {
    return unpack(await api.get<TeamResourceCatalog>('/enterprise/resources'));
  },
  async myDesignResources() {
    return unpack(await api.get<DesignResource[]>('/enterprise/design-resources'));
  },
  async myQuota() {
    return unpack(await api.get<{ allowed: boolean; usedCny: number; limitCny: number | null; remainingCny: number | null; policy: QuotaPolicy | null; account: QuotaAccount | null }>('/enterprise/quota'));
  },
  async myNodes() {
    return unpack(await api.get<RuntimeNode[]>('/enterprise/runtime/nodes'));
  },
  async myTasks(limit = 100) {
    return unpack(await api.get<RuntimeTask[]>(`/enterprise/runtime/tasks?limit=${limit}`));
  },
  async createTask(body: Record<string, unknown>) {
    return api.post<RuntimeTask>('/enterprise/runtime/tasks', body);
  },
  async cancelTask(id: string) {
    return api.post<RuntimeTask>(`/enterprise/runtime/tasks/${id}/cancel`, {});
  },
  async taskEvents(id: string) {
    return unpack(await api.get<any[]>(`/enterprise/runtime/tasks/${id}/events`));
  },
  async myWorkspaces() {
    return unpack(await api.get<RuntimeWorkspace[]>('/enterprise/runtime/workspaces'));
  },
  async createWorkspace(body: Record<string, unknown>) {
    return api.post<RuntimeWorkspace>('/enterprise/runtime/workspaces', body);
  },
  async stopWorkspace(id: string) {
    return api.post<RuntimeWorkspace>(`/enterprise/runtime/workspaces/${id}/stop`, {});
  },
  async overview() {
    return unpack(await api.get<EnterpriseOverview>('/admin/enterprise/overview'));
  },
  async resources() {
    return unpack(await api.get<TeamResourceCatalog>('/admin/enterprise/resources'));
  },
  async designResources() {
    return unpack(await api.get<DesignResource[]>('/admin/enterprise/design-resources'));
  },
  async createDesignResource(body: Record<string, unknown>) {
    return api.post<DesignResource>('/admin/enterprise/design-resources', body);
  },
  async updateDesignResource(id: string, body: Record<string, unknown>) {
    return api.patch<DesignResource>(`/admin/enterprise/design-resources/${id}`, body);
  },
  async deleteDesignResource(id: string) {
    return api.delete(`/admin/enterprise/design-resources/${id}`);
  },

  async rules(all = true) {
    return unpack(await api.get<TeamRule[]>(`/admin/enterprise/rules?all=${all ? '1' : '0'}`));
  },
  async createRule(body: Partial<TeamRule>) {
    return api.post<TeamRule>('/admin/enterprise/rules', body);
  },
  async updateRule(id: string, body: Partial<TeamRule>) {
    return api.patch<TeamRule>(`/admin/enterprise/rules/${id}`, body);
  },
  async deleteRule(id: string) {
    return api.delete(`/admin/enterprise/rules/${id}`);
  },
  async createManifest(agentId: string, ruleIds: string[]) {
    return api.post(`/admin/enterprise/agents/${agentId}/manifest`, { ruleIds });
  },

  async policies() {
    return unpack(await api.get<QuotaPolicy[]>('/admin/enterprise/quotas/policies'));
  },
  async upsertPolicy(body: Record<string, unknown>) {
    return api.post<QuotaPolicy>('/admin/enterprise/quotas/policies', body);
  },
  async deletePolicy(id: string) {
    return api.delete(`/admin/enterprise/quotas/policies/${id}`);
  },
  async accounts(limit = 200) {
    return unpack(await api.get<QuotaAccount[]>(`/admin/enterprise/quotas/accounts?limit=${limit}`));
  },
  async resetAccount(id: string, note = '管理员重置') {
    return api.post(`/admin/enterprise/quotas/accounts/${id}/reset`, { note });
  },
  async accountEntries(id: string) {
    return unpack(await api.get<any[]>(`/admin/enterprise/quotas/accounts/${id}/entries`));
  },

  async audit(params: Record<string, string | number> = {}) {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    return unpack(await api.get<{ items: AuditItem[]; total: number }>(`/admin/enterprise/audit${qs ? `?${qs}` : ''}`));
  },

  async mcpProviders() {
    return unpack(await api.get<McpProvider[]>('/admin/enterprise/mcp/providers'));
  },
  async createMcpProvider(body: Record<string, unknown>) {
    return api.post<McpProvider>('/admin/enterprise/mcp/providers', body);
  },
  async updateMcpProvider(id: string, body: Record<string, unknown>) {
    return api.patch<McpProvider>(`/admin/enterprise/mcp/providers/${id}`, body);
  },
  async deleteMcpProvider(id: string) {
    return api.delete(`/admin/enterprise/mcp/providers/${id}`);
  },
  async mcpConnectors() {
    return unpack(await api.get<McpConnector[]>('/admin/enterprise/mcp/connectors'));
  },
  async createMcpConnector(body: Record<string, unknown>) {
    return api.post<McpConnector>('/admin/enterprise/mcp/connectors', body);
  },
  async updateMcpConnector(id: string, body: Record<string, unknown>) {
    return api.patch<McpConnector>(`/admin/enterprise/mcp/connectors/${id}`, body);
  },
  async deleteMcpConnector(id: string) {
    return api.delete(`/admin/enterprise/mcp/connectors/${id}`);
  },
  async discoverMcpTools(id: string) {
    return api.post<McpTool[]>(`/admin/enterprise/mcp/connectors/${id}/discover`);
  },
  async mcpTools(id: string) {
    return unpack(await api.get<McpTool[]>(`/admin/enterprise/mcp/connectors/${id}/tools`));
  },
  async updateMcpTool(connectorId: string, name: string, body: { enabled?: boolean; costCny?: number }) {
    return api.patch<McpTool>(`/admin/enterprise/mcp/connectors/${connectorId}/tools/${encodeURIComponent(name)}`, body);
  },
  async mcpCalls(limit = 100) {
    return unpack(await api.get<any[]>(`/admin/enterprise/mcp/calls?limit=${limit}`));
  },
  async startMcpOAuth(id: string) {
    return api.post<StartMcpOAuthResult>(`/admin/enterprise/mcp/connectors/${id}/oauth/start`, {});
  },
  async mcpOAuthStatus(id: string) {
    return unpack(await api.get<McpOAuthStatus>(`/admin/enterprise/mcp/connectors/${id}/oauth/status`));
  },
  async revokeMcpOAuth(id: string) {
    return api.post<{ ok: boolean }>(`/admin/enterprise/mcp/connectors/${id}/oauth/revoke`, {});
  },

  async runtimeNodes() {
    return unpack(await api.get<RuntimeNode[]>('/admin/enterprise/runtime/nodes'));
  },
  async createRuntimeNode(body: Record<string, unknown>) {
    return api.post<{ node: RuntimeNode; token: string }>('/admin/enterprise/runtime/nodes', body);
  },
  async deleteRuntimeNode(id: string) {
    return api.delete(`/admin/enterprise/runtime/nodes/${id}`);
  },
  async runtimeTasks(limit = 100) {
    return unpack(await api.get<RuntimeTask[]>(`/admin/enterprise/runtime/tasks?limit=${limit}`));
  },
  async workspaces() {
    return unpack(await api.get<RuntimeWorkspace[]>('/admin/enterprise/runtime/workspaces'));
  },
};
