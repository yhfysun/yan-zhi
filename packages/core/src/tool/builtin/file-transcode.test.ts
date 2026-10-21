// file_transcode 回归（2026-10-21 用户要求「格式转换也要有」）
//
// 守住的语义：
//   ① 默认 dry_run：只报告，不动文件；
//   ② dry_run=false：真的把字节改成目标编码（且是**字节级**写入，不被"按原编码写回"覆盖）；
//   ③ 目标编码表示不了的内容（emoji → GBK）**整体跳过**，绝不静默写 '?'；
//   ④ 二进制文件跳过；已是目标编码标 unchanged；
//   ⑤ 目录模式按扩展名收集（recursive 控制是否进子目录）。
import { describe, it, expect } from 'vitest';
import { FileTranscodeTool } from './file-transcode';
import { setPlatformAdapter, type PlatformAdapter } from '../../platform/types';
import { decodeTextBytes, encodeTextBytes } from '@yan-zhi/shared';

const GBK_TEXT = '构建完成，请检查输出目录。';
const FILE = 'C:/work/proj/legacy/doc.txt';

function makeMemFs(files: Map<string, Uint8Array>, dirs: Set<string> = new Set()) {
  return {
    readFile: async (p: string) => new TextDecoder('utf-8').decode(files.get(p) ?? new Uint8Array()),
    readFileBase64: async (p: string) => {
      const b = files.get(p);
      if (!b) throw new Error(`no such file: ${p}`);
      return Buffer.from(b).toString('base64');
    },
    writeFile: async (p: string, content: string) => { files.set(p, new TextEncoder().encode(content)); },
    writeFileBase64: async (p: string, b64: string) => { files.set(p, new Uint8Array(Buffer.from(b64, 'base64'))); },
    exists: async (p: string) => files.has(p) || dirs.has(p),
    stat: async (p: string) => {
      if (dirs.has(p)) return { size: 0, mtimeMs: 0, isDir: true };
      const b = files.get(p);
      if (!b) throw new Error('not found');
      return { size: b.length, mtimeMs: 0, isDir: false };
    },
    listDirEntries: async (p: string) => {
      const prefix = `${p}/`;
      const names = new Set<string>();
      for (const key of [...files.keys(), ...dirs]) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const head = rest.split('/')[0];
        names.add(head);
      }
      return [...names].map((name) => ({
        name,
        isDir: dirs.has(`${prefix}${name}`),
        size: files.get(`${prefix}${name}`)?.length ?? 0,
      }));
    },
  } as unknown as PlatformAdapter['fs'];
}

async function run(files: Map<string, Uint8Array>, dirs: Set<string>, args: Record<string, unknown>) {
  const tool = new FileTranscodeTool();
  setPlatformAdapter({ platform: 'desktop', fs: makeMemFs(files, dirs) } as unknown as PlatformAdapter);
  return tool.execute(args, { workspaceDir: 'C:/work/proj' });
}

const text = (r: { content?: unknown }) =>
  ((r.content as Array<{ text: string }> | undefined)?.[0]?.text) ?? '';

