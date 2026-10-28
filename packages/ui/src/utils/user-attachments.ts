/**
 * 用户消息正文里的「附件注入块」解析（2026-10-28）。
 *
 * 背景：发送时会把上传文件、@ 引用文件、网页引用以**纯文本块**追加进 content
 * （见 useChat.sendChat 的三处拼接）——智能体要读路径，但用户消息气泡里
 * 就会露出一大段 `[文件: image.png (33.7 KB, image/png) 路径: C:\...]`。
 *
 * 这里只做「展示用」的剥离：把结构化块切出来交给卡片渲染，正文只留用户真正打的字。
 * ★ 落库内容不变（智能体仍按原文读路径），所以历史消息也能直接享受新展示。
 */

export interface UserAttachment {
  name: string;
  path?: string;
  mimeType?: string;
  /** 原样保留发送时的尺寸文案（"33.7 KB"），无需反解成字节 */
  sizeText?: string;
  kind: 'image' | 'file' | 'folder' | 'quote';
  /** 落盘失败时的原因（该文件不存在，点开也没用） */
  error?: string;
}

export interface UserQuotedLink {
  name: string;
  url: string;
}

/**
 * 浏览器批注（2026-10-28）。
 * ★ 只用于**展示**：落库正文仍是 `formatAnnotationBlock` 那一整块纯文本
 *   （服务端靠 `已存档:` 挂多模态图，模型靠纯文本读组件路径）。
 *   这里把它切成结构化条目，免得用户气泡里糊一大段机器可读的文本。
 */
export interface UserAnnotation {
  index: number;
  kind: 'element' | 'region';
  label: string;
  componentFile?: string;
  selector?: string;
  comment: string;
}

export interface ParsedUserContent {
  text: string;
  attachments: UserAttachment[];
  links: UserQuotedLink[];
  annotations: UserAnnotation[];
  /** 批注截图落盘路径（正文里那行 `已存档:`）——卡片上做成可点开的缩略入口 */
  annotationShot?: string;
}

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif', 'heic', 'heif']);
const REFS_XML_MARK = '\n\n<references>\n';
const UPLOAD_MARK = '\n---\n已上传文件：';
const REFS_MARK = '\n\n[引用文件]\n';
const FILES_MARK = '\n\n[Files]\n';
const LINKS_MARK = '\n\n[网页引用]\n';
const UPLOAD_LINE_PREFIX = '[文件: ';
const REF_LINE_PREFIX = '[引用] ';

function extOf(name: string): string {
  const base = name.split(/[\\/]/).pop() || name;
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1).toLowerCase() : '';
}

