// 浏览器批注 → 消息块（P0，2026-10-28）
//
// 纯函数 + 一个截图辅助，单独成文件是为了能脱离组件真跑测试：
// 拼接措辞一旦漂移，模型就拿不到组件路径，或截图静默挂不上多模态输入。
import type { BrowserAnnotation } from '@yan-zhi/shared';

/**
 * `已存档:` 这一行的措辞**不能改**。
 *
 * 服务端 `apps/server/src/llm-task-manager.ts` 的 `IMAGE_ARCHIVE_MARK_RE`
 * （`/已存档:\s*([^\n）)]+\.(?:png|jpe?g|webp|gif|bmp)/i`）靠这个前缀认出截图路径并
 * 读成 base64 挂进 `imageParts`。换成「截图：」「附件：」之类的说法，
 * 图就**静默**挂不上 —— 模型看不到图，也不报错。
 */
const ARCHIVE_PREFIX = '已存档:';

/**
 * 一次性交接槽：`/browser` 独立浏览器页用的是 `page` 这个 store，
 * 而发消息的 `useChat` 只认 `preview`（对话页右栏预览）那份队列。
 *
 * 所以独立页点「发送到对话」时，先把批注放进这个槽，`sendInner` 优先取它 ——
 * 否则那一页点发送会**静默什么都不发**（实测踩到过）。
 * 取走即清空（一次性），避免串到下一条消息。
 */
export interface AnnotationStash {
  items: BrowserAnnotation[];
  tabId: string;
}

let stash: AnnotationStash | null = null;

export function stashAnnotations(next: AnnotationStash) {
  stash = { items: [...next.items], tabId: next.tabId };
}

export function hasStashedAnnotations(): boolean {
  return !!stash && stash.items.length > 0;
}

export function takeStashedAnnotations(): AnnotationStash | null {
  const v = stash;
  stash = null;
  return v;
}

/** 把批注序列化成随用户消息发送的文本块；没有批注时返回空串 */export function formatAnnotationBlock(items: BrowserAnnotation[], screenshotPath?: string): string {
  if (!Array.isArray(items) || items.length === 0) return '';

  const pageUrl = items.find((it) => it.pageUrl)?.pageUrl || '';
  const lines: string[] = [];
  lines.push(`浏览器批注（${items.length} 条${pageUrl ? `，页面：${pageUrl}` : ''}）`);

  items.forEach((a, i) => {
    lines.push('');
    if (a.type === 'region') {
      const r = a.rect || { x: 0, y: 0, w: 0, h: 0 };
      // 区域拿不到 DOM 目标，只能给尺寸与位置 —— 靠截图理解
      lines.push(`[${i + 1}] 区域框选 ${r.w}×${r.h} @ (${r.x}, ${r.y})`);
    } else {
      lines.push(`[${i + 1}] ${a.label || '元素'}`);
      // 组件路径只有 dev 构建能反查（Vue 的 __file 仅 dev 注入）—— 没有就整行省略，不留空字段
      if (a.componentFile) lines.push(`    组件：${a.componentFile}`);
      if (a.selector) lines.push(`    选择器：${a.selector}`);
    }
    lines.push(`    评论：${a.comment}`);
  });

  if (screenshotPath) {
    lines.push('');
    lines.push(`${ARCHIVE_PREFIX} ${screenshotPath}`);
  }

  return lines.join('\n');
}

/**
 * 取一张当前页截图并返回落盘路径（主进程已存到 userData/screenshots）。
 *
 * 失败是常态而非异常：面板收起时 Chromium 没有合成画面，`capturePage` 必然失败
 * （见 main.cjs screenshot 分支的 `panelReallyHidden` 闸）。这里**不抛错**，
 * 让调用方降级成「只发文字批注」，不要把整条消息卡住。
 */
export async function captureAnnotationScreenshot(tabId: string): Promise<{ path?: string; error?: string }> {
  const api = typeof window !== 'undefined' ? (window as any).electronAPI?.browserView : null;
  if (!api?.action) return { error: '仅桌面端支持截图' };
  if (!tabId) return { error: '没有可截图的标签页' };
  try {
    const r: any = await api.action(tabId, 'screenshot', {});
    if (r && r.error) return { error: String(r.error) };
    return typeof r?.file === 'string' && r.file ? { path: r.file } : {};
  } catch (e: any) {
    return { error: e?.message || String(e) };
  }
}
