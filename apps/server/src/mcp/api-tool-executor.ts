import { v4 as uuid } from 'uuid';
import { readdir, stat, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { db } from '../db.js';
import { DEFAULT_CONTEXT_WINDOW } from '../constants.js';
import { AGENS_API_URL, inferCapabilitiesFromModelId } from '../agens-platform/service.js';
import { serverState } from '../state.js';
import { resolveFfmpeg, installFfmpeg } from './ffmpeg-runtime.js';
import { resolveYtdlp, installYtdlp, ytdlpFetch, isYoutubeHost, youtubeEnabled } from './ytdlp-runtime.js';
import { decideInstallPolicy, formatBytes } from '../services/runtime-installer.js';
import { buildSrt, type SrtCue } from './srt.js';
import {
  upsertPeer,
  listPeers,
  pingPeer,
  sendPeerMessage,
  pollPeerMessages,
} from '../services/peers.js';
import { gitService } from '../services/git.js';
import { bumpMemoryCache } from '../services/memory-service.js';
import { readSpaceMemory, appendSpaceMemory, readTaskProgressForConversation } from '../services/space-memory.js';
import { setSpaceTaskType, resolveSpaceResourceRoot } from '../services/space-resources.js';
import { TASK_TYPE_IDS, getTaskType } from '@yan-zhi/shared';
import { readBrowserMemoryOverview } from '../services/browser-memory.js';
import { ensureArtifactDirFor } from '../services/artifact-dir.js';
import { downloadMediaBinary } from '../services/media-fetch.js';
import { systemSpeak, listSystemVoices, pickVoiceForRole, describeVoiceCapacity, inferRoleGender } from './tts-sapi.js';
import { listEdgeVoices, edgeSpeak, pickEdgeVoiceForRole, defaultEdgeVoice, type EdgeVoice } from './edge-tts.js';
import { localSpeak, pcmToWav, parseLocalVoice, pickSpeakerForRole, resolveSherpaLib } from './sherpa-tts.js';
import { listTtsPacks } from '../services/tts-packs.js';

/**
 * 找第一个已安装的本地语音包（用于本地合成）。
 * 返回 null = 没装（这是正常状态，不是错误 —— 本地语音只是三层兜底之一）。
 */
async function findInstalledLocalPack(): Promise<{ id: string; dir: string } | null> {
  if (!resolveSherpaLib().available) return null;
  try {
    const packs = await listTtsPacks();
    // modelDir 已由 listTtsPacks 解析为「真实可用目录」（下载位或手动放置位）
    const hit = packs.find((p) => p.installed);
    return hit ? { id: hit.id, dir: hit.modelDir } : null;
  } catch {
    return null;
  }
}

/** 本地层的说话人分配：显式编号优先 → 角色预置表 → 散列兜底（保证同角色恒定同声音）。 */
const localSpeakerAssignments = new Map<string, Map<string, number>>();
function resolveLocalSpeaker(explicitVoice: string, character: string, conversationId: string | undefined): number {
  const parsed = parseLocalVoice(explicitVoice, character);
  if (parsed !== null) return parsed;
  if (!character) return 0;
  const key = conversationId || '__global__';
  let m = localSpeakerAssignments.get(key);
  if (!m) { m = new Map(); localSpeakerAssignments.set(key, m); }
  const existing = m.get(character);
  if (existing !== undefined) return existing;
  const used = new Set(m.values());
  const sid = pickSpeakerForRole(character, used);
  m.set(character, sid);
  return sid;
}

/** Edge 音色列表缓存（网络请求较慢，进程内缓存 30 分钟足够）。 */
let edgeVoiceCache: { at: number; voices: EdgeVoice[] } | null = null;
async function getEdgeVoices(force = false): Promise<EdgeVoice[]> {
  if (!force && edgeVoiceCache && Date.now() - edgeVoiceCache.at < 30 * 60 * 1000) return edgeVoiceCache.voices;
  const voices = await listEdgeVoices();
  edgeVoiceCache = { at: Date.now(), voices };
  return voices;
}

/** Edge 层的角色→音色分配缓存（与系统层分开，音色名体系不同）。 */
const edgeRoleAssignments = new Map<string, Map<string, string>>();
function edgeAssignmentFor(conversationId: string | undefined): Map<string, string> {
  const key = conversationId || '__global__';
  let m = edgeRoleAssignments.get(key);
  if (!m) { m = new Map(); edgeRoleAssignments.set(key, m); }
  return m;
}
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

/** 解析系统中文字体文件路径（标题叠加 drawtext 需要，否则中文标题会变成方框）。
 *  找不到返回 null，此时调用方退化为按字体名 'Microsoft YaHei' 让 ffmpeg/fontconfig 自己解析。 */
function resolveCjkFont(): string | null {
  const platform = process.platform;
  const candidates: string[] =
    platform === 'win32'
      ? [
          'C:\\Windows\\Fonts\\msyh.ttc',
          'C:\\Windows\\Fonts\\msyhbd.ttc',
          'C:\\Windows\\Fonts\\simhei.ttf',
          'C:\\Windows\\Fonts\\simsun.ttc',
        ]
      : platform === 'darwin'
        ? [
            '/System/Library/Fonts/PingFang.ttc',
            '/System/Library/Fonts/STHeiti Light.ttc',
            '/Library/Fonts/Arial Unicode.ttf',
          ]
        : [
            '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
            '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
            '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
          ];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
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

/** 会话 → 所属空间 ID（空间记忆类工具省略 spaceId 时的默认解析） */
function resolveTaskSpaceId(conversationId?: string): string {
  if (!conversationId) return '';
  const conv = db.prepare('SELECT space_id FROM conversation WHERE id = ?').get(conversationId) as
    | { space_id: string | null }
    | undefined;
  return conv?.space_id || '';
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

/**
 * 该工具是否由 executeApiTool 执行。
 *
 * ★★★ 为什么不能只判 `startsWith('api_')`（2026-09-27 挖出的真实缺陷）：
 *   `media_compose` / `media_install_ffmpeg` 由本文件的 executeApiTool 实现、也列在
 *   SUPPORTED_API_TOOLS 里，**但名字不带 `api_` 前缀**。而全链路四处分发都写成
 *   `name.startsWith('api_')`（llm-task-manager 的执行与暴露、routes/tools、
 *   mcp/index），且它们又不在 core registry 里 —— 于是：
 *     · 模型侧**看不到**它们（buildToolsForBackend 的 `filter(startsWith('api_'))` 把它们滤掉）
 *     → 表现为「让模型拼长视频，它压根没这个工具可调」；
 *     · 即使硬调，也落到 core registry 分支 → 返回「内置工具不存在」。
 *   这正是用户诉求「视频拼成长视频」跑不通的**底层原因之一**，而不是模型不会用。
 *   统一走这个判定函数，四处调用点不再各写各的前缀判断（避免再次漏改）。
 */
export function isApiExecutableTool(name: string): boolean {
  return String(name || '').startsWith('api_') || SUPPORTED_API_TOOLS.has(name);
}

/** 服务端实际实现了执行逻辑的 api_* 工具清单，未列出的名称应被配置层过滤。 */
export const SUPPORTED_API_TOOLS = new Set([
  'api_agent_list', 'api_agent_get', 'api_agent_create', 'api_agent_update', 'api_agent_delete', 'api_agent_mount',
  'api_conversation_list', 'api_conversation_get', 'api_conversation_create', 'api_conversation_update', 'api_conversation_delete',
  'api_conversation_setup',
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
  'api_code_semantic_search', 'api_code_definition',
  'api_memory_search', 'api_memory_list', 'api_memory_create', 'api_memory_delete',
  'api_space_memory_read', 'api_space_memory_append',
  'api_browser_memory_read',
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
  'api_space_list', 'api_space_create', 'api_space_update', 'api_space_delete', 'api_space_set_task_type',
  // 数据查询（P4.1/P4.2：数据源 / 本体上下文链 / 只读取数 / 翻页）
  'api_datasource_list', 'api_ontology_search', 'api_ontology_list', 'api_data_query', 'api_data_paginate',
  'api_ontology_overview', 'api_ontology_brief', 'api_ontology_detail', 'api_ontology_values',
  // AI 媒体生成（文生图/文生视频，agnes 平台）
  'api_image_generate', 'api_video_generate', 'api_video_status',
  // 文字转语音（模型层 + 系统语音兜底）+ 音色枚举
  'api_tts_speak', 'api_tts_voices',
  // 合成层：字幕生成 + ffmpeg 音视频合成（含按需下载 ffmpeg）
  'api_srt_generate', 'media_compose', 'media_install_ffmpeg', 'media_install_ytdlp',
  // 剪辑与特效层：裁剪/变速/抽帧/变换/淡入淡出/调色/转场/画中画/图片运镜/BGM/音量/响度（统一走 media_edit 的 op）
  'media_edit',
  // 网络素材获取：公开视频/图片直链下载（标准化见 media_compose 的 normalize 操作）
  'api_media_fetch', 'api_media_normalize',
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

/** 知识库挂载范围：任务显式下发优先；否则读 server agent 表；均无 = undefined 不限（跨全部可见库检索） */
function agentKnowledgeBaseIds(userId: string | undefined, agentId: string | undefined, explicit?: string[]): string[] | undefined {
  if (explicit && explicit.length) return explicit;
  if (!agentId || !userId) return undefined;
  try {
    const row = db.prepare('SELECT knowledge_base_ids FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)').get(agentId, userId) as
      | { knowledge_base_ids?: string | null }
      | undefined;
    const ids = JSON.parse(row?.knowledge_base_ids || '[]');
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

// ===== AI 媒体生成（api_image_generate / api_video_generate / api_video_status）=====
// agnes 平台的生图/生视频模型走专用端点（不在 chat/completions 通道）：
// - 生图：POST /v1/images/generations（OpenAI 标准，同步）
// - 生视频：POST /v1/videos {mode:'text'} → GET /v1/videos/{taskId} 轮询（异步）
// Key 来源：platform_api_key 的 Token 池（与 llm-proxy 同源），429/401/403 自动换下一把。
function loadAgensMediaCtx(): { baseUrl: string; keys: string[] } {
  const plat = db
    .prepare("SELECT id, api_url, api_key_enc FROM platform WHERE api_url LIKE '%agnes-ai.com%' ORDER BY created_at ASC LIMIT 1")
    .get() as { id: string; api_url: string; api_key_enc: string | null } | undefined;
  const baseUrl = String(plat?.api_url || process.env.AGNES_API_URL || AGENS_API_URL).replace(/\/+$/, '');
  const keys: string[] = [];
  if (process.env.AGENS_API_KEY) keys.push(process.env.AGENS_API_KEY);
  if (plat) {
    const rows = db
      .prepare('SELECT api_key FROM platform_api_key WHERE platform_id = ? AND enabled = 1 ORDER BY fail_count ASC, id ASC')
      .all(plat.id) as { api_key: string }[];
    for (const r of rows) if (r.api_key) keys.push(r.api_key);
    if (plat.api_key_enc) keys.push(plat.api_key_enc);
  }
  return { baseUrl, keys: [...new Set(keys)] };
}

function bumpAgensKeyFail(apiKey: string): void {
  try { db.prepare('UPDATE platform_api_key SET fail_count = fail_count + 1 WHERE api_key = ?').run(apiKey); } catch { /* 忽略 */ }
}

/**
 * 媒体工具的平台解析：默认 agnes；传了 platformId 或 model（模型 id/别名，配合 list_models 发现）
 * 则路由到任意已配置平台（OpenAI 兼容生图/生视频端点），key 池按 platform_api_key 通用加载。
 */
/** 媒体平台上下文（扁平结构，ok=false 时看 error） */
interface MediaPlatformCtx {
  ok: boolean;
  error: string;
  baseUrl: string;
  keys: string[];
  isAgnes: boolean;
}

function resolveMediaPlatform(args: Record<string, unknown>, userId?: string | null): MediaPlatformCtx {
  const modelRef = str(args, 'model').trim();
  const platformId = str(args, 'platformId').trim();
  if (!modelRef && !platformId) {
    const agens = loadAgensMediaCtx();
    return { ok: true, error: '', baseUrl: agens.baseUrl, keys: agens.keys, isAgnes: true };
  }
  const platRow = (() => {
    // 平台 PATCH 里用户可以把平台/模型设为「对大模型不可见」——
    // 不可见的模型智能体就不该再动态选中它，故取平台与模型时都带可见性闸门。
    if (platformId) {
      return db.prepare('SELECT id, api_url, api_key_enc FROM platform WHERE id = ? AND llm_enabled = 1').get(platformId);
    }
    const cond = userId ? 'AND m.user_id = ?' : '';
    const params: unknown[] = userId ? [modelRef, modelRef, userId] : [modelRef, modelRef];
    return db.prepare(
      `SELECT p.id, p.api_url, p.api_key_enc FROM model m JOIN platform p ON p.id = m.platform_id
        WHERE (m.model_id = ? OR m.alias = ?) AND m.enabled = 1 AND m.visible = 1 AND p.llm_enabled = 1 ${cond}
        ORDER BY m.id LIMIT 1`,
    ).get(...params);
  })() as { id: string; api_url: string; api_key_enc: string | null } | undefined;
  if (!platRow) {
    return { ok: false, error: '未找到对应的平台/模型。可先调用 list_models（type=image 或 video）查询可用的媒体模型，再传 model（模型 id 或别名）与 platformId；都不传则默认用 agnes 平台。', baseUrl: '', keys: [], isAgnes: false };
  }
  const keys: string[] = [];
  const rows = db.prepare('SELECT api_key FROM platform_api_key WHERE platform_id = ? AND enabled = 1 ORDER BY fail_count ASC, id ASC')
    .all(platRow.id) as { api_key: string }[];
  for (const r of rows) if (r.api_key) keys.push(r.api_key);
  if (platRow.api_key_enc) keys.push(platRow.api_key_enc);
  const baseUrl = String(platRow.api_url || '').replace(/\/+$/, '');
  if (!baseUrl) return { ok: false, error: '该平台未配置 API 地址，请先在模型平台里补全', baseUrl: '', keys: [], isAgnes: false };
  if (!keys.length) return { ok: false, error: '该平台没有可用的 API Key，请先在模型平台里配置', baseUrl, keys: [], isAgnes: false };
  return { ok: true, error: '', baseUrl, keys: [...new Set(keys)], isAgnes: /agnes-ai\.com/i.test(baseUrl) };
}

async function fetchWithTimeout(url: string, init: any, timeoutMs: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * 媒体产物的落盘目录 + 对应的访问地址前缀。
 *
 * 两者必须成对解析，否则会出现「文件落在规范目录、URL 却指向旧全局目录」的 404：
 * - 有会话：落 .yan-zhi 规范的交付目录，URL 走三段式（静态服务按会话定位）
 * - 无会话（定时任务 / IM 等入口没有 conversationId）：退回旧的全局目录，URL 走两段式
 */
/** 产物落盘位置（导出供语音包试听等服务复用，保证与工具产物同一目录与访问通道）。 */
export function mediaTarget(opts: {
  conversationId?: string;
  kind: 'images' | 'videos' | 'audios' | 'files';
}): { dir: string; urlBase: string } {
  const convId = (opts.conversationId || '').trim();
  if (convId) {
    return {
      dir: ensureArtifactDirFor({ conversationId: convId, category: 'deliverable' }).dir,
      urlBase: `/api/generated/${opts.kind}/${convId}`,
    };
  }
  const sub = opts.kind === 'images' ? 'generated-images'
    : opts.kind === 'audios' ? 'generated-audios'
    : opts.kind === 'files' ? 'generated-files'
    : 'generated-videos';
  return {
    dir: process.env.DATA_DIR ? path.join(process.env.DATA_DIR, sub) : path.resolve(sub),
    urlBase: `/api/generated/${opts.kind}`,
  };
}

/**
 * 下载媒体字节。走 services/media-fetch 的统一入口：直连优先，直连不通的本机自动改走
 * 本机代理隧道（agnes 产物 CDN 在部分网络直连超时，不兜底就永远落不了盘）。
 */
async function downloadBinary(url: string, timeoutMs = 180000): Promise<Buffer> {
  return downloadMediaBinary(url, timeoutMs);
}

function extFromUrl(url: string, fallback: string): string {
  const m = /\.(png|jpe?g|webp|gif|mp4|webm|mov)(?=$|[?#])/i.exec(url);
  return m ? `.${m[1].toLowerCase().replace('jpeg', 'jpg')}` : fallback;
}

/** 解析参考图输入（URL / dataURL / 裸 base64 / 本机路径）→ multipart 用的 Blob */
async function toImageBlob(v: string): Promise<{ blob: Blob; name: string } | null> {
  try {
    const s = v.trim();
    if (/^https?:\/\//i.test(s)) {
      const buf = await downloadBinary(s);
      return { blob: new Blob([new Uint8Array(buf)]), name: path.basename(new URL(s).pathname) || 'ref.png' };
    }
    const dataUrl = /^data:(image\/[a-zA-Z0-9+.-]+);base64,([\s\S]+)$/.exec(s);
    if (dataUrl) return { blob: new Blob([new Uint8Array(Buffer.from(dataUrl[2], 'base64'))]), name: 'ref.png' };
    if (s.length > 512 && /^[A-Za-z0-9+/=\r\n]+$/.test(s.slice(0, 512))) {
      return { blob: new Blob([new Uint8Array(Buffer.from(s.replace(/\s+/g, ''), 'base64'))]), name: 'ref.png' };
    }
    // 本机路径（如 api_image_generate 之前落盘的 file）
    const fsp = await import('node:fs/promises');
    const buf = await fsp.readFile(s);
    return { blob: new Blob([new Uint8Array(buf)]), name: path.basename(s) };
  } catch {
    return null;
  }
}

/** 解析帧输入（图生视频/关键帧）：URL/dataURL 直接透传；base64/本机路径转 dataURL */
async function toFrameRef(v: string): Promise<string | null> {
  try {
    const s = v.trim();
    if (/^(https?:\/\/|data:image\/)/i.test(s)) return s;
    let buf: Buffer;
    let mime = 'image/png';
    const dataUrl = /^data:(image\/[a-zA-Z0-9+.-]+);base64,([\s\S]+)$/.exec(s);
    if (dataUrl) return s;
    if (s.length > 512 && /^[A-Za-z0-9+/=\r\n]+$/.test(s.slice(0, 512))) {
      buf = Buffer.from(s.replace(/\s+/g, ''), 'base64');
    } else {
      const fsp = await import('node:fs/promises');
      buf = await fsp.readFile(s);
      if (s.toLowerCase().endsWith('.jpg') || s.toLowerCase().endsWith('.jpeg')) mime = 'image/jpeg';
      else if (s.toLowerCase().endsWith('.webp')) mime = 'image/webp';
    }
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/** 从视频任务响应的多层结构里尽力提取视频地址 */
function extractVideoUrl(j: any): string {
  const cands = [
    j?.url, j?.video_url, j?.videoUrl, j?.output?.url, j?.output?.video_url,
    j?.data?.[0]?.url, j?.data?.[0]?.video_url, j?.content?.url, j?.result?.url,
    j?.metadata?.url, j?.metadata?.video_url,
  ];
  for (const c of cands) if (typeof c === 'string' && c.startsWith('http')) return c;
  return '';
}

function taskStatus(j: any): string {
  return String(j?.status || j?.data?.status || j?.task_status || '').toLowerCase();
}

/**
 * 生图/图生图响应的共用处理：取 data[0].url（或 b64），下载落盘，返回精简契约。
 *
 * 返回契约刻意保持最小：{type, url, description} —— 界面按 url 直接渲染预览，
 * 不需要模型在正文里贴路径，也不会出现「本机备份 A:/B:」这类复述。
 * 本机绝对路径放在 file 字段（供右键「另存为 / 打开所在目录」使用）。
 */
async function handleImageResult(
  j: any,
  model: string,
  prompt: string,
  conversationId?: string,
): Promise<MpcToolExecutionResult> {
  const item = j?.data?.[0] || {};
  const remoteUrl: string = typeof item.url === 'string' ? item.url : '';
  const description = String(item.revised_prompt || prompt || '').trim();
  let localFile = '';
  let localUrl = '';
  try {
    const buf = remoteUrl
      ? await downloadBinary(remoteUrl)
      : (item.b64_json ? Buffer.from(String(item.b64_json), 'base64') : null);
    if (buf && buf.length > 0) {
      const target = mediaTarget({ conversationId, kind: 'images' });
      await mkdir(target.dir, { recursive: true });
      const file = path.join(target.dir, `image-${Date.now()}${extFromUrl(remoteUrl, '.png')}`);
      await writeFile(file, buf);
      localFile = file;
      localUrl = `${target.urlBase}/${path.basename(file)}`;
    }
  } catch (e: unknown) {
    // 落盘失败不影响对话（远端 url 仍可预览），但必须留痕：
    // 产物没进交付目录 / 消息末尾没有交付卡片，根因往往就是这里。
    console.warn(`[media] 生图产物落盘失败（来源：${remoteUrl ? '远端地址' : 'b64'}）：${e instanceof Error ? e.message : String(e)}`);
  }
  if (!remoteUrl && !localUrl) return fail(`生图响应里没有图片地址：${JSON.stringify(j).slice(0, 300)}`);
  return ok(JSON.stringify({
    ok: true,
    type: 'image',
    model,
    url: localUrl || remoteUrl,
    description,
    file: localFile || undefined,
  }));
}

async function mediaGenerateImage(
  args: Record<string, unknown>,
  userId?: string | null,
  conversationId?: string,
): Promise<MpcToolExecutionResult> {
  const prompt = str(args, 'prompt').trim();
  if (!prompt) return fail('prompt 为必填项');
  const model = str(args, 'model') || 'agnes-image-2.5-flash';
  const size = str(args, 'size');
  const ctx = resolveMediaPlatform(args, userId);
  if (!ctx.ok) return fail(ctx.error);
  const baseUrl = ctx.baseUrl;
  const keys = ctx.keys;
  if (!keys.length) return fail('未找到该平台的 API Key（Token 池为空），请先在模型平台里配置');

  // 图生图/多图合成：带参考图时走 /v1/images/edits（multipart，端点透传；上游未开放时返回原始报错）
  const imagesRaw = args.images;
  const imageList: string[] = Array.isArray(imagesRaw)
    ? imagesRaw.map((v) => String(v)).filter((v) => v.trim())
    : (typeof imagesRaw === 'string' && imagesRaw.trim() ? [imagesRaw.trim()] : []);
  if (imageList.length) {
    const blobs: { blob: Blob; name: string }[] = [];
    for (const ref of imageList) {
      const r = await toImageBlob(ref);
      if (!r) return fail(`参考图不可读（支持 URL / base64 / 本机路径）：${String(ref).slice(0, 80)}`);
      blobs.push(r);
    }
    let lastErr = '';
    for (const key of keys) {
      const fd = new FormData();
      fd.append('model', model);
      fd.append('prompt', size ? `${prompt}（目标尺寸 ${size}）` : prompt);
      for (const b of blobs) fd.append('image', b.blob, b.name);
      let res: Response;
      try {
        res = await fetchWithTimeout(`${baseUrl}/v1/images/edits`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}` },
          body: fd,
        }, 180000);
      } catch (e: unknown) {
        lastErr = e instanceof Error ? e.message : String(e);
        continue;
      }
      const text = await res.text();
      if (res.status === 429 || res.status === 401 || res.status === 403) {
        bumpAgensKeyFail(key);
        lastErr = `HTTP ${res.status}: ${text.slice(0, 200)}`;
        continue;
      }
      if (!res.ok) return fail(`图生图请求失败 HTTP ${res.status}（平台编辑通道上游可能暂未开放）：${text.slice(0, 300)}`);
      let j: any;
      try { j = JSON.parse(text); } catch { return fail('图生图响应不是合法 JSON'); }
      return await handleImageResult(j, model, prompt, conversationId);
    }
    return fail(`所有 agnes Key 均不可用（限频或无效）：${lastErr}`);
  }

  let lastErr = '';
  for (const key of keys) {
    let res: Response;
    try {
      res = await fetchWithTimeout(`${baseUrl}/v1/images/generations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, n: 1, ...(size ? { size } : {}) }),
      }, 180000);
    } catch (e: unknown) {
      lastErr = e instanceof Error ? e.message : String(e);
      continue;
    }
    const text = await res.text();
    if (res.status === 429 || res.status === 401 || res.status === 403) {
      bumpAgensKeyFail(key);
      lastErr = `HTTP ${res.status}: ${text.slice(0, 200)}`;
      continue;
    }
    if (!res.ok) return fail(`生图请求失败 HTTP ${res.status}: ${text.slice(0, 300)}`);
    let j: any;
    try { j = JSON.parse(text); } catch { return fail('生图响应不是合法 JSON'); }
    return await handleImageResult(j, model, prompt, conversationId);
  }
  return fail(`所有 agnes Key 均不可用（限频或无效）：${lastErr}`);
}

// ===== TTS（api_tts_speak）：模型层优先，系统语音兜底 =====
// 模型层走 OpenAI 兼容 POST /v1/audio/speech（二进制音频响应）；
// 系统层走 Windows SAPI / macOS say（离线可用）。双层失败才报错，错误信息带上各层原因。

function hasConfiguredTtsModel(userId?: string | null): boolean {
  try {
    const cond = userId ? 'AND m.user_id = ?' : '';
    const params: unknown[] = userId ? [userId] : [];
    const row = db.prepare(
      `SELECT m.id FROM model m JOIN platform p ON p.id = m.platform_id
        WHERE m.enabled = 1 AND m.visible = 1 AND p.llm_enabled = 1
          AND (m.type = 'audio' OR m.capabilities LIKE '%audio%' OR m.capabilities LIKE '%tts%' OR m.capabilities LIKE '%speech%') ${cond}
        LIMIT 1`,
    ).get(...params);
    return !!row;
  } catch { return false; }
}

async function ttsViaModel(
  args: Record<string, unknown>,
  text: string,
  voice: string,
  userId?: string | null,
  conversationId?: string,
): Promise<{ ok: true; result: MpcToolExecutionResult } | { ok: false; error: string }> {
  const model = str(args, 'model') || 'tts-1';
  const ctx = resolveMediaPlatform(args, userId);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (!ctx.keys.length) return { ok: false, error: '未找到该平台的 API Key（Token 池为空），请先在模型平台里配置' };
  let lastErr = '';
  for (const key of ctx.keys) {
    let res: Response;
    try {
      res = await fetchWithTimeout(`${ctx.baseUrl}/v1/audio/speech`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: text, voice: voice || 'alloy', response_format: 'mp3' }),
      }, 180000);
    } catch (e: unknown) {
      lastErr = e instanceof Error ? e.message : String(e);
      continue;
    }
    if (res.status === 429 || res.status === 401 || res.status === 403) {
      bumpAgensKeyFail(key);
      lastErr = `HTTP ${res.status}`;
      continue;
    }
    if (!res.ok) {
      lastErr = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) { lastErr = '响应体为空'; continue; }
    const target = mediaTarget({ conversationId, kind: 'audios' });
    await mkdir(target.dir, { recursive: true });
    const file = path.join(target.dir, `audio-${Date.now()}.mp3`);
    await writeFile(file, buf);
    return { ok: true, result: ok(JSON.stringify({
      ok: true, type: 'audio', engine: 'model', model, voice: voice || 'alloy',
      url: `${target.urlBase}/${path.basename(file)}`, file, bytes: buf.length,
    })) };
  }
  return { ok: false, error: lastErr || '未知错误' };
}

/** 列出可用音色：本地语音包（离线）+ Edge 在线 + 系统本地 + 模型层。 */
async function mediaTtsVoices(): Promise<MpcToolExecutionResult> {
  const out: Record<string, unknown> = { ok: true };
  // 0) 本地语音包（离线多音色，装了才可用）
  try {
    const engine = resolveSherpaLib();
    const packs = await listTtsPacks();
    const installed = packs.filter((p) => p.installed);
    out.local = {
      available: installed.length > 0,
      engineAvailable: engine.available,
      ...(installed.length
        ? {
          models: installed.map((p) => ({ id: p.id, name: p.name, speakers: p.speakers, sampleRate: p.sampleRate })),
          note: '本地语音完全离线可用。传 voice: "local:<说话人编号>" 指定音色；传 character 会自动分配。',
        }
        : { note: '未安装语音包，可在 设置 → 语音包 中下载（约 31MB，174 个中文说话人）' }),
      ...(engine.available ? {} : { engineError: engine.error }),
    };
  } catch (e: unknown) {
    out.local = { available: false, error: e instanceof Error ? e.message : String(e) };
  }
  // 1) Edge 在线音色（中文普通话 8 个，男女齐全，质量高）
  try {
    const voices = await getEdgeVoices(true);
    const zh = voices.filter((v) => String(v.culture).startsWith('zh'));
    out.edge = {
      available: true,
      note: 'Edge 在线合成（免费、无需 Key、质量高于系统语音）。离线时会自动回落。',
      total: voices.length,
      zhVoices: zh.map((v) => ({ name: v.name, gender: v.gender, culture: v.culture })),
      zhCount: zh.length,
      zhMale: zh.filter((v) => v.gender === 'Male').length,
      zhFemale: zh.filter((v) => v.gender === 'Female').length,
    };
  } catch (e: unknown) {
    out.edge = { available: false, error: e instanceof Error ? e.message : String(e), note: 'Edge 不可用（可能是离线）时会自动使用系统语音' };
  }
  // 2) 系统本地音色（离线兜底）
  try {
    const sys = await listSystemVoices();
    if (sys === null) {
      out.system = { available: false, note: '当前平台无离线语音引擎（仅 Windows / macOS）' };
    } else {
      const cap = describeVoiceCapacity(sys, 3);
      out.system = { available: true, voices: sys, distinctVoices: cap.distinctVoices, capacityNote: cap.note };
    }
  } catch (e: unknown) {
    out.system = { available: false, error: e instanceof Error ? e.message : String(e) };
  }
  // 3) 模型层音色名
  out.model = {
    note: '模型层音色取决于所用平台；以下是 OpenAI 兼容 /v1/audio/speech 的常见音色名',
    voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
    hint: hasConfiguredTtsModel(null)
      ? '库中已配置 audio 型模型，传 model+platformId 即可走模型层'
      : '库中未配置 audio 型模型',
  };
  out.priority = 'api_tts_speak 选音色顺序：显式传 model/platformId 走模型层 → 已装语音包走本地（离线）→ Edge 在线 → 系统语音';
  out.tip = '多角色短剧：传 character（如"男主"/"女主"）即可自动按性别/编号分配不同音色，无需手查音色表。';
  return ok(JSON.stringify(out));
}

/**
 * 角色 → 音色映射缓存（进程内）。
 *
 * 为什么需要缓存：多角色短剧会为每个角色的每句台词分别调 api_tts_speak，
 * 每次调用都是独立进程级请求，若不缓存，同一角色会被分配到不同音色 ——
 * 表现为「同一角色声音忽男忽女」，而每次调用单看都成功、无从察觉。
 * 键用「会话 + 角色名」：不同会话的角色表互不干扰。
 */
const roleVoiceAssignments = new Map<string, Map<string, string>>();

function assignmentFor(conversationId: string | undefined, role: string): Map<string, string> {
  const key = conversationId || '__global__';
  let m = roleVoiceAssignments.get(key);
  if (!m) { m = new Map(); roleVoiceAssignments.set(key, m); }
  return m;
}

/** 解析本次要用的音色：显式 voice 优先；否则按角色自动分配并锁定。
 *  仅用于系统语音层 —— 系统音色名（如 Microsoft Huihui）对模型层无效。 */
async function resolveSpeakVoice(
  explicitVoice: string,
  character: string,
  conversationId: string | undefined,
): Promise<string> {
  if (explicitVoice) return explicitVoice;
  if (!character) return '';
  const assigned = assignmentFor(conversationId, character);
  // 已分配过直接复用（保证同角色同音色）
  const existing = assigned.get(character);
  if (existing) return existing;
  let voices: Array<{ name: string; culture: string }> = [];
  try {
    voices = (await listSystemVoices()) || [];
  } catch {
    // 枚举失败则退化为「不指定音色」，让引擎按默认语言自选（好过整体失败）
    return '';
  }
  const chosen = pickVoiceForRole(voices, character, assigned);
  return chosen || '';
}

/** 模型层音色：只在显式传 voice 时使用；否则让平台用自身默认音色。
 *  防止把系统音色名（Microsoft Huihui 等）误传给模型端点导致 400。 */
const MODEL_VOICE_WHITELIST = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
function resolveModelVoice(args: Record<string, unknown>): string {
  const v = str(args, 'voice').trim();
  if (v && MODEL_VOICE_WHITELIST.includes(v.toLowerCase())) return v.toLowerCase();
  return '';
}

async function mediaSpeak(
  args: Record<string, unknown>,
  userId?: string | null,
  conversationId?: string,
): Promise<MpcToolExecutionResult> {
  const text = str(args, 'text').trim();
  if (!text) return fail('text 为必填项');
  if (text.length > 5000) return fail(`文本过长（${text.length} 字），请分段调用（单次 ≤ 5000 字）`);
  const character = str(args, 'character').trim();
  const rate = num(args, 'rate', 0);
  const errors: string[] = [];
  // 系统语音层的音色（只用于最后的兜底分支；Edge 层有自己的音色体系，不能混用）
  const explicitVoice = str(args, 'voice').trim();

  // 模型层：显式点名（model/platformId）或库里有 audio 型模型才尝试；失败自动回落系统层。
  // 注意用 resolveModelVoice（白名单）而非系统音色 —— 两者命名体系不同，混用会 400。
  const wantModel = !!str(args, 'model').trim() || !!str(args, 'platformId').trim() || hasConfiguredTtsModel(userId);
  if (wantModel) {
    const m = await ttsViaModel(args, text, resolveModelVoice(args), userId, conversationId);
    if (m.ok) return m.result;
    errors.push(`模型层：${m.error}`);
  } else {
    errors.push('模型层：未配置 audio 型模型（可传 model+platformId 点名启用）');
  }

  // 本地语音层（第三层，但排在 Edge 之前）：装了语音包就完全离线可用，音色上百。
  // 用户诉求是「离线也要多音色」，故本地模型优先于在线 Edge；
  // 未装语音包时这一步自然跳过（不报错），继续走 Edge。
  const target = mediaTarget({ conversationId, kind: 'audios' });
  await mkdir(target.dir, { recursive: true });
  try {
    const localPack = await findInstalledLocalPack();
    if (localPack) {
      const speakerId = resolveLocalSpeaker(explicitVoice, character, conversationId);
      const { samples, sampleRate } = await localSpeak(text, {
        modelDir: localPack.dir,
        speakerId,
        speed: 1 + Math.max(-10, Math.min(10, rate)) / 10,
      });
      const file = path.join(target.dir, `audio-${Date.now()}.wav`);
      const wav = pcmToWav(samples, sampleRate);
      await writeFile(file, wav);
      return ok(JSON.stringify({
        ok: true, type: 'audio', engine: 'local', voice: `local:${speakerId}`,
        model: localPack.id,
        ...(character ? { character } : {}),
        url: `${target.urlBase}/${path.basename(file)}`, file, bytes: wav.length,
      }));
    }
    errors.push('本地语音层：未安装语音包（可在 设置 → 语音包 下载）');
  } catch (e: unknown) {
    errors.push(`本地语音层：${e instanceof Error ? e.message : String(e)}`);
  }

  // Edge 层：免费在线合成，中文音色远多于系统语音（本机系统仅 3 个、Edge 有 8 个）。
  // 离线会失败 → 不中断，记下原因后回落系统语音，保证「至少有产出」。
  try {
    const voices = await getEdgeVoices();
    if (voices.length) {
      // 显式 voice 是 Edge 音色名时直用；否则按角色推断性别分配 Edge 音色
      const explicit = str(args, 'voice').trim();
      const wantGender = character ? inferRoleGender(character) : '';
      let edgeVoice = '';
      if (explicit && voices.some((v) => v.name === explicit)) {
        edgeVoice = explicit;
      } else if (character) {
        edgeVoice = pickEdgeVoiceForRole(voices, character, edgeAssignmentFor(conversationId), wantGender);
      } else {
        edgeVoice = defaultEdgeVoice(voices, wantGender);
      }
      if (edgeVoice) {
        const r = await edgeSpeak(text, { voice: edgeVoice, rate });
        const file = path.join(target.dir, `audio-${Date.now()}.mp3`);
        await writeFile(file, r.buffer);
        return ok(JSON.stringify({
          ok: true, type: 'audio', engine: 'edge', voice: edgeVoice,
          ...(character ? { character } : {}),
          url: `${target.urlBase}/${path.basename(file)}`, file, bytes: r.buffer.length,
        }));
      }
    }
    errors.push('Edge 层：未取得可用音色');
  } catch (e: unknown) {
    errors.push(`Edge 层：${e instanceof Error ? e.message : String(e)}`);
  }

  // 系统层兜底（离线可用；不做声音克隆）
  try {
    const outFile = path.join(target.dir, `audio-${Date.now()}.wav`);
    // 系统层只认自家音色名：显式传的 Edge 音色名（zh-CN-*）在这里无效，交给角色分配/引擎默认
    const sysVoice = explicitVoice && !/^[a-z]{2}-[A-Z]{2}-/.test(explicitVoice)
      ? explicitVoice
      : await resolveSpeakVoice('', character, conversationId);
    const r = await systemSpeak(text, { voice: sysVoice || undefined, rate, outFile });
    if (r) {
      // 传了角色但本机音色不够时，把「声音会重复」讲明白 —— 否则用户以为多角色已生效
      let capacityNote: string | undefined;
      if (character) {
        try {
          const sys = (await listSystemVoices()) || [];
          const cap = describeVoiceCapacity(sys, assignmentFor(conversationId, character).size);
          if (!cap.adequate) capacityNote = cap.note;
        } catch { /* 容量评估失败不影响配音结果 */ }
      }
      return ok(JSON.stringify({
        ok: true, type: 'audio', engine: r.engine, voice: sysVoice || 'auto',
        ...(character ? { character } : {}),
        ...(capacityNote ? { capacityNote } : {}),
        url: `${target.urlBase}/${path.basename(r.file)}`, file: r.file, bytes: r.bytes,
      }));
    }
    errors.push('系统语音：当前系统无离线引擎（仅支持 Windows SAPI / macOS say）');
  } catch (e: unknown) {
    errors.push(`系统语音：${e instanceof Error ? e.message : String(e)}`);
  }
  return fail(errors.join('；'));
}

// ===== 网络素材获取（media_fetch）：把公开直链素材下载到本机 =====
//
// ★ 为什么必须单独做一条通路（用户明确诉求：「让大模型去下载公开的解压类视频」）：
//   在此之前模型**根本没有可用的下载路径**，所以表现为"不去下载"：
//   · `browser_download` 只挂在 pageAgent 上，且需要浏览器先导航到页面触发下载；
//   · `http_request` 的实现是 `await res.text()` —— 二进制会被按文本解码毁掉，存不下来。
//   本工具复用生图/生视频同一套 media-fetch（直连优先 → 本机代理隧道兜底），
//   把链接取成**本机文件**，返回 {type,file,url} 与其它媒体工具一致。
//
// ★ 落点必须让任务模式"认得出"，否则下载完素材还是"缺素材"：
//   category=deliverable（默认）→ 会话交付目录（带预览 URL，可点开看）；
//   category=source → 空间资源目录的 **00-source**（任务模式的素材约定位置，无 URL，
//   但方案里的「目录资源现状」能扫到，后续步骤就地取材）。

/** 下载体积上限（2GB）：防误填超大链接把磁盘打满；命中即明确报错，不静默截断 */
const MEDIA_FETCH_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * 清洗下载文件名 —— 落盘名必须过静态路由的 `isSafeMediaName`：
 * 禁路径分隔符 / `..` / 控制字符 / 前后空白。带 `..` 的名字会被 404 拒掉，
 * 表现为「下载成功但预览裂开」，所以这里一次性洗干净（而不是让下游容错）。
 */
function safeDownloadName(raw: string, fallbackExt: string): string {
  const base = path.basename(String(raw || '').trim()).replace(/[\\/]/g, '_');
  let cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\.{2,}/g, '.')
    .trim();
  if (!cleaned || /^\.+$/.test(cleaned)) cleaned = '';
  if (!cleaned) return `fetched-${Date.now()}${fallbackExt}`;
  if (!/\.[a-z0-9]{2,5}$/i.test(cleaned)) cleaned += fallbackExt;
  return cleaned.slice(0, 150);
}

/** URL → 扩展名（路径带扩展就用它，否则按类型兜底） */
function extForFetch(url: string, fallbackExt: string): string {
  try {
    const p = new URL(url).pathname;
    const m = /\.(mp4|webm|mov|m4v|mkv|avi|flv|png|jpe?g|webp|gif|bmp)$/i.exec(p);
    if (m) return `.${m[1].toLowerCase().replace('jpeg', 'jpg')}`;
  } catch { /* 非法 URL 交给下载层报错 */ }
  return fallbackExt;
}

/** 跑一次 ffprobe，成功返回 stdout（用于探测流信息）。 */
function runFfprobe(bin: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      resolve({ ok: !err, out: String(stdout || '') });
    });
  });
}

/**
 * 探测视频**是否带音轨**，以及**视频时长**。
 *
 * ★ 为什么必须探测（而不是用 `-map 0:a:0?` 的可选映射糊过去）：
 *   可选映射在缺音轨时只是"不映射"，**输出就没有音轨** —— 而后续 concat 要求各段
 *   流布局一致，一段无音轨照样拼不上。所以需要明确知道"有没有"，再决定补不补静音。
 *   反过来同时 `-map 0:a:0?` 和 `-map <静音源>` 会产出**两条音轨**，同样是错的。
 * ★★★ 为什么还要探测**时长**（实测踩到，最隐蔽的一坑）：
 *   `anullsrc` 是**无限长**的音频源。若只靠 `-shortest` 收尾，在 ffmpeg 9.0 上对
 *   `-f lavfi` 输入**不生效** —— 命令不报错、不退出，产物一路膨胀（实测 13MB 仍在写）。
 *   正解是给静音源显式 `-t <视频时长>`，再让 `-shortest` 只做兜底。
 *   所以这里一次探测把「有无音轨 + 时长」都拿回来，避免多跑一次 ffprobe。
 */
async function probeMedia(ffprobe: string, file: string): Promise<{ hasAudio: boolean; durationSec: number; width: number; height: number }> {
  const r = await runFfprobe(ffprobe, [
    '-v', 'error', '-show_entries', 'format=duration', '-show_entries', 'stream=index,codec_type,width,height',
    '-of', 'json', file,
  ], 30000);
  if (!r.ok) return { hasAudio: false, durationSec: 0, width: 0, height: 0 };
  try {
    const j = JSON.parse(r.out) as {
      streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
      format?: { duration?: string };
    };
    const streams = j.streams || [];
    const hasAudio = streams.some((s) => s.codec_type === 'audio');
    const v = streams.find((s) => s.codec_type === 'video');
    const durationSec = Number(j.format?.duration);
    return {
      hasAudio,
      durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0,
      // 分辨率用于字幕边距/标题位置按比例换算（固定像素在不同画幅上表现完全不同）
      width: Number(v?.width) || 0,
      height: Number(v?.height) || 0,
    };
  } catch {
    return { hasAudio: false, durationSec: 0, width: 0, height: 0 };
  }
}

// ===== 合成层（api_srt_generate / media_compose）：字幕与音视频混流 =====
// 设计取舍：不做剪辑台。分镜表每镜自带时长 → 时间轴是已知量，字幕纯计算生成（零 ASR），
// 合成只需 concat / 混音 / 烧字幕三种确定性操作。ffmpeg 经 ffmpeg-runtime 定位（随包 > PATH）。

/** 跑一次 ffmpeg，失败时把 stderr 尾部带出来（定位编码/参数问题只能靠它）。 */
function runFfmpeg(bin: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) resolve({ ok: false, stderr: String(stderr || err.message).slice(-1200) });
      else resolve({ ok: true, stderr: '' });
    });
  });
}

