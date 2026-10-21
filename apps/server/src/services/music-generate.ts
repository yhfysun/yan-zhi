// 外部音乐大模型生成（整首歌：人声 + 伴奏）。
//
// ★ 与 music_compose 并存，不是替代：
//   music_compose  本地合成，和弦/BPM/旋律完全可控，适合卡点 BGM，音色是合成器。
//   music_generate 外部模型，**人声演唱**自然，但旋律由模型决定，不可逐音符控制。
//
// ★ 三种方言（按模型名/地址自动判定，用户只要在平台里填自己的 key）：
//   suno         new-api 的 Suno 路由：POST /suno/submit/music → GET /suno/fetch/{id}
//   aliyun       阿里云百炼 Fun-Music：POST {ws}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/music/generation
//   openai-audio OpenAI 兼容的 /v1/audio/speech（火山豆包音乐、MiniMax Music 等中转都走它）
//
// ★ 凭证解析顺序：工具入参 → 环境变量 → 用户库里 type=audio 的模型 → 本机网关兜底。

import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { db } from '../db.js';
import { runCmd } from './exec-cmd.js';

const SUNO_SUBMIT = '/suno/submit/music';
const SUNO_FETCH = '/suno/fetch/';
const POLL_INTERVAL_MS = 4000;
const MAX_WAIT_MS = 300000;
const MAX_AUDIO_BYTES = 64 * 1024 * 1024;

export type MusicDialect = 'suno' | 'aliyun' | 'openai-audio';

export interface MusicProvider {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  dialect: MusicDialect;
}

export interface GenerateSongInput {
  lyrics: string;
  style?: string;
  title?: string;
  instrumental?: boolean;
  /** 演唱性别（阿里/火山/MiniMax 支持） */
  gender?: 'male' | 'female';
  /** Suno 模型版本，如 chirp-v3-5 / chirp-v4 */
  mv?: string;
  /** 显式指定（工具参数覆盖配置时用） */
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  dialect?: MusicDialect;
}

export interface GenerateSongResult {
  ok: boolean;
  file?: string;
  engine?: string;
  title?: string;
  warnings?: string[];
  error?: string;
}

interface ProviderRow {
  model_id: string;
  type: string;
  api_url: string;
  api_key: string | null;
}

/** 按模型名/地址判定方言。用户换供应商时不用改代码。 */
export function dialectOf(modelId: string, apiUrl: string): MusicDialect {
  const id = String(modelId || '').toLowerCase();
  const url = String(apiUrl || '').toLowerCase();
  if (id.includes('suno') || url.includes('suno')) return 'suno';
  if (id.includes('fun-music') || url.includes('maas.aliyuncs.com')) return 'aliyun';
  return 'openai-audio';
}

function envProvider(): MusicProvider | null {
  const base = (process.env.YZ_MUSIC_API_URL || '').trim();
  const key = (process.env.YZ_MUSIC_API_KEY || '').trim();
  if (!base || !key) return null;
  const model = (process.env.YZ_MUSIC_MODEL || 'suno_music').trim();
  return {
    baseUrl: base.replace(/\/+$/, ''),
    apiKey: key,
    modelId: model,
    dialect: (process.env.YZ_MUSIC_DIALECT as MusicDialect) || dialectOf(model, base),
  };
}

/**
 * 解析音乐生成用的平台凭证。
 * 顺序：环境变量 → 用户库里第一个 type=audio 的模型 → 本机网关兜底。
 */
