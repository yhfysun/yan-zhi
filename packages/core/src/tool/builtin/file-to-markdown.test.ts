// file_to_markdown 扩面回归（2026-10-21 用户要求「格式转换也要有」）
//
// 新增两类纯文本格式：HTML（去脚本样式后转 md）与 CSV/TSV（首行表头 → 管道表格）。
// 已有的 docx/xlsx/pptx/pdf 走各自的解析器，不在本文件覆盖（有专门的 preview 测试）。
import { describe, it, expect } from 'vitest';
import { FileToMarkdownTool } from './file-to-markdown';
import { setPlatformAdapter, type PlatformAdapter } from '../../platform/types';

function makeMemFs(files: Map<string, string>) {
  const writes = new Map<string, string>();
  const fs = {
    readFile: async (p: string) => files.get(p) ?? writes.get(p) ?? '',
    readFileBase64: async (p: string) => {
      const v = files.get(p);
      if (v === undefined) throw new Error(`no such file: ${p}`);
      return Buffer.from(v, 'utf8').toString('base64');
    },
    writeFile: async (p: string, content: string) => { writes.set(p, content); },
    exists: async (p: string) => files.has(p) || writes.has(p),
  } as unknown as PlatformAdapter['fs'];
  return { fs, writes };
}

async function run(files: Map<string, string>, args: Record<string, unknown>) {
  const { fs, writes } = makeMemFs(files);
  setPlatformAdapter({ platform: 'desktop', fs } as unknown as PlatformAdapter);
  const tool = new FileToMarkdownTool();
  const r = await tool.execute(args, { workspaceDir: 'C:/work/proj' });
  const text = ((r.content as Array<{ text: string }>)[0]?.text) ?? '';
  return { r, text, writes };
}

describe('file_to_markdown 新增格式', () => {
  it('HTML → md：去脚本/样式，标题与段落成 md', async () => {
    const html = `<!doctype html><html><head><style>.a{color:red}</style>
      <script>var x = '<p>不应出现</p>';</script></head>
      <body><h1>标题</h1><p>正文段落</p><ul><li>条目一</li><li>条目二</li></ul></body></html>`;
    const files = new Map([['C:/work/proj/page.html', html]]);
    const { text, writes } = await run(files, { file_path: 'C:/work/proj/page.html' });
    expect(text).toContain('Markdown 已生成');
    const md = writes.get('C:/work/proj/page.md') || '';
    expect(md).toContain('标题');
    expect(md).toContain('正文段落');
    expect(md).not.toContain('不应出现'); // 脚本里的内容必须被剥掉
    expect(md).not.toContain('color:red');
  });

  it('CSV → md：首行表头 + 分隔行 + 数据行', async () => {
    const csv = '名字,年龄\n张三,30\n李四,25\n';
    const files = new Map([['C:/work/proj/people.csv', csv]]);
    const { writes } = await run(files, { path: 'C:/work/proj/people.csv' });
    const md = writes.get('C:/work/proj/people.md') || '';
    expect(md).toContain('| 名字 | 年龄 |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| 张三 | 30 |');
  });

  it('CSV 里带引号的英文逗号与换行不被拆坏', async () => {
    const csv = 'a,b\n"x,y","line1\nline2"\n';
    const files = new Map([['C:/work/proj/q.csv', csv]]);
    const { writes } = await run(files, { path: 'C:/work/proj/q.csv' });
    const md = writes.get('C:/work/proj/q.csv.md') || writes.get('C:/work/proj/q.md') || '';
    // 表格里换行会被 escapeCell 压成空格；关键是 x,y 不能被拆成两列
    expect(md).toContain('x,y');
    expect(md).toMatch(/\| x,y \| line1 line2 \|/);
  });

  it('TSV → md：制表符分隔', async () => {
    const tsv = 'k\tv\n键\t值\n';
    const files = new Map([['C:/work/proj/t.tsv', tsv]]);
    const { writes } = await run(files, { path: 'C:/work/proj/t.tsv' });
    const md = writes.get('C:/work/proj/t.md') || '';
    expect(md).toContain('| k | v |');
    expect(md).toContain('| 键 | 值 |');
  });

  it('不支持的后缀 → 明确报错（并把支持列表说清楚）', async () => {
    const files = new Map([['C:/work/proj/a.xyz', 'whatever']]);
    const { r, text } = await run(files, { path: 'C:/work/proj/a.xyz' });
    expect((r as unknown as { isError?: boolean }).isError).toBe(true);
    expect(text).toContain('html/csv/tsv');
  });
});
