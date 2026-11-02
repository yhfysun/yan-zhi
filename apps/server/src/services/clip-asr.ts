// 剪辑模式的本地语音识别编排（whisper.cpp）。
//
// ★ 为什么单独成服务：/asr（生成字幕）与 /talking-cut（智能剪口播）走的是**同一套**
//   依赖解析（模型档位/ffmpeg 缺失都要给出可执行指引）与临时文件清理。
//   复制两遍必然漂移（本项目反复踩过），所以只留这一份。
//
// ★ 错误形态：调用方是 HTTP 路由，这里返回 `{ status, error, extra }` 而不是 throw ——
//   路由可以原样把 need/hint/installDir 交给前端展示，不让用户猜"为什么点不了"。
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveWhisper, ensureWav16k, runWhisperToSrt,
  WHISPER_MODELS, DEFAULT_WHISPER_MODEL,
} from '../mcp/whisper-runtime.js';
import { resolveFfmpeg } from '../mcp/ffmpeg-runtime.js';
import { parseSrt } from '../mcp/subtitle-style.js';

export interface AsrCue {
  text: string;
  start: number;
  end: number;
}

export interface TranscribeOptions {
  /** 音频/视频本机路径 */
  input: string;
  /** 模型档位 id（见 WHISPER_MODELS）；未知档位直接 400 */
  model?: string;
  language?: string;
  /** 只转写源文件的这一段（秒）。命令/剪口播都按片段截取，避免整片转写 */
  ss?: number;
  duration?: number;
}

export interface TranscribeResult {
  ok: boolean;
  cues?: AsrCue[];
  /** 实际使用的模型（请求 small 但本机只有 base 时会降级，如实回报） */
  model?: string;
  requestedModel?: string;
  language?: string;
  source?: string;
  /** 建议的 HTTP 状态码（路由直接用） */
  status?: number;
  error?: string;
  /** 需要原样透传给前端的附加字段（need / hint / installDir / modelsDir…） */
  extra?: Record<string, unknown>;
}

/** 本地 whisper 识别一段音视频，返回字幕级 cue（时间**相对输入区间起点**）。 */
export async function transcribeClipAudio(o: TranscribeOptions): Promise<TranscribeResult> {
  const requestedModel = String(o.model || '').trim() || DEFAULT_WHISPER_MODEL;
  const language = String(o.language || '').trim() || 'zh';
  const input = String(o.input || '').trim();
  if (!input) return { ok: false, status: 400, error: 'input 必填（音频或视频文件路径）' };
  if (!WHISPER_MODELS[requestedModel]) {
    return {
      ok: false, status: 400,
      error: `未知模型 ${requestedModel}，可选：${Object.keys(WHISPER_MODELS).join(' / ')}`,
    };
  }

  // 依赖分诊：四类缺失各自给不同指引（前端原样展示，不让用户猜）
  const wh = await resolveWhisper(requestedModel);
  if (!wh.ok) {
    return {
      ok: false, status: 503, error: wh.error,
      extra: {
        need: 'whisper', model: requestedModel,
        installDir: wh.installDir, modelsDir: wh.modelsDir,
        hint: '可在对话里让剪辑师调用 whisper_install 安装，或按上面目录手动放置。',
      },
    };
  }
  const ff = await resolveFfmpeg();
  if (!ff.ok) {
    return {
      ok: false, status: 503, error: ff.error,
      extra: { need: 'ffmpeg', hint: '可调用 media_install_ffmpeg。' },
    };
  }

  const wav = await ensureWav16k(input, ff.ffmpeg, undefined, {
    ...(Number(o.ss) > 0 ? { ss: Number(o.ss) } : {}),
    ...(Number(o.duration) > 0 ? { duration: Number(o.duration) } : {}),
  });
  if (!wav.ok) return { ok: false, status: 500, error: `音频准备失败：${wav.error || '未知错误'}` };

  try {
    const workPrefix = path.join(path.dirname(wav.wav), 'out');
    const run = await runWhisperToSrt({
      bin: wh.bin, model: wh.model, wav: wav.wav, outPrefix: workPrefix, language,
    });
    if (!run.ok) return { ok: false, status: 500, error: run.error || 'whisper 执行失败' };
    const content = fs.readFileSync(run.srt, 'utf8');
    const cues: AsrCue[] = parseSrt(content).map((c) => ({ text: c.text, start: c.start, end: c.end }));
    if (!cues.length) {
      return {
        ok: false, status: 422,
        error: '未检测到可用语音内容（识别结果为空）',
        extra: {
          hint: `可能原因：① 音频没有说话声；② 语言参数与实际不符（当前 ${language}）；③ 音频过短。可换 medium 模型重试。`,
        },
      };
    }
    return {
      ok: true, cues,
      model: wh.modelName || requestedModel,
      requestedModel,
      language,
      source: wh.source,
    };
  } catch (e: unknown) {
    return { ok: false, status: 500, error: `转写异常：${e instanceof Error ? e.message : String(e)}` };
  } finally {
    // 临时音频清理失败不该让请求失败
    try { fs.rmSync(path.dirname(wav.wav), { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