export function resolveMusicProvider(userId: string): MusicProvider | null {
  const env = envProvider();
  if (env) return env;

  const audioRow = db.prepare(
    `SELECT m.model_id, m.type, p.api_url,
            (SELECT k.api_key FROM platform_api_key k
              WHERE k.platform_id = p.id AND k.enabled = 1
              ORDER BY k.created_at LIMIT 1) AS api_key
       FROM model m JOIN platform p ON p.id = m.platform_id
      WHERE m.user_id = ? AND m.enabled = 1 AND m.type IN ('audio', 'tts')
      ORDER BY m.is_default DESC, m.created_at DESC
      LIMIT 1`,
  ).get(userId) as ProviderRow | undefined;
  if (audioRow?.api_key) {
    const baseUrl = audioRow.api_url.replace(/\/+$/, '');
    return {
      baseUrl,
      apiKey: audioRow.api_key,
      modelId: audioRow.model_id,
      dialect: audioRow.type === 'tts' ? 'openai-audio' : dialectOf(audioRow.model_id, baseUrl),
    };
  }

  // 兜底：本机 new-api 网关（Suno 路由不按 model 行暴露，只能按地址找）
  const gateway = db.prepare(
    `SELECT p.api_url,
            (SELECT k.api_key FROM platform_api_key k
              WHERE k.platform_id = p.id AND k.enabled = 1
              ORDER BY k.created_at LIMIT 1) AS api_key
       FROM platform p
      WHERE p.user_id = ?
        AND (p.api_url LIKE '%://192.168.%' OR p.api_url LIKE '%://127.0.0.1%' OR p.api_url LIKE '%://localhost%')
      LIMIT 1`,
  ).get(userId) as { api_url: string; api_key: string | null } | undefined;
  if (gateway?.api_key) {
    const baseUrl = gateway.api_url.replace(/\/+$/, '');
    return { baseUrl, apiKey: gateway.api_key, modelId: 'suno_music', dialect: 'suno' };
  }
  return null;
}

function humanizeProviderError(raw: string): string {
  if (/No available channel/i.test(raw)) {
    return '网关里没有对应通道：请在 new-api 后台添加音乐模型渠道后重试';
  }
  if (/model_not_found/i.test(raw)) {
    return '网关不认识这个模型：请确认渠道支持该模型，或检查模型名';
  }
  if (/invalid token|authentication|unauthorized/i.test(raw)) {
    return '鉴权失败：请检查平台 API Key / 访问令牌是否有效';
  }
  if (/邀测|not.*available|permission/i.test(raw)) {
    return '该模型尚未开通：请在对应平台申请开通后再试';
  }
  return raw.slice(0, 300);
}

async function postJson(url: string, apiKey: string, body: unknown): Promise<{ status: number; json: unknown; text: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* 非 JSON 响应按文本处理 */ }
  return { status: res.status, json, text };
}

async function downloadAudio(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`下载音频失败：HTTP ${res.status}`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_AUDIO_BYTES) throw new Error('音频文件过大，已拒绝下载');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_AUDIO_BYTES) throw new Error('音频文件过大，已拒绝下载');
  return buf;
}

function extOf(urlOrType: string): string {
  const m = /\.(mp3|wav|m4a|flac|ogg)(?:\?|$)/i.exec(urlOrType);
  return m ? `.${m[1].toLowerCase()}` : '.mp3';
}

// ── suno（new-api 路由） ────────────────────────────────────────────────

function pickTaskId(json: unknown): string {
  const obj = json as Record<string, unknown> | null;
  const data = obj?.data;
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return typeof data[0] === 'string' ? data[0] : '';
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    return String(o.task_id ?? o.taskId ?? o.id ?? '');
  }
  const direct = obj?.task_id ?? obj?.taskId ?? obj?.id;
  return direct ? String(direct) : '';
}

interface SunoTrack { status?: string; audio_url?: string; title?: string }

function pickTrack(json: unknown): SunoTrack | null {
  const obj = json as Record<string, unknown> | null;
  const data = obj?.data;
  const list = Array.isArray(data) ? data : (data && typeof data === 'object' ? [data] : []);
  for (const item of list) {
    const t = item as SunoTrack;
    if (t && typeof t.audio_url === 'string' && t.audio_url) return t;
  }
  const first = list[0] as SunoTrack | undefined;
  return first && typeof first === 'object' ? first : null;
}