/** 输入文件校验：一律要求本机已存在的绝对路径（相对路径在不同 cwd 下会静默错文件）。 */
function requireLocalFile(v: unknown, label: string): { ok: true; file: string } | { ok: false; error: string } {
  const s = String(v ?? '').trim();
  if (!s) return { ok: false, error: `${label} 必填` };
  if (!path.isAbsolute(s)) return { ok: false, error: `${label} 需要本机绝对路径：${s}` };
  if (!existsSync(s)) return { ok: false, error: `${label} 文件不存在：${s}` };
  return { ok: true, file: s };
}

/** 合成层依赖 ffmpeg：缺失时给出「一键下载」引导（工具名+目录+下载源），而不是让用户自己猜。 */
function ffmpegMissingHint(st: { error: string; installDir: string; downloadUrl: string }): string {
  // 体积策略（P3b，用户拍板）：ffmpeg 约 100MB > 50MB 静默阈值 → 必须先问用户。
  // 提示里把**实测体积与阈值**一起给出，让「为什么这次要问我」是可解释的（而不是无来由的弹窗）。
  const policy = decideInstallPolicy(FFMPEG_ESTIMATED_BYTES);
  return [
    st.error,
    '',
    `处理方式：调用 media_install_ffmpeg 由我自动下载安装（${policy.reason}）` + (st.downloadUrl ? `（源：${st.downloadUrl}）` : '（当前平台无自动源）'),
    `或手动放入目录：${st.installDir}`,
    policy.decision === 'confirm' ? '请先向用户确认再下载。' : '',
  ].filter(Boolean).join('\n');
}