function isImage(mimeType?: string, name?: string): boolean {
  if (mimeType && /^image\//i.test(mimeType)) return true;
  return !!name && IMAGE_EXT.has(extOf(name));
}

/**
 * `[文件: 名称 (33.7 KB, image/png) 路径: C:\x\y.png]` → 结构化附件。
 * ★ 名称里可能有括号（`截图(1).png`）→ 括号段必须**长得像尺寸**（`33.7 KB`）才算分隔，
 *   否则 `截图` 会被当成名称、`1).png (9.0 KB` 被当成尺寸。
 */
function parseUploadLine(line: string): UserAttachment | null {
  const body = line.slice(UPLOAD_LINE_PREFIX.length, -1);
  const m = /^([\s\S]*?)\s*\((\d[\d.]* ?(?:[KMGT]?B))(?:\s*,\s*([^()]*))?\)\s*(路径|保存失败)\s*[:：]\s*([\s\S]*)$/.exec(body);
  if (!m) return null;
  const name = m[1].trim();
  const sizeText = m[2].trim();
  const mimeType = (m[3] || '').trim();
  const value = m[5].trim();
  if (!name) return null;
  if (m[4] === '保存失败') {
    return { name, mimeType, sizeText, kind: isImage(mimeType, name) ? 'image' : 'file', error: value };
  }
  return {
    name,
    path: value,
    mimeType,
    sizeText,
    kind: isImage(mimeType, name) ? 'image' : 'file',
  };
}

/**
 * 统一引用块 `<references>`（2026-10-28 起的新契约，参照 AgentScope 的 content-block 思路）：
 * ```
 * <references>
 * <reference type="file" name="a.ts" path="C:\w\a.ts" mime="ts" size="1.2 KB">
 * 预览正文（原样保留，不参与解析）
 * </reference>
 * <reference type="page" name="示例页" url="https://example.com"/>
 * </references>
 * ```
 * 只读开标签的属性；条目正文（文件预览）与展示无关，直接忽略。
 */
function unxml(v: string): string {
  return v.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function attrOf(attrs: string, name: string): string {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
  return m ? unxml(m[1]) : '';
}
function parseReferencesXml(block: string): { attachments: UserAttachment[]; links: UserQuotedLink[] } | null {
  const attachments: UserAttachment[] = [];
  const links: UserQuotedLink[] = [];
  const re = /<reference\s+([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const attrs = m[1];
    const name = attrOf(attrs, 'name');
    if (!name) continue;
    const type = attrOf(attrs, 'type');
    if (type === 'page') {
      const url = attrOf(attrs, 'url');
      if (url) links.push({ name, url });
      continue;
    }
    if (type === 'quote') {
      // 消息引用：只展示摘要（正文是给模型的上下文，不在气泡里铺开）
      attachments.push({ name: attrOf(attrs, 'preview') || '引用的消息', kind: 'quote' });
      continue;
    }
    const path = attrOf(attrs, 'path') || undefined;
    const mime = attrOf(attrs, 'mime');
    const sizeText = attrOf(attrs, 'size');
    const kind: UserAttachment['kind'] = type === 'folder' || name.endsWith('/')
      ? 'folder'
      : isImage(mime === 'unknown' ? '' : mime, name) ? 'image' : 'file';
    attachments.push({ name, path, mimeType: mime, sizeText: sizeText || undefined, kind });
  }
  return attachments.length || links.length ? { attachments, links } : null;
}

/** `[引用文件]` 块（@ 引用 / 引用按钮，每行 `[引用] 名称 | 路径 | 类型 | 大小`）→ 结构化附件 */
function parseRefsBlock(block: string): UserAttachment[] | null {
  const out: UserAttachment[] = [];
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith(REF_LINE_PREFIX)) continue;   // 预览正文等其它行一律忽略
    const parts = line.slice(REF_LINE_PREFIX.length).split('|').map((s) => s.trim());
    const name = parts[0] || '';
    if (!name) continue;
    const path = parts[1] || undefined;
    const type = parts[2] || '';
    const sizeText = parts[3] || '';
    const kind: UserAttachment['kind'] = type === 'folder' || name.endsWith('/')
      ? 'folder'
      : isImage(type === 'unknown' ? '' : type, name) ? 'image' : 'file';
    out.push({ name, path, mimeType: type, sizeText: sizeText || undefined, kind });
  }
  return out.length ? out : null;
}

/** `[Files]` 块（旧版 @ 引用注入的 JSON 数组）→ 结构化附件；非 JSON 返回 null（保留原文） */
function parseFilesBlock(block: string): UserAttachment[] | null {
  let arr: unknown;
  try {
    arr = JSON.parse(block.trim());
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  const out: UserAttachment[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    const it = raw as Record<string, unknown>;
    const name = String(it.fileName ?? it.name ?? '').trim();
    if (!name) continue;
    const type = typeof it.type === 'string' ? it.type : '';
    const path = typeof it.path === 'string' && it.path ? it.path : undefined;
    const kind: UserAttachment['kind'] =
      type === 'folder' || name.endsWith('/') ? 'folder' : isImage(type === 'unknown' ? '' : type, name) ? 'image' : 'file';
    out.push({ name, path, mimeType: type, kind });
  }
  return out;
}

/** `- 标题 https://...` 每行一条 → 引用链接 */
function parseLinksBlock(block: string): UserQuotedLink[] {
  const out: UserQuotedLink[] = [];
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('- ')) continue;
    const item = line.slice(2).trim();
    if (!item) continue;
    const m = /^([\s\S]*?)\s+(https?:\/\/\S+)$/.exec(item);
    if (m) out.push({ name: m[1].trim() || m[2], url: m[2] });
    else out.push({ name: item, url: item });
  }
  return out;
}

/**
 * 拆出「用户正文 / 附件 / 引用链接」。
 * ★ 任何一块解析不出来（用户自己手打了同样的分隔符、或格式演进）都**原样保留在正文里**，
 *   宁可显示得丑一点，也不静默吞掉用户的内容。
 */
const ANNO_MARK = '\n\n浏览器批注（';
const ANNO_HEAD_RE = /^浏览器批注（(\d+) 条(?:，页面：([^）]*))?）/;
const ANNO_SHOT_RE = /^已存档:\s*(.+)$/;

/**
 * 解析 `formatAnnotationBlock`（utils/browser-annotation-message.ts）产出的纯文本块。
 * ★ 两处格式是强绑定的：改那边的拼接就必须同步改这里，否则批注会退回成一大段文字。
 *   格式见：`[n] 标签` / `    组件：…` / `    选择器：…` / `    评论：…` / `已存档: …`
 */