async function generateViaSuno(
  provider: MusicProvider, input: GenerateSongInput,
): Promise<{ audioUrl: string; title?: string } | { error: string }> {
  const submit = await postJson(`${provider.baseUrl}${SUNO_SUBMIT}`, provider.apiKey, {
    model: provider.modelId,
    prompt: input.lyrics,
    tags: input.style || '',
    title: input.title || '未命名',
    mv: input.mv || 'chirp-v3-5',
    make_instrumental: Boolean(input.instrumental),
  }).catch((e: unknown) => ({ status: 0, json: null, text: e instanceof Error ? e.message : String(e) }));

  if (submit.status !== 200) return { error: humanizeProviderError(submit.text) };
  const taskId = pickTaskId(submit.json);
  if (!taskId) return { error: `提交成功但没拿到任务 id：${submit.text.slice(0, 200)}` };

  const deadline = Date.now() + MAX_WAIT_MS;
  let track: SunoTrack | null = null;
  let lastStatus = '';
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`${provider.baseUrl}${SUNO_FETCH}${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      signal: AbortSignal.timeout(20000),
    }).catch(() => null);
    if (!res || !res.ok) continue;
    const json = await res.json().catch(() => null);
    track = pickTrack(json);
    if (track?.audio_url) break;
    const s = String(track?.status || '');
    if (s && s !== lastStatus) lastStatus = s;
  }
  if (!track?.audio_url) {
    return {
      error: `等待超时（${Math.round(MAX_WAIT_MS / 1000)}s）：任务 ${taskId} 未返回音频${lastStatus ? `，最后状态 ${lastStatus}` : ''}`,
    };
  }
  return { audioUrl: track.audio_url, title: track.title };
}

// ── aliyun（百炼 Fun-Music） ───────────────────────────────────────────

async function generateViaAliyun(
  provider: MusicProvider, input: GenerateSongInput,
): Promise<{ audioUrl: string; title?: string } | { error: string }> {
  const url = `${provider.baseUrl}/api/v1/services/audio/music/generation`;
  const payload = {
    model: provider.modelId || 'fun-music-v1',
    input: {
      ...(input.lyrics ? { lyrics: input.lyrics } : {}),
      ...(input.style ? { prompt: input.style } : {}),
      gender: input.gender || 'female',
      is_instrumental: Boolean(input.instrumental),
      format: 'mp3',
    },
  };
  const res = await postJson(url, provider.apiKey, payload)
    .catch((e: unknown) => ({ status: 0, json: null, text: e instanceof Error ? e.message : String(e) }));
  if (res.status !== 200) return { error: humanizeProviderError(res.text) };
  const obj = res.json as { output?: { audio?: { url?: string } } } | null;
  const audioUrl = obj?.output?.audio?.url;
  if (!audioUrl) return { error: `返回里没有音频地址：${res.text.slice(0, 200)}` };
  return { audioUrl, title: input.title };
}

// ── openai-audio（/v1/audio/speech，火山/MiniMax 等中转） ──────────────

async function generateViaOpenAiAudio(
  provider: MusicProvider, input: GenerateSongInput,
): Promise<{ buf: Buffer; ext: string; title?: string } | { error: string }> {
  const url = `${provider.baseUrl}/v1/audio/speech`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: provider.modelId,
      input: input.style || input.lyrics || '一首中文流行歌曲',
      response_format: 'mp3',
      metadata: {
        lyrics: input.lyrics,
        ...(input.style ? { prompt: input.style } : {}),
        ...(input.gender ? { gender: input.gender === 'male' ? 'Male' : 'Female' } : {}),
        is_instrumental: Boolean(input.instrumental),
      },
    }),
    signal: AbortSignal.timeout(MAX_WAIT_MS),
  }).catch(() => null);
  if (!res) return { error: '请求音乐模型超时' };
  const type = res.headers.get('content-type') || '';
  if (!res.ok || type.includes('json')) {
    const text = await res.text().catch(() => '');
    return { error: humanizeProviderError(text) };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_AUDIO_BYTES) return { error: '音频文件过大，已拒绝保存' };
  return { buf, ext: '.mp3', title: input.title };
}

// ── 落盘 ──────────────────────────────────────────────────────────────

async function saveAudio(
  buf: Buffer, ext: string, input: GenerateSongInput,
  opts: { dir: string; ffmpeg?: string; baseName?: string },
): Promise<{ file: string; warnings: string[] }> {
  await mkdir(opts.dir, { recursive: true });
  const base = String(opts.baseName || input.title || `song-${Date.now()}`)
    .replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'song';
  const stamp = Date.now().toString(36);
  const srcFile = path.join(opts.dir, `${base}-${stamp}${ext}`);
  await writeFile(srcFile, buf);
  const warnings: string[] = [];
  if (!opts.ffmpeg || ext === '.m4a') return { file: srcFile, warnings };
  const outFile = path.join(opts.dir, `${base}-${stamp}.m4a`);
  const r = await runCmd(opts.ffmpeg, [
    '-y', '-v', 'error', '-i', srcFile,
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
    '-movflags', '+faststart', outFile,
  ], { timeoutMs: 120000, maxBuffer: 4 * 1024 * 1024 });
  if (!r.ok) {
    warnings.push(`转 m4a 失败，已交付原始音频：${(r.stderr || r.error).slice(-160)}`);
    return { file: srcFile, warnings };
  }
  return { file: outFile, warnings };
}

/** 生成一首歌：按方言提交 → 轮询/直取 → 下载 →（可选）转 m4a。 */
export async function generateSong(
  input: GenerateSongInput,
  opts: { dir: string; userId: string; ffmpeg?: string; baseName?: string },
): Promise<GenerateSongResult> {
  const lyrics = String(input.lyrics || '').trim();
  if (!lyrics) return { ok: false, error: '歌词为空：music_generate 必须给 lyrics' };

  const provider: MusicProvider | null = input.baseUrl && input.apiKey
    ? {
      baseUrl: input.baseUrl.replace(/\/+$/, ''),
      apiKey: input.apiKey,
      modelId: input.model || 'suno_music',
      dialect: input.dialect || dialectOf(input.model || '', input.baseUrl),
    }
    : resolveMusicProvider(opts.userId);
  if (!provider) {
    return {
      ok: false,
      error: '没有可用的音乐模型：请在平台里添加 type=audio 的模型并填 Key，或设置 YZ_MUSIC_API_URL / YZ_MUSIC_API_KEY',
    };
  }

  if (provider.dialect === 'openai-audio'
    && /tts|speech|cosyvoice|sambert/i.test(provider.modelId)
    && !/music|song/i.test(provider.modelId)) {
    return { ok: false, error: `当前音频模型 ${provider.modelId} 是语音合成（只能朗读），请配置音乐模型` };
  }

  try {
    if (provider.dialect === 'aliyun') {
      const r = await generateViaAliyun(provider, input);
      if ('error' in r) return { ok: false, error: r.error };
      const saved = await saveAudio(await downloadAudio(r.audioUrl), extOf(r.audioUrl), input, opts);
      return { ok: true, ...saved, engine: 'aliyun', title: r.title };
    }
    if (provider.dialect === 'openai-audio') {
      const r = await generateViaOpenAiAudio(provider, input);
      if ('error' in r) return { ok: false, error: r.error };
      const saved = await saveAudio(r.buf, r.ext, input, opts);
      return { ok: true, ...saved, engine: 'openai-audio', title: r.title };
    }
    const r = await generateViaSuno(provider, input);
    if ('error' in r) return { ok: false, error: r.error };
    const saved = await saveAudio(await downloadAudio(r.audioUrl), extOf(r.audioUrl), input, opts);
    return { ok: true, ...saved, engine: 'suno', title: r.title };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
