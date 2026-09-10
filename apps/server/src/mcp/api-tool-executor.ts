import { v4 as uuid } from 'uuid';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { db } from '../db.js';
import { serverState } from '../state.js';
import {
  upsertPeer,
  listPeers,
  pingPeer,
  sendPeerMessage,
  pollPeerMessages,
} from '../services/peers.js';
import { gitService } from '../services/git.js';
import { bumpMemoryCache } from '../services/memory-service.js';
import {
  computeNextRun,
  nextCronTime,
  runScheduledTask,
  refreshScheduledTaskScheduler,
} from '../services/scheduled-tasks.js';
import {
  listOllamaMarket,
  pullOllamaModel,
  getPullStatus,
  deleteOllamaModel,
  testOllamaModel,
} from '../services/ollama.js';
import {
  listKnowledgeBases,
  listMountedKnowledgeBases,
  createKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  listKnowledgeDocs,
  addKnowledgeDoc,
  deleteKnowledgeDoc,
  multiHopSearchKnowledge,
  entityGraphSearch,
  entityGraphSearchGrouped,
  resetBuiltinAppGuide,
  extractEntityGraph,
  searchAllKnowledgeBases,
  vectorSearchAll,
  hybridSearchAll,
  listKnowledgeChunks,
  getKnowledgeGraph,
  getEntityGraph,
  getRevectorizeStatus,
} from '../services/kb.js';
import { listEmbeddingModels, getEmbeddingConfig, embedText } from '../services/ollama-embed.js';
import {
  listImConnectors,
  createImConnector,
  updateImConnector,
  deleteImConnector,
  sendImMessage,
  testImConnector,
} from '../services/im.js';
import {
  listSourcesForAgent,
  listOntologiesForAgent,
  searchOntologiesForAgent,
  queryDataForAgent,
  paginateDataForAgent,
  overviewOntologiesForAgent,
  briefOntologyForAgent,
  detailOntologyForAgent,
  ontologyValuesForAgent,
} from '../services/data-query.js';
import type { QueryIntent } from '../services/ontology-compiler.js';
import { setJsExecDataBridge } from '@yan-zhi/core';

export interface MpcToolExecutionResult {
  content: Array<{ type: string; text: string }>;
  isError: boolean;
}

function ok(value: unknown): MpcToolExecutionResult {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
    isError: false,
  };
}

function fail(message: string): MpcToolExecutionResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function str(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return value == null ? '' : String(value);
}

function num(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = Number(args[key]);
  return Number.isFinite(value) ? value : fallback;
}

function arr(args: Record<string, unknown>, key: string): unknown[] {
  return Array.isArray(args[key]) ? (args[key] as unknown[]) : [];
}

function obj(args: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = args[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function memBytesToVec(b: Uint8Array | Buffer | null): number[] | null {
  if (!b) return null;
  try { return Array.from(new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4)); } catch { return null; }
}
function memVecToBytes(v: number[] | null): Buffer | null {
  if (!v || !v.length) return null;
  return Buffer.from(new Float32Array(v).buffer);
}
function memCosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function requireUser(userId?: string): string {
  if (!userId) {
    throw new Error('该接口需要登录用户上下文，请在 MCP 请求中携带 Authorization Bearer token');
  }
  return userId;
}

/** conversation_file 行 → camelCase 输出（与 /api/conversations/:id/files 保持一致） */
function rowToFile(r: any) {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    spaceId: r.space_id,
    name: r.name,
    path: r.path,
    category: r.category,
    mimeType: r.mime_type,
    size: r.size,
    source: r.source,
    messageId: r.message_id,
    createdAt: r.created_at,
  };
}

/** 服务端实际实现了执行逻辑的 api_* 工具清单，未列出的名称应被配置层过滤。 */
export const SUPPORTED_API_TOOLS = new Set([
  'api_agent_list', 'api_agent_get', 'api_agent_create', 'api_agent_update', 'api_agent_delete', 'api_agent_mount',
  'api_conversation_list', 'api_conversation_get', 'api_conversation_create', 'api_conversation_update', 'api_conversation_delete',
  'api_conversation_file_list', 'api_conversation_file_add', 'api_conversation_file_update', 'api_conversation_file_delete',
  'api_message_list', 'api_message_send', 'api_message_delete',
  'api_platform_list', 'api_platform_create', 'api_platform_update', 'api_platform_delete',
  'api_model_list', 'api_model_create', 'api_model_update', 'api_model_delete',
  'api_mcp_server_list', 'api_mcp_server_create', 'api_mcp_server_update', 'api_mcp_server_delete', 'api_mcp_tool_list', 'api_mcp_tool_toggle',
  'api_skill_list', 'api_skill_get', 'api_skill_toggle', 'api_skill_install', 'api_skill_delete',
  'api_skill_create', 'api_skill_update',
  'api_custom_tool_list', 'api_custom_tool_get', 'api_custom_tool_create', 'api_custom_tool_update', 'api_custom_tool_delete', 'api_custom_tool_toggle',
  'api_builtin_tool_list',
  'api_custom_tool_execute', 'api_tool_ocr', 'api_tool_install',
  'api_marketplace_sources', 'api_marketplace_add_source', 'api_marketplace_delete_source', 'api_marketplace_browse', 'api_marketplace_install',
  'api_workspace_list_dir', 'api_workspace_search_files',
  'api_memory_search', 'api_memory_list', 'api_memory_create', 'api_memory_delete',
  'api_file_list', 'api_file_set_category',
  'api_peer_register', 'api_peer_list', 'api_peer_ping', 'api_chat_send', 'api_chat_poll',
  'api_im_connector_list', 'api_im_connector_create', 'api_im_connector_update', 'api_im_connector_delete', 'api_im_send',
  'api_im_connector_test',
  'api_kb_list', 'api_kb_create', 'api_kb_update', 'api_kb_delete',
  'api_kb_document_add', 'api_kb_document_list', 'api_kb_document_delete', 'api_kb_search',
  'api_kb_builtin_guide_reset',
  'api_kb_search_all', 'api_kb_multi_hop', 'api_kb_entity_search', 'api_kb_chunks',
  'api_kb_graph', 'api_kb_entity_graph', 'api_kb_embedding_model', 'api_kb_revectorize_status',
  // 定时任务
  'api_scheduled_task_list', 'api_scheduled_task_create', 'api_scheduled_task_update', 'api_scheduled_task_delete', 'api_scheduled_task_run',
  // 本地模型（Ollama）
  'api_ollama_list', 'api_ollama_pull', 'api_ollama_pull_status', 'api_ollama_delete', 'api_ollama_test',
  // Git
  'api_git_status', 'api_git_diff', 'api_git_log', 'api_git_branches', 'api_git_add', 'api_git_commit',
  'api_git_push', 'api_git_pull', 'api_git_checkout', 'api_git_restore', 'api_git_read_file', 'api_git_show',
  // 插件
  'api_plugin_list', 'api_plugin_get', 'api_plugin_enable', 'api_plugin_disable', 'api_plugin_set_config', 'api_plugin_uninstall',
  // 空间
  'api_space_list', 'api_space_create', 'api_space_update', 'api_space_delete',
  // 数据查询（P4.1/P4.2：数据源 / 本体上下文链 / 只读取数 / 翻页）
  'api_datasource_list', 'api_ontology_search', 'api_ontology_list', 'api_data_query', 'api_data_paginate',
  'api_ontology_overview', 'api_ontology_brief', 'api_ontology_detail', 'api_ontology_values',
]);

