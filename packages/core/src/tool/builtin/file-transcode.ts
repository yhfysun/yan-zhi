// file_transcode — 文本文件**编码转换**（GBK ↔ UTF-8、Big5、Shift_JIS、EUC-KR、windows-125x、iso-8859-x、koi8-r…）
//
// ★ 为什么单独做一个工具（2026-10-21 用户要求「格式转换也要有啊」，承接上一轮「大部分编码都要支持」）：
//   上一轮解决的是「读对、按原编码写回」；但真实迁库场景要的是**主动转码**：
//   把一批 GBK 的老 .bat/.txt 一次性转成 UTF-8，或把 UTF-8 转回 GBK 交给老系统。
//   没有这个工具，模型只能「file_read + file_write」两步走 —— 而 file_write 的落盘出口
//   **按原编码写回**（这是对的），于是"想转码"永远转不动，只能靠人手工另存。
//
// 安全默认：
//   ① `dry_run` 默认 true —— 只报告"哪些文件会从什么编码转成什么编码"，不落盘；
//   ② 目标编码表示不了的字符（emoji、生僻字）**拒绝转码**，绝不静默写成 '?'（会毁数据）；
//   ③ 二进制文件、解码后有替换符的文件跳过并说明原因；
//   ④ 落盘走 `writeFileBase64`（**字节级写入**）：绕开"按原编码写回"的文本出口，
//      否则刚转好的 UTF-8 会被原编码再编码回去，等于没转。
import type { BuiltInTool, ToolContext } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { getPlatformAdapter } from '../../platform/types';
import { resolveToolPath } from './fs-walk';
import { readPathArg } from './path-args';
import { toolError } from '../result';
import {
  decodeTextBytes,
  decodeTextBytesAs,
  encodeTextBytes,
  looksBinaryBytes,
  resolveEncodingName,
  encodingLabel,
  base64ToBytes,
  type TextEncoding,
} from '@yan-zhi/shared';

/** 默认处理的文本类扩展名（不给 extensions 时用） */
const DEFAULT_TEXT_EXTS = [
  'txt', 'md', 'markdown', 'log', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml', 'xml',
  'ini', 'cfg', 'conf', 'properties', 'bat', 'cmd', 'ps1', 'sh', 'py', 'js', 'ts', 'java',
  'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs', 'php', 'rb', 'sql', 'html', 'htm', 'css', 'srt', 'ass',
];

const MAX_BATCH_FILES = 500;

interface TranscodeItem {
  path: string;
  from: string;
  to: string;
  changed: boolean;
  dryRun: boolean;
  bytesBefore: number;
  bytesAfter: number;
  action: 'converted' | 'skipped' | 'unchanged' | 'planned';
  reason?: string;
}

function extOf(p: string): string {
  const base = p.split(/[\\/]/).pop() || '';
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1).toLowerCase() : '';
}

