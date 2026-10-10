/**
 * 图片压缩与预算闸（C2，2026-10-09）。
 *
 * ★★★ 为什么必须有（当前就在发生的问题）：
 *   `runImageAnalyze` → `fs.readFileBase64` **原图** → `LlmClient.visionAnalyze` 把 base64
 *   直接塞进 `data:<mime>;base64,...` —— **全链路无任何压缩**（全仓无 sharp/jimp）。
 *   而 `browser_screenshot` 产出的整页 PNG 常数 MB：
 *     · 上游对单图多有限制（Anthropic 单图 base64 约 5MB）→ **直接 400**；
 *     · 即便放行，一张图就吃掉几万～几十万 token（vision token 与像素面积近似成正比）。
 *   ⇒ 这是"现在就存在的真 bug"，不依赖多模态接通（C1）。
 *
 * ★ 为什么用 canvas（而不是引入 sharp/jimp）：
 *   渲染进程就是 Chromium，`Image` + `canvas` **零依赖**可用，且本项目已有同款用法
 *   （`utils/pdf-render.ts`、`views/Connections.vue`）。引 native 图片库会给三端打包
 *   （Electron/Web/Capacitor）各加一份平台相关二进制，代价远大于收益。
 *
 * ★ 压缩策略（参数都放在这里，**唯一出处**）：
 *   · 长边 ≤ 1568px —— 视觉编码器通常把图缩到这个量级，再大是**白付 token**；
 *   · 默认输出 JPEG q≈0.82（截图这类含小字/线条的图，JPEG 比 PNG 小一个数量级且足够）；
 *   · 目标 ≤ 1.5MB；若仍超，**按质量阶梯递减**重编码；到最后仍超则**缩小尺寸**再来一轮。
 *   · ★ 只有"确实变小了"才替换原图（避免把已经很小的图反而变大）。
 */

/** 长边上限（视觉编码器的常见有效分辨率量级；再大只增 token 不增可读性） */
export const IMAGE_MAX_EDGE = 1568;
/** 单图字节预算（默认 1.5MB，兼容常见上游限制；留给 base64 膨胀后的余量） */
export const IMAGE_MAX_BYTES = 1.5 * 1024 * 1024;
/** 质量阶梯（从高到低尝试） */
export const IMAGE_QUALITY_STEPS = [0.82, 0.7, 0.6] as const;

/** 可按环境覆盖的预算（便于测试与不同上游） */
export function imageBudget(): { maxEdge: number; maxBytes: number } {
  return { maxEdge: IMAGE_MAX_EDGE, maxBytes: IMAGE_MAX_BYTES };
}

/** base64 字符串对应的**原始字节数**（不含膨胀；用于判断"要不要压"） */
export function base64Bytes(b64: string): number {
  const s = String(b64 || '');
  if (!s) return 0;
  // 每 4 个字符 3 字节；去掉末尾 padding
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((s.length * 3) / 4) - pad);
}

/**
 * ★★★ 判定"是否需要压缩"（抽成**纯函数**，便于真跑验证 —— 本项目多次栽在"只能查字符串"）。
 *
 * ★ 三条触发（缺任一条都会漏掉一类图）：
 *   ① **字节超标** → 压（上游限制 / token 成本）；
 *   ② **边长超标** → 压（视觉编码器有效分辨率之外是白付 token）；
 *   ③ **无损格式（PNG/BMP）** → 压（★ 实测：2.10MB 的 1080x1440 PNG 转 JPEG q5 后仅
 *      **237KB（降到 10%）**，而它的尺寸/字节都**可能**在预算内 —— 但格式冗余本身就该消除。
 *      只按"字节超标"判定会漏掉这类"尺寸合规但格式冗余"的图）。
 *
 * @param byteLen 原图字节数
 * @param maxBytes 预算
 * @param width/height 原图尺寸（未知时传 0）
 * @param mime 原始 MIME（用于识别无损格式）
 */
export function needsImageDownscale(
  byteLen: number,
  maxBytes: number,
  width = 0,
  height = 0,
  maxEdge = IMAGE_MAX_EDGE,
  mime = '',
): boolean {
  if (byteLen > maxBytes) return true;                       // ① 体积超标 → 必压
  const longEdge = Math.max(width, height);
  if (longEdge > maxEdge) return true;                       // ② 边长超标 → 必压（省 token）
  // ③ 无损格式 → 转 JPEG（收益实测可达 90%，见上）
  if (/png|bmp|tiff|webp$/i.test(mime.trim())) return true;
  return false;
}

/** 按长边上限算缩放后的尺寸（不放大：原图更小则原样返回） */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  if (w === 0 || h === 0) return { width: w, height: h };
  const long = Math.max(w, h);
  if (long <= maxEdge) return { width: w, height: h };
  const k = maxEdge / long;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

