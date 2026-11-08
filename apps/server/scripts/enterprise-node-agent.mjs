#!/usr/bin/env node
/**
 * 言智工作节点 Agent（企业工作台 v1）。
 *
 * 环境变量：
 *   YZ_RUNTIME_SERVER       服务端根地址，默认 http://127.0.0.1:3001
 *   YZ_RUNTIME_TOKEN        管理端创建节点时返回的一次性令牌
 *   YZ_RUNTIME_WORKSPACE_ROOT  节点工作区根目录，默认 ./.yan-zhi-runtime
 *   YZ_LICENSE              License 门禁开启时的授权码（可选）
 *
 * 协议先用 HTTP 长轮询，保证实现简单、可调试；接口稳定后再升级 WebSocket。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SERVER = (process.env.YZ_RUNTIME_SERVER || 'http://127.0.0.1:3001').replace(/\/+$/, '');
const TOKEN = String(process.env.YZ_RUNTIME_TOKEN || '').trim();
const ROOT = path.resolve(process.env.YZ_RUNTIME_WORKSPACE_ROOT || path.join(process.cwd(), '.yan-zhi-runtime'));
const LICENSE = String(process.env.YZ_LICENSE || '').trim();

if (!TOKEN) {
  console.error('[runtime] 缺少 YZ_RUNTIME_TOKEN');
  process.exit(1);
}

fs.mkdirSync(ROOT, { recursive: true });

function headers() {
  return {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    ...(LICENSE ? { 'x-license': LICENSE } : {}),
  };
}

async function api(pathname, method = 'GET', body) {
  const res = await fetch(`${SERVER}/api/runtime/v1${pathname}`, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* 原始文本 */ }
  if (!res.ok) throw new Error(`${method} ${pathname} -> HTTP ${res.status}: ${json?.error || text.slice(0, 300)}`);
  // 必须区分“没有 data 字段”和“data 显式为 null”：
  // /tasks/next 无任务时返回 { data: null }，不能回落成整个响应对象。
  return json && Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;
}

function safeWorkspacePath(id, suggested) {
  const base = path.resolve(ROOT, 'workspaces');
  const target = path.resolve(suggested || path.join(base, id));
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error(`工作区路径越界: ${target}`);
  }
  return target;
}

class EventSender {
  constructor(taskId) {
    this.taskId = taskId;
    this.seq = 0;
    this.pending = [];
    this.timer = null;
    this.closed = false;
  }
  send(kind, payload) {
    if (this.closed) return;
    this.pending.push({ seq: ++this.seq, kind, payload });
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 200);
  }
  async flush() {
    this.timer = null;
    if (this.closed || this.pending.length === 0) return;
    const batch = this.pending.splice(0, this.pending.length);
    try {
      await api(`/tasks/${encodeURIComponent(this.taskId)}/events`, 'POST', { events: batch });
    } catch (e) {
      console.error(`[runtime] 事件回传失败 task=${this.taskId}:`, e?.message || e);
      this.pending.unshift(...batch);
    }
  }
  async close() {
    if (this.timer) clearTimeout(this.timer);
    await this.flush();
    this.closed = true;
  }
}

async function workspaceState(workspaceId, body) {
  return api(`/workspaces/${encodeURIComponent(workspaceId)}/state`, 'POST', body);
}

async function executeWorkspaceCreate(task, events) {
  const payload = task.payload || {};
  const workspaceId = payload.workspaceId || task.workspace_id;
  const dir = safeWorkspacePath(workspaceId, payload.path);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.yan-zhi-workspace.json'), JSON.stringify({
    id: workspaceId,
    name: payload.name || '工作区',
    image: payload.image || null,
    cpu: payload.cpu ?? null,
    memoryMb: payload.memoryMb ?? null,
    createdAt: Date.now(),
  }, null, 2));
  events.send('workspace', { status: 'running', path: dir });
  await workspaceState(workspaceId, { status: 'running', path: dir, ports: [] });
  return { state: 'completed', result: { workspaceId, path: dir } };
}

