import { Router, type Request, type Response, type NextFunction } from 'express';
import { authMiddleware } from '../auth.js';
import { getAuthMode, userHasPermission } from '../rbac.js';
import { db } from '../db.js';
import { auditRequest, listAdminAudit } from '../enterprise/audit.js';
import {
  createExpertManifest, createTeamRule, deleteTeamRule, enterpriseOverview,
  listExpertManifests, listResourceVersions, listTeamResourceCatalog, listTeamRules,
  snapshotResourceVersion, updateTeamRule,
} from '../enterprise/resources.js';
import {
  deleteQuotaPolicy, getQuotaStatus, listQuotaAccounts, listQuotaPolicies,
  quotaAccountEntries, resetQuotaAccount, upsertQuotaPolicy,
} from '../enterprise/quota.js';
import {
  callMcpToolDirect, createMcpConnector, createMcpProvider, deleteMcpConnector,
  deleteMcpProvider, discoverMcpConnectorTools, listMcpCallLogs, listMcpConnectors,
  listMcpProviders, listMcpTools, updateMcpConnector, updateMcpProvider, updateMcpTool,
} from '../enterprise/mcp-hub.js';
import {
  appendRuntimeEvents, authenticateRuntimeNode, cancelRuntimeTask, claimRuntimeTask,
  completeRuntimeTask, createRuntimeNode, createRuntimeTask, createWorkspace,
  deleteRuntimeNode, getRuntimeTask, getWorkspace, heartbeatRuntimeNode, listRuntimeArtifacts,
  listRuntimeEvents, listRuntimeNodes, listRuntimeTasks, listWorkspaces, registerRuntimeNode,
  resolveWorkspacePreviewTarget, stopWorkspace, unregisterWorkspacePort,
  updateRuntimeNode, updateWorkspaceState, WorkspacePreviewError,
} from '../enterprise/runtime.js';
import {
  createDesignResource, deleteDesignResource, listDesignResources, updateDesignResource,
} from '../enterprise/design-resources.js';
import {
  completeMcpOAuth, getMcpOAuthStatus, McpOAuthError, OAUTH_CALLBACK_PATH,
  redactSecrets, revokeMcpOAuth, startMcpOAuth,
} from '../enterprise/mcp-oauth.js';

declare global {
  namespace Express {
    interface Request {
      runtimeNode?: any;
    }
  }
}

function requirePerm(permissionId: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (getAuthMode() === 'guest') { next(); return; }
    const actor = (req as any).realUser || req.user;
    if (!actor || !userHasPermission(actor.userId, permissionId)) {
      res.status(403).json({ error: '无权限执行该操作', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
}

function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json({ data });
}

function fail(res: Response, e: unknown, status = 400) {
  // OAuth 重新授权是「可行动错误」：必须带稳定 code 与重新授权入口，前端才能引导管理员操作。
  if (e instanceof McpOAuthError) {
    res.status(e.status).json({
      error: e.message,
      code: e.code,
      connectorId: e.connectorId,
      action: e.connectorId
        ? `/api/admin/enterprise/mcp/connectors/${e.connectorId}/oauth/start`
        : undefined,
    });
    return;
  }
  res.status(status).json({ error: e instanceof Error ? e.message : String(e) });
}

/** 反代下用 X-Forwarded-Proto 还原外部协议，保证 redirect_uri 与发起时一致。 */
function requestOrigin(req: Request): string {
  const forwarded = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  return `${forwarded || req.protocol}://${req.get('host')}`;
}

function body(req: Request): Record<string, any> {
  return (req.body || {}) as Record<string, any>;
}

export const enterpriseAdminRouter = Router();
enterpriseAdminRouter.use(authMiddleware);
enterpriseAdminRouter.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) { next(); return; }
  res.on('finish', () => {
    if (res.statusCode < 400) {
      try {
        auditRequest(req, `${req.method} ${req.baseUrl}${req.path}`, {
          resourceType: req.path.split('/')[1] || undefined,
          // ★ 审计唯一出口：clientSecret / token / 授权码等一律脱敏后再落 after_json。
          after: req.method === 'DELETE' ? null : redactSecrets(req.body),
        });
      } catch { /* 审计失败不影响主流程 */ }
    }
  });
  next();
});

enterpriseAdminRouter.get('/overview', requirePerm('admin.enterprise.manage'), (_req, res) => {
  ok(res, { ...enterpriseOverview(), quotas: listQuotaAccounts(20), audit: listAdminAudit({ limit: 20 }).items });
});

