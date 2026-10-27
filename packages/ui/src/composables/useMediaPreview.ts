// 消息内媒体的统一交互层：缩略图 → 放大查看 / 另存为 / 打开所在目录 / 复制 / 复制路径。
//
// 状态放在模块级单例：聊天区、子智能体卡片、文件面板等任意位置点击缩略图，
// 都指向同一个灯箱与同一个右键菜单，避免每个挂载点各持一份状态。
//
// 平台能力：
// - 桌面端：electronAPI.dialog.saveFile（系统保存框）、clipboard.writeImage（原生剪贴板）、
//   shell.showItemInFolder（文件管理器中定位）
// - 浏览器/移动端：a[download] 下载 + navigator.clipboard，能力缺失时给出提示而不是静默失败

import { reactive, readonly } from 'vue';
import { ElMessage } from 'element-plus';
import { resolveServerUrl } from '@yan-zhi/shared';
import { API_BASE } from '../api/client';
import { toWindowsPath } from '../utils/file-open';
import { saveDeliverableBytes, safeFileName, bytesToBase64 } from '../utils/deliverable-save';

/** 一个可预览媒体（图片 / 视频 / 音频 / 普通文件）的来源描述 */
export interface MediaTarget {
  /** 显示用地址：/api/... 相对地址、http(s) 或 data: */
  src: string;
  /** 本机绝对路径（桌面端另存为/打开目录用；没有则只提供复制与放大） */
  path?: string;
  /** 文件名（用于另存为默认名与菜单标题） */
  name?: string;
  /**
   * 媒体类型：file 表示无内联预览的普通文件（菜单只给另存为/复制/打开目录）。
   * audio 是 2026-09-27 新增 —— 此前配音产物（TTS wav/mp3）既没有消息卡片、
   * 文件预览也只能「用本机应用打开」，应用内完全听不到。
   */
  kind: 'image' | 'video' | 'audio' | 'file';
  /** 可选说明（图片的画图描述等） */
  description?: string;
}

const state = reactive({
  /** 灯箱 */
  viewerVisible: false,
  viewer: null as MediaTarget | null,
  viewerZoom: 1,
  /** 右键菜单 */
  menuVisible: false,
  menuX: 0,
  menuY: 0,
  menuTarget: null as MediaTarget | null,
  /** 当前选中的媒体（Ctrl+C 复制的对象） */
  selected: null as MediaTarget | null,
  /** hover 浮层：按缩略图 getBoundingClientRect 复位，body 级纯视觉放大（不参与布局） */
  hoverVisible: false,
  hoverTarget: null as MediaTarget | null,
  hoverX: 0,
  hoverY: 0,
  hoverW: 0,
  hoverH: 0,
  /** 视频浮层专用：进入时自动静音播放，最长 5 秒 */
  hoverPlaying: false,
});

const media = readonly(state);

/** Electron 预加载暴露的桥接对象（桌面端才有） */
function electronApi(): any {
  return (window as unknown as { electronAPI?: any }).electronAPI;
}

function isDesktop(): boolean {
  return !!electronApi()?.isElectron;
}

