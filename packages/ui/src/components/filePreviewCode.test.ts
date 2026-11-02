// 代码 / JSON 预览守门测试（2026-11-02）
//   · JSON 只读展示自动格式化（编辑态仍用原文）
//   · 常见代码扩展名映射到 hljs 语言（java/py/xml/yaml…）
//   · 行号列横向滚动时吸附
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../..');
const SRC = readFileSync(resolve(REPO, 'packages/ui/src/components/FilePreview.vue'), 'utf8');

describe('FilePreview 代码视图', () => {
  it('JSON 展示自动格式化，且不动编辑内容', () => {
    expect(SRC).toMatch(/const displayCode = computed/);
    expect(SRC).toMatch(/JSON\.stringify\(JSON\.parse\(content\.value\), null, 2\)/);
    expect(SRC).toMatch(/hljs\.highlight\(displayCode\.value/);
  });

  it('常见扩展名映射到 hljs 语言', () => {
    for (const [ext, lang] of [
      ['py', 'python'], ['js', 'javascript'], ['ts', 'typescript'],
      ['yml', 'yaml'], ['html', 'xml'], ['kt', 'kotlin'], ['rs', 'rust'],
    ] as const) {
      expect(SRC, `${ext} → ${lang}`).toMatch(new RegExp(`${ext}: '${lang}'`));
    }
  });

  it('行号列粘在左侧', () => {
    const block = SRC.slice(SRC.indexOf('.fp-lns {'), SRC.indexOf('.fp-code {'));
    expect(block).toMatch(/position: sticky; left: 0/);
  });

  it('CSV 支持表格编辑并回写', () => {
    expect(SRC).toMatch(/function startCsvEdit/);
    expect(SRC).toMatch(/function csvAddRow/);
    expect(SRC).toMatch(/function csvAddCol/);
    expect(SRC).toMatch(/function saveCsvEdit/);
    expect(SRC).toMatch(/fp-cell-input/);
    expect(SRC).toMatch(/csvToText/);
  });

  it('常见文本格式都在白名单内', () => {
    for (const ext of ['java', 'py', 'xml', 'yaml', 'toml', 'log', 'csv', 'tsv', 'dart', 'proto', 'graphql', 'mdx', 'jsonc']) {
      expect(SRC, ext).toMatch(new RegExp(`'${ext}'`));
    }
  });
});
