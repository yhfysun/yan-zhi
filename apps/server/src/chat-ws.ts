// 聊天主链路 WebSocket 层（2026-10-20，SSE→WS 迁移第一步）。
//
// ★ 为什么只切聊天主链路：SSE 服务的是**全部**流式面板（聊天/子智能体/运维/安全/
//   本地终端/SFTP/CI-CD/运行调试），一次性全切回归面失控。本模块只承接 `routes/llm-tasks.ts`
//   的**任务级 + 会话级**事件流与任务生命周期（建任务/追问/工具回执/中止/暂停/恢复），
//   其余面板维持 SSE 不变。通道语义与 SSE 完全对齐：复用 llm-task-manager 的
//   emit / subscribe / subscribeConversation，只是把 `onEvent` 从「写 res」换成「写 ws」。
//
// ★ 鉴权：本地单用户模式（authMiddleware 恒定 guest），与聊天 HTTP 路由同源 —— 不校验
//   token、不校验 license（license 只守插件/运维能力，聊天是核心能力）。

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import {
  createTask, subscribe, subscribeConversation, abortTask, pauseTask, resumeTask,
  resolveToolResult, injectUserMessage, findRunningTaskId, validateTaskModel,
} from './llm-task-manager.js';
import { findCreatedTask, rememberCreatedTask } from './chat-ws-dedupe.js';

/** 本机单用户身份（与 auth.ts 的 LOCAL_USER 一致；全库 user_id 都是 guest） */
const USER_ID = 'guest';

type Unsub = () => void;

interface ChatWsClient {
  ws: WebSocket;
  /**
   * 订阅退订函数集合（任务订阅 / 会话订阅），连接关闭时统一释放。
   * ★ 按 key 存（`task:${id}` / `conv:${id}`）：同一连接重复订阅同一目标时先退旧的再挂新的
   *   （幂等重订，避免重订后双份事件）；unsubscribe_* 也能精确退订，不必断连接。
   */
  subs: Map<string, Unsub>;
}

/** 客户端 → 服务端消息信封 */
interface ClientMsg {
  id?: string;
  type: string;
  taskId?: string;
  conversationId?: string;
  since?: number;
  callId?: string;
  result?: string;
  content?: string;
  clientMsgId?: string;
  // create_task 载荷（与 POST /tasks 对齐）
  platformId?: string;
  modelId?: string;
  userContent?: string;
  agentId?: string | null;
  appGuide?: string;
  systemPrompt?: string;
  tools?: any[];
  options?: Record<string, unknown>;
  modeFlags?: Record<string, boolean>;
  maxSteps?: number;
  memoryExtractPlatformId?: string;
  memoryExtractModelId?: string;
  ontologyIds?: string[];
  workspaceDir?: string;
  pathGuard?: string;
}

/** 复用 POST /tasks 的「运行中任务 → 追问注入」语义，避免 WS 与 HTTP 两条建任务路径漂移 */
function createTaskOrInject(payload: ClientMsg): { taskId: string; reused?: boolean; injected?: boolean; injectedMsgId?: string; duplicate?: boolean } {
  const conversationId = payload.conversationId!;
  // ★ 重发幂等（2026-10-26）：前端自动重发时沿用同一个 clientMsgId。
  //   命中说明上一次 create_task 其实已经建好了任务，只是应答在断连中丢了 ——
  //   此时**绝不能再建/再注入一次**，直接把 taskId 还回去（前端订阅即可重放整个过程）。
  //   duplicate 让前端知道"这是重发的同一句话"，不必再提示用户。
  const clientMsgId = typeof payload.clientMsgId === 'string' ? payload.clientMsgId : undefined;
  const already = findCreatedTask(conversationId, clientMsgId);
  if (already) return { taskId: already, reused: true, duplicate: true };
  const runningId = findRunningTaskId(conversationId, USER_ID);
  if (runningId) {
    const inj = payload.userContent
      ? injectUserMessage(conversationId, String(payload.userContent), USER_ID, clientMsgId)
      : { status: 'no-task' as const };
    // 并入成功也要记账：否则下一次重发会再注一遍（幂等键只有落进记账才生效）
    if (inj.status === 'injected') rememberCreatedTask(conversationId, clientMsgId, runningId);
    return { taskId: runningId, reused: true, injected: inj.status === 'injected', injectedMsgId: (inj as any).msgId };
  }
  const modelInvalid = validateTaskModel(USER_ID, String(payload.platformId), String(payload.modelId));
  if (modelInvalid) throw new Error(modelInvalid);
  const taskId = createTask({
    conversationId,
    userId: USER_ID,
    platformId: payload.platformId!,
    modelId: payload.modelId!,
    userContent: payload.userContent,
    agentId: payload.agentId ?? null,
    appGuide: payload.appGuide,
    systemPrompt: payload.systemPrompt,
    tools: payload.tools,
    options: payload.options as any,
    modeFlags: payload.modeFlags as any,
    maxSteps: payload.maxSteps,
    includeUiTools: true,
    memoryExtractPlatformId: payload.memoryExtractPlatformId,
    memoryExtractModelId: payload.memoryExtractModelId,
    ontologyIds: Array.isArray(payload.ontologyIds) ? payload.ontologyIds.map(String) : undefined,
    workspaceDir: typeof payload.workspaceDir === 'string' ? payload.workspaceDir : undefined,
    pathGuard: (payload.pathGuard === 'strict' || payload.pathGuard === 'off' || payload.pathGuard === 'ask') ? payload.pathGuard : undefined,
  });
  rememberCreatedTask(conversationId, clientMsgId, taskId);
  return { taskId };
}