/** ffmpeg 静态构建包的实测体积（win32 essentials ≈ 100MB），用于体积策略判定 */
const FFMPEG_ESTIMATED_BYTES = 100 * 1024 * 1024;

async function mediaInstallFfmpeg(): Promise<MpcToolExecutionResult> {
  const before = await resolveFfmpeg();
  if (before.ok) {
    return ok(JSON.stringify({ ok: true, alreadyInstalled: true, source: before.source, dir: path.dirname(before.ffmpeg) }));
  }
  // 体积策略回执：让模型/用户看得到「这次为何要确认、阈值是多少、可怎么改」
  const policy = decideInstallPolicy(FFMPEG_ESTIMATED_BYTES);
  const r = await installFfmpeg((msg) => console.log(`[ffmpeg] ${msg}`));
  if (!r.ok) return fail(`${r.message}${r.dir ? `\n可手动放入目录：${r.dir}` : ''}`);
  const after = await resolveFfmpeg();
  return ok(JSON.stringify({
    ok: true, installed: true, source: after.source,
    dir: r.dir, ffmpeg: after.ffmpeg, ffprobe: after.ffprobe,
    policy: { decision: policy.decision, estimatedBytes: policy.bytes, estimatedSize: policy.bytes ? formatBytes(policy.bytes) : null },
    note: '安装完成，媒体合成（media_compose）现在可用。',
  }));
}

/** yt-dlp 安装引导（视频网站解析下载）。yt-dlp.exe 自包含、约 15MB，低于静默阈值。 */
async function mediaInstallYtdlp(): Promise<MpcToolExecutionResult> {
  const before = await resolveYtdlp();
  if (before.ok) {
    return ok(JSON.stringify({ ok: true, alreadyInstalled: true, source: before.source, dir: path.dirname(before.bin) }));
  }
  const r = await installYtdlp((msg) => console.log(`[ytdlp] ${msg}`));
  if (!r.ok) return fail(`${r.message}${r.dir ? `\n可手动放入目录：${r.dir}` : ''}`);
  const after = await resolveYtdlp();
  return ok(JSON.stringify({
    ok: true, installed: true, source: after.source,
    dir: r.dir, bin: after.bin,
    note: '安装完成，视频网站解析下载（media_fetch 直接给页面链接）现在可用。',
  }));
}

/** 会话 → 所属空间的资源根目录（下载素材要落进空间的 00-source，而不是会话交付目录） */
function resolveConversationSpaceRoot(conversationId?: string): string | null {
  if (!conversationId) return null;
  try {
    const row = db
      .prepare('SELECT s.id, s.dir_path FROM conversation c JOIN space s ON s.id = c.space_id WHERE c.id = ?')
      .get(conversationId) as { id: string; dir_path: string | null } | undefined;
    if (!row) return null;
    return resolveSpaceResourceRoot({ id: row.id, dir_path: row.dir_path });
  } catch {
    return null;
  }
}

/**
 * 下载公开素材直链到本机（网络素材获取）。
 *
 * 走 services/media-fetch 的统一入口：直连优先，直连不通自动改走本机代理隧道 ——
 * 与生图/生视频产物落盘同一条通路，网络环境的差异在这一层被吸收。
 */

/** 粗略判断字节流是否像 HTML 页面（用于区分"直链文件"与"视频网站页面"） */
function looksLikeHtml(buf: Buffer): boolean {
  const head = buf.subarray(0, 512).toString('latin1').toLowerCase();
  const t = head.trimStart();
  return t.startsWith('<!doctype') || t.startsWith('<html') || head.includes('<head') || head.includes('<meta') || head.includes('<script');
}

