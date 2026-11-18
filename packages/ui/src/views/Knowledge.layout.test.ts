import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.resolve(here, 'Knowledge.vue'), 'utf8');

describe('Knowledge layout', () => {
  it('uses independent scrolling regions instead of scrolling the whole page', () => {
    expect(SRC).toContain(':scroll="false"');
    expect(SRC).toContain('class="kb-list-body"');
    expect(SRC).toMatch(/\.knowledge-layout\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*hidden/s);
    expect(SRC).toMatch(/\.kb-list-body\s*\{[^}]*overflow-y:\s*auto/s);
    expect(SRC).toMatch(/\.kb-tabs :deep\(\.el-tabs__content\)\s*\{[^}]*overflow:\s*hidden/s);
    expect(SRC).toMatch(/\.doc-tree-body\s*\{[^}]*overflow-y:\s*auto/s);
    expect(SRC).toMatch(/\.doc-preview-body\s*\{[^}]*overflow-y:\s*auto/s);
  });
});
