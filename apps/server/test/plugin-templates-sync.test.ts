// 内嵌源码模板与真实源码的一致性（P6）。
//
// 背景：打包版不带 .ts 源码，「导出源码」只能读 templates/index.ts 里的内嵌快照；
// dev 下则直接读真实源码（routes/plugins.ts 的 readPluginSourceFromDisk）。
// 两者一旦漂移，用户拿到的"源码"就是旧的 —— 今天实测就发现 computer-use 模板
// 还停在直连 db.js 的老写法（真实源码早已改走 host-bridge）。
// 本测试把「内嵌快照 === 真实源码」钉死：改插件源码忘了跑同步脚本 → 立刻红。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLUGIN_TEMPLATES } from '../src/plugins/templates/index.js';

const PLUGINS_SRC = fileURLToPath(new URL('../src/plugins/', import.meta.url));
const TEMPLATES_FILE = path.join(PLUGINS_SRC, 'templates', 'index.ts');

/** 模板文件里声明了 generated 区块的插件 id（与 sync-plugin-templates.mjs 的发现规则一致） */
function generatedIds(): string[] {
  const tpl = readFileSync(TEMPLATES_FILE, 'utf8');
  return [...tpl.matchAll(/^\/\/ === generated:([a-z][a-z0-9-]*):start[^\n]* ===$/gm)].map((m) => m[1]);
}

describe('内嵌源码模板 === 真实源码', () => {
  const ids = generatedIds();

  it('至少存在一个 generated 区块（否则本测试失去意义）', () => {
    expect(ids.length).toBeGreaterThan(0);
  });

  for (const id of ids) {
    it(`${id}：未过期（改了源码要重跑 sync-plugin-templates.mjs）`, () => {
      const candidates = [path.join(PLUGINS_SRC, `${id}.ts`), path.join(PLUGINS_SRC, id, 'index.ts')];
      const srcFile = candidates.find((f) => existsSync(f));
      expect(srcFile, `找不到 ${id} 的源码文件`).toBeTruthy();
      const src = readFileSync(srcFile!, 'utf8');
      const tpl = PLUGIN_TEMPLATES[id];
      expect(tpl, `PLUGIN_TEMPLATES 缺少 ${id}`).toBeTruthy();
      expect(tpl.code).toBe(src);
    });
  }
});
