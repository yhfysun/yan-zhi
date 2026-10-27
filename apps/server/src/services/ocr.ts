// OCR 统一入口（2026-10-27）：本地 RapidOCR（PP-OCRv4 mobile + ONNX）优先，tesseract.js 兜底。
//
// ★ 只服务**兜底层**：`/api/tools/ocr` 与 `api_tool_ocr`。image_analyze 的 vision 主链路
//   （packages/ui/src/stores/chat.ts 的 runImageAnalyze）不经过这里，也不受影响。
// ★ 为什么换掉「只有 tesseract」：tesseract 的 chi_sim 是 fast 包（2.4MB），中文界面/截图
//   乱码率极高（旧返回文案自己都写着"仅供参考"）。RapidOCR 用 16MB ONNX 模型离线实测
//   平均置信度 0.98、中文几乎无错字，安装包只增加约 60MB。
// ★ fail-open：RapidOCR 任何失败（没装/缺模型/坏图/python 缺失）一律**静默降级**到
//   tesseract 并在 fallbackReason 里记原因 —— 不能把"环境问题"升级成"OCR 不可用"。
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { findPython, getPythonScript, runPythonScript } from '@yan-zhi/core';
import { createLogger } from './logger.js';

const logger = createLogger('ocr');

export type OcrProvider = 'rapidocr' | 'tesseract';

export interface OcrLine {
  text: string;
  score: number;
}

export interface OcrResult {
  text: string;
  /** 0~100（与历史 tesseract 口径一致；RapidOCR 的 0~1 均值已乘 100） */
  confidence?: number;
  provider: OcrProvider;
  lines?: OcrLine[];
  /** 视觉行（每行若干单元格）；表格截图靠它保住列关系，纯文字截图每行只有一格 */
  rows?: { text: string; score: number }[][];
  /** 走了 tesseract 时，说明 RapidOCR 为什么没用上（排查用，不回显给模型） */
  fallbackReason?: string;
}

const OCR_TIMEOUT_MS = 60_000;
const DEFAULT_LANG = 'chi_sim+eng';
const SCORE_TO_PERCENT = 100;

let cachedPython: string | null = null;
/** 环境级失败（没装 rapidocr / 缺脚本 / 没有 python）后本次进程内不再重试，避免每次 OCR 白等启动 */
let rapidocrDisabled: string | null = null;

/**
 * 定位能 import rapidocr 的解释器。
 * ★ 随包解释器的解析已收敛到 core 的 `findPython()`（2026-10-27）：那边补了
 *   「从安装目录/dev 仓库推导 resources/python」两条路，这里不再重复实现，
 *   否则预览、python_exec 等别的调用点仍会各自踩同一个坑。
 * ★ YZ_OCR_PYTHON 仅作本模块的临时覆盖（排查用）。
 */
async function resolveOcrPython(): Promise<string> {
  if (cachedPython) return cachedPython;
  const explicit = (process.env.YZ_OCR_PYTHON || '').trim();
  cachedPython = explicit && fs.existsSync(explicit) ? explicit : await findPython();
  logger.info(`OCR 解释器: ${cachedPython}`);
  return cachedPython;
}

interface RapidOcrOutput {
  text: string;
  lines: OcrLine[];
  confidence: number;
  /** 视觉行（每行若干单元格），用于还原表格列关系 */
  rows: { text: string; score: number }[][];
}

/**
 * 把「视觉行」渲染成 `列1 | 列2 | …` 文本；不像表格时返回 null。
 *
 * ★ 为什么要交给上层模型整理（2026-10-27 用户实测）：PP-OCR 只给行级文字，表格会被读成
 *   一串顺序文字（「项目 / 结果」上下两行，列关系丢失）。这里带上位置分组后的行/列，
 *   调用方模型就能据此排成 Markdown 表格 —— 不用再回头给模型塞图（省 token、省一次视觉调用）。
 */
function tableSection(rows: { text: string }[][]): string | null {
  if (rows.length < 2) return null;
  const multiCell = rows.filter((r) => r.length >= 2).length;
  if (multiCell < 2 || multiCell / rows.length < 0.4) return null;
  const body = rows.map((r) => r.map((c) => c.text.trim()).join(' | ')).join('\n');
  return `\n\n[表格结构：按文字位置还原，每行用 | 分列 —— 需要标准表格时据此整理成 Markdown]\n${body}`;
}