enterpriseAdminRouter.get('/resources', requirePerm('admin.enterprise.manage'), (req, res) => {
  try { ok(res, listTeamResourceCatalog(req.user!.userId)); } catch (e) { fail(res, e); }
});

enterpriseAdminRouter.get('/design-resources', requirePerm('admin.enterprise.manage'), (req, res) => {
  ok(res, listDesignResources({
    all: true,
    kind: typeof req.query.kind === 'string' ? req.query.kind : undefined,
  }));
});
enterpriseAdminRouter.post('/design-resources', requirePerm('admin.enterprise.manage'), (req, res) => {
  try { ok(res, createDesignResource(req.user!.userId, body(req)), 201); } catch (e) { fail(res, e); }
});
enterpriseAdminRouter.patch('/design-resources/:id', requirePerm('admin.enterprise.manage'), (req, res) => {
  try { ok(res, updateDesignResource(req.user!.userId, req.params.id, body(req))); } catch (e) { fail(res, e); }
});
enterpriseAdminRouter.delete('/design-resources/:id', requirePerm('admin.enterprise.manage'), (req, res) => {
  try { deleteDesignResource(req.user!.userId, req.params.id); ok(res, { ok: true }); } catch (e) { fail(res, e); }
});

enterpriseAdminRouter.get('/rules', requirePerm('admin.enterprise.manage'), (req, res) => {
  ok(res, listTeamRules(req.user!.userId, { all: String(req.query.all || '') === '1' }));
});
enterpriseAdminRouter.post('/rules', requirePerm('admin.enterprise.manage'), (req, res) => {
  try {
    const row = createTeamRule(req.user!.userId, body(req) as any);
    ok(res, row, 201);
  } catch (e) { fail(res, e); }
});
enterpriseAdminRouter.patch('/rules/:id', requirePerm('admin.enterprise.manage'), (req, res) => {
  try { ok(res, updateTeamRule(req.user!.userId, req.params.id, body(req) as any)); } catch (e) { fail(res, e); }
});
enterpriseAdminRouter.delete('/rules/:id', requirePerm('admin.enterprise.manage'), (req, res) => {
  try { deleteTeamRule(req.user!.userId, req.params.id); ok(res, { ok: true }); } catch (e) { fail(res, e); }
});
enterpriseAdminRouter.get('/rules/:id/versions', requirePerm('admin.enterprise.manage'), (req, res) => {
  try { ok(res, listResourceVersions('rule', req.params.id)); } catch (e) { fail(res, e); }
});

enterpriseAdminRouter.get('/agents/:id/manifest', requirePerm('admin.enterprise.manage'), (req, res) => {
  ok(res, listExpertManifests(req.params.id));
});
enterpriseAdminRouter.post('/agents/:id/manifest', requirePerm('admin.enterprise.manage'), (req, res) => {
  try {
    ok(res, createExpertManifest(req.user!.userId, req.params.id, {
      ruleIds: Array.isArray(body(req).ruleIds) ? body(req).ruleIds.map(String) : [],
    }), 201);
  } catch (e) { fail(res, e); }
});
enterpriseAdminRouter.post('/resources/:type/:id/snapshot', requirePerm('admin.enterprise.manage'), (req, res) => {
  try {
    const type = String(req.params.type);
    const id = String(req.params.id);
    const table = ({
      agent: 'agent', model: 'model', skill: 'skill', tool: 'custom_tool',
      plugin: 'plugin', rule: 'team_rule', mcp: 'mcp_connector',
    } as Record<string, string>)[type];
    if (!table) { fail(res, new Error('不支持的资源类型')); return; }
    const row = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id);
    if (!row) { fail(res, new Error('资源不存在'), 404); return; }
    ok(res, snapshotResourceVersion(type, id, row, req.user!.userId), 201);
  } catch (e) { fail(res, e); }
});