function bytesToBase64(bytes: Uint8Array): string {
  const maybeBuffer = (globalThis as { Buffer?: { from: (b: Uint8Array) => { toString: (e: string) => string } } }).Buffer;
  if (maybeBuffer) return maybeBuffer.from(bytes).toString('base64');
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export class FileTranscodeTool implements BuiltInTool {
  name = 'file_transcode';
  description = [
    '把文本文件从一种**编码**转成另一种（GBK/GB2312 ↔ UTF-8、Big5、Shift_JIS、EUC-JP、EUC-KR、windows-125x、iso-8859-x、koi8-r、macintosh…）。',
    '支持单文件（path）、多文件（paths）或整目录（path 指向目录 + recursive）。',
    '默认 dry_run=true，只返回"将做什么"不动文件；确认无误后再用 dry_run=false 落盘。',
    '目标编码表示不了的字符（emoji/生僻字）会让该文件**整体跳过并说明**，绝不静默写成 ?。',
    '批量上限 500 个文件；二进制文件自动跳过。',
  ].join(' ');
  inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: '单个文件或目录（配 recursive）。也接受 file_path。' },
      file_path: { type: 'string', description: '`path` 的别名（Claude Code / Codex 命名）。' },
      paths: { type: 'array', items: { type: 'string' }, description: '多个文件（与 path 二选一或并用）。' },
      to: {
        type: 'string',
        description: '目标编码，必需。如 utf-8 / gbk / big5 / shift_jis / euc-kr / windows-1252 / iso-8859-5 / koi8-r。',
      },
      from: {
        type: 'string',
        description: '源编码，默认 auto（自动识别）。已知源编码时显式指定更稳。',
      },
      recursive: { type: 'boolean', description: 'path 是目录时是否递归子目录，默认 false。' },
      extensions: {
        type: 'array',
        items: { type: 'string' },
        description: `只处理这些扩展名（目录模式用），默认 ${DEFAULT_TEXT_EXTS.slice(0, 8).join('/')} 等文本类。`,
      },
      dry_run: { type: 'boolean', description: '默认 true：只报告不落盘。设 false 才真正转换。' },
      bom: { type: 'boolean', description: '目标为 UTF-8/UTF-16 时是否写 BOM，默认 false。' },
    },
    required: ['to'],
  };

  async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult> {
    const { fs } = getPlatformAdapter();

    // ── 目标编码 ──
    const toResolved = resolveEncodingName(String(args.to || ''));
    if (!toResolved) {
      return toolError(`Error: 不支持的目标编码 "${args.to}"。可用：utf-8 / gbk / big5 / shift_jis / euc-jp / euc-kr / windows-125x / iso-8859-x / koi8-r / macintosh …`);
    }
    const to: TextEncoding = toResolved;

    // ── 源编码（显式指定时校验）──
    const fromRaw = String(args.from || 'auto').trim();
    let forcedFrom: TextEncoding | null = null;
    if (fromRaw && fromRaw.toLowerCase() !== 'auto') {
      forcedFrom = resolveEncodingName(fromRaw);
      if (!forcedFrom) return toolError(`Error: 不支持的源编码 "${fromRaw}"。`);
    }

    // ── 收集目标文件 ──
    const single = readPathArg(args);
    const listRaw = Array.isArray(args.paths) ? args.paths.map((p) => String(p || '').trim()).filter(Boolean) : [];
    const roots = [single, ...listRaw].filter(Boolean);
    if (!roots.length) return toolError('Error: 需要 path（文件或目录）或 paths（文件列表）。');

    const recursive = args.recursive === true;
    const onlyExts = Array.isArray(args.extensions) && args.extensions.length
      ? new Set(args.extensions.map((e) => String(e).replace(/^\./, '').toLowerCase()))
      : new Set(DEFAULT_TEXT_EXTS);

    const files: string[] = [];
    for (const r of roots) {
      const abs = resolveToolPath(r, ctx?.workspaceDir);
      // 目录还是文件：优先用 stat（可选能力），没有就按"能否列目录"判断
      let dirFlag = false;
      if (fs.stat) {
        try { dirFlag = (await fs.stat(abs)).isDir; } catch { dirFlag = false; }
      } else if (typeof fs.listDirEntries === 'function') {
        try { await fs.listDirEntries(abs); dirFlag = true; } catch { dirFlag = false; }
      }
      if (!dirFlag) { files.push(abs); continue; }
      if (typeof fs.listDirEntries !== 'function') {
        return toolError('Error: 当前平台不支持目录遍历，请改用 paths 逐个指定文件。');
      }
      const stack = [abs];
      while (stack.length) {
        const dir = stack.pop() as string;
        const entries = await fs.listDirEntries(dir);
        for (const e of entries) {
          const child = `${dir}/${e.name}`;
          if (e.isDir) { if (recursive) stack.push(child); continue; }
          if (onlyExts.has(extOf(e.name))) files.push(child);
        }
      }
    }

    if (!files.length) return toolError('Error: 没有找到可处理的文件（目录模式下请检查 extensions / recursive）。');
    if (files.length > MAX_BATCH_FILES) {
      return toolError(`Error: 一次最多 ${MAX_BATCH_FILES} 个文件，当前 ${files.length} 个。请分批处理。`);
    }

    const dryRun = args.dry_run !== false;
    const withBom = args.bom === true;
    const items: TranscodeItem[] = [];

    for (const file of files) {
      const base64 = await fs.readFileBase64(file).catch(() => null);
      if (base64 == null) {
        items.push({ path: file, from: '?', to, changed: false, dryRun, bytesBefore: 0, bytesAfter: 0, action: 'skipped', reason: '读取失败' });
        continue;
      }
      const bytes = base64ToBytes(base64);
      if (looksBinaryBytes(bytes)) {
        items.push({ path: file, from: 'binary', to, changed: false, dryRun, bytesBefore: bytes.length, bytesAfter: bytes.length, action: 'skipped', reason: '二进制文件' });
        continue;
      }

      const decoded = forcedFrom
        ? { text: decodeTextBytesAs(bytes, forcedFrom) ?? decodeTextBytes(bytes).text, encoding: forcedFrom }
        : decodeTextBytes(bytes);
      const text = decoded.text;

      // 解码出了替换符 = 源编码判断错误（或文件本身损坏）→ 不转，免得把坏数据写成另一种坏数据
      if (text.includes('\ufffd')) {
        items.push({ path: file, from: decoded.encoding, to, changed: false, dryRun, bytesBefore: bytes.length, bytesAfter: bytes.length, action: 'skipped', reason: '按源编码解码出现替换符（请显式指定 from）' });
        continue;
      }

      if (decoded.encoding === to) {
        items.push({ path: file, from: encodingLabel(decoded.encoding), to: encodingLabel(to), changed: false, dryRun, bytesBefore: bytes.length, bytesAfter: bytes.length, action: 'unchanged' });
        continue;
      }

      // 目标编码无损性检查：编码后再解回来必须逐字相同，否则说明有字符表示不了
      const encoded = encodeTextBytes(text, to, { withBom });
      const roundTrip = decodeTextBytesAs(encoded, to);
      if (roundTrip !== text) {
        items.push({ path: file, from: encodingLabel(decoded.encoding), to: encodingLabel(to), changed: false, dryRun, bytesBefore: bytes.length, bytesAfter: bytes.length, action: 'skipped', reason: `目标编码无法无损表示该文件的内容（${encodingLabel(to)} 表示不了的字符会被写成 ?）` });
        continue;
      }

      if (!dryRun) {
        try {
          await fs.writeFileBase64(file, bytesToBase64(encoded));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          items.push({ path: file, from: encodingLabel(decoded.encoding), to: encodingLabel(to), changed: false, dryRun, bytesBefore: bytes.length, bytesAfter: bytes.length, action: 'skipped', reason: `写入失败：${msg}` });
          continue;
        }
      }
      items.push({
        path: file,
        from: encodingLabel(decoded.encoding),
        to: encodingLabel(to),
        changed: true,
        dryRun,
        bytesBefore: bytes.length,
        bytesAfter: encoded.length,
        action: dryRun ? 'planned' : 'converted',
      });
    }

    const planned = items.filter((i) => i.action === 'planned').length;
    const converted = items.filter((i) => i.action === 'converted').length;
    const skipped = items.filter((i) => i.action === 'skipped');
    const unchanged = items.filter((i) => i.action === 'unchanged').length;

    const head = dryRun
      ? `预览：${planned} 个文件待转换 → ${encodingLabel(to)}（未落盘；确认后把 dry_run 设为 false 再调用一次）`
      : `已转换 ${converted} 个文件 → ${encodingLabel(to)}`;
    const tail = [
      unchanged ? `已是目标编码：${unchanged}` : '',
      skipped.length ? `跳过 ${skipped.length} 个` : '',
    ].filter(Boolean).join(' · ');

    const lines = items.map((i) => {
      const mark = i.action === 'planned' ? '·' : i.action === 'converted' ? '✓' : i.action === 'unchanged' ? '=' : '×';
      const size = i.changed ? ` (${i.bytesBefore}B → ${i.bytesAfter}B)` : '';
      const why = i.reason ? ` —— ${i.reason}` : '';
      return `${mark} ${i.path}  ${i.from} → ${i.to}${size}${why}`;
    });

    return {
      content: [{
        type: 'text',
        text: `${head}${tail ? `（${tail}）` : ''}\n${lines.join('\n')}`,
      }],
      _meta: { files: items.map((i) => i.path), dryRun, converted, skipped: skipped.length },
    } as McpCallResult;
  }
}