async function ocrWithRapidOcr(buffer: Buffer): Promise<RapidOcrOutput> {
  const script = getPythonScript('ocr_rapid.py');
  if (!script) throw new Error('缺少 ocr_rapid.py 脚本');
  const py = await resolveOcrPython();
  const tmp = path.join(os.tmpdir(), `yz_ocr_${Date.now()}_${Math.random().toString(36).slice(2)}.png`);
  fs.writeFileSync(tmp, buffer);
  try {
    const r = await runPythonScript(script, [tmp], { timeout: OCR_TIMEOUT_MS, cwd: os.tmpdir(), pythonPath: py });
    // ★ 只取最后一行：rapidocr 自身会往 stdout 打日志，JSON 固定是最后一行
    const last = (r.stdout || '').trim().split('\n').pop() || '{}';
    let parsed: {
      ok?: boolean;
      error?: string;
      text?: string;
      avg_score?: number;
      lines?: OcrLine[];
      rows?: { text: string; score: number }[][];
    };
    try {
      parsed = JSON.parse(last);
    } catch {
      throw new Error(`输出无法解析（exit ${r.exitCode}）: ${last.slice(0, 200)}`);
    }
    if (!parsed.ok) throw new Error(parsed.error || 'rapidocr 返回失败');
    // ★ 识别成功但一个字都没有 = 正常结果（纯图/纯噪声/无文字截图），**不能当失败**：
    //   一旦在这里抛错就会去降级 tesseract，而 tesseract 处理千万像素图能跑好几分钟
    //   （2026-10-27 实测：4000x3000 的图整整卡了 5 分钟没返回）。
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    const table = tableSection(rows);
    return {
      text: String(parsed.text || '') + (table || ''),
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
      rows,
      confidence: Math.round(Number(parsed.avg_score || 0) * SCORE_TO_PERCENT * 100) / 100,
    };
  } finally {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* 临时文件清理失败不影响结果 */
    }
  }
}

async function ocrWithTesseract(buffer: Buffer, lang: string): Promise<{ text: string; confidence?: number }> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(lang, 1, { logger: () => {} });
  try {
    const { data } = await worker.recognize(buffer);
    return { text: data.text || '', confidence: data.confidence };
  } finally {
    await worker.terminate();
  }
}

/**
 * 识别图片文字：RapidOCR 优先，失败降级 tesseract。
 * @param buffer 图片字节
 * @param opts.lang tesseract 语言包（RapidOCR 用内置中英模型，不需要此参数）
 */
/** 这些错误是「环境没准备好」而非「这张图有问题」：记下后本次进程不再重试 RapidOCR，
 *  否则每次 OCR 都要先白等一次 python 启动（~1.5s）再降级。 */
const ENV_LEVEL_ERRORS = [/rapidocr 不可用/, /缺少 ocr_rapid\.py/, /未找到 Python/, /ENOENT/];

export async function runOcr(buffer: Buffer, opts: { lang?: string } = {}): Promise<OcrResult> {
  const lang = opts.lang || DEFAULT_LANG;
  let fallbackReason = rapidocrDisabled || undefined;
  if (!rapidocrDisabled) {
    try {
      const r = await ocrWithRapidOcr(buffer);
      return { text: r.text, confidence: r.confidence, provider: 'rapidocr', lines: r.lines, rows: r.rows };
    } catch (e: unknown) {
      fallbackReason = e instanceof Error ? e.message : String(e);
      if (ENV_LEVEL_ERRORS.some((re) => re.test(fallbackReason as string))) {
        rapidocrDisabled = fallbackReason;
        logger.warn(`RapidOCR 不可用，本进程内不再重试: ${fallbackReason}`);
      } else {
        logger.warn(`RapidOCR 本次失败，降级 tesseract: ${fallbackReason}`);
      }
    }
  }
  const t = await ocrWithTesseract(buffer, lang);
  return { text: t.text, confidence: t.confidence, provider: 'tesseract', fallbackReason };
}