enterpriseAdminRouter.get('/quotas/policies', requirePerm('admin.quota.manage'), (_req, res) => {
  ok(res, listQuotaPolicies());
});
enterpriseAdminRouter.post('/quotas/policies', requirePerm('admin.quota.manage'), (req, res) => {
  try {
    const b = body(req);
    const row = upsertQuotaPolicy({
      id: b.id,
      subjectType: b.subjectType === 'org' ? 'org' : 'user',
      subjectId: String(b.subjectId || ''),
      period: b.period === 'day' || b.period === 'week' ? b.period : 'month',
      limitCny: Number(b.limitCny),
      enabled: b.enabled !== false,
    });
    ok(res, row, 201);
  } catch (e) { fail(res, e); }
});
enterpriseAdminRouter.delete('/quotas/policies/:id', requirePerm('admin.quota.manage'), (req, res) => {
  ok(res, { ok: deleteQuotaPolicy(req.params.id) });
});
enterpriseAdminRouter.get('/quotas/accounts', requirePerm('admin.quota.manage'), (req, res) => {
  ok(res, listQuotaAccounts(Number(req.query.limit) || 200));
});
enterpriseAdminRouter.post('/quotas/accounts/:id/reset', requirePerm('admin.quota.manage'), (req, res) => {
  try { ok(res, resetQuotaAccount(req.params.id, String(body(req).note || '管理员重置'))); } catch (e) { fail(res, e); }
});
enterpriseAdminRouter.get('/quotas/accounts/:id/entries', requirePerm('admin.quota.manage'), (req, res) => {
  ok(res, quotaAccountEntries(req.params.id, Number(req.query.limit) || 200));
});

enterpriseAdminRouter.get('/audit', requirePerm('admin.audit.read'), (req, res) => {
  ok(res, listAdminAudit({
    limit: Number(req.query.limit) || 100,
    offset: Number(req.query.offset) || 0,
    actorUserId: typeof req.query.actorUserId === 'string' ? req.query.actorUserId : undefined,
    resourceType: typeof req.query.resourceType === 'string' ? req.query.resourceType : undefined,
    action: typeof req.query.action === 'string' ? req.query.action : undefined,
  }));
});

enterpriseAdminRouter.get('/mcp/providers', requirePerm('admin.enterprise.manage'), (_req, res) => {
  ok(res, listMcpProviders());
});
enterpriseAdminRouter.post('/mcp/providers', requirePerm('admin.enterprise.manage'), (req, res) => {
  try { ok(res, createMcpProvider(req.user!.userId, body(req) as any), 201); } catch (e) { fail(res, e); }
});
enterpriseAdminRouter.patch('/mcp/providers/:id', requirePerm('admin.enterprise.manage'), (req, res) => {
  try { ok(res, updateMcpProvider(req.params.id, body(req) as any)); } catch (e) { fail(res, e); }
});
enterpriseAdminRouter.delete('/mcp/providers/:id', requirePerm('admin.enterprise.manage'), (req, res) => {
  try { deleteMcpProvider(req.params.id); ok(res, { ok: true }); } catch (e) { fail(res, e); }
});
enterpriseAdminRouter.get('/mcp/connectors', requirePerm('admin.enterprise.manage'), (req, res) => {
  ok(res, listMcpConnectors(req.user!.userId, { all: true }));
});
enterpriseAdminRouter.post('/mcp/connectors', requirePerm('admin.enterprise.manage'), (req, res) => {
  try { ok(res, createMcpConnector(req.user!.userId, body(req) as any), 201); } catch (e) { fail(res, e); }
});
enterpriseAdminRouter.patch('/mcp/connectors/:id', requirePerm('admin.enterprise.manage'), (req, res) => {
  try { ok(res, updateMcpConnector(req.params.id, body(req) as any)); } catch (e) { fail(res, e); }
});
enterpriseAdminRouter.delete('/mcp/connectors/:id', requirePerm('admin.enterprise.manage'), (req, res) => {
  try { deleteMcpConnector(req.params.id); ok(res, { ok: true }); } catch (e) { fail(res, e); }
});
enterpriseAdminRouter.get('/mcp/connectors/:id/tools', requirePerm('admin.enterprise.manage'), (req, res) => {
  ok(res, listMcpTools(req.params.id));
});
enterpriseAdminRouter.post('/mcp/connectors/:id/discover', requirePerm('admin.enterprise.manage'), async (req, res) => {
  try { ok(res, await discoverMcpConnectorTools(req.params.id)); } catch (e) { fail(res, e, 502); }
});
enterpriseAdminRouter.patch('/mcp/connectors/:id/tools/:name', requirePerm('admin.enterprise.manage'), (req, res) => {
  try {
    ok(res, updateMcpTool(req.params.id, req.params.name, {
      enabled: body(req).enabled,
      costCny: body(req).costCny,
    }));
  } catch (e) { fail(res, e); }
});
enterpriseAdminRouter.get('/mcp/calls', requirePerm('admin.enterprise.manage'), (req, res) => {
  ok(res, listMcpCallLogs({
    connectorId: typeof req.query.connectorId === 'string' ? req.query.connectorId : undefined,
    userId: typeof req.query.userId === 'string' ? req.query.userId : undefined,
    limit: Number(req.query.limit) || 100,
  }));
});