async function mediaFetch(
  args: Record<string, unknown>,
  conversationId?: string,
): Promise<MpcToolExecutionResult> {
  const url = str(args, 'url').trim();
  if (!url) return fail('url 为必填项');
  if (!/^https?:\/\//i.test(url)) return fail(`url 必须是 http/https 直链或视频网站页面链接：${url.slice(0, 120)}`);

  const kind = str(args, 'kind').trim().toLowerCase() || 'video';
  if (!['video', 'image', 'audio', 'file'].includes(kind)) return fail('kind 必须是 video / image / audio / file 之一');
  const category = str(args, 'category').trim() === 'source' ? 'source' : 'deliverable';
  const fallbackExt = kind === 'image' ? '.png' : kind === 'audio' ? '.mp3' : kind === 'file' ? '.bin' : '.mp4';
  const rawMax = num(args, 'maxBytes', 0);
  const maxBytes = rawMax > 0 ? rawMax : MEDIA_FETCH_MAX_BYTES;

  const nameHint = str(args, 'name').trim();
  const prefixBase = safeDownloadName(nameHint || `${kind}-${Date.now()}`, fallbackExt); // 不含扩展名

  // 两种 category 都先定好落盘目录
  let dir: string;
  let urlBase = '';
  if (category === 'source') {
    const root = resolveConversationSpaceRoot(conversationId);
    if (!root) return fail('当前会话没有绑定空间，无法定位 00-source（可改用 category=deliverable）');
    dir = path.join(root, '00-source');
  } else {
    const target = mediaTarget({
      conversationId,
      kind: kind === 'image' ? 'images' : kind === 'audio' ? 'audios' : kind === 'file' ? 'files' : 'videos',
    });
    dir = target.dir;
    urlBase = target.urlBase;
  }
  await mkdir(dir, { recursive: true });
  const prefix = path.join(dir, prefixBase);

  // ① 先尝试直链下载（公开素材站 .mp4/.jpg 直链最稳）
  let buf: Buffer | null = null;
  try {
    buf = await downloadBinary(url);
  } catch {
    /* 直连失败 → 落到 yt-dlp 解析分支 */
  }

  if (buf && buf.length > 0 && !looksLikeHtml(buf)) {
    if (buf.length > maxBytes) {
      return fail(`文件过大（${formatBytes(buf.length)}），超过上限 ${formatBytes(maxBytes)}（可传更大的 maxBytes）`);
    }
    const fileName = `${prefixBase}${extForFetch(url, fallbackExt)}`;
    const file = path.join(dir, fileName);
    await writeFile(file, buf);
    return ok(JSON.stringify({
      ok: true, type: kind, category,
      file, name: fileName, bytes: buf.length, sourceUrl: url,
      ...(category === 'source'
        ? { note: '已存入本目录的 00-source（任务模式素材位置）。后续步骤直接用这个绝对路径读它。' }
        : { url: `${urlBase}/${path.basename(file)}` }),
    }));
  }

  // ② 直链失败或拿到的是网页 → 走 yt-dlp 解析下载（视频网站页面链接）
  let host = '';
  try { host = new URL(url).hostname; } catch { /* 非法 url 交给 yt-dlp 去报 */ }
  if (isYoutubeHost(host) && !youtubeEnabled()) {
    return fail(
      '当前仅支持国内视频站（B站 / 抖音 / 西瓜等）的页面链接解析下载。\n' +
      'YouTube 受反爬限制默认关闭：设置环境变量 YZ_YTDLP_YOUTUBE=1 并配置可用代理（YZ_YTDLP_PROXY 或 HTTPS_PROXY）后启用。',
    );
  }
  const yt = await ytdlpFetch(url, prefix, { timeoutMs: 600000 });
  if (!yt.ok || !yt.file) return fail(`视频解析下载失败：${yt.error || '未知错误'}`);

  // 下载后体积检查（yt-dlp 不进 Node 内存，但太大仍要拦）
  const st = await stat(yt.file);
  if (st.size > maxBytes) {
    await rm(yt.file, { force: true });
    return fail(`文件过大（${formatBytes(st.size)}），超过上限 ${formatBytes(maxBytes)}（可传更大的 maxBytes）`);
  }
  return ok(JSON.stringify({
    ok: true, type: kind, category,
    file: yt.file, name: path.basename(yt.file), bytes: st.size, sourceUrl: url,
    ...(category === 'source'
      ? { note: '已存入本目录的 00-source（由视频网站解析得到）。后续步骤直接用这个绝对路径读它。' }
      : { url: `${urlBase}/${path.basename(yt.file)}` }),
  }));
}

/**
 * 竖屏标准化：把任意来源的视频统一成同一规格，让后续拼接一定成功。
 *
 * ★ 为什么必须做（用户诉求「视频最后都是竖屏、分辨率一样、拼成长视频」）：
 *   media_compose 的 concat 走 `-c copy` 直拼，**要求各段编码参数完全一致**，
 *   不一致直接报错。网上下载的素材分辨率/帧率/编码各不相同 → 不做标准化就永远拼不上。
 * ★ 两个动作一次做完（分开做必然有一批片段漏做其中一步）：
 *   ① 画面 scale 到覆盖目标后**居中裁切**（`force_original_aspect_ratio=increase` + `crop`），
 *      横屏素材也不留黑边；② 音轨统一成 48k 立体声 AAC，**原本没有音轨的补静音** ——
 *      有片段缺音轨时 concat 同样会失败，这是最容易被漏掉的一环。
 */
async function mediaNormalize(
  args: Record<string, unknown>,
  conversationId?: string,
): Promise<MpcToolExecutionResult> {
  const ff = await resolveFfmpeg();
  if (!ff.ok) return fail(ffmpegMissingHint(ff));

  const raw = Array.isArray(args.videos) ? args.videos.map((v) => String(v)) : [];
  if (!raw.length) return fail('videos 必填且为非空数组（要标准化的视频绝对路径）');
  const files: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = requireLocalFile(raw[i], `videos[${i}]`);
    if (!c.ok) return fail(c.error);
    files.push(c.file);
  }

  const size = str(args, 'size').trim() || '1080x1920';
  if (!/^\d{2,5}x\d{2,5}$/.test(size)) return fail(`size 形如 1080x1920（宽x高）：${size}`);
  const fps = Math.min(Math.max(Number(args.fps) || 30, 1), 120);
  const [w, h] = size.split('x').map((n) => Number(n));

  const target = mediaTarget({ conversationId, kind: 'videos' });
  await mkdir(target.dir, { recursive: true });

  // 画面：按其**较短边**放大到覆盖目标框，再居中裁切 → 横竖屏都能填满且不变形
  const vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=${fps}`;
  const outBase = safeDownloadName(str(args, 'prefix').trim() || `norm-${Date.now()}`, '').replace(/\.[a-z0-9]+$/i, '');

  const outs: Array<{ file: string; url: string; bytes: number; source: string; hadAudio: boolean }> = [];
  const failures: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const src = files[i];
    const out = path.join(target.dir, `${outBase}-${String(i + 1).padStart(3, '0')}.mp4`);
    // 有音轨 → 只用原音轨；无音轨 → 只用静音源。二选一（同时映射会产出两条音轨）。
    const hadAudio = await probeMedia(ff.ffprobe, src);
    // ★★ 一旦出现任何 `-map`，ffmpeg 的**默认流选择就被禁用** —— 所以视频流必须显式映射，
    //    否则「有音轨」分支会产出**只有音频、没有画面**的文件（命令成功、不报错，实测踩到）。
    // 无音轨 → 用 anullsrc 补静音，**必须显式 -t <时长>**：anullsrc 是无限源，
    // 只靠 -shortest 在 ffmpeg 9.0 上不生效（不报错、不退出、产物一直膨胀）。
    const audioArgs = hadAudio.hasAudio
      ? ['-map', '0:v:0', '-map', '0:a:0']
      : [
          '-f', 'lavfi',
          ...(hadAudio.durationSec > 0 ? ['-t', String(hadAudio.durationSec)] : []),
          '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
          '-map', '0:v:0', '-map', '1:a:0',
        ];
    const r = await runFfmpeg(ff.ffmpeg, [
      '-y', '-i', src,
      // 画面标准化，音频统一 48k 立体声 AAC；缺音轨补等长静音（-shortest 兜底对齐）
      ...audioArgs,
      '-vf', vf,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-ar', '48000', '-ac', '2',
      '-shortest', '-movflags', '+faststart',
      out,
    ], 900000);
    if (!r.ok) { failures.push(`${path.basename(src)}：${r.stderr.slice(-300)}`); continue; }
    try {
      const st = await stat(out);
      outs.push({ file: out, url: `${target.urlBase}/${path.basename(out)}`, bytes: st.size, source: src, hadAudio: hadAudio.hasAudio });
    } catch (e: unknown) {
      failures.push(`${path.basename(src)}：产物读取失败 ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!outs.length) return fail(`标准化全部失败：\n${failures.join('\n')}`);
  return ok(JSON.stringify({
    ok: failures.length === 0,
    type: 'video',
    normalized: outs.length,
    failed: failures.length,
    size, fps,
    files: outs.map((o) => ({ file: o.file, url: o.url, bytes: o.bytes, source: o.source, hadAudio: o.hadAudio })),
    ...(failures.length ? { failures } : {}),
    note: '各段已是同一规格，可直接用 media_compose op=concat 拼接（-c copy 直拼不会报参数不一致）。',
  }));
}

async function mediaSrtGenerate(
  args: Record<string, unknown>,
  conversationId?: string,
): Promise<MpcToolExecutionResult> {
  const raw = args.cues;
  if (!Array.isArray(raw) || raw.length === 0) return fail('cues 必填且为非空数组');
  const cues: SrtCue[] = raw.map((c) => {
    const o = (c || {}) as Record<string, unknown>;
    return {
      text: String(o.text ?? ''),
      duration: typeof o.duration === 'number' ? o.duration : undefined,
      start: typeof o.start === 'number' ? o.start : undefined,
      end: typeof o.end === 'number' ? o.end : undefined,
    };
  });
  const built = buildSrt(cues);
  if (!built.ok) return fail(built.error);
  try {
    const target = mediaTarget({ conversationId, kind: 'files' });
    await mkdir(target.dir, { recursive: true });
    const file = path.join(target.dir, `subtitle-${Date.now()}.srt`);
    // SRT 播放器普遍按 UTF-8 解析；显式写 UTF-8（Windows 默认编码会导致中文乱码）
    await writeFile(file, built.srt, 'utf8');
    return ok(JSON.stringify({
      ok: true, type: 'file', kind: 'srt', cues: built.count,
      url: `${target.urlBase}/${path.basename(file)}`, file,
    }));
  } catch (e: unknown) {
    return fail(`字幕落盘失败：${e instanceof Error ? e.message : String(e)}`);
  }
}