/** 本体挂载范围：任务显式下发优先；否则读 server agent 表；均无 = undefined 不限 */
function agentOntologyIds(userId: string | undefined, agentId: string | undefined, explicit?: string[]): string[] | undefined {
  if (explicit && explicit.length) return explicit;
  if (!agentId || !userId) return undefined;
  try {
    const row = db.prepare('SELECT ontology_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as
      | { ontology_ids?: string | null }
      | undefined;
    const ids = JSON.parse(row?.ontology_ids || '[]');
    return Array.isArray(ids) && ids.length ? ids.map(String) : undefined;
  } catch {
    return undefined;
  }
}

// js_exec 沙箱桥接：脚本内 dataQuery({sql, datasourceId?, limit?}) → 只读数据查询服务。
// 本机单租户场景按 guest 身份取数（与工具面板数据一致）；只读护栏 + 行数上限在服务内强制。
setJsExecDataBridge(async (args: { datasourceId?: string; sql: string; limit?: number }) => {
  const r = await queryDataForAgent('guest', {
    ...(args.datasourceId ? { datasourceId: args.datasourceId } : {}),
    sql: String(args.sql || ''),
    limit: Math.min(Math.max(Number(args.limit) || 200, 1), 1000),
  });
  return { columns: r.columns, rows: r.rows, rowCount: r.rowCount, truncated: r.truncated, sql: r.sql };
});

export async function executeApiTool(
  name: string,
  args: Record<string, unknown>,
  userId?: string,
  agentId?: string,
  /** 任务级显式挂载（前端随 /llm/tasks 下发）；给出时优先于 server agent 表读取 */
  explicitOntologyIds?: string[],
): Promise<MpcToolExecutionResult> {
  try {
    switch (name) {
      // Agent
      case 'api_agent_list':
        return ok(db.prepare('SELECT id, name, description, type, version, is_public FROM agent ORDER BY created_at DESC').all());
      case 'api_agent_get':
        return ok(db.prepare('SELECT * FROM agent WHERE id = ?').get(str(args, 'id')) || null);
      case 'api_agent_create': {
        const id = uuid();
        const ts = Date.now();
        db.prepare(
          `INSERT INTO agent (id, name, description, system_prompt, type, workflow_json, inputs_schema_json, config_json, is_public, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, '{"nodes":[],"edges":[]}', ?, ?, 0, 1, ?, ?)`,
        ).run(
          id,
          str(args, 'name'),
          str(args, 'description') || null,
          str(args, 'systemPrompt') || null,
          str(args, 'type') || 'harness',
          JSON.stringify(obj(args, 'inputsSchema') || {}),
          JSON.stringify(obj(args, 'config') || {}),
          ts,
          ts,
        );
        return ok(db.prepare('SELECT * FROM agent WHERE id = ?').get(id));
      }
      case 'api_agent_update': {
        const id = str(args, 'id');
        const sets: string[] = [];
        const vals: any[] = [];
        if (args.name !== undefined) { sets.push('name = ?'); vals.push(args.name); }
        if (args.systemPrompt !== undefined) { sets.push('system_prompt = ?'); vals.push(args.systemPrompt); }
        sets.push('updated_at = ?');
        vals.push(Date.now(), id);
        db.prepare(`UPDATE agent SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
        return ok(db.prepare('SELECT * FROM agent WHERE id = ?').get(id));
      }
      case 'api_agent_delete':
        db.prepare('DELETE FROM agent WHERE id = ?').run(str(args, 'id'));
        return ok({ deleted: true });
      case 'api_agent_mount': {
        const id = str(args, 'id');
        db.prepare(
          `UPDATE agent SET builtin_tool_ids = ?, custom_tool_ids = ?, mcp_tool_mounts = ?, skill_ids = ?, sub_agent_ids = ?, updated_at = ? WHERE id = ?`,
        ).run(
          JSON.stringify(arr(args, 'builtinToolIds')),
          JSON.stringify(arr(args, 'customToolIds')),
          JSON.stringify(arr(args, 'mcpToolMounts')),
          JSON.stringify(arr(args, 'skillIds')),
          JSON.stringify(arr(args, 'subAgentIds')),
          Date.now(),
          id,
        );
        return ok(db.prepare('SELECT * FROM agent WHERE id = ?').get(id));
      }

      // Conversation
      case 'api_conversation_list': {
        const uid = requireUser(userId);
        return ok(db.prepare('SELECT * FROM conversation WHERE user_id = ? ORDER BY updated_at DESC').all(uid));
      }
      case 'api_conversation_get':
        return ok(db.prepare('SELECT * FROM conversation WHERE id = ? AND user_id = ?').get(str(args, 'id'), requireUser(userId)) || null);
      case 'api_conversation_create': {
        const uid = requireUser(userId);
        const id = uuid();
        const ts = Date.now();
        db.prepare(
          `INSERT INTO conversation (id, user_id, title, agent_id, platform_id, model_id, space_id, mcp_servers_json, skill_ids_json, pinned, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, '[]', '[]', 0, ?, ?)`,
        ).run(id, uid, str(args, 'title'), str(args, 'agentId') || null, str(args, 'platformId') || null, str(args, 'modelId') || null, str(args, 'spaceId') || null, ts, ts);
        return ok(db.prepare('SELECT * FROM conversation WHERE id = ?').get(id));
      }
      case 'api_conversation_update': {
        const uid = requireUser(userId);
        const id = str(args, 'id');
        const sets: string[] = [];
        const vals: any[] = [];
        if (args.title !== undefined) { sets.push('title = ?'); vals.push(args.title); }
        if (args.pinned !== undefined) { sets.push('pinned = ?'); vals.push(args.pinned ? 1 : 0); }
        sets.push('updated_at = ?');
        vals.push(Date.now(), id, uid);
        db.prepare(`UPDATE conversation SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
        return ok(db.prepare('SELECT * FROM conversation WHERE id = ?').get(id));
      }
      case 'api_conversation_delete': {
        const uid = requireUser(userId);
        const id = str(args, 'id');
        db.prepare('DELETE FROM message WHERE conversation_id = ? AND user_id = ?').run(id, uid);
        db.prepare('DELETE FROM conversation WHERE id = ? AND user_id = ?').run(id, uid);
        return ok({ deleted: true });
      }
      case 'api_conversation_file_list': {
        const uid = requireUser(userId);
        const cid = str(args, 'conversationId');
        const conv = db.prepare('SELECT id FROM conversation WHERE id = ? AND user_id = ?').get(cid, uid);
        if (!conv) return fail('会话不存在');
        return ok(db.prepare('SELECT * FROM conversation_file WHERE conversation_id = ? ORDER BY category ASC, created_at ASC').all(cid).map(rowToFile));
      }
      case 'api_conversation_file_add': {
        const uid = requireUser(userId);
        const cid = str(args, 'conversationId');
        const conv = db.prepare('SELECT id, space_id FROM conversation WHERE id = ? AND user_id = ?').get(cid, uid) as any;
        if (!conv) return fail('会话不存在');
        const name = str(args, 'name');
        const fpath = str(args, 'path');
        if (!name || !fpath) return fail('name 和 path 为必填项');
        const id = uuid();
        db.prepare(
          `INSERT INTO conversation_file (id, conversation_id, user_id, space_id, name, path, category, mime_type, size, source, message_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          cid,
          uid,
          conv.space_id || null,
          name,
          fpath,
          str(args, 'category') || 'intermediate',
          str(args, 'mimeType') || null,
          num(args, 'size', 0),
          str(args, 'source') || 'agent',
          str(args, 'messageId') || null,
          Date.now(),
        );
        return ok(rowToFile(db.prepare('SELECT * FROM conversation_file WHERE id = ?').get(id)));
      }
      case 'api_conversation_file_update': {
        const uid = requireUser(userId);
        const cid = str(args, 'conversationId');
        const fileId = str(args, 'fileId');
        const existing = db.prepare('SELECT * FROM conversation_file WHERE id = ? AND conversation_id = ? AND user_id = ?').get(fileId, cid, uid);
        if (!existing) return fail('文件不存在');
        const sets: string[] = [];
        const vals: any[] = [];
        if (args.category !== undefined) { sets.push('category = ?'); vals.push(args.category); }
        if (args.name !== undefined) { sets.push('name = ?'); vals.push(args.name); }
        if (args.path !== undefined) { sets.push('path = ?'); vals.push(args.path); }
        if (sets.length > 0) {
          vals.push(fileId);
          db.prepare(`UPDATE conversation_file SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
        }
        return ok(rowToFile(db.prepare('SELECT * FROM conversation_file WHERE id = ?').get(fileId)));
      }
      case 'api_conversation_file_delete': {
        const uid = requireUser(userId);
        const cid = str(args, 'conversationId');
        const fileId = str(args, 'fileId');
        const existing = db.prepare('SELECT * FROM conversation_file WHERE id = ? AND conversation_id = ? AND user_id = ?').get(fileId, cid, uid);
        if (!existing) return fail('文件不存在');
        db.prepare('DELETE FROM conversation_file WHERE id = ?').run(fileId);
        return ok({ deleted: true });
      }

      // Message
      case 'api_message_list': {
        const uid = requireUser(userId);
        return ok(db.prepare(
          'SELECT m.* FROM message m JOIN conversation c ON c.id = m.conversation_id WHERE m.conversation_id = ? AND m.user_id = ? ORDER BY m.created_at ASC',
        ).all(str(args, 'conversationId'), uid));
      }
      case 'api_message_send': {
        const uid = requireUser(userId);
        const cid = str(args, 'conversationId');
        const conv = db.prepare('SELECT id FROM conversation WHERE id = ? AND user_id = ?').get(cid, uid);
        if (!conv) return fail('会话不存在');
        const id = uuid();
        const ts = Date.now();
        db.prepare(
          `INSERT INTO message (id, conversation_id, user_id, role, content, tool_calls_json, tool_call_id, reasoning_content, tokens, created_at)
           VALUES (?, ?, ?, 'user', ?, NULL, NULL, NULL, 0, ?)`,
        ).run(id, cid, uid, str(args, 'content'), ts);
        db.prepare('UPDATE conversation SET updated_at = ? WHERE id = ?').run(ts, cid);
        return ok(db.prepare('SELECT * FROM message WHERE id = ?').get(id));
      }
      case 'api_message_delete': {
        const uid = requireUser(userId);
        db.prepare('DELETE FROM message WHERE id = ? AND user_id = ?').run(str(args, 'id'), uid);
        return ok({ deleted: true });
      }

      // Platform / model
      case 'api_platform_list':
        return ok(db.prepare('SELECT * FROM platform WHERE user_id = ? ORDER BY created_at DESC').all(requireUser(userId)));
      case 'api_platform_create': {
        const uid = requireUser(userId);
        const id = uuid();
        db.prepare(
          'INSERT INTO platform (id, user_id, name, protocol, api_url, api_key_enc, headers_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)',
        ).run(id, uid, str(args, 'name'), str(args, 'protocol') || 'openai', str(args, 'apiUrl') || null, str(args, 'apiKeyEnc') || null, '{}', Date.now());
        return ok(db.prepare('SELECT * FROM platform WHERE id = ?').get(id));
      }
      case 'api_platform_update': {
        const uid = requireUser(userId);
        const id = str(args, 'id');
        const sets: string[] = [];
        const vals: any[] = [];
        if (args.name !== undefined) { sets.push('name = ?'); vals.push(args.name); }
        if (args.apiUrl !== undefined) { sets.push('api_url = ?'); vals.push(args.apiUrl); }
        sets.push('updated_at = ?');
        vals.push(Date.now(), id, uid);
        db.prepare(`UPDATE platform SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
        return ok(db.prepare('SELECT * FROM platform WHERE id = ?').get(id));
      }
      case 'api_platform_delete': {
        const uid = requireUser(userId);
        const id = str(args, 'id');
        db.prepare('DELETE FROM model WHERE platform_id = ? AND user_id = ?').run(id, uid);
        db.prepare('DELETE FROM platform WHERE id = ? AND user_id = ?').run(id, uid);
        return ok({ deleted: true });
      }
      case 'api_model_list': {
        const uid = requireUser(userId);
        if (str(args, 'platformId')) return ok(db.prepare('SELECT * FROM model WHERE platform_id = ? AND user_id = ?').all(str(args, 'platformId'), uid));
        return ok(db.prepare('SELECT * FROM model WHERE user_id = ?').all(uid));
      }
      case 'api_model_create': {
        const uid = requireUser(userId);
        const id = uuid();
        db.prepare(
          'INSERT INTO model (id, platform_id, user_id, model_id, alias, type, context_window, capabilities_json, pricing_json, description, enabled, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)',
        ).run(id, str(args, 'platformId'), uid, str(args, 'modelId'), str(args, 'alias') || null, str(args, 'type') || 'llm', num(args, 'contextWindow', 8000), '[]', '{}', str(args, 'description') || null, Date.now());
        return ok(db.prepare('SELECT * FROM model WHERE id = ?').get(id));
      }
      case 'api_model_update': {
        const uid = requireUser(userId);
        const id = str(args, 'id');
        const sets: string[] = [];
        const vals: any[] = [];
        if (args.alias !== undefined) { sets.push('alias = ?'); vals.push(args.alias); }
        if (args.enabled !== undefined) { sets.push('enabled = ?'); vals.push(args.enabled ? 1 : 0); }
        if (args.type !== undefined) { sets.push('type = ?'); vals.push(args.type); }
        if (args.contextWindow !== undefined) { sets.push('context_window = ?'); vals.push(args.contextWindow); }
        if (args.description !== undefined) { sets.push('description = ?'); vals.push(args.description); }
        if (sets.length === 0) return ok(db.prepare('SELECT * FROM model WHERE id = ?').get(id));
        vals.push(id, uid);
        db.prepare(`UPDATE model SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
        return ok(db.prepare('SELECT * FROM model WHERE id = ?').get(id));
      }
      case 'api_model_delete': {
        db.prepare('DELETE FROM model WHERE id = ? AND user_id = ?').run(str(args, 'id'), requireUser(userId));
        return ok({ deleted: true });
      }

      // MCP servers
      case 'api_mcp_server_list':
        return ok(db.prepare('SELECT * FROM mcp_server WHERE user_id = ? ORDER BY created_at DESC').all(requireUser(userId)));
      case 'api_mcp_server_create': {
        const uid = requireUser(userId);
        const id = uuid();
        db.prepare(
          `INSERT INTO mcp_server (id, user_id, name, transport, command, args_json, env_json, url, headers_json, auto_reconnect, reconnect_interval, auto_connect, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', 1, 5000, 0, ?)`,
        ).run(id, uid, str(args, 'name'), str(args, 'transport'), str(args, 'command') || null, JSON.stringify(arr(args, 'args')), JSON.stringify(obj(args, 'env')), str(args, 'url') || null, Date.now());
        return ok(db.prepare('SELECT * FROM mcp_server WHERE id = ?').get(id));
      }
      case 'api_mcp_server_update': {
        const uid = requireUser(userId);
        const id = str(args, 'id');
        const sets: string[] = [];
        const vals: any[] = [];
        if (args.name !== undefined) { sets.push('name = ?'); vals.push(args.name); }
        if (args.url !== undefined) { sets.push('url = ?'); vals.push(args.url); }
        if (sets.length === 0) return ok(db.prepare('SELECT * FROM mcp_server WHERE id = ?').get(id));
        vals.push(id, uid);
        db.prepare(`UPDATE mcp_server SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
        return ok(db.prepare('SELECT * FROM mcp_server WHERE id = ?').get(id));
      }
      case 'api_mcp_server_delete':
        db.prepare('DELETE FROM mcp_server WHERE id = ? AND user_id = ?').run(str(args, 'id'), requireUser(userId));
        return ok({ deleted: true });
      case 'api_mcp_tool_list': {
        requireUser(userId);
        return ok(db.prepare('SELECT * FROM mcp_tool WHERE mcp_server_id = ?').all(str(args, 'serverId')));
      }
      case 'api_mcp_tool_toggle': {
        requireUser(userId);
        db.prepare('UPDATE mcp_tool SET enabled = ? WHERE mcp_server_id = ? AND name = ?').run(args.enabled ? 1 : 0, str(args, 'serverId'), str(args, 'toolName'));
        return ok({ updated: true });
      }

      // Skill
      case 'api_skill_list':
        return ok(db.prepare('SELECT * FROM skill WHERE user_id = ? ORDER BY created_at DESC').all(requireUser(userId)));
      case 'api_skill_get':
        return ok(db.prepare('SELECT * FROM skill WHERE id = ? AND user_id = ?').get(str(args, 'id'), requireUser(userId)) || null);
      case 'api_skill_toggle': {
        db.prepare('UPDATE skill SET enabled = ? WHERE id = ? AND user_id = ?').run(args.enabled ? 1 : 0, str(args, 'id'), requireUser(userId));
        return ok({ updated: true });
      }
      case 'api_skill_install': {
        const uid = requireUser(userId);
        const itemId = str(args, 'marketplaceId');
        const url = `/api/marketplace/skills/${encodeURIComponent(itemId)}`;
        const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3001';
        const resp = await fetch(`${base}${url}`);
        const data = await resp.json();
        if (!data.success || !data.data) return fail('远程 Skill 不存在');
        const s = data.data;
        const id = uuid();
        db.prepare(
          'INSERT INTO skill (id, user_id, name, description, triggers_json, body, category, enabled, source, installs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?)',
        ).run(id, uid, s.name, s.description || null, JSON.stringify(s.triggers || []), s.body, s.category || null, 'market', Date.now());
        return ok(db.prepare('SELECT * FROM skill WHERE id = ?').get(id));
      }
      case 'api_skill_delete':
        db.prepare('DELETE FROM skill WHERE id = ? AND user_id = ?').run(str(args, 'id'), requireUser(userId));
        return ok({ deleted: true });

      // Custom tool
      case 'api_custom_tool_list':
        return ok(db.prepare('SELECT * FROM custom_tool WHERE user_id = ? ORDER BY created_at DESC').all(requireUser(userId)));
      case 'api_custom_tool_get':
        return ok(db.prepare('SELECT * FROM custom_tool WHERE id = ? AND user_id = ?').get(str(args, 'id'), requireUser(userId)) || null);
      case 'api_custom_tool_create': {
        const uid = requireUser(userId);
        const id = uuid();
        const ts = Date.now();
        db.prepare(
          `INSERT INTO custom_tool (id, user_id, name, description, input_schema_json, output_schema_json, runtime, entry, code, dependencies_json, timeout, env_json, enabled, source, is_public, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'node', ?, ?, '[]', ?, '{}', 1, 'local', 0, ?, ?)`,
        ).run(id, uid, str(args, 'name'), str(args, 'description') || null, JSON.stringify(obj(args, 'inputSchema') || {}), null, str(args, 'entry'), str(args, 'code'), num(args, 'timeout', 30000), ts, ts);
        return ok(db.prepare('SELECT * FROM custom_tool WHERE id = ?').get(id));
      }
      case 'api_custom_tool_update': {
        const uid = requireUser(userId);
        const id = str(args, 'id');
        const sets: string[] = [];
        const vals: any[] = [];
        if (args.code !== undefined) { sets.push('code = ?'); vals.push(args.code); }
        if (args.description !== undefined) { sets.push('description = ?'); vals.push(args.description); }
        sets.push('updated_at = ?');
        vals.push(Date.now(), id, uid);
        db.prepare(`UPDATE custom_tool SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...vals);
        return ok(db.prepare('SELECT * FROM custom_tool WHERE id = ?').get(id));
      }
      case 'api_custom_tool_delete':
        db.prepare('DELETE FROM custom_tool WHERE id = ? AND user_id = ?').run(str(args, 'id'), requireUser(userId));
        return ok({ deleted: true });
      case 'api_custom_tool_toggle':
        db.prepare('UPDATE custom_tool SET enabled = ? WHERE id = ? AND user_id = ?').run(args.enabled ? 1 : 0, str(args, 'id'), requireUser(userId));
        return ok({ updated: true });
      case 'api_builtin_tool_list':
        return ok(getBuiltinToolDefinitions());

      // Marketplace
      case 'api_marketplace_sources':
        return ok(db.prepare('SELECT * FROM remote_marketplace WHERE user_id = ? ORDER BY created_at DESC').all(requireUser(userId)));
      case 'api_marketplace_add_source': {
        const uid = requireUser(userId);
        const id = uuid();
        db.prepare(
          'INSERT INTO remote_marketplace (id, user_id, name, type, base_url, auth_type, auth_config_enc, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)',
        ).run(id, uid, str(args, 'name'), str(args, 'type'), str(args, 'baseUrl'), str(args, 'authType') || 'none', null, Date.now());
        return ok(db.prepare('SELECT * FROM remote_marketplace WHERE id = ?').get(id));
      }
      case 'api_marketplace_delete_source':
        db.prepare('DELETE FROM remote_marketplace WHERE id = ? AND user_id = ?').run(str(args, 'id'), requireUser(userId));
        return ok({ deleted: true });
      case 'api_marketplace_browse': {
        requireUser(userId);
        const source = db.prepare('SELECT * FROM remote_marketplace WHERE id = ?').get(str(args, 'sourceId')) as any;
        if (!source) return fail('远程源不存在');
        const url = `${source.base_url.replace(/\/$/, '')}/api/marketplace/${source.type}s?page=${num(args, 'page', 1)}`;
        const resp = await fetch(url);
        return ok(await resp.json());
      }
      case 'api_marketplace_install': {
        requireUser(userId);
        const source = db.prepare('SELECT * FROM remote_marketplace WHERE id = ?').get(str(args, 'sourceId')) as any;
        if (!source) return fail('远程源不存在');
        const itemId = str(args, 'itemId');
        const url = `${source.base_url.replace(/\/$/, '')}/api/marketplace/${source.type}s/${encodeURIComponent(itemId)}`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (!data.success || !data.data) return fail('远程项目不存在');
        return ok(data.data);
      }

      // Workspace
      case 'api_workspace_list_dir':
        return ok(await listWorkspaceDir(str(args, 'path')));
      case 'api_workspace_search_files':
        return ok(await searchWorkspaceFiles(str(args, 'pattern')));

      // Memory
      case 'api_memory_search': {
        const uid = requireUser(userId);
        const agentId = str(args, 'agentId');
        const topK = num(args, 'topK', 5);
        const qVec = await embedText(str(args, 'query')).catch(() => null);
        if (qVec) {
          const rows = db.prepare(
            `SELECT * FROM memory WHERE user_id = ? AND (? = '' OR agent_id = ?) AND embedding IS NOT NULL`,
          ).all(uid, agentId, agentId) as any[];
          const scored = rows
            .map((r) => { const v = memBytesToVec(r.embedding); return v ? { r, score: memCosine(qVec, v) } : null; })
            .filter((x): x is { r: any; score: number } => x !== null)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
          if (scored.length) return ok(scored.map((x) => x.r));
        }
        const q = `%${str(args, 'query')}%`;
        const rows = db.prepare(
          `SELECT * FROM memory WHERE user_id = ? AND (? = '' OR agent_id = ?) AND content LIKE ? ORDER BY last_used_at DESC LIMIT ?`,
        ).all(uid, agentId, agentId, q, topK);
        return ok(rows);
      }
      case 'api_memory_list': {
        const uid = requireUser(userId);
        if (str(args, 'agentId')) return ok(db.prepare('SELECT * FROM memory WHERE user_id = ? AND agent_id = ? ORDER BY last_used_at DESC LIMIT ?').all(uid, str(args, 'agentId'), num(args, 'limit', 50)));
        return ok(db.prepare('SELECT * FROM memory WHERE user_id = ? ORDER BY last_used_at DESC LIMIT ?').all(uid, num(args, 'limit', 50)));
      }
      case 'api_memory_create': {
        const uid = requireUser(userId);
        const id = uuid();
        const ts = Date.now();
        const content = str(args, 'content');
        const emb = memVecToBytes(await embedText(content).catch(() => null));
        db.prepare(
          'INSERT INTO memory (id, user_id, agent_id, content, tags_json, metadata_json, embedding, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(id, uid, str(args, 'agentId') || null, content, JSON.stringify(arr(args, 'tags')), '{}', emb, ts, ts);
        bumpMemoryCache(uid);
        return ok(db.prepare('SELECT * FROM memory WHERE id = ?').get(id));
      }
      case 'api_memory_delete': {
        const uid = requireUser(userId);
        db.prepare('DELETE FROM memory WHERE id = ? AND user_id = ?').run(str(args, 'id'), uid);
        bumpMemoryCache(uid);
        return ok({ deleted: true });
      }

      // Conversation files
      case 'api_file_list': {
        const uid = requireUser(userId);
        if (str(args, 'category')) return ok(db.prepare('SELECT * FROM conversation_file WHERE user_id = ? AND category = ? ORDER BY created_at DESC').all(uid, str(args, 'category')));
        return ok(db.prepare('SELECT * FROM conversation_file WHERE user_id = ? ORDER BY created_at DESC').all(uid));
      }
      case 'api_file_set_category': {
        db.prepare('UPDATE conversation_file SET category = ? WHERE id = ? AND user_id = ?').run(str(args, 'category'), str(args, 'fileId'), requireUser(userId));
        return ok({ updated: true });
      }

      // Peer / chat
      case 'api_peer_register':
        return ok(upsertPeer({
          nodeId: str(args, 'nodeId'),
          name: str(args, 'name'),
          baseUrl: str(args, 'baseUrl'),
          capabilities: arr(args, 'capabilities') as string[],
        }, userId));
      case 'api_peer_list':
        return ok(listPeers());
      case 'api_peer_ping':
        return ok(pingPeer(str(args, 'nodeId')));
      case 'api_chat_send':
        return ok(sendPeerMessage({
          fromPeerId: str(args, 'fromPeerId'),
          toPeerId: str(args, 'toPeerId'),
          content: str(args, 'content') || undefined,
          file: args.file,
          senderName: str(args, 'senderName') || undefined,
        }));
      case 'api_chat_poll':
        return ok(pollPeerMessages(str(args, 'peerId'), num(args, 'since', 0), num(args, 'limit', 100)));

      // IM
      case 'api_im_connector_list':
        return ok(listImConnectors(requireUser(userId)));
      case 'api_im_connector_create':
        return ok(createImConnector(requireUser(userId), {
          provider: str(args, 'provider'),
          name: str(args, 'name'),
          config: obj(args, 'config'),
          enabled: args.enabled === undefined ? true : !!args.enabled,
        }));
      case 'api_im_connector_update':
        return ok(updateImConnector(requireUser(userId), str(args, 'id'), {
          name: args.name === undefined ? undefined : str(args, 'name'),
          config: obj(args, 'config'),
          enabled: args.enabled === undefined ? undefined : !!args.enabled,
        }));
      case 'api_im_connector_delete':
        deleteImConnector(requireUser(userId), str(args, 'id'));
        return ok({ deleted: true });
      case 'api_im_send':
        return ok(await sendImMessage(requireUser(userId), str(args, 'connectorId'), {
          to: str(args, 'to'),
          content: str(args, 'content') || undefined,
          file: args.file as any,
          receiveIdType: str(args, 'receiveIdType') || undefined,
        }));

      // Knowledge base
      case 'api_kb_list':
        return ok(listMountedKnowledgeBases(requireUser(userId)));
      case 'api_kb_create':
        return ok(createKnowledgeBase(requireUser(userId), {
          name: str(args, 'name'),
          description: str(args, 'description') || undefined,
        }));
      case 'api_kb_update':
        return ok(updateKnowledgeBase(requireUser(userId), str(args, 'id'), {
          name: args.name === undefined ? undefined : str(args, 'name'),
          description: args.description === undefined ? undefined : str(args, 'description'),
        }));
      case 'api_kb_delete':
        deleteKnowledgeBase(requireUser(userId), str(args, 'id'));
        return ok({ deleted: true });
      case 'api_kb_document_add':
        return ok(await addKnowledgeDoc(requireUser(userId), str(args, 'baseId'), {
          name: str(args, 'name'),
          content: str(args, 'content') || undefined,
          sourcePath: str(args, 'sourcePath') || undefined,
        }));
      case 'api_kb_document_list':
        return ok(listKnowledgeDocs(requireUser(userId), str(args, 'baseId')));
      case 'api_kb_document_delete':
        deleteKnowledgeDoc(requireUser(userId), str(args, 'docId'));
        return ok({ deleted: true });
      case 'api_kb_search': {
        const q = str(args, 'query');
        const baseIds = (arr(args, 'baseIds') as string[]).map((b) => String(b)).filter(Boolean);
        const hops = num(args, 'hops', 3);
        // 实体导向多跳查询，按知识库分组返回（{ 库id: [切片...] }）；单库/多库指定都走同一逻辑，天然分组
        const grouped = entityGraphSearchGrouped(requireUser(userId), q, baseIds, hops, num(args, 'topK', 3));
        const total = Object.values(grouped).reduce((s: number, a: any[]) => s + a.length, 0);
        if (total > 0) return ok({ grouped, total });
        // 实体图谱为空（未抽取/无实体）→ 退化关键词多跳，按库分组
        const kw = multiHopSearchKnowledge(requireUser(userId), q, num(args, 'topK', 3), hops);
        const kwGrouped: Record<string, any[]> = {};
        for (const c of kw) {
          if (baseIds.length && !baseIds.includes(c.baseId)) continue;
          (kwGrouped[c.baseId] ||= []).push(c);
        }
        const kwTotal = Object.values(kwGrouped).reduce((s: number, a: any[]) => s + a.length, 0);
        return ok({ grouped: kwGrouped, total: kwTotal });
      }
      case 'api_kb_builtin_guide_reset': {
        const uid = requireUser(userId);
        const data = resetBuiltinAppGuide(uid, []);
        // 重置后异步重新抽取实体图谱（本地模型，不阻塞）
        extractEntityGraph('guest', 'builtin-app-guide').catch(() => undefined);
        return ok(data);
      }
      case 'api_kb_search_all': {
        const uid = requireUser(userId);
        const query = str(args, 'query');
        const topK = num(args, 'topK', 5);
        // 与路由一致：RRF 混合检索（关键词+向量融合），向量不可用自动降级关键词
        const { data, mode } = await hybridSearchAll(uid, query, topK);
        return ok({ data, mode });
      }
      case 'api_kb_multi_hop':
        return ok(multiHopSearchKnowledge(
          requireUser(userId),
          str(args, 'query'),
          num(args, 'topK', 3),
          num(args, 'hops', 2),
        ));
      case 'api_kb_entity_search':
        return ok(entityGraphSearch(
          requireUser(userId),
          str(args, 'query'),
          num(args, 'hops', 3),
          num(args, 'topK', 3),
        ));
      case 'api_kb_chunks':
        return ok(listKnowledgeChunks(requireUser(userId), str(args, 'baseId'), str(args, 'docId') || undefined));
      case 'api_kb_graph':
        return ok(getKnowledgeGraph(requireUser(userId), str(args, 'baseId')));
      case 'api_kb_entity_graph':
        return ok(getEntityGraph(requireUser(userId), str(args, 'baseId')));
      case 'api_kb_embedding_model': {
        const { platforms, models } = await listEmbeddingModels();
        return ok({ platforms, models, current: getEmbeddingConfig() });
      }
      case 'api_kb_revectorize_status':
        return ok(getRevectorizeStatus());

      // Scheduled task
      case 'api_scheduled_task_list':
        return ok(db.prepare('SELECT * FROM scheduled_task WHERE user_id = ? ORDER BY created_at DESC').all(requireUser(userId)));
      case 'api_scheduled_task_create': {
        const uid = requireUser(userId);
        const name = str(args, 'name');
        if (!name.trim()) return fail('任务名称为必填项');
        const intervalMinutes = args.intervalMinutes == null ? null : num(args, 'intervalMinutes', 0);
        const cronExpr = args.cronExpr == null ? null : str(args, 'cronExpr');
        const scheduleError = validateTaskSchedule(intervalMinutes, cronExpr);
        if (scheduleError) return fail(scheduleError);
        const id = uuid();
        const now = Date.now();
        const isEnabled = args.enabled === undefined ? true : !!args.enabled;
        db.prepare(
          'INSERT INTO scheduled_task (id, user_id, name, prompt, cron_expr, interval_minutes, conversation_id, agent_id, platform_id, model_id, space_id, enabled, last_run_at, next_run_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)',
        ).run(
          id, uid, name.trim(), str(args, 'prompt') || null, cronExpr, intervalMinutes,
          ownConversationId(uid, str(args, 'conversationId')), str(args, 'agentId') || null,
          str(args, 'platformId') || null, str(args, 'modelId') || null, str(args, 'spaceId') || null,
          isEnabled ? 1 : 0,
          isEnabled ? computeNextRun({ interval_minutes: intervalMinutes, cron_expr: cronExpr }, now) : null,
          now, now,
        );
        refreshScheduledTaskScheduler();
        return ok(db.prepare('SELECT * FROM scheduled_task WHERE id = ?').get(id));
      }
      case 'api_scheduled_task_update': {
        const uid = requireUser(userId);
        const id = str(args, 'id');
        const existing = db.prepare('SELECT * FROM scheduled_task WHERE id = ? AND user_id = ?').get(id, uid) as any;
        if (!existing) return fail('任务不存在');

        const intervalMinutes = args.intervalMinutes !== undefined ? (args.intervalMinutes == null ? null : num(args, 'intervalMinutes', 0)) : existing.interval_minutes;
        const cronExpr = args.cronExpr !== undefined ? (args.cronExpr == null ? null : str(args, 'cronExpr')) : existing.cron_expr;
        const scheduleError = validateTaskSchedule(intervalMinutes, cronExpr);
        if (scheduleError) return fail(scheduleError);

        const sets: string[] = [];
        const vals: any[] = [];
        if (args.name !== undefined) {
          if (!String(args.name).trim()) return fail('任务名称不能为空');
          sets.push('name = ?'); vals.push(String(args.name).trim());
        }
        if (args.prompt !== undefined) { sets.push('prompt = ?'); vals.push(str(args, 'prompt') || null); }
        if (args.cronExpr !== undefined) { sets.push('cron_expr = ?'); vals.push(cronExpr); }
        if (args.intervalMinutes !== undefined) { sets.push('interval_minutes = ?'); vals.push(intervalMinutes); }
        if (args.conversationId !== undefined) { sets.push('conversation_id = ?'); vals.push(ownConversationId(uid, str(args, 'conversationId'))); }
        if (args.agentId !== undefined) { sets.push('agent_id = ?'); vals.push(str(args, 'agentId') || null); }
        if (args.platformId !== undefined) { sets.push('platform_id = ?'); vals.push(str(args, 'platformId') || null); }
        if (args.modelId !== undefined) { sets.push('model_id = ?'); vals.push(str(args, 'modelId') || null); }
        if (args.spaceId !== undefined) { sets.push('space_id = ?'); vals.push(str(args, 'spaceId') || null); }
        if (args.enabled !== undefined) { sets.push('enabled = ?'); vals.push(args.enabled ? 1 : 0); }
        if (sets.length === 0) return ok(existing);

        // 停用清空 next_run_at；调度变化或重新启用时从现在起重算
        const willEnable = args.enabled !== undefined ? !!args.enabled : !!existing.enabled;
        const scheduleChanged =
          (args.cronExpr !== undefined && cronExpr !== existing.cron_expr) ||
          (args.intervalMinutes !== undefined && intervalMinutes !== existing.interval_minutes);
        if (!willEnable) {
          sets.push('next_run_at = NULL');
        } else if (scheduleChanged || (args.enabled !== undefined && willEnable && !existing.enabled)) {
          sets.push('next_run_at = ?'); vals.push(computeNextRun({ interval_minutes: intervalMinutes, cron_expr: cronExpr }, Date.now()));
        }
        sets.push('updated_at = ?'); vals.push(Date.now());
        vals.push(id);
        db.prepare(`UPDATE scheduled_task SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
        refreshScheduledTaskScheduler();
        return ok(db.prepare('SELECT * FROM scheduled_task WHERE id = ?').get(id));
      }
      case 'api_scheduled_task_delete': {
        const uid = requireUser(userId);
        const id = str(args, 'id');
        if (!db.prepare('SELECT * FROM scheduled_task WHERE id = ? AND user_id = ?').get(id, uid)) return fail('任务不存在');
        db.prepare('DELETE FROM scheduled_task WHERE id = ?').run(id);
        refreshScheduledTaskScheduler();
        return ok({ deleted: true });
      }
      case 'api_scheduled_task_run': {
        const uid = requireUser(userId);
        const task = db.prepare('SELECT * FROM scheduled_task WHERE id = ? AND user_id = ?').get(str(args, 'id'), uid) as any;
        if (!task) return fail('任务不存在');
        const result = await runScheduledTask(task);
        if (!result.ok) return fail(result.error || '任务执行失败');
        return ok({ ...result, task: db.prepare('SELECT * FROM scheduled_task WHERE id = ?').get(task.id) });
      }

      // Ollama 本地模型
      case 'api_ollama_list':
        requireUser(userId);
        return ok(await listOllamaMarket());
      case 'api_ollama_pull': {
        requireUser(userId);
        const model = str(args, 'model');
        if (!model) return fail('model 为必填项');
        return ok(pullOllamaModel(model));
      }
      case 'api_ollama_pull_status': {
        requireUser(userId);
        const model = str(args, 'model');
        if (!model) return fail('model 为必填项');
        return ok(getPullStatus(model));
      }
      case 'api_ollama_delete': {
        requireUser(userId);
        const model = str(args, 'model');
        if (!model) return fail('model 为必填项');
        await deleteOllamaModel(model);
        return ok({ deleted: true });
      }
      case 'api_ollama_test': {
        requireUser(userId);
        const model = str(args, 'model');
        if (!model) return fail('model 为必填项');
        return ok({ reply: await testOllamaModel(model) });
      }

      // Git
      case 'api_git_status':
        await requireGitSupport();
        return ok(await gitService.status(str(args, 'repo')));
      case 'api_git_diff':
        await requireGitSupport();
        return ok(await gitService.diff(str(args, 'repo'), {
          file: args.file === undefined ? undefined : str(args, 'file'),
          staged: args.staged === true,
        }));
      case 'api_git_log':
        await requireGitSupport();
        return ok(await gitService.log(str(args, 'repo'), {
          branch: args.branch === undefined ? undefined : str(args, 'branch'),
          n: num(args, 'n', 50),
        }));
      case 'api_git_branches':
        await requireGitSupport();
        return ok(await gitService.branches(str(args, 'repo')));
      case 'api_git_add':
        await requireGitSupport();
        await gitService.add(str(args, 'repo'), arr(args, 'files') as string[]);
        return ok({ ok: true });
      case 'api_git_commit': {
        await requireGitSupport();
        const message = str(args, 'message');
        if (!message) return fail('提交信息不能为空');
        await gitService.commit(str(args, 'repo'), message, args.files === undefined ? undefined : (arr(args, 'files') as string[]));
        return ok({ ok: true });
      }
      case 'api_git_push':
        await requireGitSupport();
        await gitService.push(str(args, 'repo'), args.branch === undefined ? undefined : str(args, 'branch'));
        return ok({ ok: true });
      case 'api_git_pull':
        await requireGitSupport();
        await gitService.pull(str(args, 'repo'), args.branch === undefined ? undefined : str(args, 'branch'));
        return ok({ ok: true });
      case 'api_git_checkout':
        await requireGitSupport();
        await gitService.checkout(str(args, 'repo'), str(args, 'branch'));
        return ok({ ok: true });
      case 'api_git_restore':
        await requireGitSupport();
        await gitService.restore(str(args, 'repo'), arr(args, 'files') as string[]);
        return ok({ ok: true });
      case 'api_git_read_file':
        await requireGitSupport();
        return ok(await gitService.readFile(str(args, 'repo'), str(args, 'path')));
      case 'api_git_show':
        await requireGitSupport();
        return ok(await gitService.show(str(args, 'repo'), str(args, 'path'), str(args, 'ref') || 'HEAD'));

      // Plugin
      case 'api_plugin_list': {
        requireUser(userId);
        const { getPluginManager } = await import('@yan-zhi/core');
        return ok(getPluginManager().list().map(pluginInfo));
      }
      case 'api_plugin_get': {
        requireUser(userId);
        const { getPluginManager } = await import('@yan-zhi/core');
        const p = getPluginManager().get(str(args, 'id'));
        return p ? ok(pluginInfo(p)) : fail('插件不存在');
      }
      case 'api_plugin_enable': {
        requireUser(userId);
        const { getPluginManager } = await import('@yan-zhi/core');
        const target = getPluginManager().get(str(args, 'id'));
        // 高危权限插件（如 desktop-input）不允许智能体自行启用，必须用户在插件管理页手动操作
        if (target && (target.manifest.permissions || []).includes('desktop-input')) {
          return fail('该插件含控制鼠标键盘的高危权限，禁止由智能体自行启用，请在「插件管理」页手动开启');
        }
        await getPluginManager().enable(str(args, 'id'));
        return ok({ ok: true });
      }
      case 'api_plugin_disable': {
        requireUser(userId);
        const { getPluginManager } = await import('@yan-zhi/core');
        await getPluginManager().disable(str(args, 'id'));
        return ok({ ok: true });
      }
      case 'api_plugin_set_config': {
        requireUser(userId);
        const { getPluginManager } = await import('@yan-zhi/core');
        await getPluginManager().setConfig(str(args, 'id'), obj(args, 'config'));
        return ok({ ok: true });
      }
      case 'api_plugin_uninstall': {
        requireUser(userId);
        const { getPluginManager } = await import('@yan-zhi/core');
        await getPluginManager().uninstall(str(args, 'id'));
        return ok({ ok: true });
      }

      // Space
      case 'api_space_list':
        return ok(db.prepare('SELECT * FROM space WHERE user_id = ? ORDER BY sort_order ASC, updated_at DESC').all(requireUser(userId)));
      case 'api_space_create': {
        const uid = requireUser(userId);
        const name = str(args, 'name');
        if (!name) return fail('空间名称为必填项');
        const id = uuid();
        const now = Date.now();
        db.prepare(
          'INSERT INTO space (id, user_id, name, dir_path, description, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(id, uid, name, args.dirPath ? str(args, 'dirPath') : null, args.description ? str(args, 'description') : null, num(args, 'sortOrder', 0), now, now);
        return ok(db.prepare('SELECT * FROM space WHERE id = ?').get(id));
      }
      case 'api_space_update': {
        const uid = requireUser(userId);
        const sid = str(args, 'id');
        if (!db.prepare('SELECT * FROM space WHERE id = ? AND user_id = ?').get(sid, uid)) return fail('空间不存在');
        const sets: string[] = [];
        const vals: any[] = [];
        if (args.name !== undefined) { sets.push('name = ?'); vals.push(str(args, 'name')); }
        if (args.dirPath !== undefined) { sets.push('dir_path = ?'); vals.push(str(args, 'dirPath') || null); }
        if (args.description !== undefined) { sets.push('description = ?'); vals.push(str(args, 'description') || null); }
        if (args.sortOrder !== undefined) { sets.push('sort_order = ?'); vals.push(num(args, 'sortOrder', 0)); }
        if (sets.length === 0) return ok(db.prepare('SELECT * FROM space WHERE id = ?').get(sid));
        sets.push('updated_at = ?'); vals.push(Date.now());
        vals.push(sid);
        db.prepare(`UPDATE space SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
        return ok(db.prepare('SELECT * FROM space WHERE id = ?').get(sid));
      }
      case 'api_space_delete': {
        const uid = requireUser(userId);
        const sid = str(args, 'id');
        if (!db.prepare('SELECT * FROM space WHERE id = ? AND user_id = ?').get(sid, uid)) return fail('空间不存在');
        // 其下会话 space_id 置空归"未归类"，工作目录里的文件不动
        db.prepare('UPDATE conversation SET space_id = NULL WHERE space_id = ? AND user_id = ?').run(sid, uid);
        db.prepare('DELETE FROM space WHERE id = ?').run(sid);
        return ok({ deleted: true });
      }

      // ===== 数据查询（P4.1/P4.2/P4.3）：数据源 / 本体上下文链 / 只读取数 / 翻页 =====
      // agentId 给定时，本体上下文与取数范围收敛到该智能体挂载的本体集合（未挂载 = 不限）。
      case 'api_datasource_list':
        return ok(listSourcesForAgent(requireUser(userId)));
      case 'api_ontology_search':
        return ok(
          await searchOntologiesForAgent(requireUser(userId), str(args, 'question'), {
            ...(str(args, 'datasourceId') ? { datasourceId: str(args, 'datasourceId') } : {}),
            limit: num(args, 'limit', 5),
            allowed: agentOntologyIds(userId, agentId, explicitOntologyIds),
          }),
        );
      case 'api_ontology_list':
        return ok(
          await listOntologiesForAgent(requireUser(userId), {
            ...(str(args, 'datasourceId') ? { datasourceId: str(args, 'datasourceId') } : {}),
            ...(str(args, 'keyword') ? { keyword: str(args, 'keyword') } : {}),
            limit: num(args, 'limit', 20),
            allowed: agentOntologyIds(userId, agentId, explicitOntologyIds),
          }),
        );
      // 本体上下文链（P4.2）：集合总览 → 单体简略 → 懒加载详情 → 属性值/枚举采样
      case 'api_ontology_overview':
        return ok(
          await overviewOntologiesForAgent(requireUser(userId), {
            ...(str(args, 'datasourceId') ? { datasourceId: str(args, 'datasourceId') } : {}),
            allowed: agentOntologyIds(userId, agentId, explicitOntologyIds),
          }),
        );
      case 'api_ontology_brief':
        return ok(await briefOntologyForAgent(requireUser(userId), str(args, 'ontology'), agentOntologyIds(userId, agentId, explicitOntologyIds)));
      case 'api_ontology_detail': {
        const include = obj(args, 'include');
        return ok(
          await detailOntologyForAgent(
            requireUser(userId), str(args, 'ontology'),
            Object.keys(include).length ? include : undefined,
            agentOntologyIds(userId, agentId, explicitOntologyIds),
          ),
        );
      }
      case 'api_ontology_values':
        return ok(await ontologyValuesForAgent(requireUser(userId), str(args, 'ontology'), str(args, 'attr'), num(args, 'limit', 20), agentOntologyIds(userId, agentId, explicitOntologyIds)));
      case 'api_data_query': {
        const intent = obj(args, 'intent');
        return ok(
          await queryDataForAgent(requireUser(userId), {
            ...(str(args, 'datasourceId') ? { datasourceId: str(args, 'datasourceId') } : {}),
            ...(str(args, 'ontology') ? { ontology: str(args, 'ontology') } : {}),
            ...(Object.keys(intent).length ? { intent: intent as QueryIntent } : {}),
            ...(str(args, 'sql') ? { sql: str(args, 'sql') } : {}),
            limit: num(args, 'limit', 100),
            allowed: agentOntologyIds(userId, agentId, explicitOntologyIds),
          }),
        );
      }
      case 'api_data_paginate': {
        const intent = obj(args, 'intent');
        return ok(
          await paginateDataForAgent(requireUser(userId), {
            ...(str(args, 'datasourceId') ? { datasourceId: str(args, 'datasourceId') } : {}),
            ...(str(args, 'ontology') ? { ontology: str(args, 'ontology') } : {}),
            ...(Object.keys(intent).length ? { intent: intent as QueryIntent } : {}),
            ...(str(args, 'sql') ? { sql: str(args, 'sql') } : {}),
            offset: num(args, 'offset', 0),
            limit: num(args, 'limit', 50),
            allowed: agentOntologyIds(userId, agentId, explicitOntologyIds),
          }),
        );
      }

      // Skill 增补：新建 / 更新
      case 'api_skill_create': {
        const uid = requireUser(userId);
        const name = str(args, 'name');
        const body = str(args, 'body');
        if (!name || !body) return fail('名称和 body 为必填项');
        const id = uuid();
        db.prepare(
          'INSERT INTO skill (id, user_id, name, description, triggers_json, body, category, enabled, installs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?)',
        ).run(id, uid, name, args.description ? str(args, 'description') : null, JSON.stringify(arr(args, 'triggers')), body, args.category ? str(args, 'category') : null, Date.now());
        return ok(db.prepare('SELECT * FROM skill WHERE id = ?').get(id));
      }
      case 'api_skill_update': {
        const uid = requireUser(userId);
        const sid = str(args, 'id');
        const existing = db.prepare('SELECT * FROM skill WHERE id = ? AND user_id = ?').get(sid, uid);
        if (!existing) return fail('Skill 不存在');
        const sets: string[] = [];
        const vals: any[] = [];
        if (args.name !== undefined) { sets.push('name = ?'); vals.push(str(args, 'name')); }
        if (args.description !== undefined) { sets.push('description = ?'); vals.push(str(args, 'description')); }
        if (args.body !== undefined) { sets.push('body = ?'); vals.push(str(args, 'body')); }
        if (args.category !== undefined) { sets.push('category = ?'); vals.push(str(args, 'category')); }
        if (args.triggers !== undefined) { sets.push('triggers_json = ?'); vals.push(JSON.stringify(arr(args, 'triggers'))); }
        if (args.enabled !== undefined) { sets.push('enabled = ?'); vals.push(args.enabled ? 1 : 0); }
        if (args.isPublic !== undefined) { sets.push('is_public = ?'); vals.push(args.isPublic ? 1 : 0); }
        if (sets.length === 0) return ok(existing);
        vals.push(sid);
        db.prepare(`UPDATE skill SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
        return ok(db.prepare('SELECT * FROM skill WHERE id = ?').get(sid));
      }

      // 自定义工具增补：执行 / OCR / 从远程安装
      case 'api_custom_tool_execute': {
        const uid = requireUser(userId);
        const t = db.prepare('SELECT * FROM custom_tool WHERE id = ? AND user_id = ?').get(str(args, 'id'), uid) as any;
        if (!t) return fail('工具不存在');
        if (!t.enabled) return fail('工具未启用');
        const { runInSandbox } = await import('@yan-zhi/core');
        return ok(await runInSandbox(t.code, t.entry, obj(args, 'args'), { timeout: t.timeout || 30000 }));
      }
      case 'api_tool_ocr': {
        requireUser(userId);
        const image = str(args, 'image');
        const imgPath = str(args, 'path');
        let buffer: Buffer | null = null;
        if (image) buffer = Buffer.from(image, 'base64');
        else if (imgPath) buffer = await (await import('node:fs/promises')).readFile(imgPath);
        if (!buffer) return fail('需提供 image(base64) 或 path 参数');
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker(str(args, 'lang') || 'chi_sim+eng', 1, { logger: () => {} });
        try {
          const { data } = await worker.recognize(buffer);
          return ok({ text: data.text || '', confidence: data.confidence });
        } finally {
          await worker.terminate();
        }
      }
      case 'api_tool_install': {
        const uid = requireUser(userId);
        const source = db.prepare('SELECT * FROM remote_marketplace WHERE id = ? AND user_id = ?').get(str(args, 'remoteSourceId'), uid) as any;
        if (!source) return fail('远程源不存在');
        const baseUrl = String(source.base_url).replace(/\/$/, '');
        const resp = await fetch(`${baseUrl}/api/marketplace/tools/${encodeURIComponent(str(args, 'toolId'))}`);
        const data = (await resp.json()) as any;
        if (!data.success || !data.data) return fail('远程工具不存在');
        const t = data.data;
        const id = uuid();
        const now = Date.now();
        db.prepare(
          `INSERT INTO custom_tool (id, user_id, name, description, input_schema_json, output_schema_json,
           runtime, entry, code, dependencies_json, timeout, env_json, enabled, source, remote_source_id, is_public, updated_at, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,'remote',?,0,?,?)`,
        ).run(id, uid, t.name, t.description || null, JSON.stringify(t.inputSchema || {}),
          t.outputSchema ? JSON.stringify(t.outputSchema) : null, t.runtime || 'node', t.entry, t.code,
          t.dependencies ? JSON.stringify(t.dependencies) : null, t.timeout || 30000, null,
          str(args, 'remoteSourceId'), now, now);
        return ok(db.prepare('SELECT * FROM custom_tool WHERE id = ?').get(id));
      }

      // IM 增补：测试连接器
      case 'api_im_connector_test':
        return ok(await testImConnector(requireUser(userId), str(args, 'id')));

      default:
        return fail(`未实现的 API 工具: ${name}`);
    }
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

function getBuiltinToolDefinitions() {
  return [
    { name: 'file_read', description: '读取文件内容，支持指定路径和行数范围' },
    { name: 'file_write', description: '写入内容到指定文件路径' },
    { name: 'cmd_exec', description: '执行系统命令' },
    { name: 'ask_user', description: '向用户反问澄清问题并等待回答' },
    { name: 'confirm_user', description: '多页确认向导，逐页收集用户选择、文字回答和补充说明' },
    { name: 'task_plan', description: '创建任务计划并展示进度' },
    { name: 'task_step', description: '更新任务步骤状态' },
    { name: 'configure_model_platform', description: '弹出模型平台/模型配置表单，等待用户填写后创建平台与模型' },
  ];
}

/** 校验定时任务调度配置：interval 优先，其次 cron（5 字段分钟粒度）；返回错误信息或 null */
function validateTaskSchedule(intervalMinutes?: number | null, cronExpr?: string | null): string | null {
  if (intervalMinutes && intervalMinutes > 0) return null;
  if (cronExpr && cronExpr.trim()) {
    return nextCronTime(cronExpr, Date.now()) === null
      ? 'cron 表达式无效（应为 5 字段分钟粒度，如 "30 9 * * *"）'
      : null;
  }
  return '请设置定时间隔（intervalMinutes）或 cron 表达式（cronExpr）';
}

/** 校验会话归属（不属于当前用户时返回 null，避免越权绑定他人会话） */
function ownConversationId(userId: string, conversationId?: string | null): string | null {
  if (!conversationId) return null;
  const conv = db.prepare('SELECT id FROM conversation WHERE id = ? AND user_id = ?').get(conversationId, userId);
  return conv ? conversationId : null;
}

/** Git 能力依赖本地 shell，Web/Mobile 平台不支持 */
async function requireGitSupport(): Promise<void> {
  const { getPlatformAdapter } = await import('@yan-zhi/core');
  if (!getPlatformAdapter().shell) {
    throw new Error('当前平台不支持 Git 操作（仅桌面端/服务端可用）');
  }
}

function pluginInfo(p: any) {
  return { manifest: p.manifest, state: p.state, error: p.error, config: p.config, source: p.source };
}

async function listWorkspaceDir(dirPath: string) {
  const root = path.resolve(dirPath || serverState.workspaceDir || process.cwd());
  const entries = await readdir(root, { withFileTypes: true });
  return Promise.all(
    entries.map(async (entry) => {
      const full = path.join(root, entry.name);
      const info = await stat(full).catch(() => null);
      return {
        name: entry.name,
        path: full,
        isDir: info?.isDirectory() ?? false,
      };
    }),
  );
}

async function searchWorkspaceFiles(pattern: string) {
  if (!pattern) return [];
  const root = serverState.workspaceDir || process.cwd();
  const needle = pattern.replace(/\\/g, '/').toLowerCase();
  const results: string[] = [];
  async function walk(dir: string, depth: number) {
    if (depth > 5 || results.length >= 200) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = full.replace(root + path.sep, '').replace(/\\/g, '/');
      if (rel.toLowerCase().includes(needle)) results.push(rel);
      if (entry.isDirectory()) await walk(full, depth + 1);
    }
  }
  await walk(root, 0);
  return results.slice(0, 200);
}