// ===== 集中式 MCP OAuth 授权闭环（Task 1）=====
enterpriseAdminRouter.post('/mcp/connectors/:id/oauth/start', requirePerm('admin.enterprise.manage'), (req, res) => {
  try {
    ok(res, startMcpOAuth(req.params.id, req.user!.userId, { publicOrigin: requestOrigin(req) }));
  } catch (e) { fail(res, e); }
});
enterpriseAdminRouter.get('/mcp/connectors/:id/oauth/status', requirePerm('admin.enterprise.manage'), (req, res) => {
  try { ok(res, getMcpOAuthStatus(req.params.id)); } catch (e) { fail(res, e); }
});
enterpriseAdminRouter.post('/mcp/connectors/:id/oauth/revoke', requirePerm('admin.enterprise.manage'), (req, res) => {
  try { revokeMcpOAuth(req.params.id); ok(res, { ok: true }); } catch (e) { fail(res, e); }
});

/**
 * 公开回调：由第三方授权服务器通过浏览器重定向触发，带不了 JWT，
 * 因此单独挂在 /api/enterprise/mcp/oauth（必须先于 enterpriseUserRouter 注册）。
 * 认证完全依赖一次性 state + PKCE + iss + redirect_uri 来源校验。
 */
export const enterpriseOAuthRouter = Router();
enterpriseOAuthRouter.get('/callback', async (req, res) => {
  const q = req.query;
  try {
    const result = await completeMcpOAuth({
      state: typeof q.state === 'string' ? q.state : undefined,
      code: typeof q.code === 'string' ? q.code : undefined,
      error: typeof q.error === 'string' ? q.error : undefined,
      iss: typeof q.iss === 'string' ? q.iss : undefined,
      currentRedirectUri: `${requestOrigin(req)}${OAUTH_CALLBACK_PATH}`,
    });
    // 用相对 Location，反代 / 多域名部署下由浏览器自己补全 origin；query 里不含任何凭证。
    const params = new URLSearchParams({
      mcp_oauth: result.status === 'authorized' ? 'success' : 'denied',
      connector: result.connectorId,
    });
    res.redirect(302, `/admin/enterprise?${params.toString()}`);
  } catch (e) {
    fail(res, e, 400);
  }
});

enterpriseAdminRouter.get('/runtime/nodes', requirePerm('admin.runtime.manage'), (_req, res) => {
  ok(res, listRuntimeNodes('', { all: true }));
});
enterpriseAdminRouter.post('/runtime/nodes', requirePerm('admin.runtime.manage'), (req, res) => {
  try { ok(res, createRuntimeNode(req.user!.userId, body(req) as any), 201); } catch (e) { fail(res, e); }
});
enterpriseAdminRouter.patch('/runtime/nodes/:id', requirePerm('admin.runtime.manage'), (req, res) => {
  try { ok(res, updateRuntimeNode(req.params.id, body(req) as any)); } catch (e) { fail(res, e); }
});
enterpriseAdminRouter.delete('/runtime/nodes/:id', requirePerm('admin.runtime.manage'), (req, res) => {
  deleteRuntimeNode(req.params.id);
  ok(res, { ok: true });
});
enterpriseAdminRouter.get('/runtime/tasks', requirePerm('admin.runtime.manage'), (req, res) => {
  ok(res, listRuntimeTasks('', { all: true, limit: Number(req.query.limit) || 100 }));
});
enterpriseAdminRouter.get('/runtime/workspaces', requirePerm('admin.runtime.manage'), (_req, res) => {
  ok(res, listWorkspaces('', { all: true }));
});

