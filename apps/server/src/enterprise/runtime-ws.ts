/**
 * 运行节点 WebSocket 控制通道（Task 5）。
 *
 * ★ 协议（JSON 帧，同一连接承载任务下发 / 事件回传 / 心跳）：
 *   S→C  registered / task / events_acked / complete_acked / error
 *   C→S  ready（请求认领，空闲期按节律重发兼作心跳）/ events（按 seq 幂等）/ complete / heartbeat
 *   断线重连续传由**节点侧**负责：未收到 events_acked 的事件在重连后重发，
 *   服务端以 runtime_event 的 UNIQUE(task, seq) + INSERT OR IGNORE 幂等去重（同一事件不重复执行）。
 *
 * ★ 认证：upgrade 时用节点令牌（yzn.*，与 HTTP 轮询同一信任级别）认证；
 *   不接受匿名连接。license 门禁开启时要求 x-license 头或 ?license=（浏览器/agent 带头能力一致）。
 *   帧处理收口在 handleRuntimeFrame：传输层（bindRuntimeSocket）只做收发，便于真跑单测。
 */
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import { isLicenseGuardEnabled, extractLicenseCode, verifyLicenseCached, isGuardExemptPath } from '../license-guard.js';
import { getEnterpriseRepository } from './repository.js';

const runtimeWsServer = new WebSocketServer({ noServer: true });

/** nodeId -> 该节点当前活跃连接集合；重连留下的旧连接会被新连接主动顶掉。 */
const connections = new Map<string, Set<WebSocket>>();

function sendFrame(ws: WebSocket, frame: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(frame)); } catch { /* 对端已断 */ }
  }
}

/** 节点令牌格式校验（轻量，避免把任意 query 塞进 authenticate）。 */
function extractNodeToken(req: IncomingMessage): string {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    return String(url.searchParams.get('token') || '').trim();
  } catch {
    return '';
  }
}

function licenseValid(req: IncomingMessage): boolean {
  if (!isLicenseGuardEnabled()) return true;
  if (isGuardExemptPath('/enterprise/runtime/ws')) return true;
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const code = extractLicenseCode({ headers: req.headers, query: Object.fromEntries(url.searchParams) } as never);
    return !!code && verifyLicenseCached(code).valid;
  } catch {
    return false;
  }
}

/**
 * 升级入口：认证通过返回 true（已完成 handleUpgrade），失败返回 false（调用方 401 + destroy）。
 * ★ 必须挂在通用 wsUpgradeAuthorized 之前 —— 节点令牌不是 JWT，multi 模式的 JWT 闸认不了它。
 */
export async function handleRuntimeWsUpgrade(
  req: IncomingMessage,
  socket: import('node:stream').Duplex,
  head: Buffer,
): Promise<boolean> {
  const token = extractNodeToken(req);
  const node = await authenticateQuietly(token);
  if (!node || !licenseValid(req)) return false;
  runtimeWsServer.handleUpgrade(req, socket, head, (ws) => bindRuntimeSocket(ws, node.id, token));
  return true;
}

async function authenticateQuietly(token: string): Promise<{ id: string } | null> {
  try {
    const repo = await getEnterpriseRepository();
    const node = await repo.authenticateRuntimeNode(token);
    return node ? { id: node.id } : null;
  } catch {
    return null;
  }
}

/**
 * ★ 帧处理唯一出口。nodeId/token 来自已认证的连接；返回要回发的帧（可为空数组）。
 * 抛错一律转成 error 帧回给节点（节点据此重试或降级），不让传输层崩。
 */
export async function handleRuntimeFrame(
  nodeId: string,
  token: string,
  frame: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const type = String(frame?.type || '');
  const repo = await getEnterpriseRepository();
  switch (type) {
    case 'ready': {
      // ready 兼作心跳：即使没有任务也保活。
      await repo.touchRuntimeNode(token);
      const task = await repo.claimRuntimeTask(token);
      if (!task) return [];
      return [{ type: 'task', task }];
    }
    case 'heartbeat': {
      await repo.touchRuntimeNode(token);
      return [{ type: 'heartbeat_acked', serverTime: Date.now() }];
    }
    case 'events': {
      const taskId = String(frame.taskId || '');
      const events = Array.isArray(frame.events) ? (frame.events as any[]) : [];
      const inserted = await repo.appendRuntimeEvents(token, taskId, events);
      return [{ type: 'events_acked', taskId, inserted }];
    }
    case 'complete': {
      const taskId = String(frame.taskId || '');
      await repo.completeRuntimeTask(token, taskId, {
        state: frame.state as never,
        result: frame.result,
        error: (frame.error as string) ?? null,
        exitCode: (frame.exitCode as number) ?? null,
        artifacts: Array.isArray(frame.artifacts) ? frame.artifacts as never[] : [],
      });
      return [{ type: 'complete_acked', taskId }];
    }
    case 'workspace_state': {
      const workspaceId = String(frame.workspaceId || '');
      await repo.updateWorkspaceState(token, workspaceId, frame.body as never);
      return [{ type: 'workspace_state_acked', workspaceId }];
    }
    default:
      return [{ type: 'error', message: `不支持的帧类型: ${type || '(空)'}` }];
  }
}

function bindRuntimeSocket(ws: WebSocket, nodeId: string, token: string): void {
  // 一节点一连接：重连成功后顶掉旧连接，避免双连接重复消费任务。
  const existing = connections.get(nodeId);
  if (existing) {
    for (const old of existing) {
      try { old.close(4001, 'superseded'); } catch { /* 已断 */ }
    }
  }
  const set = new Set<WebSocket>([ws]);
  connections.set(nodeId, set);
  // 触达一次心跳：registered 到达即视为在线。
  void (async () => {
    try {
      const repo = await getEnterpriseRepository();
      await repo.touchRuntimeNode(token);
    } catch { /* 令牌失效时靠后续帧报错 */ }
  })();
  sendFrame(ws, { type: 'registered', nodeId, serverTime: Date.now() });

  ws.on('message', (raw) => {
    let frame: Record<string, unknown>;
    try { frame = JSON.parse(String(raw)); } catch {
      sendFrame(ws, { type: 'error', message: '帧不是合法 JSON' });
      return;
    }
    void handleRuntimeFrame(nodeId, token, frame)
      .then((replies) => { for (const r of replies) sendFrame(ws, r); })
      .catch((e) => sendFrame(ws, { type: 'error', message: String((e as Error)?.message || e).slice(0, 300) }));
  });

  ws.on('close', () => {
    const cur = connections.get(nodeId);
    if (cur) {
      cur.delete(ws);
      if (cur.size === 0) {
        connections.delete(nodeId);
        // 该节点已无任何 WS 连接：立即离线（janitor 2 分钟兜底仍然保留）。
        void (async () => {
          try {
            const repo = await getEnterpriseRepository();
            await repo.markRuntimeNodeOffline(nodeId);
          } catch { /* 节点可能已删除 */ }
        })();
      }
    }
  });
  ws.on('error', () => { try { ws.close(); } catch { /* ignore */ } });
}

/** 测试 / 运维探针：某节点当前是否有活跃 WS 连接。 */
export function hasRuntimeWsConnection(nodeId: string): boolean {
  return (connections.get(nodeId)?.size || 0) > 0;
}
