import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPlatformAdapter } from '../../platform/types';

/**
 * 写文件工具。
 *
 * ★★★ 设计口径（2026-09-23 用户反馈「路径不应该方法里面自己判断？还用大模型传？」
 *     「代码层面直接传入啊」）：
 *
 *   产物位置在本系统里是**确定性可推导**的（产物目录规范，见 @yan-zhi/shared 的
 *   artifact-paths）：`<根>/.yan-zhi/tasks/<conversationId>/{intermediate,deliverables}`。
 *   调用方（llm-task-manager）手里就有 conversationId，**直接算出目录传进 ctx** 即可。
 *
 *   ⇒ 本工具**不做任何路径推导**（不查库、不猜根、不注入回调）：
 *     只在 `ctx.artifactDirs[category]` 这个**已经算好的绝对目录**里拼上文件名。
 *     core 是平台无关层，路径怎么算属于边缘层的知识。
 *
 *   让模型填 path 的实测后果（这就是原实现的问题）：
 *     ① 文件写到工作区任意位置（各处一份，用户看到"写得到处都是"）；
 *     ② 服务端静态媒体路由只认规范目录 → 登记进 conversation_file 的文件
 *        预览/另存为一律 404（"生成后能看到但预览不行"）；
 *     ③ 读取时产物根还随工作目录漂移，同一份库里出现多个根
 *        （见 issues/产物根目录漂移导致媒体404-20260919.md）。
 *
 *   ⇒ `path` 不再必填，语义收敛为**仅当用户明确点名要某个落点**时才用；
 *     常规写入只需 `file_name`（甚至不填，由系统按内容/分类命名）。
 */
export class FileWriteTool implements BuiltInTool {
  name = 'file_write';
  description = [
    '把文本内容写入文件（自动创建父目录；同名覆盖）。',
    '★ 落盘位置由系统按当前会话自动决定，**不要把完整路径编在参数里**。',
    '只想指定文件名时传 file_name（如 "分析报告.md"）；完全不传则由系统按内容推导。',
    '只有当用户**明确要求存到某个具体位置**（例如"存到桌面"）时，才把该位置传给 path。',
  ].join('');

  inputSchema = {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The text content to write to the file.',
      },
      file_name: {
        type: 'string',
        description:
          '期望的文件名（不含目录），例如 "销售分析.md"、"data.csv"。省略时系统会按内容/分类自动命名。不要在这里写路径。',
      },
      category: {
        type: 'string',
        enum: ['intermediate', 'deliverable'],
        description:
          '文件分类，必须正确选择：deliverable=最终交付给用户的成果（报告、最终文档、生成的源代码、导出数据、图片成品等用户会直接使用或保存的文件）；intermediate=过程性中间产物（调试输出、临时草稿、中间计算结果、将被后续步骤覆盖或删除的临时文件）。凡用户最终想要的结果文件必须显式传 deliverable，不要省略该参数，也不要把交付物误标为 intermediate。',
      },
      path: {
        type: 'string',
        description:
          '【通常不需要】仅当用户明确要求存到某个具体位置时才填（如 "存到桌面/xxx.png"）。日常写入请改用 file_name —— 自己编路径会导致文件散落、预览打不开。',
      },
    },
    // ★ 只有 content 必填：位置由调用方算好传入（见类注释）。
    required: ['content'],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const { fs } = getPlatformAdapter();
    const content = args.content as string;
    const category: 'intermediate' | 'deliverable' =
      (args.category as string) === 'deliverable' ? 'deliverable' : 'intermediate';

    if (content === undefined || content === null) {
      return { content: [{ type: 'text', text: 'Error: content is required' }], isError: true };
    }

    const rawPath = typeof args.path === 'string' ? args.path.trim() : '';
    const rawName = typeof args.file_name === 'string' ? args.file_name.trim() : '';

    // 文件名：优先 file_name；模型若仍按旧习惯传了 path，则取其 basename 当名字。
    const fileName =
      sanitizeFileName(rawName || (rawPath ? baseNameOf(rawPath) : '')) ||
      defaultFileName(category, content);

    // ── 落盘目录：调用方已算好，这里只取用 ──────────────────────────────
    const ctxDir = ctx?.artifactDirs?.[category] || '';
    const dir = ctxDir || dirNameOf(rawPath);   // 无 ctx 时退回旧行为（不为空即按原 path 的目录写）
    const path = dir ? joinPath(dir, fileName) : (rawPath || fileName);

    try {
      if (dir) {
        const parentExists = await fs.exists(dir);
        if (!parentExists) await fs.mkdir(dir);
      }
      // ★ 落盘前先读原内容，回传给调用方做 Diff 快照。
      //   为什么由工具自己做：落盘路径只有工具知道（目录来自 ctx、文件名由本工具推导），
      //   调用方无法在执行前预知路径；让它回传比让调用方重复推导一遍可靠。
      let beforeContent: string | null = null;
      try {
        if (await fs.exists(path)) beforeContent = await fs.readFile(path);
      } catch { /* 读不到按"新建文件"处理 */ }

      await fs.writeFile(path, content);
      const len = content.length;

      // 成功文案：给模型一句明确指引 + 文件名（不要把绝对路径当主体，
      // 否则模型容易在正文里把盘上路径复述给用户，用户并不需要看）
      return {
        content: [{ type: 'text', text: `Successfully wrote ${len} bytes to ${fileName}（会话产物目录：${category}）` }],
        // _meta 供 llm-task-manager 登记 conversation_file：
        // ★ path 用**绝对路径**（"落盘即权威"口径）—— 读取端应信任登记路径，而不是重算产物根。
        _meta: { path, name: fileName, category, bytes: len, beforeContent },
      } as McpCallResult;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error writing file: ${msg}` }], isError: true };
    }
  }
}

/** 拼接目录与文件名（统一用平台分隔符由 fs 适配层处理，这里保持原样拼接） */
function joinPath(dir: string, name: string): string {
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
  return dir.replace(/[/\\]+$/, '') + sep + name;
}

/** 取目录部分（兼容 / 与 \；无分隔符返回空串） */
function dirNameOf(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i > 0 ? p.slice(0, i) : '';
}

/** 取文件名部分（兼容 / 与 \） */
function baseNameOf(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(i + 1) : p;
}

/**
 * 清理文件名：去掉路径分隔符与非法字符，避免"文件名里带斜杠"这种落盘越界。
 * ★ 放行中文/空格/括号 —— 交付物常是「手机推荐报告.png」这类名字。
 */
function sanitizeFileName(name: string): string {
  if (!name) return '';
  return name
    .replace(/[/\\]/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^\.+/, '')      // 去掉前导点，避免生成隐藏文件
    .trim()
    .slice(0, 120);
}

/** 由内容推导默认文件名：优先取首个 Markdown 标题，其次按分类给个带时间戳的名字。 */
function defaultFileName(category: 'intermediate' | 'deliverable', content: string): string {
  const m = /^\s{0,3}#{1,3}\s+(.+)$/m.exec(content || '');
  if (m) {
    const title = sanitizeFileName(m[1].replace(/[*_`]/g, '').trim());
    if (title) return `${title.slice(0, 60)}.md`;
  }
  const stamp = Date.now().toString(36);
  return category === 'deliverable' ? `deliverable-${stamp}.md` : `intermediate-${stamp}.md`;
}