export const enterpriseUserRouter = Router();
enterpriseUserRouter.use(authMiddleware);
enterpriseUserRouter.get('/resources', (req, res) => {
  ok(res, listTeamResourceCatalog(req.user!.userId));
});
enterpriseUserRouter.get('/design-resources', (req, res) => {
  ok(res, listDesignResources({
    userId: req.user!.userId,
    kind: typeof req.query.kind === 'string' ? req.query.kind : undefined,
  }));
});
enterpriseUserRouter.get('/quota', (req, res) => {
  ok(res, getQuotaStatus(req.user!.userId));
});
enterpriseUserRouter.get('/mcp/connectors', (req, res) => {
  ok(res, listMcpConnectors(req.user!.userId));
});
enterpriseUserRouter.post('/mcp/:id', async (req, res) => {
  try {
    const connectorId = req.params.id;
    const b = body(req);
    const method = String(b.method || '');
    if (method === 'initialize') {
      ok(res, {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'yan-zhi-enterprise-mcp', version: '0.1.0' },
      });
      return;
    }
    if (method === 'ping') { ok(res, {}); return; }
    if (method === 'notifications/initialized') { res.status(202).end(); return; }
    if (method === 'tools/list') {
      const tools = listMcpTools(connectorId)
        .filter((t) => t.enabled)
        .map((t) => ({ name: t.name, description: t.description || '', inputSchema: t.input_schema || {} }));
      ok(res, { tools });
      return;
    }
    if (method === 'tools/call') {
      const params = b.params || {};
      const result = await callMcpToolDirect({
        connectorId,
        toolName: String(params.name || ''),
        args: (params.arguments || {}) as Record<string, unknown>,
        userId: req.user!.userId,
        taskId: typeof b.taskId === 'string' ? b.taskId : undefined,
      });
      res.setHeader('X-Billing-Transaction-ID', result.costCny > 0 ? String(Date.now()) : '');
      ok(res, result);
      return;
    }
    fail(res, new Error(`不支持的 MCP 方法: ${method}`), 400);
  } catch (e) {
    fail(res, e, 502);
  }
});

enterpriseUserRouter.get('/runtime/nodes', (req, res) => {
  ok(res, listRuntimeNodes(req.user!.userId));
});
enterpriseUserRouter.get('/runtime/tasks', (req, res) => {
  ok(res, listRuntimeTasks(req.user!.userId, { limit: Number(req.query.limit) || 100 }));
});
enterpriseUserRouter.post('/runtime/tasks', (req, res) => {
  try { ok(res, createRuntimeTask(req.user!.userId, body(req) as any), 201); } catch (e) { fail(res, e); }
});
enterpriseUserRouter.get('/runtime/tasks/:id', (req, res) => {
  const task = getRuntimeTask(req.params.id, req.user!.userId);
  if (!task) { fail(res, new Error('任务不存在'), 404); return; }
  ok(res, task);
});
enterpriseUserRouter.get('/runtime/tasks/:id/events', (req, res) => {
  const task = getRuntimeTask(req.params.id, req.user!.userId);
  if (!task) { fail(res, new Error('任务不存在'), 404); return; }
  ok(res, listRuntimeEvents(req.params.id, Number(req.query.sinceSeq) || 0));
});
enterpriseUserRouter.get('/runtime/tasks/:id/artifacts', (req, res) => {
  const task = getRuntimeTask(req.params.id, req.user!.userId);
  if (!task) { fail(res, new Error('任务不存在'), 404); return; }
  ok(res, listRuntimeArtifacts(req.params.id));
});
enterpriseUserRouter.post('/runtime/tasks/:id/cancel', (req, res) => {
  try { ok(res, cancelRuntimeTask(req.user!.userId, req.params.id)); } catch (e) { fail(res, e); }
});
enterpriseUserRouter.get('/runtime/workspaces', (req, res) => {
  ok(res, listWorkspaces(req.user!.userId));
});
enterpriseUserRouter.post('/runtime/workspaces', (req, res) => {
  try { ok(res, createWorkspace(req.user!.userId, body(req) as any), 201); } catch (e) { fail(res, e); }
});
enterpriseUserRouter.get('/runtime/workspaces/:id', (req, res) => {
  const row = getWorkspace(req.params.id, req.user!.userId);
  if (!row) { fail(res, new Error('工作区不存在'), 404); return; }
  ok(res, row);
});
enterpriseUserRouter.post('/runtime/workspaces/:id/stop', (req, res) => {
  try { ok(res, stopWorkspace(req.user!.userId, req.params.id)); } catch (e) { fail(res, e); }
});

/**
 * 云工作区端口预览（Task 3）。
 * ★ 目标地址只允许由「节点上报的 preview_host + 工作区已登记端口」拼成，
 *   请求方无法传 host / 任意目标 URL；不跟随 3xx、不透传凭证头、不透传 Set-Cookie。
 */
const SAFE_PREVIEW_RESPONSE_HEADERS = [
  'content-type', 'content-length', 'cache-control', 'etag', 'last-modified', 'x-content-type-options',
];