async function mediaCompose(
  args: Record<string, unknown>,
  conversationId?: string,
): Promise<MpcToolExecutionResult> {
  const op = str(args, 'op').trim();
  if (!['dub', 'concat', 'subtitle', 'normalize'].includes(op)) return fail('op 必须是 dub / concat / subtitle / normalize 之一');

  // normalize 与其余三个操作共用 ffmpeg，但语义是「统一规格」而非「组装」，直接转交
  if (op === 'normalize') return mediaNormalize(args, conversationId);

  const ff = await resolveFfmpeg();
  if (!ff.ok) return fail(ffmpegMissingHint(ff));

  const target = mediaTarget({ conversationId, kind: 'videos' });
  const tmpDir = path.join(tmpdir(), `yz-compose-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(target.dir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });

  const nameArg = str(args, 'output').trim();
  const safeName = nameArg && /^[A-Za-z0-9._-]+$/.test(nameArg) ? nameArg : `composed-${Date.now()}.mp4`;
  const outFile = path.join(target.dir, safeName);

  try {
    let r: { ok: boolean; stderr: string };

    if (op === 'concat') {
      const list = Array.isArray(args.videos) ? args.videos.map((v) => String(v)) : [];
      if (list.length < 2) return fail('concat 需要 videos 数组且至少 2 段');
      const files: string[] = [];
      for (let i = 0; i < list.length; i++) {
        const c = requireLocalFile(list[i], `videos[${i}]`);
        if (!c.ok) return fail(c.error);
        files.push(c.file);
      }
      // concat demuxer 的路径转义：单引号内嵌需写成 '\''，Windows 反斜杠需转正斜杠
      const listFile = path.join(tmpDir, 'concat.txt');
      const body = files.map((f) => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
      await writeFile(listFile, body, 'utf8');
      // -c copy 直拼（要求各段参数一致；不一致会明确报错，不静默转码降质）
      // ★ -movflags +faststart 必加（2026-10-02）：没有它 moov 在文件末尾，
      //   应用内 web 播放器要下完整文件才能开播 → 表现为"读取中→黑屏"（405MB 实测踩坑）。
      r = await runFfmpeg(ff.ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', outFile], 600000);
      if (!r.ok) {
        return fail(
          `拼接失败（各段编码参数不一致）。**正解不是反复重试，而是先统一规格**：\n` +
          `先调 api_media_normalize { videos: [...各段绝对路径], size: "1080x1920", fps: 30 } 把每段标准化，\n` +
          `再用 media_compose op=concat 拼它返回的 files[].file（此时 -c copy 直拼一定能过）。\n` +
          `原始报错：${r.stderr}`,
        );
      }
    } else if (op === 'dub') {
      const v = requireLocalFile(args.video, 'video');
      if (!v.ok) return fail(v.error);
      const a = requireLocalFile(args.audio, 'audio');
      if (!a.ok) return fail(a.error);
      const keep = args.keepAudio === true;
      // 替换音轨 vs 与原声混合（amix 降权避免削波）
      const filter = keep ? ['-filter_complex', '[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[a]', '-map', '0:v', '-map', '[a]'] : ['-map', '0:v', '-map', '1:a'];
      r = await runFfmpeg(ff.ffmpeg, [
        '-y', '-i', v.file, '-i', a.file,
        ...filter,
        '-c:v', 'copy', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', outFile,
      ], 600000);
      if (!r.ok) return fail(`配音合成失败：${r.stderr}`);
    } else {
      const v = requireLocalFile(args.video, 'video');
      if (!v.ok) return fail(v.error);
      const s = requireLocalFile(args.srt, 'srt');
      if (!s.ok) return fail(s.error);
      // subtitles 滤镜的路径要转义（Windows 盘符冒号与反斜杠在 filtergraph 里是特殊字符）
      const esc = escFilterPath(s.file);
      // 字幕样式全可配：字号 / 颜色 / 描边色与宽度 / 位置 / 边距。
      //
      // ★★★ libass 的字号/边距换算（实测反推，务必按这个来，凭直觉设像素会大出几倍）：
      //   ffmpeg 的 subtitles 滤镜生成的 ASS 头**恒定**为 `PlayResX: 384 / PlayResY: 288`
      //   （与输出分辨率无关，实测 854×480 与 1080×1920 都是这组值，original_size 也改不了它）。
      //   因此实际渲染：
      //       渲染字号 px = FontSize × frameH / 384
      //       渲染边距 px = MarginV  × frameH / 288
      //   反过来看：**FontSize 与 MarginV 是「以画面高度为分母的比例值」** ——
      //   同一数值在任何画幅上视觉占比一致（实测 FontSize=34 在 720p/1080×1920/1280×720
      //   上都恰好占画面高 8.75%），所以**不需要按分辨率缩放**。
      //   曾经的坑：把 34 当"34 像素"以为很小 → 实际渲染 170px（占竖屏 8.85% 高，
      //   约 6 字/行），用户反馈"字幕有点大"就是这个原因；而上一版又画蛇添足按宽度再缩一次。
      //   对外仍按**像素（以 1920 高的成片为基准）**暴露，换算系数如下 —— 这样
      //   「我要 110px 的字」在任何画幅上都得到相同的视觉占比。
      const FS_PER_PX = 384 / 1920; // 0.2
      const MV_PER_PX = 288 / 1920; // 0.15
      // 默认 88px ≈ libass FontSize 17.6 ≈ 画面高 4.6% ≈ 1080 宽下约 12 字/行。
      // ★ 2026-10-02 用户反馈 120 仍偏大（"字幕很大，一句话完整顶出来"）→ 降到 88；
      //   长句由 libass 智能换行（WrapStyle=0），不再一行顶满全句。
      const fs = Math.max(6, Math.round(num(args, 'subtitleFontSize', 88) * FS_PER_PX));
      const ol = Math.max(0, Math.round(num(args, 'subtitleOutline', 12) * FS_PER_PX));
      // ★ safeArea=true 时底部边距抬到 420px：竖屏短视频（抖音/快手/视频号）的进度条、
      //   账号信息、操作按钮都在底部约 20% 画面高内，字幕压在那儿会被完全遮住。
      //   420px ≈ 画面高 22%，正好避开。默认 200px ≈ 10.4%（与旧版 MarginV=30 视觉一致）。
      const safe = args.safeArea === true;
      const prim = toAssColor(str(args, 'subtitleColor'), '&HFFFFFF&');
      const olc = toAssColor(str(args, 'subtitleOutlineColor'), '&H000000&');
      const POS: Record<string, { align: number; mvPx: number }> = {
        bottom: { align: 2, mvPx: safe ? 420 : 200 },
        center: { align: 5, mvPx: 0 },
        top: { align: 8, mvPx: safe ? 420 : 267 },
      };
      const posKey = str(args, 'subtitlePosition').trim().toLowerCase() || 'bottom';
      const pk = POS[posKey];
      if (!pk) return fail(`subtitlePosition 只能是 ${Object.keys(POS).join(' / ')}：${posKey}`);
      const mvPx = args.subtitleMarginV != null ? num(args, 'subtitleMarginV', pk.mvPx) : pk.mvPx;
      const mv = Math.max(0, Math.round(mvPx * MV_PER_PX));
      const style = `FontSize=${fs},PrimaryColour=${prim},OutlineColour=${olc},Outline=${ol},Shadow=1,Alignment=${pk.align},MarginV=${mv}`;
      let vf = `subtitles='${esc}':force_style='${style}'`;
      // 标题（项目名）叠加在顶部、整片常驻；未给 title 时不叠加。
      // ★ 与字幕相反：drawtext 的 fontsize 与 y **是绝对像素**（真实视频坐标系），
      //   不换算的话同一标题在 480 高的小片上会比 1920 高的大片小 4 倍 → 这里必须按高度缩放。
      const title = str(args, 'title').trim();
      if (title) {
        const cjk = resolveCjkFont();
        const fontOpt = cjk
          ? `fontfile='${escFilterPath(cjk)}'`
          : `font='Microsoft YaHei'`;
        const tEsc = escDrawtext(title);
        const vInfo = await probeMedia(ff.ffprobe, v.file);
        const refH = vInfo.height > 0 ? vInfo.height : 1920;
        const refW = vInfo.width > 0 ? vInfo.width : 1080;
        const pxH = (px: number) => Math.max(1, Math.round((refH * px) / 1920));
        let tSize = pxH(num(args, 'titleFontSize', 140));
        // ★★★ 标题超宽处置（2026-10-02 用户反馈"标题超出画面看不全"）：
        //   drawtext 无法自动缩字，长标题（如书名+章节名）在 140px 下必然横向溢出。
        //   titleFit 三档：
        //     · auto（默认）：先**估宽**（CJK 字宽≈字号、ASCII≈0.55×字号），超过画面宽 92%
        //       就按比例缩字号（下限 60px 基准），保证完整显示；
        //     · scroll：跑马灯从右向左匀速滚动（宽标题完整可读，任何长度都不裁）；
        //     · fixed：历史行为，居中不缩放（溢出会裁边，仅短标题用）。
        const fitMode = (str(args, 'titleFit').trim().toLowerCase() || 'auto');
        const estTitleW = (px: number) => {
          let units = 0;
          for (const ch of title) units += ch.codePointAt(0)! > 0x2e80 ? 1 : 0.55;
          return Math.ceil(units * px);
        };
        const spd = pxH(Math.max(20, num(args, 'titleScrollSpeed', 120)));
        let tX = `x=(w-text_w)/2`;
        if (fitMode === 'scroll') {
          // 从右往左循环滚动：x = w - mod(t*speed, w+text_w)（引号内逗号无需再转义，同 tAlpha）
          tX = `x='w-mod(t*${spd},w+text_w)'`;
        } else if (fitMode === 'auto') {
          const maxW = Math.floor(refW * 0.92);
          const est = estTitleW(tSize);
          if (est > maxW) {
            tSize = Math.max(pxH(60), Math.floor(tSize * maxW / est));
          }
        }
        // drawtext 的 fontcolor 用 0xRRGGBB（与 libass 的 &HAABBGGRR& 不同，别混用）
        const rawTc = str(args, 'titleColor').trim().replace(/^#/, '');
        const tColor = /^[0-9a-fA-F]{6}$/.test(rawTc) ? `0x${rawTc.toUpperCase()}` : 'white';
        const tFade = Math.max(0, num(args, 'titleFade', 0));
        const tAlpha = tFade > 0 ? `:alpha='if(lt(t,${tFade}),t/${tFade},1)'` : '';
        vf += `,drawtext=${fontOpt}:text='${tEsc}':fontcolor=${tColor}:fontsize=${tSize}:box=1:boxcolor=black@0.45:boxborderw=${pxH(30)}:${tX}:y=${pxH(120)}${tAlpha}`;
      }
      // ★ faststart 同 dub/concat（moov 前置，应用内预览才能秒开）
      r = await runFfmpeg(ff.ffmpeg, ['-y', '-i', v.file, '-vf', vf, '-c:a', 'copy', '-movflags', '+faststart', outFile], 600000);
      if (!r.ok) return fail(`字幕烧录失败：${r.stderr}`);
    }

    const size = (await stat(outFile)).size;
    return ok(JSON.stringify({
      ok: true, type: 'video', engine: 'ffmpeg', source: ff.source,
      url: `${target.urlBase}/${path.basename(outFile)}`, file: outFile, bytes: size,
    }));
  } catch (e: unknown) {
    return fail(`合成失败：${e instanceof Error ? e.message : String(e)}`);
  }
}

// ===== 剪辑与特效层（media_edit）：在 media_compose 的「组装」之上补「加工」=====
// 设计取舍：**不做时间线编辑器**。每个 op 都是「一次确定性的 ffmpeg 加工」，
// 与分镜/时间轴解耦 —— 模型知道要什么效果，就直接点名 op + 参数，不需要盯预览拖动。
// op 一览：trim 裁剪 / speed 变速 / snapshot 抽帧 / transform 翻转旋转裁切 / fade 淡入淡出
//          color 调色 / transition 转场 / overlay 画中画水印 / kenburns 图片运镜
//          bgsound 背景音乐 / volume 音量 / loudnorm 响度归一

/** 时间参数解析：支持秒数、"MM:SS"、"HH:MM:SS"（分镜表里这些写法都常见）。 */
function parseTime(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v ?? '').trim();
  if (!s) return fallback;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const parts = s.split(':').map((x) => Number(x));
  if (parts.some((n) => !Number.isFinite(n))) return fallback;
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  return sec;
}

/** #RRGGBB / #AARRGGBB → libass 的 &HAABBGGRR&（**字节序是反的**，照抄 RGB 顺序就是颜色对不上）。 */
function toAssColor(v: string, fallback: string): string {
  const s = String(v || '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(s)) {
    const r = s.slice(0, 2), g = s.slice(2, 4), b = s.slice(4, 6);
    return `&H00${b}${g}${r}&`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{8}$/.test(s)) {
    // 输入按 #AARRGGBB 理解（与前端 CSS 习惯一致）
    const a = s.slice(0, 2), r = s.slice(2, 4), g = s.slice(4, 6), b = s.slice(6, 8);
    return `&H${a}${b}${g}${r}&`.toUpperCase();
  }
  return fallback;
}

/** filtergraph 里的路径转义：Windows 盘符冒号与反斜杠都是特殊字符。 */
function escFilterPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

/** drawtext 的 text 转义：反斜杠、单引号、冒号、百分号漏一个整条 filter 就解析失败。 */
function escDrawtext(t: string): string {
  return t.replace(/\\/g, '\\\\').replace(/'/g, "'\\''").replace(/:/g, '\\:').replace(/%/g, '\\%');
}

/**
 * 变速用的 atempo 链：**单个 atempo 只接受 0.5~2.0**，超出必须串联。
 * 漏掉串联会在 factor>2 时报 "atempo tempo must be between 0.5 and 100"（或直接静默错速）。
 */
function atempoChain(factor: number): string {
  let f = Math.max(0.25, Math.min(4, factor));
  const parts: string[] = [];
  while (f > 2.0) { parts.push('atempo=2.0'); f /= 2.0; }
  while (f < 0.5) { parts.push('atempo=0.5'); f /= 0.5; }
  parts.push(`atempo=${f.toFixed(4)}`);
  return parts.join(',');
}

const MEDIA_EDIT_OPS = [
  'trim', 'speed', 'snapshot', 'transform', 'fade',
  'color', 'transition', 'overlay', 'kenburns',
  'bgsound', 'volume', 'loudnorm',
] as const;

const XFADE_TYPES = [
  'fade', 'fadeblack', 'fadewhite', 'dissolve',
  'wipeleft', 'wiperight', 'wipeup', 'wipedown',
  'slideleft', 'slideright', 'slideup', 'slidedown',
  'circleopen', 'circleclose', 'radial', 'smoothleft', 'smoothright',
  'pixelize', 'zoomin',
];

const COLOR_PRESETS: Record<string, string> = {
  warm: 'colorbalance=rs=.15:gs=.05:bs=-.10,eq=saturation=1.06',
  cool: 'colorbalance=rs=-.08:bs=.15,eq=saturation=1.02',
  bw: 'hue=s=0',
  vintage: 'curves=vintage,eq=saturation=.85:contrast=1.05',
  vivid: 'eq=saturation=1.35:contrast=1.08',
  film: 'eq=contrast=1.10:saturation=.90:gamma=.96,noise=alls=6:allf=t',
  fade: 'eq=brightness=.05:saturation=.75:contrast=.92',
};

async function mediaEdit(
  args: Record<string, unknown>,
  conversationId?: string,
): Promise<MpcToolExecutionResult> {
  const op = str(args, 'op').trim().toLowerCase();
  if (!(MEDIA_EDIT_OPS as readonly string[]).includes(op)) {
    return fail(`op 必须是 ${MEDIA_EDIT_OPS.join(' / ')} 之一`);
  }
  const ff = await resolveFfmpeg();
  if (!ff.ok) return fail(ffmpegMissingHint(ff));

  const nameArg = str(args, 'output').trim();
  const nameOk = nameArg && /^[A-Za-z0-9._-]+$/.test(nameArg);
  /** 产物落盘（按 op 决定 kind 与扩展名 —— 抽帧是图片、音量处理可能只出音频）。 */
  const mkOut = async (kind: 'videos' | 'audios' | 'images', ext: string) => {
    const tg = mediaTarget({ conversationId, kind });
    await mkdir(tg.dir, { recursive: true });
    const base = nameOk ? nameArg.replace(/\.[a-z0-9]+$/i, '') : `${op}-${Date.now()}`;
    return { tg, file: path.join(tg.dir, `${base}${ext}`) };
  };
  const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv|avi|flv)$/i;

  let out!: { tg: { dir: string; urlBase: string }; file: string };
  let note = '';
  let r: { ok: boolean; stderr: string };

  try {
    if (op === 'trim') {
      const v = requireLocalFile(args.video, 'video');
      if (!v.ok) return fail(v.error);
      const total = (await probeMedia(ff.ffprobe, v.file)).durationSec;
      const start = Math.max(0, parseTime(args.start, 0));
      const end = args.end == null ? 0 : parseTime(args.end, 0);
      const dur = args.duration == null ? 0 : num(args, 'duration', 0);
      let segEnd = end > 0 ? end : (dur > 0 ? start + dur : total);
      if (total > 0) segEnd = Math.min(segEnd, total);
      if (!(segEnd > start)) {
        return fail(`裁剪区间无效：start=${start}s → end=${segEnd}s（需要 end > start；不传 end 时用 duration 或片尾）`);
      }
      out = await mkOut('videos', '.mp4');
      r = await runFfmpeg(ff.ffmpeg, [
        '-y', '-ss', String(start), '-i', v.file, '-t', (segEnd - start).toFixed(3),
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-avoid_negative_ts', 'make_zero',
        '-movflags', '+faststart', out.file,
      ], 600000);
      if (!r.ok) return fail(`裁剪失败：${r.stderr}`);
      note = `已裁 ${start}s → ${segEnd}s（片段时长 ${(segEnd - start).toFixed(2)}s）`;
    } else if (op === 'speed') {
      const v = requireLocalFile(args.video, 'video');
      if (!v.ok) return fail(v.error);
      const factor = Math.min(Math.max(num(args, 'factor', 1), 0.25), 4);
      if (Math.abs(factor - 1) < 0.001) return fail('factor 不能为 1（等于没变速）；加快 >1，放慢 <1');
      const info = await probeMedia(ff.ffprobe, v.file);
      out = await mkOut('videos', '.mp4');
      const vf = `setpts=PTS/${factor.toFixed(6)},scale=trunc(iw/2)*2:trunc(ih/2)*2`;
      if (info.hasAudio) {
        r = await runFfmpeg(ff.ffmpeg, [
          '-y', '-i', v.file,
          '-filter_complex', `[0:v]${vf}[v];[0:a]${atempoChain(factor)}[a]`,
          '-map', '[v]', '-map', '[a]',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out.file,
        ], 600000);
      } else {
        const outDur = info.durationSec > 0 ? (info.durationSec / factor).toFixed(3) : '';
        r = await runFfmpeg(ff.ffmpeg, [
          '-y', '-i', v.file,
          '-f', 'lavfi', ...(outDur ? ['-t', outDur] : []), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
          '-vf', vf, '-map', '0:v:0', '-map', '1:a:0',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out.file,
        ], 600000);
      }
      if (!r.ok) return fail(`变速失败：${r.stderr}`);
      note = `速度 ×${factor}（${factor > 1 ? '加快' : '放慢'}）`;
    } else if (op === 'snapshot') {
      const v = requireLocalFile(args.video, 'video');
      if (!v.ok) return fail(v.error);
      const t = Math.max(0, parseTime(args.time, 0));
      out = await mkOut('images', '.jpg');
      r = await runFfmpeg(ff.ffmpeg, [
        '-y', '-ss', String(t), '-i', v.file, '-frames:v', '1', '-q:v', '2', out.file,
      ], 120000);
      if (!r.ok) return fail(`抽帧失败（时间点 ${t}s 可能超出片长）：${r.stderr}`);
      note = `已抽取 ${t}s 处画面为图片`;
    } else if (op === 'transform') {
      const v = requireLocalFile(args.video, 'video');
      if (!v.ok) return fail(v.error);
      const info = await probeMedia(ff.ffprobe, v.file);
      const MAP: Record<string, string> = {
        hflip: 'hflip', vflip: 'vflip', mirror: 'hflip',
        rotate90: 'transpose=1', rotate270: 'transpose=2', rotate180: 'transpose=1,transpose=1',
      };
      const parts: string[] = [];
      const rawOps = Array.isArray(args.ops) ? args.ops.map((x) => String(x).trim().toLowerCase()) : [];
      if (rawOps.length) {
        for (const o of rawOps) {
          const f = MAP[o];
          if (!f) return fail(`未知 transform 操作 ${o}；可选：${Object.keys(MAP).join(' / ')}`);
          parts.push(f);
        }
      }
      if (args.cropW != null && args.cropH != null) {
        const cw = Math.round(num(args, 'cropW', 0));
        const ch = Math.round(num(args, 'cropH', 0));
        if (cw > 0 && ch > 0) {
          const cx = Math.round(num(args, 'cropX', 0));
          const cy = Math.round(num(args, 'cropY', 0));
          parts.push(`crop=${cw}:${ch}:${cx}:${cy}`);
        }
      }
      if (!parts.length) return fail('ops 必填且非空（如 ["hflip"] / ["rotate90"]），或传 cropW+cropH 做画面裁切');
      out = await mkOut('videos', '.mp4');
      const vf = `${parts.join(',')},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`;
      const cmd = ['-y', '-i', v.file, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20'];
      if (info.hasAudio) cmd.push('-c:a', 'copy'); else cmd.push('-an');
      cmd.push('-movflags', '+faststart', out.file);
      r = await runFfmpeg(ff.ffmpeg, cmd, 600000);
      if (!r.ok) return fail(`画面变换失败：${r.stderr}`);
    } else if (op === 'fade') {
      const v = requireLocalFile(args.video, 'video');
      if (!v.ok) return fail(v.error);
      const info = await probeMedia(ff.ffprobe, v.file);
      const total = info.durationSec;
      const din = Math.max(0, num(args, 'fadeIn', 1));
      const dout = Math.max(0, num(args, 'fadeOut', 1));
      const vparts: string[] = [];
      if (din > 0) vparts.push(`fade=t=in:st=0:d=${din}`);
      if (dout > 0 && total > 0) vparts.push(`fade=t=out:st=${Math.max(0, total - dout).toFixed(3)}:d=${dout}`);
      if (!vparts.length) return fail('fadeIn / fadeOut 至少给一个 > 0 的值（片尾淡出需能探到时长）');
      out = await mkOut('videos', '.mp4');
      const vf = `${vparts.join(',')},scale=trunc(iw/2)*2:trunc(ih/2)*2`;
      const cmd = ['-y', '-i', v.file, '-vf', vf];
      if (info.hasAudio) {
        const aparts: string[] = [];
        if (din > 0) aparts.push(`afade=t=in:st=0:d=${din}`);
        if (dout > 0 && total > 0) aparts.push(`afade=t=out:st=${Math.max(0, total - dout).toFixed(3)}:d=${dout}`);
        cmd.push('-af', aparts.join(','), '-c:a', 'aac', '-b:a', '192k');
      } else cmd.push('-an');
      cmd.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out.file);
      r = await runFfmpeg(ff.ffmpeg, cmd, 600000);
      if (!r.ok) return fail(`淡入淡出失败：${r.stderr}`);
      note = `画面淡入 ${din}s / 淡出 ${dout}s${info.hasAudio ? '（声音同步淡入淡出）' : ''}`;
    } else if (op === 'color') {
      const v = requireLocalFile(args.video, 'video');
      if (!v.ok) return fail(v.error);
      const info = await probeMedia(ff.ffprobe, v.file);
      const preset = str(args, 'preset').trim().toLowerCase();
      let core: string;
      if (preset) {
        if (!COLOR_PRESETS[preset]) {
          return fail(`未知调色预设 ${preset}；可选：${Object.keys(COLOR_PRESETS).join(' / ')}（也可不用 preset，直接传 brightness/contrast/saturation/gamma/hue）`);
        }
        core = COLOR_PRESETS[preset];
      } else {
        const parts: string[] = [];
        const eqArgs: string[] = [];
        if (args.brightness != null) eqArgs.push(`brightness=${num(args, 'brightness', 0)}`);
        if (args.contrast != null) eqArgs.push(`contrast=${num(args, 'contrast', 1)}`);
        if (args.saturation != null) eqArgs.push(`saturation=${num(args, 'saturation', 1)}`);
        if (args.gamma != null) eqArgs.push(`gamma=${num(args, 'gamma', 1)}`);
        if (eqArgs.length) parts.push(`eq=${eqArgs.join(':')}`);
        if (args.hue != null) parts.push(`hue=h=${num(args, 'hue', 0)}`);
        if (!parts.length) return fail('至少给一个：preset 或 brightness / contrast / saturation / gamma / hue');
        core = parts.join(',');
      }
      out = await mkOut('videos', '.mp4');
      const vf = `${core},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`;
      const cmd = ['-y', '-i', v.file, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20'];
      if (info.hasAudio) cmd.push('-c:a', 'copy'); else cmd.push('-an');
      cmd.push('-movflags', '+faststart', out.file);
      r = await runFfmpeg(ff.ffmpeg, cmd, 900000);
      if (!r.ok) return fail(`调色失败：${r.stderr}`);
      note = preset ? `调色预设：${preset}` : '自定义调色';
    } else if (op === 'transition') {
      const a = requireLocalFile(args.video, 'video');
      if (!a.ok) return fail(a.error);
      const b = requireLocalFile(args.video2, 'video2');
      if (!b.ok) return fail(b.error);
      const d = Math.min(Math.max(num(args, 'duration', 0.8), 0.1), 5);
      const kind = str(args, 'type').trim().toLowerCase() || 'fade';
      if (!XFADE_TYPES.includes(kind)) return fail(`未知转场类型 ${kind}；可选：${XFADE_TYPES.join(' / ')}`);
      const ia = await probeMedia(ff.ffprobe, a.file);
      const ib = await probeMedia(ff.ffprobe, b.file);
      if (ia.durationSec <= d) {
        return fail(`首段时长 ${ia.durationSec}s 不足以做 ${d}s 转场（xfade 的 offset 必须小于首段时长）`);
      }
      const offset = (ia.durationSec - d).toFixed(3);
      const bothAudio = ia.hasAudio && ib.hasAudio;
      const fc = bothAudio
        ? `[0:v][1:v]xfade=transition=${kind}:duration=${d}:offset=${offset}[v];[0:a][1:a]acrossfade=d=${d}[a]`
        : `[0:v][1:v]xfade=transition=${kind}:duration=${d}:offset=${offset}[v]`;
      out = await mkOut('videos', '.mp4');
      const cmd = ['-y', '-i', a.file, '-i', b.file, '-filter_complex', fc, '-map', '[v]'];
      if (bothAudio) cmd.push('-map', '[a]', '-c:a', 'aac', '-b:a', '192k');
      cmd.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out.file);
      r = await runFfmpeg(ff.ffmpeg, cmd, 900000);
      if (!r.ok) {
        return fail(
          `转场失败（xfade 要求两段**规格完全一致**：分辨率 / 帧率 / 像素格式）：\n${r.stderr}\n` +
          `正解：先调 api_media_normalize { videos: [两段路径], size: "1080x1920" } 统一规格再转场。`,
        );
      }
      note = bothAudio ? `转场：${kind}（含音频交叉淡入）` : `转场：${kind}（两段未都有音轨 → 仅画面转场）`;
    } else if (op === 'overlay') {
      const base = requireLocalFile(args.video, 'video');
      if (!base.ok) return fail(base.error);
      const ov = requireLocalFile(args.overlay, 'overlay');
      if (!ov.ok) return fail(ov.error);
      const isImg = /\.(png|jpe?g|webp|gif|bmp)$/i.test(ov.file);
      const bi = await probeMedia(ff.ffprobe, base.file);
      const ow = num(args, 'overlayWidth', 0);
      const chain: string[] = [];
      if (ow > 0) chain.push(`scale=${Math.round(ow)}:-2`);
      else if (isImg) chain.push(`scale=iw*${Math.min(Math.max(num(args, 'overlayScale', 0.18), 0.02), 1).toFixed(4)}:-2`);
      const opa = Math.min(Math.max(num(args, 'opacity', 1), 0.05), 1);
      if (opa < 1) chain.push(`format=rgba,colorchannelmixer=aa=${opa.toFixed(3)}`);
      if (!chain.length) chain.push('null');
      const pos = str(args, 'position').trim().toLowerCase() || 'br';
      const m = Math.max(0, Math.round(num(args, 'margin', 24)));
      const XY: Record<string, [string, string]> = {
        tl: [String(m), String(m)],
        tr: [`W-w-${m}`, String(m)],
        bl: [String(m), `H-h-${m}`],
        br: [`W-w-${m}`, `H-h-${m}`],
        center: ['(W-w)/2', '(H-h)/2'],
        top: ['(W-w)/2', String(m)],
        bottom: ['(W-w)/2', `H-h-${m}`],
      };
      const [x, y] = XY[pos] || XY.br;
      out = await mkOut('videos', '.mp4');
      const fc = `[1:v]${chain.join(',')}[ov];[0:v][ov]overlay=${x}:${y}[v]`;
      const cmd = ['-y', '-i', base.file, ...(isImg ? ['-loop', '1'] : []), '-i', ov.file, '-filter_complex', fc, '-map', '[v]'];
      if (bi.hasAudio) cmd.push('-map', '0:a:0', '-c:a', 'copy'); else cmd.push('-an');
      cmd.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p');
      // 落位时长：能探到基准时长就用 -t 锁死（图片叠加不锁会无限写盘；视频叠加不锁会被 overlay 拉长）
      if (bi.durationSec > 0) cmd.push('-t', bi.durationSec.toFixed(3));
      else cmd.push('-shortest');
      cmd.push('-movflags', '+faststart', out.file);
      r = await runFfmpeg(ff.ffmpeg, cmd, 900000);
      if (!r.ok) return fail(`画中画/贴图失败：${r.stderr}`);
      note = `叠加位置 ${pos}${opa < 1 ? `，不透明度 ${opa}` : ''}`;
    } else if (op === 'kenburns') {
      const img = requireLocalFile(args.image, 'image');
      if (!img.ok) return fail(img.error);
      if (!/\.(png|jpe?g|webp|bmp)$/i.test(img.file)) {
        return fail('kenburns 只处理静态图片（png/jpg/webp/bmp）——视频运镜请用 transform，或先 op=snapshot 抽帧');
      }
      const dur = Math.min(Math.max(num(args, 'duration', 6), 1), 120);
      const size = str(args, 'size').trim() || '1080x1920';
      if (!/^\d{2,5}x\d{2,5}$/.test(size)) return fail(`size 形如 1080x1920（宽x高）：${size}`);
      const fps = Math.round(Math.min(Math.max(num(args, 'fps', 30), 1), 60));
      const [ow, oh] = size.split('x').map((n) => Number(n));
      const dir = str(args, 'direction').trim().toLowerCase() || 'in';
      const frames = Math.max(2, Math.round(dur * fps));
      const step = (0.25 / frames).toFixed(6);
      const zExpr = dir === 'out'
        ? `if(eq(on,1),1.25,max(zoom-${step},1.0))`
        : `min(zoom+${step},1.25)`;
      // 先放大 4 倍再 zoompan：直接对原图做 zoom 会因亚像素抖动（jitter）明显
      const vf = `scale=${ow * 4}:-2,zoompan=z='${zExpr}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${ow}x${oh}:fps=${fps},format=yuv420p`;
      out = await mkOut('videos', '.mp4');
      r = await runFfmpeg(ff.ffmpeg, [
        '-y', '-loop', '1', '-i', img.file, '-t', String(dur),
        '-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
        '-vf', vf, '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
        '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out.file,
      ], 900000);
      if (!r.ok) return fail(`图片运镜失败：${r.stderr}`);
      note = `图片 → ${dur}s ${size} 视频（${dir === 'out' ? '向外拉远' : '向内推近'}），已补静音轨`;
    } else if (op === 'bgsound') {
      const v = requireLocalFile(args.video, 'video');
      if (!v.ok) return fail(v.error);
      const bgm = requireLocalFile(args.audio, 'audio');
      if (!bgm.ok) return fail(bgm.error);
      const vi = await probeMedia(ff.ffprobe, v.file);
      if (!vi.hasAudio) {
        return fail('视频没有原音轨，无法做「BGM + 原声」混音；请先 op=normalize 补静音轨，或直接用 media_compose op=dub 铺一条音乐');
      }
      const vol = Math.min(Math.max(num(args, 'volume', 0.25), 0), 1);
      const duck = args.duck === true;
      const din = Math.max(0, num(args, 'fadeIn', 0.5));
      const dout = Math.max(0, num(args, 'fadeOut', 1.5));
      const total = vi.durationSec;
      const bgChain = [`volume=${vol.toFixed(3)}`];
      if (din > 0) bgChain.push(`afade=t=in:st=0:d=${din}`);
      if (dout > 0 && total > 0) bgChain.push(`afade=t=out:st=${Math.max(0, total - dout).toFixed(3)}:d=${dout}`);
      // ★ 两条分支的图结构**不一样**，不能共用 asplit：
      //   - duck：原声要同时喂给 amix 与 sidechaincompress → 才需要 asplit 分流；
      //   - 非 duck：原声只喂 amix 一次 → **不要 asplit**。加了而不用，ffmpeg 会报
      //     「Filter 'asplit' has output 0 (v2) unconnected」直接失败（实测踩到）。
      const fc = duck
        ? `[0:a]asplit=2[v1][v2];[1:a]${bgChain.join(',')}[bg];[bg][v2]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[bgd];[v1][bgd]amix=inputs=2:duration=first:dropout_transition=2[a]`
        : `[1:a]${bgChain.join(',')}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]`;
      out = await mkOut('videos', '.mp4');
      r = await runFfmpeg(ff.ffmpeg, [
        '-y', '-i', v.file, '-i', bgm.file,
        '-filter_complex', fc, '-map', '0:v:0', '-map', '[a]',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out.file,
      ], 900000);
      if (!r.ok) return fail(`背景音乐混音失败：${r.stderr}`);
      note = `BGM 音量 ${vol}${duck ? '，已开启「说话时自动压低」' : ''}${dout > 0 ? `，片尾 ${dout}s 淡出` : ''}`;
    } else if (op === 'volume') {
      const m = requireLocalFile(args.media, 'media');
      if (!m.ok) return fail(m.error);
      const hasDb = args.db != null;
      const hasFactor = args.factor != null;
      if (!hasDb && !hasFactor) return fail('给 db（分贝增益，如 -6 或 3）或 factor（倍数，如 1.5）之一');
      const spec = hasDb ? `${num(args, 'db', 0)}dB` : String(num(args, 'factor', 1));
      const isVideo = VIDEO_EXT.test(m.file);
      out = isVideo ? await mkOut('videos', '.mp4') : await mkOut('audios', '.m4a');
      const cmd = ['-y', '-i', m.file, '-af', `volume=${spec}`];
      if (isVideo) cmd.push('-c:v', 'copy');
      cmd.push('-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out.file);
      r = await runFfmpeg(ff.ffmpeg, cmd, 900000);
      if (!r.ok) return fail(`音量调整失败：${r.stderr}`);
      note = `音量 ${spec}`;
    } else if (op === 'loudnorm') {
      // loudnorm：EBU R128 响度归一（多段素材拼长片后音量忽大忽小，靠它拉平）
      const m = requireLocalFile(args.media, 'media');
      if (!m.ok) return fail(m.error);
      const i = num(args, 'target', -16);
      const tp = num(args, 'truePeak', -1.5);
      const lra = num(args, 'lra', 11);
      const isVideo = VIDEO_EXT.test(m.file);
      out = isVideo ? await mkOut('videos', '.mp4') : await mkOut('audios', '.m4a');
      const cmd = ['-y', '-i', m.file, '-af', `loudnorm=I=${i}:TP=${tp}:LRA=${lra}`];
      if (isVideo) cmd.push('-c:v', 'copy');
      cmd.push('-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out.file);
      r = await runFfmpeg(ff.ffmpeg, cmd, 900000);
      if (!r.ok) return fail(`响度归一失败：${r.stderr}`);
      note = `响度已归一到 I=${i} LUFS / TP=${tp} dBTP`;
    } else {
      // 兜底：正常不可达（op 已在函数入口按 MEDIA_EDIT_OPS 校验过）——留着是为了
      // 将来加 op 时漏写分支能立刻暴露，而不是静默走到某个 op 的逻辑里。
      return fail(`未实现的 media_edit op：${op}`);
    }

    const st = await stat(out.file);
    const isImage = /\.(jpe?g|png|webp)$/i.test(out.file);
    return ok(JSON.stringify({
      ok: true,
      type: isImage ? 'image' : 'video',
      engine: 'ffmpeg', op, source: ff.source,
      url: `${out.tg.urlBase}/${path.basename(out.file)}`,
      file: out.file, bytes: st.size,
      ...(note ? { note } : {}),
    }));
  } catch (e: unknown) {
    return fail(`剪辑失败：${e instanceof Error ? e.message : String(e)}`);
  }
}

async function mediaGenerateVideo(
  args: Record<string, unknown>,
  userId?: string | null,
  conversationId?: string,
): Promise<MpcToolExecutionResult> {
  const prompt = str(args, 'prompt').trim();
  if (!prompt) return fail('prompt 为必填项');
  const model = str(args, 'model') || 'agnes-video-2.5-flash';
  const seconds = str(args, 'seconds') || '5';
  const size = str(args, 'size') || '720P';
  const waitMinutes = Math.min(Math.max(num(args, 'waitMinutes', 8), 1), 10);
  const ctx = resolveMediaPlatform(args, userId);
  if (!ctx.ok) return fail(ctx.error);
  const baseUrl = ctx.baseUrl;
  const keys = ctx.keys;
  const isAgnes = ctx.isAgnes;
  if (!keys.length) return fail('未找到该平台的 API Key（Token 池为空），请先在模型平台里配置');

  // 1) 提交任务（429/401/403 换下一把 key）
  // 图生视频/关键帧：firstFrame/lastFrame 透传为 first_frame/last_frame（字段名已被接口识别，
  // 但 mode 路由当前未开放——提交会得到明确报错，平台开放后零改动生效）
  const firstFrameRaw = str(args, 'firstFrame').trim();
  const lastFrameRaw = str(args, 'lastFrame').trim();
  let firstFrameRef = '';
  let lastFrameRef = '';
  if (firstFrameRaw) {
    firstFrameRef = await toFrameRef(firstFrameRaw) || '';
    if (!firstFrameRef) return fail(`首帧图不可读（支持 URL / base64 / 本机路径）：${firstFrameRaw.slice(0, 80)}`);
  }
  if (lastFrameRaw) {
    lastFrameRef = await toFrameRef(lastFrameRaw) || '';
    if (!lastFrameRef) return fail(`尾帧图不可读（支持 URL / base64 / 本机路径）：${lastFrameRaw.slice(0, 80)}`);
  }
  const MEDIA_NOT_OPEN_HINT = '图生视频/关键帧功能在 agnes API 侧尚未开放（接口的 mode 参数当前只接受 "text"）。请改用纯文字提示词生成视频，或等平台开放后重试。';
  let taskId = '';
  let submitKey = '';
  let lastErr = '';
  for (const key of keys) {
    let res: Response;
    try {
      res = await fetchWithTimeout(`${baseUrl}/v1/videos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, prompt, seconds, size,
          // mode:'text' 是 agnes 专有约定（其他 OpenAI 兼容平台不接受多余参数）
          ...(isAgnes ? { mode: 'text' } : {}),
          // agnes：first_frame/last_frame（字段名已识别，路由开放前报「暂未开放」）；
          // 其他平台：OpenAI Sora 风格 input_reference
          ...(isAgnes
            ? {
              ...(firstFrameRef ? { first_frame: firstFrameRef } : {}),
              ...(lastFrameRef ? { last_frame: lastFrameRef } : {}),
            }
            : { ...(firstFrameRef ? { input_reference: firstFrameRef } : {}) }),
        }),
      }, 60000);
    } catch (e: unknown) {
      lastErr = e instanceof Error ? e.message : String(e);
      continue;
    }
    const text = await res.text();
    if (res.status === 429 || res.status === 401 || res.status === 403) {
      bumpAgensKeyFail(key);
      lastErr = `HTTP ${res.status}: ${text.slice(0, 200)}`;
      continue;
    }
    if (!res.ok) {
      if (isAgnes && /media fields|invalid mode/i.test(text)) return fail(MEDIA_NOT_OPEN_HINT);
      return fail(`视频任务提交失败 HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    try {
      const j = JSON.parse(text);
      taskId = String(j?.task_id || j?.taskId || j?.id || j?.video_id || '');
    } catch { /* ignore */ }
    if (!taskId) return fail(`视频任务响应里没有 task_id：${text.slice(0, 300)}`);
    // 任务归属提交它的那把 key（换 key 查会报 task_not_exist，2026-09-15 实测），轮询/下载必须沿用
    submitKey = key;
    break;
  }
  if (!taskId) return fail(`所有 agnes Key 均不可用（限频或无效）：${lastErr}`);

  // 2) 轮询直到完成/失败/超时（用提交时的同一把 key）
  const pollKey = submitKey;
  const deadline = Date.now() + waitMinutes * 60 * 1000;
  let status = '';
  let finalJson: any = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10000));
    try {
      const res = await fetchWithTimeout(`${baseUrl}/v1/videos/${taskId}`, {
        headers: { Authorization: `Bearer ${pollKey}` },
      }, 30000);
      const text = await res.text();
      if (res.ok) {
        try {
          finalJson = JSON.parse(text);
          status = taskStatus(finalJson);
        } catch { /* 下轮再试 */ }
      }
    } catch { /* 网络抖动下轮再试 */ }
    if (['completed', 'succeeded', 'success', 'finished', 'done'].includes(status)) break;
    if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
      return fail(`视频任务失败（taskId=${taskId}）：${JSON.stringify(finalJson).slice(0, 400)}`);
    }
  }
  if (!['completed', 'succeeded', 'success', 'finished', 'done'].includes(status)) {
    return ok(JSON.stringify({
      ok: false,
      pending: true,
      model,
      taskId,
      status: status || 'processing',
      note: `视频任务已提交且仍在处理中（等待 ${waitMinutes} 分钟未完成）。可用 api_video_status 工具传 taskId=${taskId} 继续查询，不要重复提交同样的任务。`,
    }));
  }

  // 3) 拿视频地址（响应带 url 优先；否则试 /content 直下）
  const remoteUrl = extractVideoUrl(finalJson);
  let localFile = '';
  let localUrl = '';
  try {
    let buf: Buffer | null = null;
    if (remoteUrl) {
      try {
        buf = await downloadBinary(remoteUrl, 300000);
      } catch {
        // 产物 CDN 域名（platform-outputs.*）可能本机直连不通（2026-09-15 实测：
        // agnes-ai.com 主域 200，platform-outputs.agnes-ai.space 连接超时），
        // 此时回退主域 /content 端点直下——它挂在 API 主域上，与提交/轮询同源可达
        buf = null;
      }
    }
    if (!buf || buf.length === 0) {
      const res = await fetchWithTimeout(`${baseUrl}/v1/videos/${taskId}/content`, {
        headers: { Authorization: `Bearer ${pollKey}` },
      }, 300000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
    }
    if (buf.length > 0) {
      const target = mediaTarget({ conversationId, kind: 'videos' });
      await mkdir(target.dir, { recursive: true });
      const file = path.join(target.dir, `video-${Date.now()}${extFromUrl(remoteUrl, '.mp4')}`);
      await writeFile(file, buf);
      localFile = file;
      localUrl = `${target.urlBase}/${path.basename(file)}`;
    }
  } catch (e: unknown) {
    console.warn(`[media] 生视频产物落盘失败（来源：${remoteUrl ? '远端地址' : '上游直出'}）：${e instanceof Error ? e.message : String(e)}`);
  }

  return ok(JSON.stringify({
    ok: true,
    type: 'video',
    model,
    taskId,
    status,
    url: localUrl || remoteUrl,
    description: `${prompt}（${seconds} 秒 · ${size}）`,
    file: localFile || undefined,
  }));
}

