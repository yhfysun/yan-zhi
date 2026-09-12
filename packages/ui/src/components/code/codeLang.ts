// 代码编辑器的语言分派：文件名 → CodeMirror 6 LanguageSupport。
// 语言包按需动态 import（首屏只加载 javascript/json/markdown 这类基础包，Java/Python/Go 等打开时才拉）。
import type { Extension } from '@codemirror/state';
import { StreamLanguage } from '@codemirror/language';

type Loader = () => Promise<Extension>;

/** 扩展名 → 语言 id */
const EXT_MAP: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx',
  json: 'json', jsonc: 'json', json5: 'json',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  html: 'html', htm: 'html', vue: 'vue', svelte: 'html',
  css: 'css', scss: 'css', sass: 'css', less: 'css',
  py: 'python', pyw: 'python', pyi: 'python',
  java: 'java', kt: 'java', kts: 'java', gradle: 'groovy',
  c: 'cpp', h: 'cpp', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cxx: 'cpp', cs: 'cpp',
  go: 'go',
  rs: 'rust',
  sql: 'sql',
  xml: 'xml', xsl: 'xml', xsd: 'xml', svg: 'xml', pom: 'xml',
  yaml: 'yaml', yml: 'yaml',
  properties: 'properties', ini: 'properties', cfg: 'properties', conf: 'properties',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  rb: 'ruby',
  lua: 'lua',
  r: 'r',
  toml: 'toml',
};

/** 完整文件名（无扩展名也能命中，如 Dockerfile / Makefile / pom.xml） */
const NAME_MAP: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  '.gitignore': 'shell',
  '.env': 'properties',
  '.editorconfig': 'properties',
};

const LOADERS: Record<string, Loader> = {
  javascript: async () => (await import('@codemirror/lang-javascript')).javascript(),
  jsx: async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true }),
  typescript: async () => (await import('@codemirror/lang-javascript')).javascript({ typescript: true }),
  tsx: async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true, typescript: true }),
  json: async () => (await import('@codemirror/lang-json')).json(),
  markdown: async () => (await import('@codemirror/lang-markdown')).markdown(),
  html: async () => (await import('@codemirror/lang-html')).html(),
  // Vue 单文件组件：<template>/<script>/<style> 三块，html 模式已能覆盖大部分高亮
  vue: async () => (await import('@codemirror/lang-html')).html(),
  css: async () => (await import('@codemirror/lang-css')).css(),
  python: async () => (await import('@codemirror/lang-python')).python(),
  java: async () => (await import('@codemirror/lang-java')).java(),
  cpp: async () => (await import('@codemirror/lang-cpp')).cpp(),
  go: async () => (await import('@codemirror/lang-go')).go(),
  rust: async () => (await import('@codemirror/lang-rust')).rust(),
  sql: async () => (await import('@codemirror/lang-sql')).sql(),
  yaml: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/yaml')).yaml),
  properties: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/properties')).properties),
  shell: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/shell')).shell),
  xml: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/xml')).xml),
  ruby: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/ruby')).ruby),
  lua: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/lua')).lua),
  r: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/r')).r),
  toml: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/toml')).toml),
  groovy: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/properties')).properties),
  dockerfile: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/shell')).shell),
  makefile: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/shell')).shell),
};

const cache = new Map<string, Extension>();

/** 文件名 → 语言 id（未知返回 ''，编辑器退化为纯文本） */
export function langIdOf(fileName: string): string {
  const lower = (fileName || '').toLowerCase();
  const base = lower.split(/[\\/]/).pop() || lower;
  if (NAME_MAP[base]) return NAME_MAP[base];
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return EXT_MAP[base.slice(dot + 1)] || '';
}

/** 语言显示名（状态栏用） */
const LANG_LABEL: Record<string, string> = {
  javascript: 'JavaScript', jsx: 'JavaScript JSX', typescript: 'TypeScript', tsx: 'TypeScript JSX',
  json: 'JSON', markdown: 'Markdown', html: 'HTML', vue: 'Vue', css: 'CSS',
  python: 'Python', java: 'Java', cpp: 'C/C++', go: 'Go', rust: 'Rust', sql: 'SQL',
  yaml: 'YAML', properties: 'Properties', shell: 'Shell', xml: 'XML', ruby: 'Ruby',
  lua: 'Lua', r: 'R', toml: 'TOML', groovy: 'Groovy', dockerfile: 'Dockerfile', makefile: 'Makefile',
};

export function langLabel(fileName: string): string {
  const id = langIdOf(fileName);
  return id ? LANG_LABEL[id] || id : '纯文本';
}

/**
 * 加载语言扩展（带缓存）。返回 null 表示无对应语言（纯文本）。
 * 并发调用同一语言只会真正 import 一次。
 */
export async function loadLanguage(fileName: string): Promise<Extension | null> {
  const id = langIdOf(fileName);
  if (!id) return null;
  const hit = cache.get(id);
  if (hit) return hit;
  const loader = LOADERS[id];
  if (!loader) return null;
  try {
    const ext = await loader();
    cache.set(id, ext);
    return ext;
  } catch {
    return null;
  }
}

/** 是否为可编辑的文本类文件（用于判断能否在编辑器中打开） */
export function isTextLike(fileName: string): boolean {
  return langIdOf(fileName) !== '' || /\.(txt|log|csv|env)$/i.test(fileName);
}
