// SVG 图表围栏块解析（```svg）
//
// 模型直接产出的 SVG 图表，聊天里不应当代码贴出来 —— 抽出来用 <img> 渲染（img 内不执行脚本，安全）。
// 只接受以 <svg 开头的围栏，其它 ```svg 代码片段保持原样（可能是教程示例）。

export const SVG_FENCE_RE = /```svg[ \t]*\r?\n([\s\S]*?)```/g;

export function extractSvgBlocks(markdown: string): string[] {
  const out: string[] = [];
  for (const m of String(markdown || '').matchAll(SVG_FENCE_RE)) {
    const svg = (m[1] || '').trim();
    if (/^<svg[\s>]/i.test(svg)) out.push(svg);
  }
  return out;
}

export function stripSvgBlocks(markdown: string): string {
  return String(markdown || '')
    .replace(SVG_FENCE_RE, (whole, body: string) => (/^<svg[\s>]/i.test(String(body).trim()) ? '\n' : whole))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** SVG 文本 → <img> 可用的 data URL（URL 编码，保留中文/尺寸单位） */
export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