function send(ws: WebSocket, obj: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try { ws.send(JSON.stringify(obj)); } catch { /* 对端已断 */ }
}

export const chatWsServer = new WebSocketServer({ noServer: true });

export function handleChatUpgrade(req: IncomingMessage, socket: any, head: Buffer): void {
  chatWsServer.handleUpgrade(req, socket, head, (ws) => {
    const client: ChatWsClient = { ws, subs: new Map() };
    ws.on('message', (data) => handleMessage(client, data));
    ws.on('close', () => {
      for (const un of client.subs.values()) { try { un(); } catch { /* 已释放 */ } }
      client.subs.clear();
    });
    ws.on('error', () => { /* close 兜底 */ });
  });
}

/** 幂等挂订阅：同一 key 先退旧的再挂新的（重订/重复订阅都安全，不产生双份事件） */
function addSub(client: ChatWsClient, key: string, un: Unsub): void {
  const prev = client.subs.get(key);
  if (prev) { try { prev(); } catch { /* 已释放 */ } }
  client.subs.set(key, un);
}

function handleMessage(client: ChatWsClient, data: any): void {
  let msg: ClientMsg;
  try { msg = JSON.parse(String(data)); } catch { return; }
  const { ws } = client;
  const reply = (type: string, payload: Record<string, unknown>) => send(ws, { id: msg.id, type, ...payload });

  try {
    switch (msg.type) {
      case 'ping': reply('pong', {}); break;

      case 'create_task': {
        if (!msg.conversationId || !msg.platformId || !msg.modelId) {
          reply('error', { error: '缺少 conversationId/platformId/modelId' });
          break;
        }
        const r = createTaskOrInject(msg);
        reply('ok', { data: { taskId: r.taskId, reused: !!r.reused, injected: !!r.injected, injectedMsgId: r.injectedMsgId, duplicate: !!r.duplicate } });
        break;
      }

      case 'subscribe_task': {
        if (!msg.taskId) { reply('error', { error: '缺少 taskId' }); break; }
        const taskId = msg.taskId;
        const un = subscribe(taskId, Number.isFinite(msg.since) && (msg.since || 0) > 0 ? msg.since! : 0, (event) => {
          send(ws, { type: 'task_event', taskId, event });
        });
        addSub(client, `task:${taskId}`, un);
        reply('ok', { data: { taskId } });
        break;
      }

      case 'unsubscribe_task': {
        // 精确退订（连接不断也能退）；没订过就静默成功（幂等）
        const prev = msg.taskId ? client.subs.get(`task:${msg.taskId}`) : undefined;
        if (prev) { try { prev(); } catch { /* 已释放 */ } client.subs.delete(`task:${msg.taskId}`); }
        reply('ok', {});
        break;
      }

      case 'subscribe_conversation': {
        if (!msg.conversationId) { reply('error', { error: '缺少 conversationId' }); break; }
        const conversationId = msg.conversationId;
        const un = subscribeConversation(conversationId, (event) => {
          send(ws, { type: 'conv_event', conversationId, event });
        });
        addSub(client, `conv:${conversationId}`, un);
        reply('ok', { data: { conversationId } });
        break;
      }

      case 'unsubscribe_conversation': {
        const prevConv = msg.conversationId ? client.subs.get(`conv:${msg.conversationId}`) : undefined;
        if (prevConv) { try { prevConv(); } catch { /* 已释放 */ } client.subs.delete(`conv:${msg.conversationId}`); }
        reply('ok', {});
        break;
      }

      case 'inject': {
        if (!msg.conversationId || typeof msg.content !== 'string' || !msg.content.trim()) {
          reply('error', { error: '缺少 conversationId/content' });
          break;
        }
        const r = injectUserMessage(msg.conversationId, msg.content, USER_ID, typeof msg.clientMsgId === 'string' ? msg.clientMsgId : undefined);
        reply('ok', { data: { status: r.status, msgId: r.msgId, duplicate: !!r.duplicate } });
        break;
      }

      case 'tool_result': {
        if (!msg.taskId || !msg.callId) { reply('error', { error: '缺少 taskId/callId' }); break; }
        resolveToolResult(msg.taskId, msg.callId, msg.result || '');
        reply('ok', {});
        break;
      }

      case 'abort': if (msg.taskId) { abortTask(msg.taskId); reply('ok', {}); } break;
      case 'pause': if (msg.taskId) { reply('ok', { data: { paused: pauseTask(msg.taskId) } }); } break;
      case 'resume': if (msg.taskId) { reply('ok', { data: { resumed: resumeTask(msg.taskId) } }); } break;

      default:
        reply('error', { error: `未知消息类型: ${msg.type}` });
    }
  } catch (e: any) {
    reply('error', { error: String(e?.message || e) });
  }
}