describe('file_transcode 编码转换', () => {
  it('★ 默认 dry_run：只报告，不改字节', async () => {
    const gbk = encodeTextBytes(GBK_TEXT, 'gb18030');
    const files = new Map([[FILE, gbk]]);
    const r = await run(files, new Set(), { path: FILE, to: 'utf-8' });
    const out = text(r as never);
    expect(out).toContain('预览');
    expect(out).toContain('GBK → UTF-8');
    expect(files.get(FILE)).toBe(gbk); // 字节一个都没变
  });

  it('★ dry_run=false：真正转成 UTF-8，文本不变', async () => {
    const files = new Map([[FILE, encodeTextBytes(GBK_TEXT, 'gb18030')]]);
    const r = await run(files, new Set(), { path: FILE, to: 'utf-8', dry_run: false });
    expect(text(r as never)).toContain('已转换 1 个文件');
    const after = files.get(FILE)!;
    const decoded = decodeTextBytes(after);
    expect(decoded.encoding).toBe('utf-8');
    expect(decoded.text).toBe(GBK_TEXT);
  });

  it('反向：UTF-8 → GBK（老系统场景）', async () => {
    const files = new Map([[FILE, encodeTextBytes(GBK_TEXT, 'utf-8')]]);
    await run(files, new Set(), { path: FILE, to: 'gbk', dry_run: false });
    expect(decodeTextBytes(files.get(FILE)!).encoding).toBe('gb18030');
  });

  it('★ 目标编码表示不了的字符 → 整体跳过，绝不写 ?', async () => {
    const emojiText = '表情 😀 在 GBK 里没有';
    const files = new Map([[FILE, encodeTextBytes(emojiText, 'utf-8')]]);
    const r = await run(files, new Set(), { path: FILE, to: 'gbk', dry_run: false });
    const out = text(r as never);
    expect(out).toContain('跳过');
    expect(out).toContain('无法无损表示');
    expect(decodeTextBytes(files.get(FILE)!).text).toBe(emojiText); // 原文没动
  });

  it('已经是目标编码 → 标 unchanged，不重写', async () => {
    const original = encodeTextBytes(GBK_TEXT, 'utf-8');
    const files = new Map([[FILE, original]]);
    const r = await run(files, new Set(), { path: FILE, to: 'utf-8', dry_run: false });
    expect(text(r as never)).toContain('已是目标编码');
    expect(files.get(FILE)).toBe(original);
  });

  it('二进制文件跳过', async () => {
    const files = new Map([[FILE, new Uint8Array([0x00, 0x01, 0x02, 0xff, 0x00])]]);
    const r = await run(files, new Set(), { path: FILE, to: 'utf-8', dry_run: false });
    expect(text(r as never)).toContain('二进制');
  });

  it('目录模式：按扩展名收集，recursive 控制是否进子目录', async () => {
    const a = 'C:/work/proj/dir/a.txt';
    const b = 'C:/work/proj/dir/sub/b.txt';
    const files = new Map<string, Uint8Array>([
      [a, encodeTextBytes(GBK_TEXT, 'gb18030')],
      [b, encodeTextBytes(GBK_TEXT, 'gb18030')],
      ['C:/work/proj/dir/skip.bin', new Uint8Array([0, 1, 2])],
    ]);
    const dirs = new Set(['C:/work/proj/dir', 'C:/work/proj/dir/sub']);

    const shallow = await run(new Map(files), dirs, { path: 'C:/work/proj/dir', to: 'utf-8' });
    expect(text(shallow as never)).toContain('1 个文件待转换');

    const deep = await run(new Map(files), dirs, { path: 'C:/work/proj/dir', to: 'utf-8', recursive: true });
    expect(text(deep as never)).toContain('2 个文件待转换');
  });

  it('不认识的编码名 → 明确报错', async () => {
    const files = new Map([[FILE, encodeTextBytes(GBK_TEXT, 'utf-8')]]);
    const r = (await run(files, new Set(), { path: FILE, to: 'klingon-8' })) as unknown as { isError?: boolean };
    expect(r.isError).toBe(true);
    expect(text(r as never)).toContain('不支持的目标编码');
  });
});

// UTF-16 文件此前会被「含 NUL 即二进制」误跳过（2026-10-21 修）：这里钉住能转。
describe('file_transcode · UTF-16 源文件', () => {
  it('UTF-16LE(带 BOM) → UTF-8 能正常转码（不再被当二进制跳过）', async () => {
    const body = 'UTF-16 中文内容';
    const bytes = new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(body, 'utf16le')]));
    const files = new Map([[FILE, bytes]]);
    const r = await run(files, new Set(), { path: FILE, to: 'utf-8', dry_run: false });
    expect(text(r as never)).toContain('已转换 1 个文件');
    const after = decodeTextBytes(files.get(FILE)!);
    expect(after.encoding).toBe('utf-8');
    expect(after.text).toBe(body);
  });
});