async function mediaVideoStatus(args: Record<string, unknown>, userId?: string | null, conversationId?: string): Promise<MpcToolExecutionResult> {
  const taskId = str(args, 'taskId').trim();
  if (!taskId) return fail('taskId 为必填项');
  const ctx = resolveMediaPlatform(args, userId);
  if (!ctx.ok) return fail(ctx.error);
  const { baseUrl, keys } = ctx;
  if (!keys.length) return fail('未找到该平台的 API Key');
  // 任务归属提交它的 key；这里不知道是哪把，逐把试到命中（task_not_exist 换下一把）
  let lastErr = '';
  for (const key of keys) {
    const res = await fetchWithTimeout(`${baseUrl}/v1/videos/${taskId}`, {
      headers: { Authorization: `Bearer ${key}` },
    }, 30000).catch(() => null);
    if (!res) { lastErr = '网络错误'; continue; }
    const text = await res.text();
    if (!res.ok) { lastErr = `HTTP ${res.status}: ${text.slice(0, 200)}`; continue; }
    try {
      const j = JSON.parse(text);
      const st = taskStatus(j);
      const remoteUrl = extractVideoUrl(j);
      // 补查到已完成却没落过盘的视频，就地补落盘 —— 任务超时后模型都会走这里补查，
      // 不补的话产物永远停在远程 url（CDN 直连不通时连画面都没有）
      let localFile = '';
      let localUrl = '';
      if (['completed', 'succeeded', 'success', 'finished', 'done'].includes(st)) {
        try {
          let buf: Buffer | null = null;
          if (remoteUrl) {
            try { buf = await downloadBinary(remoteUrl, 300000); } catch { buf = null; }
          }
          if (!buf || buf.length === 0) {
            const r2 = await fetchWithTimeout(`${baseUrl}/v1/videos/${taskId}/content`, {
              headers: { Authorization: `Bearer ${key}` },
            }, 300000);
            if (r2.ok) buf = Buffer.from(await r2.arrayBuffer());
          }
          if (buf && buf.length > 0) {
            const target = mediaTarget({ conversationId, kind: 'videos' });
            await mkdir(target.dir, { recursive: true });
            const file = path.join(target.dir, `video-${Date.now()}${extFromUrl(remoteUrl, '.mp4')}`);
            await writeFile(file, buf);
            localFile = file;
            localUrl = `${target.urlBase}/${path.basename(file)}`;
          }
        } catch { /* 补落盘失败不影响状态查询结果 */ }
      }
      return ok(JSON.stringify({
        taskId, status: st,
        // 补落盘成功时给完整媒体契约，前端卡片与文件登记按新生成同样处理
        ...(localUrl ? { ok: true, type: 'video', url: localUrl, file: localFile } : {}),
        ...(localUrl ? {} : { remoteUrl: remoteUrl || undefined }),
        ...(localFile ? {} : { raw: j }),
      }));
    } catch {
      lastErr = `响应不是合法 JSON：${text.slice(0, 200)}`;
    }
  }
  return fail(`查询失败：${lastErr}`);
}


