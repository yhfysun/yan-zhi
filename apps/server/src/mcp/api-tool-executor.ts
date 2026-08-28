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
} from '../services/kb.js';
import {
  listImConnectors,
  createImConnector,
  updateImConnector,
  deleteImConnector,
  sendImMessage,
} from '../services/im.js';

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

function requireUser(userId?: string): string {
  if (!userId) {
    throw new Error('该接口需要登录用户上下文，请在 MCP 请求中携带 Authorization Bearer token');
  }
  return userId;
}

/** 服务端实际实现了执行逻辑的 api_* 工具清单，未列出的名称应被配置层过滤。 */
export const SUPPORTED_API_TOOLS = new Set([
  'api_agent_list', 'api_agent_get', 'api_agent_create', 'api_agent_update', 'api_agent_delete', 'api_agent_mount',
  'api_conversation_list', 'api_conversation_get', 'api_conversation_create', 'api_conversation_update', 'api_conversation_delete',
  'api_message_list', 'api_message_send', 'api_message_delete',
  'api_platform_list', 'api_platform_create', 'api_platform_update', 'api_platform_delete',
  'api_model_list', 'api_model_create', 'api_model_update', 'api_model_delete',
  'api_mcp_server_list', 'api_mcp_server_create', 'api_mcp_server_update', 'api_mcp_server_delete', 'api_mcp_tool_list', 'api_mcp_tool_toggle',
  'api_skill_list', 'api_skill_get', 'api_skill_toggle', 'api_skill_install', 'api_skill_delete',
  'api_custom_tool_list', 'api_custom_tool_get', 'api_custom_tool_create', 'api_custom_tool_update', 'api_custom_tool_delete', 'api_custom_tool_toggle',
  'api_builtin_tool_list',
  'api_marketplace_sources', 'api_marketplace_add_source', 'api_marketplace_delete_source', 'api_marketplace_browse', 'api_marketplace_install',
  'api_workspace_list_dir', 'api_workspace_search_files',
  'api_memory_search', 'api_memory_list', 'api_memory_create', 'api_memory_delete',
  'api_file_list', 'api_file_set_category',
  'api_peer_register', 'api_peer_list', 'api_peer_ping', 'api_chat_send', 'api_chat_poll',
  'api_im_connector_list', 'api_im_connector_create', 'api_im_connector_update', 'api_im_connector_delete', 'api_im_send',
  'api_kb_list', 'api_kb_create', 'api_kb_update', 'api_kb_delete',
  'api_kb_document_add', 'api_kb_document_list', 'api_kb_document_delete', 'api_kb_search',
]);

export async function executeApiTool(
  name: string,
  args: Record<string, unknown>,
  userId?: string,
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
          'INSERT INTO model (id, platform_id, user_id, model_id, alias, type, context_window, capabilities_json, pricing_json, enabled, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)',
        ).run(id, str(args, 'platformId'), uid, str(args, 'modelId'), str(args, 'alias') || null, str(args, 'type') || 'llm', num(args, 'contextWindow', 8000), '[]', '{}', Date.now());
        return ok(db.prepare('SELECT * FROM model WHERE id = ?').get(id));
      }
      case 'api_model_update': {
        const uid = requireUser(userId);
        const id = str(args, 'id');
        const sets: string[] = [];
        const vals: any[] = [];
        if (args.alias !== undefined) { sets.push('alias = ?'); vals.push(args.alias); }
        if (args.enabled !== undefined) { sets.push('enabled = ?'); vals.push(args.enabled ? 1 : 0); }
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
        const q = `%${str(args, 'query')}%`;
        const rows = db.prepare(
          `SELECT * FROM memory WHERE user_id = ? AND (? = '' OR agent_id = ?) AND content LIKE ? ORDER BY last_used_at DESC LIMIT ?`,
        ).all(uid, str(args, 'agentId'), str(args, 'agentId'), q, num(args, 'topK', 5));
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
        db.prepare(
          'INSERT INTO memory (id, user_id, agent_id, content, tags_json, metadata_json, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(id, uid, str(args, 'agentId') || null, str(args, 'content'), JSON.stringify(arr(args, 'tags')), '{}', ts, ts);
        return ok(db.prepare('SELECT * FROM memory WHERE id = ?').get(id));
      }
      case 'api_memory_delete':
        db.prepare('DELETE FROM memory WHERE id = ? AND user_id = ?').run(str(args, 'id'), requireUser(userId));
        return ok({ deleted: true });

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
    { name: 'web_search', description: '联网搜索，获取实时信息' },
    { name: 'cmd_exec', description: '执行系统命令' },
    { name: 'ask_user', description: '向用户反问澄清问题并等待回答' },
    { name: 'confirm_user', description: '多页确认向导，逐页收集用户选择、文字回答和补充说明' },
    { name: 'task_plan', description: '创建任务计划并展示进度' },
    { name: 'task_step', description: '更新任务步骤状态' },
    { name: 'configure_model_platform', description: '弹出模型平台/模型配置表单，等待用户填写后创建平台与模型' },
  ];
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