async function executeWorkspaceStop(task, events) {
  const payload = task.payload || {};
  const workspaceId = payload.workspaceId || task.workspace_id;
  const dir = safeWorkspacePath(workspaceId, payload.path);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  events.send('workspace', { status: 'stopped', path: dir, reason: payload.reason || 'requested' });
  await workspaceState(workspaceId, { status: 'stopped', path: dir, ports: [] });
  return { state: 'completed', result: { workspaceId, stopped: true } };
}

async function executeCommand(task, events) {
  const payload = task.payload || {};
  const command = String(payload.command || '').trim();
  if (!command) throw new Error('任务缺少 command');
  const cwd = payload.cwd ? path.resolve(String(payload.cwd)) : ROOT;
  fs.mkdirSync(cwd, { recursive: true });
  const timeoutMs = Math.max(1000, Math.min(Number(payload.timeoutMs) || 30 * 60_000, 24 * 60 * 60_000));
  events.send('started', { command, cwd });
  return await new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: { ...process.env, ...(payload.env && typeof payload.env === 'object' ? payload.env : {}) },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, 3000).unref?.();
    }, timeoutMs);
    timer.unref?.();
    child.stdout?.on('data', (buf) => {
      const text = buf.toString('utf8');
      stdout += text;
      events.send('stdout', { text });
    });
    child.stderr?.on('data', (buf) => {
      const text = buf.toString('utf8');
      stderr += text;
      events.send('stderr', { text });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({
        state: 'failed',
        error: e.message,
        result: { stdout, stderr },
      });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const artifacts = Array.isArray(payload.artifacts) ? payload.artifacts : [];
      if (code === 0) {
        resolve({
          state: 'completed',
          exitCode: 0,
          result: { stdout, stderr, signal },
          artifacts,
        });
      } else {
        resolve({
          state: 'failed',
          exitCode: Number.isFinite(code) ? code : null,
          error: `命令退出码 ${code ?? 'null'}${signal ? ` signal=${signal}` : ''}`,
          result: { stdout, stderr, signal },
          artifacts,
        });
      }
    });
  });
}

async function executeTask(task) {
  const events = new EventSender(task.id);
  try {
    let result;
    if (task.kind === 'workspace_create') result = await executeWorkspaceCreate(task, events);
    else if (task.kind === 'workspace_stop') result = await executeWorkspaceStop(task, events);
    else result = await executeCommand(task, events);
    await events.close();
    await api(`/tasks/${encodeURIComponent(task.id)}/complete`, 'POST', {
      state: result.state || 'completed',
      result: result.result,
      error: result.error || null,
      exitCode: result.exitCode ?? null,
      artifacts: result.artifacts || [],
    });
    console.log(`[runtime] 任务完成 ${task.id} kind=${task.kind} state=${result.state || 'completed'}`);
  } catch (e) {
    try {
      events.send('error', { message: e?.message || String(e) });
      await events.close();
      await api(`/tasks/${encodeURIComponent(task.id)}/complete`, 'POST', {
        state: 'failed',
        error: e?.message || String(e),
      });
    } catch (reportError) {
      console.error(`[runtime] 任务失败且回传失败 ${task.id}:`, reportError?.message || reportError);
    }
  }
}

let running = true;

async function main() {
  console.log(`[runtime] server=${SERVER} token=configured workspace=${ROOT}`);
  await api('/register', 'POST', {
    platform: process.platform,
    arch: process.arch,
    version: process.version,
    capabilities: ['command', 'workspace_create', 'workspace_stop'],
  });
  console.log('[runtime] 节点已上线');

  const heartbeat = setInterval(() => {
    api('/heartbeat', 'POST', {}).catch((e) => console.error('[runtime] 心跳失败:', e?.message || e));
  }, 15_000);
  heartbeat.unref?.();

  while (running) {
    try {
      const task = await api('/tasks/next');
      if (task) await executeTask(task);
      else await new Promise((r) => setTimeout(r, 1200));
    } catch (e) {
      console.error('[runtime] 拉取任务失败:', e?.message || e);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  clearInterval(heartbeat);
}

function shutdown() {
  running = false;
  console.log('[runtime] 正在退出');
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((e) => {
  console.error('[runtime] 启动失败:', e?.stack || e);
  process.exit(1);
});
