// file_read 的格式兼容与编码支持回归（2026-10-21）
//
// 两件事：
//   ① 入参名对齐 Claude Code / Codex：`file_path` 与 `path` 等价（三家生态叫法不同）；
//   ② encoding 参数必须覆盖**大部分编码**（不只 gbk/utf-8）—— 用户原话
//      「大部分编码都要支持啊」。
import { describe, it, expect, beforeEach } from 'vitest';
import { FileReadTool } from './file-read';
import { setPlatformAdapter, type PlatformAdapter } from '../../platform/types';
import { encodeTextBytes } from '@yan-zhi/shared';

const FILE = 'C:/work/proj/src/a.txt';
const TEXT = '第一行\n第二行';

/** 内存文件系统（按字节存，便于验证编码） */
function makeMemFs(files: Map<string, Uint8Array>): Pick<PlatformAdapter, 'fs'>['fs'] {
  return {
    async readFile(p: string) {
      const bytes = files.get(p);
      if (!bytes) throw new Error(`no such file: ${p}`);
      return new TextDecoder('utf-8').decode(bytes); // 适配器已解码；这里只做兜底
    },
    async readFileBase64(p: string) {
      const bytes = files.get(p);
      if (!bytes) throw new Error(`no such file: ${p}`);
      return Buffer.from(bytes).toString('base64');
    },
    async writeFile(p: string, content: string) { files.set(p, new TextEncoder().encode(content)); },
    async exists(p: string) { return files.has(p); },
  } as unknown as PlatformAdapter['fs'];
}

async function run(files: Map<string, Uint8Array>, args: Record<string, unknown>) {
  const tool = new FileReadTool();
  setPlatformAdapter({ platform: 'desktop', fs: makeMemFs(files) } as unknown as PlatformAdapter);
  return tool.execute(args, { workspaceDir: 'C:/work/proj' });
}

const asText = (r: { content?: unknown }) =>
  ((r.content as Array<{ text: string }> | undefined)?.[0]?.text) ?? '';

describe('file_read 格式兼容', () => {
  let files: Map<string, Uint8Array>;
  beforeEach(() => {
    files = new Map([[FILE, encodeTextBytes(TEXT, 'utf-8')]]);
  });

  it('file_path 别名等价于 path（Claude Code / Codex 命名）', async () => {
    const r = await run(files, { file_path: FILE });
    expect(asText(r as never)).toContain('第一行');
  });

  it('filePath 老写法也仍然可用（不破坏既有调用）', async () => {
    const r = await run(files, { filePath: FILE });
    expect(asText(r as never)).toContain('第一行');
  });
});

describe('file_read 编码参数覆盖大部分编码', () => {
  const cases: Array<[string, string]> = [
    ['big5', '繁體中文測試'],
    ['shift_jis', '日本語のテストです。'],
    ['euc-kr', '한국어 테스트입니다.'],
    ['windows-1252', 'café résumé'],
    ['windows-1251', 'Съешь же ещё этих мягких булок.'],
    ['koi8-r', 'Съешь же ещё этих мягких булок.'],
  ];

  for (const [enc, text] of cases) {
    it(`${enc}：显式指定编码读出正确文本`, async () => {
      const files = new Map([[FILE, encodeTextBytes(text, enc as never)]]);
      const r = await run(files, { file_path: FILE, encoding: enc });
      expect(asText(r as never)).toContain(text.slice(0, 4));
    });
  }

  it('不认识的编码名 → 明确报错（不静默按 UTF-8 读出乱码）', async () => {
    const files = new Map([[FILE, encodeTextBytes(TEXT, 'utf-8')]]);
    const r = (await run(files, { path: FILE, encoding: 'klingon-8' })) as unknown as { isError?: boolean };
    expect(r.isError).toBe(true);
    expect(asText(r as never)).toContain('不支持的编码');
  });
});
