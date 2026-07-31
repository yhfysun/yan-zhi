// MCP store
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { McpServer, McpTransport, McpTool } from '@yan-zhi/shared';
import { getPlatformAdapter, McpClient } from '@yan-zhi/core';
import { uid } from '@yan-zhi/shared';
import { api } from '../api/client';
import { useAuthStore } from './auth';

function rowToServer(r: any): McpServer {
  return {
    id: r.id,
    name: r.name,
    transport: r.transport,
    command: r.command,
    args: r.args_json ? JSON.parse(r.args_json) : [],
    env: r.env_json ? JSON.parse(r.env_json) : {},
    url: r.url,
    headers: r.headers_json ? JSON.parse(r.headers_json) : {},
    status: r.status === 1 ? 'connected' : 'disconnected',
    autoReconnect: !!r.auto_reconnect,
    reconnectInterval: r.reconnect_interval,
    autoConnect: !!r.auto_connect,
  };
}

export const useMcpStore = defineStore('mcp', () => {
  const servers = ref<McpServer[]>([]);
  const tools = ref<Record<string, McpTool[]>>({});
  const resources = ref<Record<string, any[]>>({});
  const prompts = ref<Record<string, any[]>>({});
  const connecting = ref('');
  const logs = ref<Record<string, Array<{ time: number; method: string; ok: boolean; msg?: string }>>>({});
  const mcpTestClient = ref<McpClient | null>(null);

  const clients = new Map<string, McpClient>();
  const on = () => !!useAuthStore().isLoggedIn;

  function isDesktop() {
    try { return !!getPlatformAdapter().mcp; } catch { return false; }
  }

  function cancelTest() {
    mcpTestClient.value?.abort();
    mcpTestClient.value = null;
  }

  async function loadServers() {
    if (on()) {
      const r = await api.get<any[]>('/mcp-servers');
      if ('data' in r) servers.value = (r.data as any[]).map(rowToServer);
      for (const s of servers.value) {
        try {
          const tr = await api.get<any[]>(`/mcp-servers/${s.id}/tools`);
          if ('data' in tr) {
            tools.value[s.id] = (tr.data as any[]).map((t: any) => ({
              id: t.id, mcpServerId: s.id,
              name: t.name, description: t.description,
              alias: t.alias || undefined,
              remark: t.remark || undefined,
              enabled: t.enabled !== 0,
              inputSchema: t.inputSchema || (t.input_schema_json ? JSON.parse(t.input_schema_json) : {}),
            }));
          }
        } catch {
          if (!tools.value[s.id]) tools.value[s.id] = [];
        }
      }
      for (const s of servers.value) {
        if (s.autoConnect) {
          connect(s.id).catch(() => {});
        }
      }
      return;
    }
    const adapter = getPlatformAdapter();
    const rows = await adapter.db.query<any>('SELECT * FROM mcp_server ORDER BY created_at DESC');
    servers.value = rows.map(rowToServer);
    for (const s of servers.value) {
      const toolRows = await adapter.db.query<any>('SELECT * FROM mcp_tool WHERE mcp_server_id = ?', [s.id]);
      tools.value[s.id] = toolRows.map((t: any) => ({
        id: t.id, mcpServerId: s.id,
        name: t.name, description: t.description,
        alias: t.alias || undefined,
        remark: t.remark || undefined,
        enabled: t.enabled !== 0,
        inputSchema: t.input_schema_json ? JSON.parse(t.input_schema_json) : {},
      }));
    }
    const autoConnects = servers.value.filter(s => s.autoConnect).map(s =>
      connect(s.id).catch(() => {})
    );
    if (autoConnects.length > 0) Promise.allSettled(autoConnects);
  }

  async function addServer(data: {
    name: string; transport: McpTransport;
    command?: string; args?: string[]; env?: Record<string, string>;
    url?: string; headers?: Record<string, string>;
    autoReconnect?: boolean; reconnectInterval?: number; autoConnect?: boolean;
  }): Promise<McpServer> {
    if (on()) {
      const r = await api.post<any>('/mcp-servers', data);
      if ('data' in r) {
        const s = rowToServer(r.data);
        servers.value.unshift(s);
        return s;
      }
      throw new Error('添加 MCP 服务失败');
    }
    const adapter = getPlatformAdapter();
    const id = uid('mcp_');
    const row: any[] = [
      id, data.name, data.transport, data.command || null,
      data.args ? JSON.stringify(data.args) : '[]',
      data.env ? JSON.stringify(data.env) : '{}',
      data.url || null,
      data.headers ? JSON.stringify(data.headers) : '{}',
      0, data.autoReconnect !== false ? 1 : 0, data.reconnectInterval || 5000,
      data.autoConnect ? 1 : 0, Date.now(),
    ];
    await adapter.db.exec(
      'INSERT INTO mcp_server (id, name, transport, command, args_json, env_json, url, headers_json, status, auto_reconnect, reconnect_interval, auto_connect, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      row,
    );
    const server: McpServer = {
      id, name: data.name, transport: data.transport,
      command: data.command, args: data.args || [], env: data.env || {},
      url: data.url, headers: data.headers || {},
      status: 'disconnected', autoReconnect: data.autoReconnect !== false,
      reconnectInterval: data.reconnectInterval || 5000, autoConnect: data.autoConnect !== false,
    };
    servers.value.unshift(server);
    return server;
  }

  async function updateServer(id: string, data: {
    name?: string; transport?: McpTransport;
    command?: string; args?: string[]; env?: Record<string, string>;
    url?: string; headers?: Record<string, string>;
    autoReconnect?: boolean; reconnectInterval?: number; autoConnect?: boolean;
  }): Promise<void> {
    const idx = servers.value.findIndex(s => s.id === id);
    if (idx === -1) return;
    if (on()) {
      await api.patch(`/mcp-servers/${id}`, data);
      await loadServers();
      return;
    }
    const adapter = getPlatformAdapter();
    await adapter.db.exec(
      `UPDATE mcp_server SET name=?, transport=?, command=?, args_json=?, env_json=?, url=?, headers_json=?,
       auto_reconnect=?, reconnect_interval=?, auto_connect=? WHERE id=?`,
      [
        data.name ?? servers.value[idx].name,
        data.transport ?? servers.value[idx].transport,
        data.command ?? servers.value[idx].command,
        data.args ? JSON.stringify(data.args) : JSON.stringify(servers.value[idx].args),
        data.env ? JSON.stringify(data.env) : JSON.stringify(servers.value[idx].env),
        data.url ?? servers.value[idx].url,
        data.headers ? JSON.stringify(data.headers) : JSON.stringify(servers.value[idx].headers),
        data.autoReconnect !== undefined ? (data.autoReconnect ? 1 : 0) : (servers.value[idx].autoReconnect ? 1 : 0),
        data.reconnectInterval ?? servers.value[idx].reconnectInterval,
        data.autoConnect !== undefined ? (data.autoConnect ? 1 : 0) : (servers.value[idx].autoConnect ? 1 : 0),
        id,
      ]
    );
    await loadServers();
  }

  async function deleteServer(id: string) {
    await disconnect(id);
    if (on()) {
      await api.delete(`/mcp-servers/${id}`);
    } else {
      const adapter = getPlatformAdapter();
      await adapter.db.exec('DELETE FROM mcp_tool WHERE mcp_server_id = ?', [id]);
      await adapter.db.exec('DELETE FROM mcp_server WHERE id = ?', [id]);
    }
    await loadServers();
  }

  async function connect(id: string): Promise<{ ok: boolean; msg: string }> {
    const s = servers.value.find((x) => x.id === id);
    if (!s) return { ok: false, msg: '服务不存在' };
    if (clients.has(id)) return { ok: true, msg: '已连接' };
    connecting.value = id;
    try {
      const client = new McpClient(s);
      await client.connect();
      clients.set(id, client);
      const list = await client.listTools();
      if (!list || list.length === 0) {
        const existing = tools.value[id];
        if (existing && existing.length > 0) {
          clients.delete(id);
          try { await client.disconnect(); } catch {}
          return { ok: true, msg: `已连接但工具列表为空，保留 ${existing.length} 个缓存工具` };
        }
      }
      tools.value[id] = list || [];
      try { resources.value[id] = await client.listResources(); } catch { resources.value[id] = []; }
      try { prompts.value[id] = await client.listPrompts(); } catch { prompts.value[id] = []; }
      if (!on()) {
        if (list && list.length > 0) {
          const adapter = getPlatformAdapter();
          // 保留已有 alias/remark/enabled
          const oldRows = await adapter.db.query<any>('SELECT name, alias, remark, enabled FROM mcp_tool WHERE mcp_server_id = ?', [id]);
          const oldMeta: Record<string, { alias?: string; remark?: string; enabled?: number }> = {};
          for (const r of oldRows) oldMeta[r.name] = { alias: r.alias, remark: r.remark, enabled: r.enabled };
          await adapter.db.exec('DELETE FROM mcp_tool WHERE mcp_server_id = ?', [id]);
          for (const t of list) {
            const meta = oldMeta[t.name] || {};
            await adapter.db.exec(
              'INSERT INTO mcp_tool (id, mcp_server_id, name, description, input_schema_json, alias, remark, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [uid('mt_'), id, t.name, t.description || null, JSON.stringify(t.inputSchema), meta.alias || null, meta.remark || null, meta.enabled ?? 1],
            );
          }
        }
      }
      if (on()) {
        await api.patch(`/mcp-servers/${id}`, { status: 1 });
        if (list && list.length > 0) {
          await api.put(`/mcp-servers/${id}/tools`, {
            tools: list.map(t => ({
              id: uid('mt_'),
              name: t.name,
              description: t.description || null,
              inputSchema: t.inputSchema || {},
            })),
          }).catch(() => {});
        }
      } else {
        const adapter = getPlatformAdapter();
        await adapter.db.exec('UPDATE mcp_server SET status = ? WHERE id = ?', [1, id]);
      }
      const idx = servers.value.findIndex((x) => x.id === id);
      if (idx !== -1) servers.value[idx] = { ...servers.value[idx], status: 'connected' };
      addLog(id, 'connect', true);
      return { ok: true, msg: `连接成功，${list.length} 个工具` };
    } catch (e: any) {
      let msg = e?.message || '连接失败';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        msg = '网络请求失败，请检查 URL 是否正确或服务器是否允许跨域访问（CORS）';
      }
      // 连接失败时更新状态为 disconnected
      const idx = servers.value.findIndex((x) => x.id === id);
      if (idx !== -1) servers.value[idx] = { ...servers.value[idx], status: 'disconnected' };
      if (on()) {
        api.patch(`/mcp-servers/${id}`, { status: 0 }).catch(() => {});
      } else {
        const adapter = getPlatformAdapter();
        adapter.db.exec('UPDATE mcp_server SET status = ? WHERE id = ?', [0, id]).catch(() => {});
      }
      addLog(id, 'connect', false, e?.message);
      return { ok: false, msg };
    } finally {
      connecting.value = '';
    }
  }

  async function updateToolMeta(serverId: string, toolName: string, meta: { alias?: string; remark?: string }) {
    const list = tools.value[serverId];
    if (!list) return;
    const idx = list.findIndex(t => t.name === toolName);
    if (idx < 0) return;

    const aliased = { ...list[idx], ...meta };
    if (!meta.alias) delete aliased.alias;
    if (!meta.remark) delete aliased.remark;
    list[idx] = aliased;

    if (on()) {
      await api.patch(`/mcp-servers/${serverId}/tools/${encodeURIComponent(toolName)}`, meta).catch(() => {});
    } else {
      const adapter = getPlatformAdapter();
      const sets: string[] = [];
      const vals: any[] = [];
      if (meta.alias !== undefined) { sets.push('alias = ?'); vals.push(meta.alias || null); }
      if (meta.remark !== undefined) { sets.push('remark = ?'); vals.push(meta.remark || null); }
      if (sets.length > 0) {
        vals.push(serverId, toolName);
        await adapter.db.exec(`UPDATE mcp_tool SET ${sets.join(', ')} WHERE mcp_server_id = ? AND name = ?`, vals);
      }
    }
  }

  async function setToolEnabled(serverId: string, toolName: string, enabled: boolean) {
    const list = tools.value[serverId];
    if (!list) return;
    const idx = list.findIndex(t => t.name === toolName);
    if (idx >= 0) list[idx] = { ...list[idx], enabled };
    if (on()) {
      await api.patch(`/mcp-servers/${serverId}/tools/${encodeURIComponent(toolName)}`, { enabled }).catch(() => {});
    } else {
      const adapter = getPlatformAdapter();
      await adapter.db.exec('UPDATE mcp_tool SET enabled = ? WHERE mcp_server_id = ? AND name = ?', [enabled ? 1 : 0, serverId, toolName]);
    }
  }

  async function disconnect(id: string) {
    const client = clients.get(id);
    if (client) { try { await client.disconnect(); } catch {} clients.delete(id); }
    if (on()) {
      await api.patch(`/mcp-servers/${id}`, { status: 0 });
    } else {
      const adapter = getPlatformAdapter();
      await adapter.db.exec('UPDATE mcp_server SET status = ? WHERE id = ?', [0, id]);
    }
    const idx = servers.value.findIndex((x) => x.id === id);
    if (idx !== -1) servers.value[idx] = { ...servers.value[idx], status: 'disconnected' };
  }

  async function testServerConfig(config: any): Promise<{ ok: boolean; msg: string; tools?: any[]; durationMs?: number }> {
    const start = Date.now();
    const temp = { id: '_tmp', name: '_tmp', transport: config.transport, command: config.command, args: config.args || [], env: config.env || {}, url: config.url, headers: config.headers || {}, status: 'disconnected' as const, autoReconnect: false, reconnectInterval: 5000, autoConnect: false };
    const client = new McpClient(temp);
    mcpTestClient.value = client;
    try {
      await client.connect();
      const tools = await client.listTools();
      return { ok: true, msg: `连接成功，${tools.length} 个工具`, tools, durationMs: Date.now() - start };
    } catch (e: any) {
      let msg = e?.message || '连接失败';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        msg = '网络请求失败，请检查 URL 是否正确或服务端是否允许跨域（CORS）。提示：浏览器端连接 SSE 服务通常需要服务端配置 CORS 头。';
      }
      return { ok: false, msg, durationMs: Date.now() - start };
    } finally {
      try { await client.disconnect(); } catch {}
      mcpTestClient.value = null;
    }
  }

  async function callTool(serverId: string, toolName: string, args: unknown): Promise<{ ok: true; result: unknown } | { ok: false; msg: string }> {
    const c = clients.get(serverId);
    if (!c) return { ok: false, msg: '服务未连接' };
    const start = Date.now();
    try {
      const r = await c.callTool(toolName, args);
      addLog(serverId, `tools/call:${toolName}`, true, `${Date.now() - start}ms`);
      return { ok: true, result: r };
    } catch (e: any) {
      addLog(serverId, `tools/call:${toolName}`, false, e?.message);
      return { ok: false, msg: e?.message };
    }
  }

  async function readResource(serverId: string, uri: string) {
    const c = clients.get(serverId);
    if (!c) return { ok: false, msg: '服务未连接' };
    try {
      const r = await c.readResource(uri);
      addLog(serverId, `resources/read:${uri}`, true);
      return { ok: true, contents: r };
    } catch (e: any) {
      addLog(serverId, `resources/read:${uri}`, false, e?.message);
      return { ok: false, msg: e?.message };
    }
  }

  async function getPrompt(serverId: string, name: string, args?: Record<string, string>) {
    const c = clients.get(serverId);
    if (!c) return { ok: false, msg: '服务未连接' };
    try {
      const r = await c.getPrompt(name, args);
      addLog(serverId, `prompts/get:${name}`, true);
      return { ok: true, result: r };
    } catch (e: any) {
      addLog(serverId, `prompts/get:${name}`, false, e?.message);
      return { ok: false, msg: e?.message };
    }
  }

  function addLog(serverId: string, method: string, ok: boolean, msg?: string) {
    if (!logs.value[serverId]) logs.value[serverId] = [];
    logs.value[serverId].unshift({ time: Date.now(), method, ok, msg });
    if (logs.value[serverId].length > 100) logs.value[serverId].pop();
  }

  function getLogs(serverId: string) {
    return logs.value[serverId] || [];
  }

  return {
    servers, tools, resources, prompts, connecting,
    loadServers, addServer, updateServer, deleteServer,
    connect, disconnect, updateToolMeta, setToolEnabled, callTool, readResource, getPrompt,
    testServerConfig, cancelTest, getLogs, isDesktop,
  };
});
