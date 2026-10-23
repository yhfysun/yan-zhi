/**
 * 「模板用了但从未注册」的组件 —— 静态守门（2026-10-12）
 *
 * 背景（用户实报，2026-10-12）：
 *   ```
 *   CodeEditorArea.vue:256 Failed to resolve component: AiDiffView
 *   CodeEditorArea.vue:256 Failed to resolve component: CodeConflictEditor
 *   ```
 *   两个组件文件**一直存在**（`components/code/` 同目录），模板里也一直在用，
 *   但 `<script setup>` **从未 import 它们** —— `<script setup>` 不会自动注册同目录组件，
 *   未 import 即"未注册" ⇒ Vue 运行时解析失败 + console warn + **该处 UI 静默不渲染**：
 *     · `AiDiffView` 不渲染 ⇒ 模型改动看不到 diff，点不到「应用/回退」
 *     · `CodeConflictEditor` 不渲染 ⇒ 合并冲突无法解决
 *
 * ★★★ 为什么需要这个测试（而不是只修那两处）：
 *   这属**静默失效家族** —— 不报错、不崩，只是少一块 UI，肉眼极易漏掉；
 *   而 Vue 只在**运行时**、且**只有渲染到那条分支**时才 warn。
 *   静态扫描能在 CI 阶段一次性抓住全部同类问题（本项目"能力在、入口断"的又一形态）。
 *
 * ★ 判据：模板里出现的**大驼峰**标签名（如 `<AiDiffView`），必须满足其一：
 *   ① 本文件 `import ... from '...'` 引入；
 *   ② 在 `components: {}` / `defineComponent` 里注册；
 *   ③ 是全局注册的内置组件（Element Plus / Vue 内置 / 应用级 app.component）。
 *   标签是**小写含连字符**（`<div>` / `<el-button>` / `<slot>`）的天然不是本文件组件，跳过。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);

// __dirname = packages/ui/src/components → 上溯 1 层 = packages/ui/src（扫描范围）
const UI_SRC = join(__dirname, '..');

/** 递归收集所有 .vue */
function walkVue(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkVue(p, out);
    else if (name.endsWith('.vue')) out.push(p);
  }
  return out;
}

/**
 * 允许"未在本文件注册"的标签白名单 —— 必须是**全局注册**的，或 Vue 内置的。
 * ★ 白名单要保守：每加一个都应能说清"它为什么是全局的"。
 */
const GLOBAL_COMPONENTS = new Set([
  // Vue 内置
  'Transition', 'TransitionGroup', 'KeepAlive', 'Teleport', 'Suspense', 'Component', 'Slot',
  'RouterView', 'RouterLink',
]);

/**
 * Element Plus 图标全局注册表（`@element-plus/icons-vue` 的全部导出）。
 *
 * ★ 为什么读包而不是硬编码名单：`apps/{desktop,web,mobile}/src/main.ts` 里是
 *   `for (const [key, comp] of Object.entries(Icons)) app.component(key, comp)`
 *   —— **整个图标包全量全局注册**。硬编码名单必然漏（图标几百个）且会随版本漂移。
 *   ⇒ 直接枚举包的实际导出，与运行时口径一致。
 */
let ICON_NAMES: Set<string> | null = null;
function globalIconNames(): Set<string> {
  if (ICON_NAMES) return ICON_NAMES;
  ICON_NAMES = new Set<string>();
  try {
    const pkgPath = req.resolve('@element-plus/icons-vue/package.json');
    const dir = pkgPath.replace(/package\.json$/, '');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    // 尝试多个候选入口（module / main / dist/index.mjs / dist/index.js）
    const candidates = [
      join(dir, pkg.module || ''),
      join(dir, pkg.main || ''),
      join(dir, 'dist/index.mjs'),
      join(dir, 'dist/index.js'),
    ].filter(Boolean);
    let text = '';
    for (const c of candidates) {
      try { text = readFileSync(c, 'utf8'); break; } catch { /* 试下一个 */ }
    }
    for (const m of text.matchAll(/\b([A-Z][A-Za-z0-9]+)\s+as\s+[A-Za-z0-9_$]+/g)) ICON_NAMES.add(m[1]);
    for (const m of text.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const part of m[1].split(',')) {
        const nm = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (nm && /^[A-Z]/.test(nm)) ICON_NAMES.add(nm);
      }
    }
  } catch { /* 读不到包 → 白名单为空，测试会要求显式 import（更严格，不会假绿） */ }
  return ICON_NAMES;
}

/**
 * 提取模板里的**大驼峰**自定义标签名。
 *
 * ★★★ 不能用 `<template[\s\S]*?</template>` 非贪婪配对（2026-10-12 实测漏判）：
 *   模板内部有大量**嵌套 `<template v-if>`**（Element Plus 的表格列模板等），
 *   非贪婪匹配会在**第一个内层 `</template>`** 就闭合 ⇒ 后面的标签全部扫不到。
 *   实测：`CodeEditorArea.vue` 的 `<CodeConflictEditor>`（在文件后半、外层 template 内）
 *   被漏掉，导致该组件的"未注册"问题扫不出来（假绿风险）。
 *
 * ⇒ 改成**反向法**：剥掉 `<script>` / `<style>` 块，剩下的就是模板 —— 不依赖配对，天然免疫嵌套。
 */
function collectPascalTags(vue: string): string[] {
  const withoutScripts = vue
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '');
  const tags = new Set<string>();
  for (const m of withoutScripts.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)) tags.add(m[1]);
  return [...tags];
}