export interface CompressResult {
  /** 压缩后的 base64（无 data: 前缀）。**未压缩时原样返回入参** */
  base64: string;
  mime: string;
  /** 是否真的压缩过（false = 原图直接可用） */
  compressed: boolean;
  /** 原始字节数 / 结果字节数 */
  originalBytes: number;
  resultBytes: number;
  /** 结果尺寸（拿不到时为 0） */
  width: number;
  height: number;
  /** 压缩失败/降级时的人类可读说明 */
  note?: string;
}

/**
 * 把图片 base64 压到预算内（长边 ≤ maxEdge，字节 ≤ maxBytes）。
 *
 * ★ **一律 fail-open**：任何一步失败（解码不了 / canvas 不可用 / 重编码无效）
 *   都返回**原图**并在 `note` 里说明 —— 压缩是"优化"，绝不能让它变成"图片用不了"。
 *   （与 `capLongText` 同类思路：超限处理必须保底可用，而不是抛错让调用方失败。）
 */
export async function downscaleImageBase64(
  base64: string,
  mime: string,
  opts: { maxEdge?: number; maxBytes?: number; qualitySteps?: readonly number[] } = {},
): Promise<CompressResult> {
  const { maxEdge = IMAGE_MAX_EDGE, maxBytes = IMAGE_MAX_BYTES, qualitySteps = IMAGE_QUALITY_STEPS } = opts;
  const originalBytes = base64Bytes(base64);
  const passthrough = (note?: string): CompressResult => ({
    base64, mime, compressed: false, originalBytes, resultBytes: originalBytes, width: 0, height: 0, note,
  });

  if (!base64) return passthrough('空输入');
  // ★ SVG / GIF 不走 canvas 重编码：SVG 是矢量（重编码反而失真且通常很小）；
  //   GIF 重编码会**丢动画**。这两类直接放行（它们的体积问题应在产出端解决）。
  if (/svg|gif/i.test(mime)) return passthrough(`跳过压缩（${mime} 不适合位图重编码）`);

  try {
    const img = await loadImage(`data:${mime};base64,${base64}`);
    const w = img.width, h = img.height;
    if (!needsImageDownscale(originalBytes, maxBytes, w, h, maxEdge, mime)) {
      return { base64, mime, compressed: false, originalBytes, resultBytes: originalBytes, width: w, height: h, note: '未超预算且格式已高效，原样使用' };
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return passthrough('canvas 不可用');

    const target = fitWithin(w, h, maxEdge);
    let best: { b64: string; bytes: number; w: number; h: number } | null = null;

    // 一轮"按质量阶梯压"；仍超预算则**缩小 20% 再来一轮**（最多 3 轮，避免无限循环）
    let cur = { ...target };
    for (let round = 0; round < 3; round++) {
      canvas.width = cur.width;
      canvas.height = cur.height;
      // ★ 重绘前先清空：canvas 尺寸变更会清空，但显式清一次更稳（避免上一次的残留）
      ctx.clearRect(0, 0, cur.width, cur.height);
      ctx.drawImage(img, 0, 0, cur.width, cur.height);
      for (const q of qualitySteps) {
        const out = canvas.toDataURL('image/jpeg', q);
        const b64 = String(out).split(',')[1] || '';
        if (!b64) continue;
        const bytes = base64Bytes(b64);
        // ★ 只有"确实变小"才接受（防止把已经很小/已高度压缩的图反而变大）
        if (bytes < originalBytes && (!best || bytes < best.bytes)) {
          best = { b64, bytes, w: cur.width, h: cur.height };
        }
        if (bytes <= maxBytes) {
          best = { b64, bytes, w: cur.width, h: cur.height };
          break;
        }
      }
      if (best && best.bytes <= maxBytes) break;
      // 还超 → 尺寸再缩 20%，重来
      cur = { width: Math.max(1, Math.round(cur.width * 0.8)), height: Math.max(1, Math.round(cur.height * 0.8)) };
    }

    if (!best) return passthrough('重编码未产生更小结果');
    return {
      base64: best.b64,
      mime: 'image/jpeg',
      compressed: true,
      originalBytes,
      resultBytes: best.bytes,
      width: best.w,
      height: best.h,
      // 仍超预算时明确告知（调用方可选择拒绝或提示），而不是静默发送
      note: best.bytes > maxBytes
        ? `已压到 ${(best.bytes / 1048576).toFixed(2)}MB 仍超预算 ${(maxBytes / 1048576).toFixed(2)}MB`
        : undefined,
    };
  } catch (e: any) {
    // fail-open：失败就用原图
    return passthrough('压缩失败，使用原图: ' + (e?.message || e));
  }
}

/** 加载 data URL 为 Image（带超时，避免解码卡死） */
function loadImage(dataUrl: string, timeoutMs = 10000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('图片解码超时')), timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('图片解码失败')); };
    img.src = dataUrl;
  });
}