function fileNameOf(t: MediaTarget): string {
  const fallback = t.kind === 'video' ? 'video.mp4' : t.kind === 'audio' ? 'audio.mp3' : 'image.png';
  if (t.name) return t.name;
  try {
    const u = new URL(t.src, window.location.origin);
    const base = u.pathname.split('/').pop() || '';
    return decodeURIComponent(base) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * 把相对地址补成可请求的绝对地址（灯箱与复制都需要真实可取的 URL）。
 * 规则在 @yan-zhi/shared 的 resolveServerUrl：API_BASE 已含 /api，而服务端返回的媒体地址
 * 自身也以 /api 开头（/api/generated/...、/api/plugin/.../screenshots/...），
 * 所以必须先取站点根再拼 —— 直接 API_BASE + src 会拼出 /api/api/... 导致 404。
 */
export function absoluteMediaSrc(src: string): string {
  return resolveServerUrl(API_BASE, src);
}

/**
 * 从工具结果文本解析媒体产物（生图 / 生视频 / 配音）。
 *
 * 只认带 type 字段的新契约；旧数据按历史字段兜底识别，且必须命中对应字段，
 * 避免把图片结果误判成视频。带 cache：模板里会多次调用，避免重复 JSON.parse。
 */
const toolMediaCache = new Map<string, MediaTarget | null>();

export function mediaOfTool(resultText: string | null, kind: 'image' | 'video' | 'audio'): MediaTarget | null {
  if (!resultText) return null;
  const key = `${kind}|${resultText.length}|${resultText.slice(0, 80)}`;
  const hit = toolMediaCache.get(key);
  if (hit !== undefined) return hit;
  const parsed = parseToolMedia(resultText, kind);
  if (toolMediaCache.size > 500) toolMediaCache.clear();
  toolMediaCache.set(key, parsed);
  return parsed;
}

function parseToolMedia(resultText: string, kind: 'image' | 'video' | 'audio'): MediaTarget | null {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(resultText) as Record<string, unknown>;
  } catch {
    return null;
  }
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const declared = s(j.type);
  const file = s(j.file);
  const description = s(j.description) || s(j.revisedPrompt);

  if (kind === 'audio') {
    // 配音产物契约：{ type:'audio', url, file, engine, voice, bytes }
    const url = s(j.url) || s(j.audioUrl);
    if (!url) return null;
    // type 字段存在时必须自洽：视频/图片结果不能被当成音频
    if (declared && declared !== 'audio') return null;
    // 无 type 的旧数据必须命中音频扩展名或音频专用字段，避免误吞其它产物
    if (!declared && !s(j.audioUrl) && !/\.(mp3|wav|m4a|aac|flac|ogg|opus|wma)(?=$|[?#])/i.test(url)) return null;
    const voice = s(j.voice);
    const engine = s(j.engine);
    return {
      src: absoluteMediaSrc(url),
      kind: 'audio',
      name: (file ? file.split(/[\\/]/).pop() : '') || '音频',
      path: file || undefined,
      description: description || [voice && `音色 ${voice}`, engine && `${engine} 引擎`].filter(Boolean).join(' · ') || undefined,
    };
  }

  if (kind === 'video') {
    const url = s(j.url) || s(j.videoUrl);
    if (!url) return null;
    if (declared && declared !== 'video') return null;
    // 无 type 的旧数据必须命中 videoUrl 或明显的视频扩展名
    if (!declared && !s(j.videoUrl) && !/\.(mp4|webm|mov|m4v|ogg)(?=$|[?#])/i.test(url)) return null;
    return {
      src: absoluteMediaSrc(url),
      kind: 'video',
      name: (file ? file.split(/[\\/]/).pop() : '') || '视频',
      path: file || undefined,
      description: description || undefined,
    };
  }

  const url = s(j.url) || s(j.screenshotUrl) || s(j.remoteUrl);
  if (!url) return null;
  if (declared && declared !== 'image') return null;
  if (!declared && !s(j.screenshotUrl) && !s(j.remoteUrl)) return null;
  return {
    src: absoluteMediaSrc(url),
    kind: 'image',
    name: (file ? file.split(/[\\/]/).pop() : '') || '图片',
    path: file || undefined,
    description: description || undefined,
  };
}

// ===== 灯箱 =====
export function openMediaViewer(t: MediaTarget) {
  state.viewer = t;
  state.viewerZoom = 1;
  state.viewerVisible = true;
}

export function closeMediaViewer() {
  state.viewerVisible = false;
  state.viewer = null;
  state.viewerZoom = 1;
}

export function zoomMediaViewer(delta: number) {
  const next = Math.min(6, Math.max(0.25, state.viewerZoom + delta));
  state.viewerZoom = Number(next.toFixed(2));
}

export function resetMediaViewerZoom() {
  state.viewerZoom = 1;
}

// ===== 选中（Ctrl+C 复制对象） =====
export function selectMedia(t: MediaTarget | null) {
  state.selected = t;
}

// ===== 右键菜单 =====
export function openMediaMenu(e: MouseEvent, t: MediaTarget) {
  state.menuTarget = t;
  state.selected = t;
  const MENU_W = 190;
  // 音频菜单项与视频一致（播放 + 另存为 + 打开目录 + 复制路径）
  const MENU_H = t.kind === 'image' ? 170 : 130;
  const maxX = window.innerWidth - MENU_W - 8;
  const maxY = window.innerHeight - MENU_H - 8;
  state.menuX = Math.max(8, Math.min(e.clientX, maxX));
  state.menuY = Math.max(8, Math.min(e.clientY, maxY));
  state.menuVisible = true;
}

export function closeMediaMenu() {
  state.menuVisible = false;
  state.menuTarget = null;
}

// ===== hover 浮层 =====

/** hover 浮层相对缩略图的放大倍数：图/视频统一 1.8x */
const HOVER_SCALE = 1.8;

let hoverStopTimer: ReturnType<typeof setTimeout> | null = null;
function clearHoverStopTimer() {
  if (hoverStopTimer) { clearTimeout(hoverStopTimer); hoverStopTimer = null; }
}

/**
 * 唤起 hover 浮层：按缩略图当前矩形复位（transform-origin 左中），放大后仍以左缘对齐。
 * 浮层渲染在 body 上，不受消息容器 overflow / contain 裁剪，也不参与布局 ——
 * 缩略图本体不动，父盒子高度零影响，z-index 高于主智能体卡片不会被盖。
 */
export function openMediaHover(el: HTMLElement, t: MediaTarget) {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return;
  clearHoverStopTimer();
  // 放大后的目标尺寸（视频按 16:9 预留，contain 不变形）；越出窗口时往回钳
  const floatW = r.width * HOVER_SCALE;
  const floatH = (t.kind === 'video' ? floatW / HOVER_FLOAT_AR : r.height * HOVER_SCALE);
  const maxX = Math.max(8, window.innerWidth - floatW - 8);
  const maxY = Math.max(8, window.innerHeight - floatH - 8);
  let x = r.left;
  let y = r.top;
  if (x + floatW > window.innerWidth - 8) x = Math.max(8, window.innerWidth - floatW - 8);
  // 垂直方向以缩略图垂直中点为锚（origin 左中），钳制保证上下不出屏
  y = r.top + r.height / 2 - floatH / 2;
  if (y + floatH > window.innerHeight - 8) y = maxY;
  if (y < 8) y = 8;
  state.hoverTarget = t;
  state.hoverX = x;
  state.hoverY = y;
  state.hoverW = r.width;
  state.hoverH = r.height;
  state.hoverPlaying = t.kind === 'video';
  state.hoverVisible = true;
  if (t.kind === 'video') {
    // 与旧交互一致：视频 hover 最多自动播 5 秒，之后浮层里的播放停在首帧附近
    hoverStopTimer = setTimeout(() => { state.hoverPlaying = false; }, 5000);
  }
}

export function closeMediaHover() {
  clearHoverStopTimer();
  state.hoverVisible = false;
  state.hoverTarget = null;
  state.hoverPlaying = false;
}

// ===== 动作 =====

/**
 * 取媒体字节的统一入口：
 * 1. 本机文件（桌面端）走平台适配器读盘；
 * 2. 同源地址（/api/... 或本站 http）直接 fetch —— 同源无 CORS 问题；
 * 3. 远程 http(s) 地址走服务端代理 /api/media/proxy —— 老产物记录只有远程 url 时，
 *    渲染进程直 fetch 会被 CORS 拦（agnes 产物 CDN 域无 Access-Control-Allow-Origin），
 *    且该域本机直连超时，代理在服务端取流无此限制。
 * 返回 Blob，失败返回 null（调用方给用户报错而不是静默）。
 */
async function fetchMediaBlob(t: MediaTarget): Promise<Blob | null> {
  const directSrc = absoluteMediaSrc(t.src);
  const isRemote = /^https?:\/\//i.test(directSrc) && !directSrc.startsWith(window.location.origin);
  const target = isRemote
    ? `${API_BASE.replace(/\/api\/?$/, '')}/api/media/proxy?url=${encodeURIComponent(directSrc)}`
    : directSrc;
  try {
    const res = await fetch(target);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/** 拿图片的 base64 dataURL（复制到剪贴板 / 另存为都要原始字节） */
async function imageDataUrl(t: MediaTarget): Promise<string | null> {
  try {
    // 本机文件：走平台适配器读盘，避免相对地址在 Electron file:// 下取不到
    if (t.path && isDesktop()) {
      try {
        const { getPlatformAdapter } = await import('@yan-zhi/core');
        const b64 = await getPlatformAdapter().fs.readFileBase64(t.path);
        const ext = (t.path.split('.').pop() || 'png').toLowerCase();
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/png';
        return `data:${mime};base64,${b64}`;
      } catch { /* 回退到网络取图 */ }
    }
    const blob = await fetchMediaBlob(t);
    if (!blob) return null;
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** 复制图片本身 */
export async function copyMedia(t?: MediaTarget) {
  const target = t || state.menuTarget || state.selected;
  if (!target) return;
  if (target.kind !== 'image') {
    ElMessage.info('仅图片支持复制内容，可用「复制路径」');
    return;
  }
  const dataUrl = await imageDataUrl(target);
  if (!dataUrl) {
    ElMessage.error('读取图片失败，无法复制');
    return;
  }
  // 桌面端优先原生剪贴板（对 image/png 支持最稳）
  const electron = electronApi();
  if (electron?.clipboard?.writeImage) {
    const r = await electron.clipboard.writeImage(dataUrl);
    if (r?.ok) { ElMessage.success('已复制图片'); return; }
  }
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const ClipboardItemCtor = (window as any).ClipboardItem;
    if (!ClipboardItemCtor || !navigator.clipboard?.write) throw new Error('浏览器不支持图片写入剪贴板');
    await navigator.clipboard.write([new ClipboardItemCtor({ [blob.type || 'image/png']: blob })]);
    ElMessage.success('已复制图片');
  } catch {
    ElMessage.error('当前环境不支持复制图片，可用「复制路径」');
  }
}

/** 复制路径（没有本机路径时复制地址） */
export async function copyMediaPath(t?: MediaTarget) {
  const target = t || state.menuTarget || state.selected;
  if (!target) return;
  const text = target.path || target.src;
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制路径');
  } catch {
    ElMessage.error('复制失败');
  }
}

/** 在文件管理器中定位文件 */
export async function revealMedia(t?: MediaTarget) {
  const target = t || state.menuTarget || state.selected;
  if (!target) return;
  const electron = electronApi();
  if (!target.path) {
    ElMessage.info('该媒体没有本机文件，无法打开所在目录');
    return;
  }
  // ★ 登记路径可能是混合分隔符（`C:\a/03-output\b.mp4`），系统文件管理器只认原生分隔符，
  //   否则 explorer 的 /select 静默失败并退回默认目录（用户实报「跳到文档」）。
  const nativePath = toWindowsPath(target.path);
  if (electron?.shell?.showItemInFolder) {
    try {
      await electron.shell.showItemInFolder(nativePath);
      return;
    } catch { /* 回退 */ }
  }
  try {
    const { getPlatformAdapter } = await import('@yan-zhi/core');
    const adapter = getPlatformAdapter();
    if (!adapter.shell) throw new Error('无 shell 能力');
    const p = nativePath;
    const isWin = /win/i.test(navigator.platform);
    const isMac = /mac/i.test(navigator.platform);
    if (isWin) await adapter.shell.exec('explorer.exe', [`/select,${p}`]);
    else if (isMac) await adapter.shell.exec('open', ['-R', p]);
    else {
      const sep = p.includes('/') ? '/' : '\\';
      await adapter.shell.exec('xdg-open', [p.slice(0, p.lastIndexOf(sep)) || p]);
    }
  } catch {
    ElMessage.info('仅桌面端支持打开所在目录');
  }
}

/** 另存为：桌面端走系统保存框；视频/音频等大文件用源文件路径复制，图片用内存字节写 */
export async function saveMediaAs(t?: MediaTarget) {
  const target = t || state.menuTarget || state.selected;
  if (!target) return;
  const name = fileNameOf(target);
  const electron = electronApi();

  if (electron?.dialog?.saveFile) {
    const payload: Record<string, unknown> = { defaultName: name };
    if (target.kind === 'image') {
      const dataUrl = await imageDataUrl(target);
      if (!dataUrl) { ElMessage.error('读取图片失败'); return; }
      payload.dataUrl = dataUrl;
    } else if (target.path) {
      payload.sourcePath = target.path;
    } else {
      // 远端媒体：统一走 fetchMediaBlob（同源直取 / 远程走服务端代理，规避 CORS 与直连超时）
      const blob = await fetchMediaBlob(target);
      if (!blob) {
        ElMessage.error('读取文件失败，无法另存为');
        return;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ''));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
      payload.dataUrl = dataUrl;
    }
    const r = await electron.dialog.saveFile(payload);
    if (r?.ok) ElMessage.success('已保存到 ' + r.path);
    else if (r && !r.cancelled) ElMessage.error('保存失败: ' + (r.error || '未知错误'));
    return;
  }

  // 浏览器/移动端：a[download] 触发下载
  try {
    if (target.path) {
      const { getPlatformAdapter } = await import('@yan-zhi/core');
      const b64 = await getPlatformAdapter().fs.readFileBase64(target.path);
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bin]));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const a = document.createElement('a');
      a.href = absoluteMediaSrc(target.src);
      a.download = name;
      a.target = '_blank';
      a.click();
    }
    ElMessage.success('已开始下载');
  } catch (e: any) {
    ElMessage.error('下载失败: ' + (e?.message || e));
  }
}

/** Ctrl+C：复制当前选中的媒体。返回是否消费了该事件 */
export async function copySelectedMedia(): Promise<boolean> {
  if (!state.selected) return false;
  await copyMedia(state.selected);
  return true;
}

// ===== Word 导出 =====

const DOCX_KIND = {
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  label: 'Word',
};

/** 读取图片字节：本机文件优先走平台适配器，否则按地址取 */
async function readImageBytes(t: MediaTarget): Promise<{ data: Uint8Array; ext: string } | null> {
  const extOf = (p: string) => (p.split('.').pop() || 'png').toLowerCase();
  if (t.path && isDesktop()) {
    try {
      const { getPlatformAdapter } = await import('@yan-zhi/core');
      const b64 = await getPlatformAdapter().fs.readFileBase64(t.path);
      const bin = atob(b64);
      const data = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
      return { data, ext: extOf(t.path) };
    } catch { /* 回退到网络取图 */ }
  }
  try {
    const blob = await fetchMediaBlob(t);
    if (!blob) return null;
    const data = new Uint8Array(await blob.arrayBuffer());
    const ct = (blob.type || '').toLowerCase();
    const ext = /jpe?g/.test(ct) ? 'jpg' : /webp/.test(ct) ? 'webp' : /gif/.test(ct) ? 'gif' : extOf(t.src) || 'png';
    return { data, ext };
  } catch {
    return null;
  }
}

/**
 * 「导出 Word」只服务一类对象：整轮智能体响应结果（正文 + 正文引用的附图），
 * 入口在助手回复的操作条上，实现见 exportMarkdownDocx。
 * 单个媒体不再单独导出 Word —— 图片/视频的取用走「另存为」，那是它的正确语义。
 */

/** 图片地址 → dataURL；取不到返回 null（解析器降级为文字占位，不中断整篇导出） */
async function imageToDataUrl(src: string, alt: string): Promise<string | null> {
  const media: MediaTarget = { src: absoluteMediaSrc(src), kind: 'image', name: alt || '图片' };
  const bytes = await readImageBytes(media);
  if (!bytes?.data.length) return null;
  const ext = /^jpe?g$/i.test(bytes.ext) ? 'jpeg' : (bytes.ext || 'png');
  return `data:image/${ext};base64,${bytesToBase64(bytes.data)}`;
}

/** markdown 文本 → 原生 Word（标题层级 / 表格 / 代码块 / 图片，走 report-docx）
 *  opts.messageId：从哪条助手消息导出就带上，交付卡片才能精确挂到那一轮。 */
export async function exportMarkdownDocx(markdown: string, title?: string, opts?: { messageId?: string }) {
  const [{ markdownToDocxBlocks }, { buildReportDocx }] = await Promise.all([
    import('../utils/markdown-docx'),
    import('../utils/report-docx'),
  ]);
  const blocks = await markdownToDocxBlocks(markdown || '', { resolveImage: imageToDataUrl });
  if (!blocks.length) {
    ElMessage.info('没有可导出的内容');
    return;
  }
  const docTitle = (title || '导出文档').trim() || '导出文档';
  const blob = await buildReportDocx({ title: docTitle, blocks });
  const name = safeFileName(docTitle, '导出文档') + '.docx';
  await saveDeliverableBytes(new Uint8Array(await blob.arrayBuffer()), name, DOCX_KIND, opts);
}

/** 悬浮层固定宽高比：视频通常 16:9，浮层按 16:9 预留高度（object-fit:contain 不会变形）。
 *  音频没有视觉内容，走的是 AudioPlayer 卡片（不参与 hover 浮层）。 */
const HOVER_FLOAT_AR = 16 / 9;

export function useMediaPreview() {
  return {
    media,
    openMediaViewer,
    closeMediaViewer,
    zoomMediaViewer,
    resetMediaViewerZoom,
    selectMedia,
    openMediaMenu,
    closeMediaMenu,
    openMediaHover,
    closeMediaHover,
    copyMedia,
    copyMediaPath,
    revealMedia,
    saveMediaAs,
    copySelectedMedia,
    exportMarkdownDocx,
    mediaOfTool,
  };
}

export { HOVER_SCALE, HOVER_FLOAT_AR };