export async function executeApiTool(
  name: string,
  args: Record<string, unknown>,
  userId?: string,
  agentId?: string,
  /** 任务级显式挂载（前端随 /llm/tasks 下发）；给出时优先于 server agent 表读取 */
  explicitOntologyIds?: string[],
  /** 当前会话 ID：空间记忆类工具用它解析默认空间（会话归属哪个空间就读写哪个空间） */
  conversationId?: string,
  /** 当前会话工作目录：代码语义检索等工具用它解析相对路径（调用方算好直接传，core 同一取向） */
  workspaceDir?: string | null,
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

      /**
       * api_conversation_setup —— 让模型设置**当前会话**的智能体 / 技能 / 工作模式。
       *
       * ★★ 为什么需要（2026-09-27 用户要求「智能体可以自己设置当前会话的智能体和 skill 和工作流程」）：
       *   用户在对话里说"你现在按翻译助手来""这个会话挂上口播技能""切到工作流模式"时，
       *   此前只能让用户自己去 UI 里点。让模型能直接落这个决定，它才能当场按新身份继续干活。
       *
       * ★ 「工作流程」= 把会话切到**工作流型智能体**（`type='workflow'`，如短剧流水线 / 小说改写流水线）
       *   或切到工作流模式（mode='wf'）。两种都在这里做：agentId 传工作流型智能体即可。
       * ★ 缺省操作**当前会话**（模型基本不需要知道会话 id，且知道也不该乱设别人的）。
       *
       * ★★ 三条必须校验的（否则是静默失效）：
       *   ① 智能体必须存在且属于本用户（或公开）—— 否则设了个悬空 id，
       *      后端查不到 agent 行 → **工具挂载/子智能体/技能全线静默降级为空**（项目里踩过）；
       *   ② 技能 id 必须真实存在 —— 悬空 skill 不会报错，只是不注入；
       *   ③ mode 必须是合法值 —— 非法值会让会话在哪个模式列表里都看不到。
       *   三条都**明确报错并给可选值**，不静默吞。
       */
      case 'api_conversation_setup': {
        const uid = requireUser(userId);
        const cid = str(args, 'conversationId') || conversationId || '';
        if (!cid) return fail('当前没有会话可设置（请在对话中调用，或显式传 conversationId）');
        const conv = db.prepare('SELECT id FROM conversation WHERE id = ? AND user_id = ?').get(cid, uid);
        if (!conv) return fail('会话不存在或不属于当前用户');

        const applied: Record<string, unknown> = {};
        const denied: string[] = [];

        // ── 智能体（含"切工作流"：工作流型智能体就是 type='workflow'）──
        if (args.agentId !== undefined) {
          const aid = str(args, 'agentId');
          const row = db
            .prepare("SELECT id, name, type, agent_kind FROM agent WHERE id = ? AND (user_id = ? OR is_public = 1)")
            .get(aid, uid) as { id: string; name: string; type: string; agent_kind: string } | undefined;
          if (!row) {
            return fail(`智能体「${aid}」不存在或不可用。可用 list_sub_agents / api_agent_list 查看可选智能体`);
          }
          // ★ 工作流型智能体不能作为会话智能体：它在 ReAct 循环里没有 system_prompt 与工具，
          //   会被当成"你是一个智能助手 + 零工具"跑出一段无关空谈（且不报错）。
          //   这是既有约束（llm-task-manager 里有专门拦截），这里提前拦掉并给出正确用法。
          if (row.type === 'workflow') {
            denied.push(
              `「${row.name}」是工作流型智能体，不能直接作为会话智能体（它没有对话人格与工具）。` +
              `正确用法：用 wf_${row.id} 工具运行它，或让当前会话通过 call_agent 委派。`,
            );
          } else {
            db.prepare('UPDATE conversation SET agent_id = ? WHERE id = ?').run(aid, cid);
            applied.agentId = aid;
            applied.agentName = row.name;
          }
        }

        // ── 技能（会话级挂载；与 agent 挂载取并集）──
        if (args.skillIds !== undefined) {
          const raw = Array.isArray(args.skillIds) ? args.skillIds.map(String) : [];
          const valid: string[] = [];
          const unknown: string[] = [];
          for (const sk of raw) {
            const hit = db.prepare('SELECT id FROM skill WHERE id = ? AND enabled = 1').get(sk);
            if (hit) valid.push(sk); else unknown.push(sk);
          }
          if (unknown.length) {
            return fail(
              `技能不存在或已禁用：${unknown.join('、')}。可用 api_skill_list 查看可选技能。` +
              (valid.length ? `（可用的部分未写入，请修正后重试）` : ''),
            );
          }
          db.prepare('UPDATE conversation SET skill_ids_json = ? WHERE id = ?').run(JSON.stringify(valid), cid);
          applied.skillIds = valid;
        }

        // ── 自定义工具（会话级挂载；与 agent 挂载取并集）──
        // ★ 为什么需要（2026-09-28）：模型用 api_custom_tool_create 造了个工具后，
        //   此前只能靠 api_agent_mount 改**智能体本体**（影响该智能体所有会话），粒度不对。
        //   这里提供会话级挂载，让"临时造的工具只作用于当前会话"。
        if (args.customToolIds !== undefined) {
          const raw = Array.isArray(args.customToolIds) ? args.customToolIds.map(String) : [];
          const valid: string[] = [];
          const unknown: string[] = [];
          for (const ct of raw) {
            const hit = db.prepare('SELECT id FROM custom_tool WHERE id = ? AND user_id = ? AND enabled = 1').get(ct, uid);
            if (hit) valid.push(ct); else unknown.push(ct);
          }
          if (unknown.length) {
            return fail(
              `自定义工具不存在、已禁用或不属于当前用户：${unknown.join('、')}。可用 api_custom_tool_list 查看。` +
              (valid.length ? `（可用的部分未写入，请修正后重试）` : ''),
            );
          }
          db.prepare('UPDATE conversation SET custom_tool_ids_json = ? WHERE id = ?').run(JSON.stringify(valid), cid);
          applied.customToolIds = valid;
        }

        // ── 工作模式（office / dev / ops / sec / wf）──
        if (args.mode !== undefined) {
          const MODES = ['office', 'dev', 'ops', 'sec', 'wf'];
          const m = str(args, 'mode');
          if (!MODES.includes(m)) {
            return fail(`未知的工作模式「${m}」。可选值：${MODES.join('、')}（wf = 工作流模式）`);
          }
          db.prepare('UPDATE conversation SET mode = ? WHERE id = ?').run(m, cid);
          applied.mode = m;
        }

        if (!Object.keys(applied).length && !denied.length) {
          return fail('没有要设置的项：请至少传 agentId / skillIds / mode 之一');
        }
        db.prepare('UPDATE conversation SET updated_at = ? WHERE id = ?').run(Date.now(), cid);

        // ★★ 一项都没落地 → 必须返回**失败**，不能只把原因塞在 rejected 里配 isError:false。
        //   实测（2026-09-27）：只传一个工作流型智能体时返回 `applied:{} + rejected:[…] + isError:false`，
        //   模型很可能当成"设置成功"继续往下跑 —— 换身份失败却以为换成功了，
        //   比直接报错更难发现（与项目里"静默失效"同一类问题）。
        if (!Object.keys(applied).length && denied.length) {
          return fail(denied.join('\n'));
        }

        return ok({
          conversationId: cid,
          applied,
          ...(denied.length ? { rejected: denied } : {}),
          note: denied.length
            ? '部分设置被拒绝（见 rejected），其余已生效。'
            : '已生效；下一轮对话起按新的智能体/技能/模式执行（技能与智能体挂载取并集）。',
        });
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
        const newModelId = str(args, 'modelId');
        const caps = Array.isArray(args.capabilities) ? (args.capabilities as string[]) : [];
        db.prepare(
          'INSERT INTO model (id, platform_id, user_id, model_id, alias, type, context_window, capabilities_json, pricing_json, description, enabled, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)',
        ).run(id, str(args, 'platformId'), uid, newModelId, str(args, 'alias') || null, str(args, 'type') || 'llm', num(args, 'contextWindow', DEFAULT_CONTEXT_WINDOW),
          JSON.stringify(caps.length ? caps : inferCapabilitiesFromModelId(newModelId)), '{}', str(args, 'description') || null, Date.now());
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
        // ★★ runtime 必须可由模型指定（2026-09-29 修）。
        //
        // 此前这里**硬编码 'node'** → 模型只能造 Node 工具，**造不出 Python 工具**，
        // 而 `runUserCode` 与 `custom_tool.runtime` 列**本来就支持 python**（python 走真子进程，
        // 有完整标准库与第三方包）。用户诉求「发现没工具就用 Python 搞一个挂上去」因此落不了地。
        // 现在：runtime 缺省 'node'，显式传 'python' 则按 python 建（执行侧 runUserCode 已分流）。
        const runtime = (() => {
          const r = str(args, 'runtime').trim().toLowerCase();
          return r === 'python' ? 'python' : 'node';
        })();
        // 依赖声明：node → npm 包名数组；python → pip 包名数组。
        // 只存声明，不在此处安装（安装走 api_custom_tool_run 的按需安装，见 installToolDependencies）。
        const deps = Array.isArray(args.dependencies) ? args.dependencies.map(String).filter(Boolean) : [];
        db.prepare(
          `INSERT INTO custom_tool (id, user_id, name, description, input_schema_json, output_schema_json, runtime, entry, code, dependencies_json, timeout, env_json, enabled, source, is_public, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', 1, 'local', 0, ?, ?)`,
        ).run(
          id, uid, str(args, 'name'), str(args, 'description') || null,
          JSON.stringify(obj(args, 'inputSchema') || {}), null,
          runtime, str(args, 'entry'), str(args, 'code'),
          JSON.stringify(deps), num(args, 'timeout', 30000), ts, ts,
        );
        const created = db.prepare('SELECT * FROM custom_tool WHERE id = ?').get(id) as any;
        // 回显时把「怎么调用它」一并给出：模型造完常常忘了要先挂载（会话级/智能体级）才能调用。
        return ok({
          ...created,
          _howToCall: [
            `已创建（runtime=${runtime}${deps.length ? `，声明依赖 ${deps.join(', ')}` : ''}）。要能调用还需两步：`,
            `1) 挂载：api_conversation_setup({ customToolIds: ["${id}"] }) 挂到当前会话（推荐，不污染智能体）；或 api_agent_mount 挂到智能体。`,
            `2) 下一轮对话即可用；也可用 api_custom_tool_execute({ id: "${id}", args: {...} }) 立即试跑。`,
            deps.length ? `依赖会在首次执行时按需安装（见执行结果回显）。` : '',
          ].filter(Boolean).join('\n'),
        });
      }
      case 'api_custom_tool_update': {
        const uid = requireUser(userId);
        const id = str(args, 'id');
        const sets: string[] = [];
        const vals: any[] = [];
        if (args.code !== undefined) { sets.push('code = ?'); vals.push(args.code); }
        if (args.description !== undefined) { sets.push('description = ?'); vals.push(args.description); }
        // 允许改 runtime / dependencies：造完发现"该用 python""漏声明了依赖"是常态，
        // 不许改就只能删了重建（工具 id 会变，已挂载的引用全失效）。
        if (args.runtime !== undefined) {
          const r = str(args, 'runtime').trim().toLowerCase();
          sets.push('runtime = ?'); vals.push(r === 'python' ? 'python' : 'node');
        }
        if (args.dependencies !== undefined) {
          const deps = Array.isArray(args.dependencies) ? args.dependencies.map(String).filter(Boolean) : [];
          sets.push('dependencies_json = ?'); vals.push(JSON.stringify(deps));
          // 依赖清单变了 → 清模块缓存，避免继续用旧版本加载的模块
          const { clearNodeModuleCache } = await import('../services/tool-deps.js');
          clearNodeModuleCache();
        }
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
      //
      // ★★ 工作目录边界守卫（2026-10-01）：这两个工具此前接受**任意绝对路径** ——
      //   `listWorkspaceDir` 内部 `path.resolve(dirPath || workspaceDir || cwd)`，
      //   给了绝对路径就原样用（api-tool-executor.ts:3529）→ 只读会话也能枚举整个磁盘。
      //
      // ★ 为什么守卫放在这里（而主链路的 executeTool 里也有一次）：
      //   本函数是 `api_*` 工具的**唯一执行点**，有 4 个调用方
      //   （ReAct 主链路 / 工作流 / mcp registry / UI 试跑）。放在这里才不会漏。
      //   与主链路那次**共用同一份判据与同一份白名单**（services/path-guard 的模块级状态）
      //   → 主链路弹窗授权后，这里能读到白名单放行；工作流直调（无白名单）则 fail-safe 拒绝。
      //   —— 不是"两处各自判定"，而是"同一判据在不同入口的不同处置"（方案 §2.1 的设计）。
      case 'api_workspace_list_dir': {
        const { checkPathAccess, allowedRootsFor, getAuthorizedDirs } = await import('../services/path-guard.js');
        const { serverState } = await import('../state.js');
        const wsDir = serverState.workspaceDir || null;
        const verdict = checkPathAccess({
          toolName: 'api_workspace_list_dir',
          args,
          workspaceDir: wsDir,
          allowedRoots: allowedRootsFor(wsDir, conversationId || null),
          authorizedDirs: conversationId ? getAuthorizedDirs(conversationId) : [],
        });
        if (verdict.kind === 'need-auth') {
          return fail(`路径在工作目录外（${verdict.items.map((i) => i.rawPath).join(', ')}），已拒绝。请改用工作目录内的路径。`);
        }
        return ok(await listWorkspaceDir(str(args, 'path')));
      }
      case 'api_workspace_search_files':
        // 只接受 pattern、不接受路径 → 天然限制在工作目录内，无需守卫
        return ok(await searchWorkspaceFiles(str(args, 'pattern')));

      case 'api_code_semantic_search': {
        // 语义代码检索（P1，2026-10-03）：embedding 管道接到代码库上
        const { searchWorkspaceCode } = await import('../services/code-index.js');
        const root = str(args, 'path') || workspaceDir || serverState.workspaceDir || '';
        if (!root) return fail('未指定工作区（path），且当前会话没有工作目录。请先在会话里绑定工作目录。');
        const { checkPathAccess, allowedRootsFor, getAuthorizedDirs } = await import('../services/path-guard.js');
        const verdict = checkPathAccess({
          toolName: 'api_code_semantic_search',
          args,
          workspaceDir: workspaceDir || serverState.workspaceDir || null,
          allowedRoots: allowedRootsFor(workspaceDir || serverState.workspaceDir || null, conversationId || null),
          authorizedDirs: conversationId ? getAuthorizedDirs(conversationId) : [],
        });
        if (verdict.kind === 'need-auth') {
          return fail(`路径在工作目录外（${verdict.items.map((i) => i.rawPath).join(', ')}），已拒绝。请改用工作目录内的路径。`);
        }
        const sr = await searchWorkspaceCode(
          root,
          str(args, 'query'),
          num(args, 'top_k', 8),
          Boolean(args.reindex),
        );
        if (!sr.ok) return fail(sr.reason || '语义检索不可用');
        const lines = sr.hits.map((h, i) =>
          `${i + 1}. [score ${h.score}] ${h.path}:${h.startLine}-${h.endLine}\n${h.snippet.split('\n').map((l) => '   ' + l).join('\n')}`,
        );
        const notes = sr.reason ? `\n说明: ${sr.reason}` : '';
        return ok(`语义检索「${str(args, 'query')}」：${sr.hits.length} 条命中（索引 ${sr.totalChunks} chunks）。${notes}\n\n${lines.join('\n\n') || '（无命中 —— 换个描述或用 file_grep 精确检索）'}`);
      }

      case 'api_code_definition': {
        // 精确跳转定义（P2-5，tsserver）：AST 版 code_refs 在 re-export 场景停在转发行，
        // 本工具走语言服务直接命中实现行。只读。
        const { tsserverDefinition, resolveTsserverPosition } = await import('../services/lsp-manager.js');
        const root = workspaceDir || serverState.workspaceDir || '';
        const rawFile = str(args, 'file');
        if (!rawFile) return fail('缺少 file 参数（要定位符号所在的文件）');
        const { checkPathAccess, allowedRootsFor, getAuthorizedDirs } = await import('../services/path-guard.js');
        const verdict = checkPathAccess({
          toolName: 'api_code_definition',
          args,
          workspaceDir: workspaceDir || serverState.workspaceDir || null,
          allowedRoots: allowedRootsFor(workspaceDir || serverState.workspaceDir || null, conversationId || null),
          authorizedDirs: conversationId ? getAuthorizedDirs(conversationId) : [],
        });
        if (verdict.kind === 'need-auth') {
          return fail(`路径在工作目录外（${verdict.items.map((i) => i.rawPath).join(', ')}），已拒绝。请改用工作目录内的路径。`);
        }
        const absFile = path.isAbsolute(rawFile) ? rawFile : path.resolve(root || process.cwd(), rawFile);
        if (!existsSync(absFile)) return fail(`文件不存在：${absFile}`);
        // 项目根：优先最近含 tsconfig.json / package.json 的祖先目录（tsserver 靠它加载项目）
        let projRoot = root || path.dirname(absFile);
        try {
          let dir = path.dirname(absFile);
          while (dir && dir !== path.dirname(dir)) {
            if (existsSync(path.join(dir, 'tsconfig.json'))) { projRoot = dir; break; }
            if (existsSync(path.join(dir, 'package.json'))) projRoot = dir;
            dir = path.dirname(dir);
          }
        } catch { /* 探测失败用会话工作目录兜底 */ }
        const content = readFileSync(absFile, 'utf-8');
        const line = num(args, 'line', 0);
        const pos = resolveTsserverPosition(content, line, args.column != null ? num(args, 'column', 0) : null, str(args, 'symbol') || null);
        if ('error' in pos) return fail(pos.error);
        const r = await tsserverDefinition(projRoot, absFile, line, pos.offset);
        if (!r.ok) return fail(r.error);
        if (!r.defs.length) {
          return ok(`未找到定义（${absFile}:${line} offset ${pos.offset}）。可能该位置是关键字/字面量，或符号来自未加载的类型声明；也可用 code_refs 做启发式兜底。`);
        }
        const rel = (f: string) => { try { return root && f.startsWith(root) ? path.relative(root, f) : f; } catch { return f; } };
        const list = r.defs.map((d, i) => `${i + 1}. ${rel(d.file)}:${d.line}:${d.column}  ${d.preview}`).join('\n');
        return ok(`定义位置（tsserver 精确跳转，来自 ${rel(absFile)}:${line}）：\n${list}`);
      }

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

      // 空间记忆文件（MEMORY.md，跨会话、所有智能体共享；spaceId 省略时取当前会话所属空间）
      case 'api_space_memory_read': {
        const uid = requireUser(userId);
        const spaceId = str(args, 'spaceId') || resolveTaskSpaceId(conversationId);
        if (!spaceId) return fail('未指定 spaceId，且当前会话未归属任何空间');
        const mem = await readSpaceMemory(uid, spaceId);
        // 顺带带上「任务进展明细」（.yan-zhi/task-memory/progress.md）：
        // MEMORY.md 里只有被压成一行的进展条目，逐批的完整流水在明细文件里。
        // 不自动注入（防爆窗），只在模型主动读空间记忆时一并给出 —— 否则那些明细
        // 写下来就再也没人看得到（写了没人读 = 白写）。
        const progress = conversationId ? readTaskProgressForConversation(conversationId) : null;
        return ok({
          ...mem,
          ...(progress && progress.content.trim() && progress.path !== mem.path
            ? { progressPath: progress.path, progressContent: progress.content }
            : {}),
        });
      }
      case 'api_space_memory_append': {
        const uid = requireUser(userId);
        const spaceId = str(args, 'spaceId') || resolveTaskSpaceId(conversationId);
        if (!spaceId) return fail('未指定 spaceId，且当前会话未归属任何空间');
        return ok(await appendSpaceMemory(uid, spaceId, str(args, 'content')));
      }
      case 'api_browser_memory_read': {
        requireUser(userId);
        const days = Math.min(Math.max(num(args, 'days', 3), 1), 30);
        const overview = await readBrowserMemoryOverview(days);
        return ok(overview.content || overview.analysis
          ? overview
          : { days, content: '', analysis: null, note: `近 ${days} 天没有浏览器使用记录` });
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
        const explicitBaseIds = (arr(args, 'baseIds') as string[]).map((b) => String(b)).filter(Boolean);
        // 知识库检索范围：agent 显式绑定优先 + 任务下发；均无 = 不限（跨全部可见库）。
        // 语义：不绑则全可用，绑则限定到绑定库（agent 挂载的知识库）。
        const scope: string[] = agentKnowledgeBaseIds(userId, agentId, explicitBaseIds.length ? explicitBaseIds : undefined) || explicitBaseIds;
        const hops = num(args, 'hops', 3);
        // 实体导向多跳查询，按知识库分组返回（{ 库id: [切片...] }）；单库/多库指定都走同一逻辑，天然分组
        const grouped = entityGraphSearchGrouped(requireUser(userId), q, scope, hops, num(args, 'topK', 3));
        const total = Object.values(grouped).reduce((s: number, a: any[]) => s + a.length, 0);
        if (total > 0) return ok({ grouped, total, scoped: !!scope.length });
        // 实体图谱为空（未抽取/无实体）→ 退化关键词多跳，按库分组
        const kw = multiHopSearchKnowledge(requireUser(userId), q, num(args, 'topK', 3), hops);
        const kwGrouped: Record<string, any[]> = {};
        for (const c of kw) {
          if (scope.length && !scope.includes(c.baseId)) continue;
          (kwGrouped[c.baseId] ||= []).push(c);
        }
        const kwTotal = Object.values(kwGrouped).reduce((s: number, a: any[]) => s + a.length, 0);
        return ok({ grouped: kwGrouped, total: kwTotal, scoped: !!scope.length });
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
        // 按 agent 绑定的知识库范围收敛（不绑则全可用）
        const scope = agentKnowledgeBaseIds(userId, agentId);
        const filtered = scope ? data.filter((c: any) => scope.includes(c.baseId)) : data;
        return ok({ data: filtered, mode, scoped: !!scope });
      }
      case 'api_kb_multi_hop': {
        // 按 agent 绑定的知识库范围收敛（不绑则全可用）
        const scope = agentKnowledgeBaseIds(userId, agentId);
        const rows = multiHopSearchKnowledge(
          requireUser(userId),
          str(args, 'query'),
          num(args, 'topK', 3),
          num(args, 'hops', 2),
        );
        return ok(scope ? rows.filter((c: any) => scope.includes(c.baseId)) : rows);
      }
      case 'api_kb_entity_search':
        return ok(entityGraphSearch(
          requireUser(userId),
          str(args, 'query'),
          num(args, 'hops', 3),
          num(args, 'topK', 3),
          agentKnowledgeBaseIds(userId, agentId),
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

      /**
       * api_space_set_task_type —— 给空间设置/更改**任务模式**（模型可直接调用）。
       *
       * ★★ 为什么需要（2026-09-27 用户要求「大模型自己都能改目录的任务模式」）：
       *   任务模式此前只能在 UI 的「空间编辑」里手动选，模型无法参与。
       *   但"这个目录该按什么流程做"往往是用户在对话里说出来的
       *   （"这个目录以后都按配音来"）—— 让模型能直接落这个决定，
       *   它才能同时建出 00-source 等资源目录并立刻按新流程引导。
       *
       * ★ 走 setSpaceTaskType（**不裸改列**）：它会同步建资源目录骨架 + 写 task.json。
       *   裸改 task_type 列会导致"类型设了但目录不存在"，正是这次要避免的坑。
       * ★ spaceId 缺省时取当前会话归属的空间（模型通常不需要知道空间 id）。
       * ★ 未知类型**明确报错并回可选值**，不静默回落成"通用"——静默回落会让用户
       *   以为设成功了，实际什么也没变。
       */
      case 'api_space_set_task_type': {
        const uid = requireUser(userId);
        const sid = str(args, 'spaceId') || resolveTaskSpaceId(conversationId);
        if (!sid) return fail('未指定 spaceId，且当前会话未归属任何空间（请先在侧栏选一个空间）');
        const raw = args.taskType === null || args.taskType === '' ? null : str(args, 'taskType');
        if (raw && !TASK_TYPE_IDS.includes(raw)) {
          return fail(`未知的任务类型「${raw}」。可选值：${TASK_TYPE_IDS.filter((t) => t !== 'general').join('、')}（传 null 或空串表示改回通用）`);
        }
        try {
          const r = await setSpaceTaskType(uid, sid, raw);
          return ok({
            spaceId: r.spaceId,
            taskType: r.taskType,
            label: getTaskType(r.taskType).label,
            root: r.root,
            createdDirs: r.createdDirs,
            changed: r.changed,
            note: r.taskType === 'general'
              ? '已改回「通用」：不再注入任务流程（资源目录保留，不删任何文件）'
              : `已设为「${getTaskType(r.taskType).label}」：资源目录已就绪，后续本目录的任务按该模式的规则推进`,
          });
        } catch (e: unknown) {
          return fail(e instanceof Error ? e.message : String(e));
        }
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
        // ★ 走 services/tool-deps 的统一入口：与 ReAct 主循环的 custom_ 分支共享
        //   「装依赖 → 注模块/站点包 → 执行」语义（此前两处各写一遍、都漏了依赖安装）。
        const { runCustomTool } = await import('../services/tool-deps.js');
        return ok(await runCustomTool(t, obj(args, 'args')));
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

      // AI 媒体生成（文生图/图生图/文生视频/图生视频，默认 agnes，支持任意已配置平台）
      case 'api_image_generate':
        return await mediaGenerateImage(args, userId, conversationId);
      case 'api_video_generate':
        return await mediaGenerateVideo(args, userId, conversationId);
      case 'api_video_status':
        return await mediaVideoStatus(args, userId, conversationId);
      case 'api_tts_speak':
        return await mediaSpeak(args, userId, conversationId);
      case 'api_tts_voices':
        return await mediaTtsVoices();
      case 'api_srt_generate':
        return await mediaSrtGenerate(args, conversationId);
      case 'media_compose':
        return await mediaCompose(args, conversationId);
      case 'media_edit':
        return await mediaEdit(args, conversationId);
      case 'media_install_ffmpeg':
        return await mediaInstallFfmpeg();
      case 'media_install_ytdlp':
        return await mediaInstallYtdlp();
      // 网络素材获取：公开直链下载 + 竖屏标准化（先下载 → 标准化 → 再拼接）
      case 'api_media_fetch':
        return await mediaFetch(args, conversationId);
      case 'api_media_normalize':
        return await mediaNormalize(args, conversationId);

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