/**
 * 本文件是否"注册"了该组件。支持四种合法形态：
 *   ① `import Foo from '...'`
 *   ② `const Foo = defineAsyncComponent(...)`
 *   ③ `components: { Foo }`
 *   ④ **递归自引用**：组件在自己的模板里用自己 —— Vue SFC 天然支持，
 *      判据 = 标签名与本文件名同名（如 `GitTreeRow.vue` 里用 `<GitTreeRow>`）。
 *
 * ⚠️ 必须先**剥注释**再判：否则注释里出现的 `import Foo from '...'`（例如写
 *   "对照：`panels/X.vue` 里有 `import AiDiffView from '../AiDiffView.vue'`" 这种说明文字）
 *   会被当成真 import ⇒ 漏判（本项目"注释里提到就算数"的老坑，见 browser-bridge-direct）。
 */
function stripComments(s: string): string {
  // ★ 必须**先剥行注释再剥块注释**（2026-10-23 ShopConsole 实报）：
  //   行注释里带路径 glob（「页签拆到 ./shop/tabs/*」）时，其 /* 会被当成块注释开始，
  //   非贪婪匹配吞到几十行外的第一个 */ → 整个 import 区被当成注释 → 全部组件误判"未注册"。
  //   行注释的 [^:] 保护 URL scheme://；块注释的 [^:/] 保护路径分隔（a/b* 后跟块注释的场景）。
  return s.replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/(^|[^:/])\/\*[\s\S]*?\*\//g, '$1');
}

function isRegistered(vue: string, tag: string, fileName?: string): boolean {
  // ④ 递归自引用：文件名与标签同名（Vue SFC 的自引用语义）—— 不依赖 script 内容
  if (fileName && fileName.replace(/\.vue$/, '') === tag) return true;
  const script = stripComments(vue.slice(vue.indexOf('<script')));
  // ① import Foo from '...' / import { Foo } / import Foo, { Bar }
  const importRe = new RegExp(
    `import\\s+(?:[A-Za-z0-9_$]+\\s*,\\s*)?(?:\\{[^}]*\\b${tag}\\b[^}]*\\}|${tag}\\b)`,
  );
  if (importRe.test(script)) return true;
  // ② defineAsyncComponent / 常量赋值
  if (new RegExp(`const\\s+${tag}\\s*=`).test(script)) return true;
  // ③ components: { Tag } / components: { Tag: X }
  if (new RegExp(`components\\s*:\\s*\\{[^}]*\\b${tag}\\b`, 's').test(script)) return true;
  // ⑤ Element Plus 图标（全局全量注册）
  if (globalIconNames().has(tag)) return true;
  return false;
}

const FILES = walkVue(UI_SRC);

describe('① ★★★ 模板里用到的自定义组件必须在本文件注册（防"Failed to resolve component"静默失效）', () => {
  it('扫描全部 .vue，未注册的自定义组件必须为空', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const vue = readFileSync(file, 'utf8');
      const fileName = file.split(/[\\/]/).pop() || '';
      for (const tag of collectPascalTags(vue)) {
        if (GLOBAL_COMPONENTS.has(tag)) continue;
        if (isRegistered(vue, tag, fileName)) continue;
        offenders.push(`${relative(UI_SRC, file)} → <${tag}>`);
      }
    }
    expect(
      offenders,
      '★★★ 以下组件在模板里被使用但未在本文件注册 —— Vue 会在运行时 warn 且该处 UI **静默不渲染**' +
      '（本次事故：CodeEditorArea.vue 的 AiDiffView / CodeConflictEditor，导致"模型改动看不到 diff"' +
      '与"合并冲突无法解决"）。修法：在 <script setup> 里 import，或加进白名单并说明为何是全局组件。\n' +
      offenders.join('\n'),
    ).toEqual([]);
  });

  it('★ 本次事故的两个组件必须已被注册（定点防回归）', () => {
    const vue = readFileSync(join(UI_SRC, 'components/code/CodeEditorArea.vue'), 'utf8');
    expect(isRegistered(vue, 'AiDiffView', 'CodeEditorArea.vue'), '★ AiDiffView 未注册 → diff 对比不渲染，点不到「应用/回退」').toBe(true);
    expect(isRegistered(vue, 'CodeConflictEditor', 'CodeEditorArea.vue'), '★ CodeConflictEditor 未注册 → 合并冲突弹窗不渲染').toBe(true);
  });
});

describe('② 扫描器自证：不能因"扫不到东西"而假绿', () => {
  it('★ 能真的从 .vue 里抓到模板标签（防正则失效导致恒空）', () => {
    const vue = readFileSync(join(UI_SRC, 'components/code/CodeEditorArea.vue'), 'utf8');
    const tags = collectPascalTags(vue);
    expect(tags.length, '★ 扫描器抓不到任何大驼峰标签 —— 断言会恒真（假绿）').toBeGreaterThan(0);
    expect(tags, '★ 应能抓到本次事故的组件').toContain('AiDiffView');
  });

  it('★ isRegistered 对"未 import"必须返回 false（防判据恒真）', () => {
    const fake = `<template><FooBar /></template><script setup>import Other from './Other.vue'</script>`;
    expect(isRegistered(fake, 'FooBar', 'SomeOther.vue'), '★ 判据恒真 → 测试形同虚设').toBe(false);
    const real = `<template><FooBar /></template><script setup>import FooBar from './FooBar.vue'</script>`;
    expect(isRegistered(real, 'FooBar', 'Host.vue')).toBe(true);
    // ④ 递归自引用
    expect(isRegistered(fake, 'FooBar', 'FooBar.vue'), '★ 自引用（文件名==标签名）应视为已注册').toBe(true);
  });

  it('★ 扫描覆盖到足够多的文件（防 walk 失效只扫了 1 个）', () => {
    expect(FILES.length, '★ 扫到的 .vue 过少 → walk 逻辑失效').toBeGreaterThan(50);
  });
});
