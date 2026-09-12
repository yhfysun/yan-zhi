// PDF 客户端高保真渲染：用 pdf.js 把每一页渲染成 PNG 图片（含图片/版式），纯前端、无需 Python。
// 替代此前"PyMuPDF 服务端栅格化"在运行环境未打包时降级成纯文本提取的缺陷。
import * as pdfjsLib from 'pdfjs-dist';
// Vite 会把 worker 文件作为静态资源处理，返回可加载的 URL
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfRenderResult {
  /** 每页 PNG 的 base64（不含 data: 前缀） */
  images: string[];
  /** 文档实际总页数 */
  total: number;
  /** 实际渲染的页数（受 maxPages 限制） */
  rendered: number;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * 渲染 PDF 前 N 页为图片。
 * @param maxPages 最多渲染页数（避免超大 PDF 卡死），默认 30
 * @param scale   渲染倍率（DPI 近似），默认 1.6
 */
export async function renderPdfToImages(
  b64: string,
  opts: { maxPages?: number; scale?: number } = {},
): Promise<PdfRenderResult> {
  const maxPages = opts.maxPages ?? 30;
  const scale = opts.scale ?? 1.6;
  const bytes = base64ToBytes(b64);

  const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
  const total = doc.numPages;
  const count = Math.min(total, maxPages);
  const images: string[] = [];

  for (let p = 1; p <= count; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建 canvas 上下文');
    // 白底，避免透明页在深色主题下发黑
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderParams: any = { canvasContext: ctx, viewport, canvas };
    await page.render(renderParams).promise;
    images.push(canvas.toDataURL('image/png').split(',')[1]);
    page.cleanup();
  }
  doc.destroy();
  return { images, total, rendered: count };
}
