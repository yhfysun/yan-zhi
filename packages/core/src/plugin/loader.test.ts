// 插件入口 → ESM specifier 归一化（packages/core/src/plugin/loader.ts）
//
// ★ 钉住的实报案（2026-10-25 远控 /hostkey 500「PluginManager 未初始化」）：
//   内置插件包给的是 `path.join()` 出来的 Windows 绝对路径（`C:\...\backend\index.js`），
//   它不是合法 ESM specifier ⇒ import() 抛错 ⇒ 回退 require(esm) ⇒ Node 22 在**独立模块图**
//   里加载插件 ⇒ 插件里的 @yan-zhi/core 是第二份实例 ⇒ 模块级单例（PluginManager）为空
//   ⇒ 插件已启用却到处报"未启用"。所以：绝对路径必须转成 file:// URL 走 ESM 正路。
import { describe, it, expect } from 'vitest';
import { toEntrySpecifier } from './loader.js';

describe('toEntrySpecifier', () => {
  it('★ Windows 盘符绝对路径（反斜杠）转成 file:// URL —— 否则会掉进 require(esm) 的独立模块图', async () => {
    const out = await toEntrySpecifier('C:\\repo\\apps\\server\\plugins\\builtin\\remote-control\\backend\\index.js');
    expect(out.startsWith('file:///')).toBe(true);
    expect(out).toContain('/remote-control/backend/index.js');
    expect(out).not.toContain('\\');
  });

  it('★ 单字母盘符不能被当成 URL scheme 放过去（C:/… 与 C:\\… 同判）', async () => {
    const slash = await toEntrySpecifier('C:/repo/backend/index.js');
    expect(slash.startsWith('file:///')).toBe(true);
  });

  it('已是 file:// URL 的原样返回（不二次转换）', async () => {
    const url = 'file:///C:/repo/backend/index.js';
    expect(await toEntrySpecifier(url)).toBe(url);
  });

  it('bare specifier / 相对路径原样返回（交给 loader 按 importer 解析）', async () => {
    expect(await toEntrySpecifier('some-plugin')).toBe('some-plugin');
    expect(await toEntrySpecifier('./backend/index.js')).toBe('./backend/index.js');
  });

  it('空串安全返回', async () => {
    expect(await toEntrySpecifier('')).toBe('');
  });
});