function parseAnnotationBlock(block: string): { items: UserAnnotation[]; shotPath?: string } | null {
  if (!ANNO_HEAD_RE.test(block)) return null;
  const items: UserAnnotation[] = [];
  let shotPath: string | undefined;
  let cur: UserAnnotation | null = null;

  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line.trim()) continue;
    if (ANNO_HEAD_RE.test(line)) continue;

    const shot = ANNO_SHOT_RE.exec(line.trim());
    if (shot) {
      shotPath = shot[1].trim();
      continue;
    }

    const item = /^\[(\d+)\]\s+(.+)$/.exec(line);
    if (item) {
      const body = item[2].trim();
      cur = {
        index: Number(item[1]),
        kind: /^区域框选/.test(body) ? 'region' : 'element',
        label: body,
        comment: '',
      };
      items.push(cur);
      continue;
    }

    const field = /^\s+(组件|选择器|评论)：([\s\S]*)$/.exec(line);
    if (field && cur) {
      const v = field[2].trim();
      if (field[1] === '组件') cur.componentFile = v;
      else if (field[1] === '选择器') cur.selector = v;
      else cur.comment = v;
    }
  }

  return items.length ? { items, shotPath } : null;
}

export function splitUserContent(raw: string | undefined | null): ParsedUserContent {
  const content = raw || '';
  if (!content) return { text: '', attachments: [], links: [], annotations: [] };

  let text = content;
  let links: UserQuotedLink[] = [];
  const attachments: UserAttachment[] = [];
  let annotations: UserAnnotation[] = [];
  let annotationShot: string | undefined;

  // ⓪ 浏览器批注块（拼接顺序最后，所以永远在正文末尾；纯批注消息则整条就是它）
  const annoIdx = text.lastIndexOf(ANNO_MARK);
  const annoStart = annoIdx >= 0 ? annoIdx + 2 : (text.startsWith('浏览器批注（') ? 0 : -1);
  if (annoStart >= 0) {
    const parsed = parseAnnotationBlock(text.slice(annoStart));
    if (parsed) {
      annotations = parsed.items;
      annotationShot = parsed.shotPath;
      text = annoStart > 0 ? text.slice(0, annoStart) : '';
    }
  }

  // ① 统一引用块（新契约，拼接顺序最靠后）
  const xmlIdx = text.lastIndexOf(REFS_XML_MARK);
  if (xmlIdx >= 0) {
    const parsed = parseReferencesXml(text.slice(xmlIdx));
    if (parsed) {
      attachments.push(...parsed.attachments);
      links = [...links, ...parsed.links];
      text = text.slice(0, xmlIdx);
    }
  }

  // ①b 旧版网页引用
  const linksIdx = text.lastIndexOf(LINKS_MARK);
  if (linksIdx >= 0) {
    const parsed = parseLinksBlock(text.slice(linksIdx + LINKS_MARK.length));
    if (parsed.length) {
      links = parsed;
      text = text.slice(0, linksIdx);
    }
  }

  // ② 引用的工作区文件（新格式是 `[引用文件]` 行式块，旧消息仍是 `[Files]` JSON）
  const refsIdx = text.lastIndexOf(REFS_MARK);
  if (refsIdx >= 0) {
    const parsed = parseRefsBlock(text.slice(refsIdx + REFS_MARK.length));
    if (parsed) {
      attachments.push(...parsed);
      text = text.slice(0, refsIdx);
    }
  }
  const filesIdx = text.lastIndexOf(FILES_MARK);
  if (filesIdx >= 0) {
    const parsed = parseFilesBlock(text.slice(filesIdx + FILES_MARK.length));
    if (parsed) {
      attachments.push(...parsed);
      text = text.slice(0, filesIdx);
    }
  }

  // ③ 上传文件
  const upIdx = text.lastIndexOf(UPLOAD_MARK);
  if (upIdx >= 0) {
    const lines = text.slice(upIdx + UPLOAD_MARK.length).split('\n').map((l) => l.trim()).filter(Boolean);
    const parsed: UserAttachment[] = [];
    let ok = lines.length > 0;
    for (const line of lines) {
      const one = line.startsWith(UPLOAD_LINE_PREFIX) && line.endsWith(']') ? parseUploadLine(line) : null;
      if (!one) { ok = false; break; }
      parsed.push(one);
    }
    if (ok) {
      attachments.unshift(...parsed);
      text = text.slice(0, upIdx);
    }
  }

  return { text: text.replace(/\s+$/, ''), attachments, links, annotations, annotationShot };
}