async function handleWorkspacePreview(req: Request, res: Response) {
  const port = Number(req.params.port);
  let target: ReturnType<typeof resolveWorkspacePreviewTarget>;
  try {
    target = resolveWorkspacePreviewTarget(req.user!.userId, req.params.id, port);
  } catch (e) {
    const err = e as WorkspacePreviewError;
    res.status(err.status || 400).json({ error: err.message, code: err.code || 'PREVIEW_DENIED' });
    return;
  }
  // 只接受相对子路径；禁协议相对 URL 与路径穿越。
  const marker = `/preview/${req.params.port}/`;
  const idx = req.path.indexOf(marker);
  const sub = idx >= 0 ? req.path.slice(idx + marker.length) : '';
  if (sub.startsWith('/') || sub.startsWith('//') || sub.includes('..')) {
    res.status(400).json({ error: '预览路径非法', code: 'INVALID_PREVIEW_PATH' });
    return;
  }
  // token 只用于本服务鉴权，绝不能透传给上游。
  const qs = new URLSearchParams(String(req.url || '').split('?')[1] || '');
  qs.delete('token');
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const url = `${target.baseUrl}/${sub}${suffix}`;
  try {
    const upstream = await fetch(url, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: {
        ...(typeof req.headers.accept === 'string' ? { Accept: req.headers.accept } : {}),
        ...(typeof req.headers['accept-language'] === 'string'
          ? { 'Accept-Language': req.headers['accept-language'] } : {}),
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      res.status(502).json({ error: '上游返回重定向，预览已拒绝', code: 'PREVIEW_REDIRECT_BLOCKED' });
      return;
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.length > 2 * 1024 * 1024) {
      res.status(502).json({ error: '预览响应过大', code: 'PREVIEW_RESPONSE_TOO_LARGE' });
      return;
    }
    for (const h of SAFE_PREVIEW_RESPONSE_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.status(upstream.status).send(body);
  } catch {
    // 端口关闭 / 容器已停止：摘掉登记，后续请求立即被 PORT_NOT_REGISTERED 拒绝。
    unregisterWorkspacePort(req.params.id, port);
    res.status(502).json({ error: '工作区端口不可达，预览已关闭', code: 'PREVIEW_UPSTREAM_UNREACHABLE' });
  }
}

enterpriseUserRouter.get('/runtime/workspaces/:id/preview/:port', handleWorkspacePreview);
enterpriseUserRouter.get('/runtime/workspaces/:id/preview/:port/*', handleWorkspacePreview);
enterpriseUserRouter.head('/runtime/workspaces/:id/preview/:port', handleWorkspacePreview);
enterpriseUserRouter.head('/runtime/workspaces/:id/preview/:port/*', handleWorkspacePreview);

function nodeToken(req: Request): string {
  const m = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
  return m?.[1] || '';
}

function requireNode(req: Request, res: Response, next: NextFunction) {
  const node = authenticateRuntimeNode(nodeToken(req));
  if (!node) {
    res.status(401).json({ error: '节点令牌无效', code: 'INVALID_NODE_TOKEN' });
    return;
  }
  req.runtimeNode = node;
  next();
}

export const enterpriseRuntimeRouter = Router();
enterpriseRuntimeRouter.post('/register', (req, res) => {
  try { ok(res, registerRuntimeNode(nodeToken(req), body(req))); } catch (e) { fail(res, e, 401); }
});
enterpriseRuntimeRouter.post('/heartbeat', requireNode, (_req, res) => {
  try { ok(res, heartbeatRuntimeNode(nodeToken(_req))); } catch (e) { fail(res, e, 401); }
});
enterpriseRuntimeRouter.get('/tasks/next', requireNode, (req, res) => {
  try { ok(res, claimRuntimeTask(nodeToken(req))); } catch (e) { fail(res, e, 401); }
});
enterpriseRuntimeRouter.post('/tasks/:id/events', requireNode, (req, res) => {
  try {
    const events = Array.isArray(body(req).events) ? body(req).events : [];
    ok(res, { inserted: appendRuntimeEvents(nodeToken(req), req.params.id, events) });
  } catch (e) { fail(res, e); }
});
enterpriseRuntimeRouter.post('/tasks/:id/complete', requireNode, (req, res) => {
  try { ok(res, completeRuntimeTask(nodeToken(req), req.params.id, body(req) as any)); } catch (e) { fail(res, e); }
});
enterpriseRuntimeRouter.post('/workspaces/:id/state', requireNode, (req, res) => {
  try { ok(res, updateWorkspaceState(nodeToken(req), req.params.id, body(req) as any)); } catch (e) { fail(res, e); }
});
