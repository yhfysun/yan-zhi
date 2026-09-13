/**
 * 皮肤全面接管：把各组件里写死的深色底/浅色底替换为皮肤分级 token。
 * ------------------------------------------------------------------
 * 背景：皮肤系统只接管了外壳（壁纸/玻璃面板/主色），但代码模式、浏览器面板、
 * 代码块、侧栏等组件仍写死 #1b1d23 / #0d1117 / #1e293b 等蓝灰色，
 * 导致「换了皮肤界面还是同一个蓝灰味道」。
 *
 * 策略：不新造变量，直接消费 settings.ts 已下发的分级 token：
 *   --skin-surface          面板/侧栏/顶栏（最浅一层，让壁纸透出）
 *   --skin-surface-raised   卡片/弹窗/下拉（抬高一层）
 *   --skin-surface-sunken   输入框/代码区/终端（凹陷一层，不透明度最高）
 *   --skin-text / -secondary / -tertiary
 *   --skin-on-primary       主色上的文字
 * 每个替换都保留原值作为兜底：var(--skin-xxx, 原值)，
 * 这样未启用皮肤（data-skin 为空变量）时行为与改动前完全一致。
 *
 * 用法：node scripts/patch-skin-hardcoded.mjs [--dry]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');
const DRY = process.argv.includes('--dry');

/**
 * 替换规则：按「文件 + 精确上下文」改写，避免误伤。
 * - 深色实底（背景）→ --skin-surface-sunken（代码/终端/视口这类凹陷区）
 * - 深色面板底     → --skin-surface
 * - 文本兜底色     → 皮肤文字色
 * 注意：只动 background / border / color 的实色，不动渐变、不动 rgba 半透明叠加。
 */
const RULES = [
  // ===== ChatConsolePanel：终端面板 =====
  {
    file: 'components/chat/ChatConsolePanel.vue',
    note: '终端面板深底 → sunken',
    edits: [
      [/(#0d1117|#0b0e14|#0a0e14)(?=[^)]*\)?\s*;)/g, null], // 占位，由下方精确规则处理
    ],
  },
];

// —— 精确逐条替换（file, from, to, note）——
const EDITS = [
  // ========== 代码模式 / 文件预览：代码块深底 ==========
  {
    file: 'views/chat.css',
    from: '.msg-content pre { background: #0d1117;',
    to: '.msg-content pre { background: var(--skin-surface-sunken, #0d1117);',
    note: '对话内代码块深底',
  },

  // ========== 浏览器面板 ==========
  {
    file: 'components/BrowserPanel.vue',
    from: '[data-theme="dark"] .tab-item.active { background: #1b1d23; }',
    to: '[data-theme="dark"] .tab-item.active { background: var(--skin-surface-raised, #1b1d23); }',
    note: '浏览器激活标签',
  },
  {
    file: 'components/BrowserPanel.vue',
    from: '[data-theme="dark"] .bookmarks-bar { background: #23252b; }',
    to: '[data-theme="dark"] .bookmarks-bar { background: var(--skin-surface-raised, #23252b); }',
    note: '书签栏',
  },
  {
    file: 'components/BrowserPanel.vue',
    from: '[data-theme="dark"] .home-page { background: #1b1d23; }',
    to: '[data-theme="dark"] .home-page { background: var(--skin-surface, #1b1d23); }',
    note: '浏览器主页',
  },
  {
    file: 'components/BrowserPanel.vue',
    from: '[data-theme="dark"] .browser-viewport { background: #1b1d23; }',
    to: '[data-theme="dark"] .browser-viewport { background: var(--skin-surface-sunken, #1b1d23); }',
    note: '浏览器视口',
  },
  {
    file: 'components/BrowserPanel.vue',
    from: '[data-theme="dark"] .page-frame { background: #1b1d23; }',
    to: '[data-theme="dark"] .page-frame { background: var(--skin-surface-sunken, #1b1d23); }',
    note: '页面框架',
  },
  {
    file: 'components/BrowserPanel.vue',
    from: '[data-theme="dark"] .page-webview { background: #1b1d23; }',
    to: '[data-theme="dark"] .page-webview { background: var(--skin-surface-sunken, #1b1d23); }',
    note: 'webview 底',
  },
  {
    file: 'components/BrowserPanel.vue',
    from: '[data-theme="dark"] .native-browser-placeholder { background: #1b1d23; }',
    to: '[data-theme="dark"] .native-browser-placeholder { background: var(--skin-surface-sunken, #1b1d23); }',
    note: '原生浏览器占位',
  },

  // ========== 文字兜底色（#1e293b）==========
  ...['components/chat/ChatContextSidebar.vue', 'components/chat/ChatFileTab.vue',
      'components/chat/ChatWelcome.vue', 'components/chat/ChatMessageList.vue',
      'components/chat/ScheduledTaskDialog.vue', 'components/SettingsDrawer.vue',
      'components/PlatformConfigCard.vue', 'components/SideNav.vue',
    ].map((f) => ({
    file: f,
    from: 'var(--el-text-color-primary, #1e293b)',
    to: 'var(--skin-text, var(--el-text-color-primary, #1e293b))',
    note: '正文色接入皮肤',
    all: true,
  })),
  // 内联 style 里无空格变体（ChatMessageList 的 <h2>）
  {
    file: 'components/chat/ChatMessageList.vue',
    from: 'var(--el-text-color-primary,#1e293b)',
    to: 'var(--skin-text,var(--el-text-color-primary,#1e293b))',
    note: '正文色接入皮肤（内联无空格）',
    all: true,
  },
];

let changed = 0;
let skipped = 0;
const report = [];

for (const e of EDITS) {
  const p = join(ROOT, 'packages', 'ui', 'src', e.file);
  if (!existsSync(p)) { report.push(`MISS ${e.file}`); skipped++; continue; }
  let s = readFileSync(p, 'utf8');
  const before = s;
  if (e.all) {
    s = s.split(e.from).join(e.to);
  } else {
    if (!s.includes(e.from)) { report.push(`SKIP(未命中) ${e.file} :: ${e.from.slice(0, 48)}`); skipped++; continue; }
    s = s.replace(e.from, e.to);
  }
  if (s !== before) {
    if (!DRY) writeFileSync(p, s, 'utf8');
    changed++;
    report.push(`OK   ${e.file}  [${e.note}]`);
  } else {
    report.push(`SKIP(无变化) ${e.file}`);
    skipped++;
  }
}

console.log(report.join('\n'));
console.log(`\n${DRY ? '[DRY RUN] ' : ''}changed=${changed} skipped=${skipped}`);
