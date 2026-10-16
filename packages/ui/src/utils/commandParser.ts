// 命令行解析与帮助文本（命令中枢 P0，2026-10-16）——**纯函数**，可脱离 pinia 单测。
//
// 语法（对齐方案 §5.1c）：`/cmd 位置参数… [-s 值] [--long] [--long=值]`；`;` 串联多条。
//
// ★★★ 为什么 `-p spec` 与 `--banner` 的取值规则要写死成"短选项吃下一个词、长选项不带值"：
//   CommandDef 里**没有**参数 schema（方案里的 `args?: JsonSchema` 尚未落地），
//   没有 schema 就无法判断 `--banner target` 到底是"带值的 banner"还是"布尔 banner + 位置参数"。
//   含糊的解析会让**同一条命令在不同人手里跑出不同结果**，而这种错不会报错、只会打错目标。
//   ⇒ 规则定死并写进帮助文本：短选项 `-p spec` 吃下一个词；长选项 `--banner` 是布尔，
//     要带值就写 `--url=https://x`（`=` 形式对长短选项都成立）。
//   将来若给 CommandDef 补上参数 schema，这条规则应当由 schema 覆盖 —— 那时只改这一个文件。

import type { CommandDef, PlaybookDef } from '@yan-zhi/core';
import { groupCommands, slashOf } from './commandBridge';

/** 一条解析出来的命令 */
export interface ParsedCommand {
  /** 原始片段（用于历史与错误提示里回显） */
  raw: string;
  /** 命令名（**不带** `/`） */
  name: string;
  /** 位置参数 */
  args: string[];
  /** 选项：布尔为 true；带值为字符串 */
  flags: Record<string, string | boolean>;
}

/**
 * 按 `;` 切分多条命令（尊重单/双引号：引号内的 `;` 是内容，不是分隔符）。
 * 空片段丢掉（`/a;; /b` 与结尾的 `;` 都是手滑，不该解析出一条空命令）。
 */
export function splitChain(line: string): string[] {
  const out: string[] = [];
  let buf = '';
  let quote = '';
  for (const ch of String(line || '')) {
    if (quote) {
      if (ch === quote) quote = '';
      buf += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (ch === ';') { out.push(buf); buf = ''; continue; }
    buf += ch;
  }
  out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** 去掉成对的引号（`"a b"` → `a b`）；不配对时原样返回（不猜用户想干嘛） */
function unquote(token: string): string {
  const s = String(token);
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) {
    return s.slice(1, -1);
  }
  return s;
}

/** 极简分词：空白切分 + 引号成组（不处理转义 —— 命令参数里出现转义是少见情形，猜错代价更大） */
function tokenize(text: string): string[] {
  const out: string[] = [];
  let buf = '';
  let quote = '';
  let has = false;
  for (const ch of String(text || '')) {
    if (quote) {
      if (ch === quote) { quote = ''; continue; }
      buf += ch; has = true;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; has = true; continue; }
    if (/\s/.test(ch)) {
      if (has || buf) { out.push(buf); buf = ''; has = false; }
      continue;
    }
    buf += ch; has = true;
  }
  if (has || buf) out.push(buf);
  return out;
}

/**
 * 解析**一条**命令（不含 `;`）。非命令（不以 `/` 开头）或空 → null。
 * ★ 调用方拿到 null 就该把这段当普通文本处理，而不是报"命令不存在"——
 *   用户可能就是想发一句以 `/` 开头的话（少见，但为此报错会打断他）。
 */
export function parseCommandLine(fragment: string): ParsedCommand | null {
  const raw = String(fragment || '').trim();
  if (!raw.startsWith('/')) return null;
  const tokens = tokenize(raw.slice(1));
  const name = unquote(tokens.shift() || '');
  if (!name) return null;

  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith('--') || (t.startsWith('-') && t.length > 1)) {
      const body = t.replace(/^-+/, '');
      const eq = body.indexOf('=');
      if (eq >= 0) {
        // `--url=https://x` / `-p=80`：显式取值，长短选项都成立
        flags[body.slice(0, eq)] = unquote(body.slice(eq + 1));
        continue;
      }
      // 短选项吃下一个词（`-p 80`）；长选项是布尔（`--banner`）
      if (t.startsWith('-') && !t.startsWith('--') && i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
        flags[body] = unquote(tokens[++i]);
        continue;
      }
      flags[body] = true;
      continue;
    }
    args.push(unquote(t));
  }
  return { raw, name, args, flags };
}

/** 解析整行（可能含 `;` 串联）→ 依次的 ParsedCommand（非命令片段被丢掉） */
export function parseCommandChain(line: string): ParsedCommand[] {
  return splitChain(line).map(parseCommandLine).filter((c): c is ParsedCommand => !!c);
}

/** 从候选里按名称/别名找命令（大小写不敏感） */
export function findCommand(list: CommandDef[], name: string): CommandDef | null {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  return list.find((c) => c.name.toLowerCase() === n
    || (c.aliases || []).some((a) => String(a).toLowerCase() === n)) || null;
}

/** `/help <cmd>`：单条命令的用法、说明、分组、风险级 */
export function formatCommandHelp(c: CommandDef): string {
  const lines = [
    `${slashOf(c)}  —  ${c.desc || '(无说明)'}`,
    `用法：${c.usage || slashOf(c)}`,
  ];
  if (c.aliases?.length) lines.push(`别名：${c.aliases.map((a) => `/${a}`).join('、')}`);
  if (c.group) lines.push(`分组：${c.group}`);
  if (c.danger) lines.push(`风险：${c.danger}`);
  if (c.kind === 'page') {
    const scope = c.matchUrl ? `URL 正则 ${c.matchUrl}` : (c.matchHost || '*');
    lines.push(`站点：${scope}（${c.pageKind === 'script' ? '脚本型，执行前确认' : '任务型'}）`);
    lines.push('提示：这条指令出现在**当前页**的面板里，直接在浏览器面板点击即可运行。');
  }
  return lines.join('\n');
}

/**
 * `/help`：把全部命令按分组列出来（**由 CommandDef 自动生成** —— 命令一多，
 * 手写的帮助文本必然与实现漂移，而"帮助里没有这条命令"会让用户以为它不存在）。
 */
export function formatHelp(all: CommandDef[]): string {
  if (!all.length) return '当前没有可用命令。';
  const blocks = groupCommands(all).map((g) => {
    const rows = g.commands.map((c) => `  ${slashOf(c).padEnd(18)} ${c.desc || ''}`.trimEnd());
    return `【${g.group}】\n${rows.join('\n')}`;
  });
  return ['可用命令（输入 / 唤起面板，Tab 补全，↑↓ 翻历史）：', ...blocks].join('\n\n');
}

/** 历史：把一条输入压入（去重、最新在前、容量封顶）。纯函数，调用方负责持久化。 */
export function pushHistory(list: string[], entry: string, max = 50): string[] {
  const e = String(entry || '').trim();
  if (!e) return list;
  return [e, ...list.filter((x) => x !== e)].slice(0, max);
}

/**
 * 回车提交这一行时的**动作计划**（命令中枢）。
 *
 * ★★★ 为什么把判断抽成纯函数：这里有一条**绝不能错**的规则 ——
 *   "以 / 开头的命令**永远不许**被当成聊天内容发给模型"。
 *   而它是靠"在 send() 之前插一个分支"实现的，写进组件里就只能靠源码断言，
 *   断言不出"分支顺序反了""带空格的行漏了"。抽出来就能真跑。
 *
 * @returns 依次要做的动作。**不是命令时返回 `[{kind:'chat'}]`**（调用方据此走普通发送）。
 */
export type CommandInputPlan =
  /** 普通文本 → 走聊天发送 */
  | { kind: 'chat' }
  /** 执行这条命令 */
  | { kind: 'run'; def: CommandDef; parsed: ParsedCommand }
  /** 需要交互选择（开子菜单），不能放进 `;` 串联 */
  | { kind: 'interactive'; def: CommandDef }
  /** 名字不认识 */
  | { kind: 'unknown'; name: string };

/** 需要交互的命令（点了要再选一次，串联里做不了） */
const INTERACTIVE_RUN_IDS = new Set(['agent', 'model']);

export function planCommandInput(line: string, commands: CommandDef[]): CommandInputPlan[] {
  const text = String(line || '').trim();
  if (!text.startsWith('/')) return [{ kind: 'chat' }];
  const chain = parseCommandChain(text);
  // 以 / 开头但解析不出命令（例如单一个 "/"）：仍按聊天处理 —— 用户可能就是想发这句话
  if (!chain.length) return [{ kind: 'chat' }];

  return chain.map((parsed) => {
    const def = findCommand(commands, parsed.name);
    if (!def) return { kind: 'unknown', name: parsed.name };
    if (def.run && INTERACTIVE_RUN_IDS.has(def.run)) return { kind: 'interactive', def };
    return { kind: 'run', def, parsed };
  });
}

/**
 * `${k}` 占位符替换。
 * ★ vars 里没有（或为空）的键**原样留着** —— 让用户看见"这里需要你填"，
 *   而不是静默替换成空串去扫一个空目标（那是最坏的失败方式：不报错，结果没意义）。
 */
export function applyVars(text: string, vars: Record<string, string> = {}): string {
  return String(text || '').replace(/\$\{(\w+)\}/g, (m, k) => {
    const v = vars[k];
    return v !== undefined && v !== '' ? String(v) : m;
  });
}

/** 按召唤名（或 id）找剧本；大小写不敏感 */
export function findPlaybook(list: PlaybookDef[], name: string): PlaybookDef | null {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  return list.find((p) => p.name.toLowerCase() === n || p.id.toLowerCase() === n) || null;
}

/** 剧本 → 命令行数组（占位符按 vars 替换；**不**校验命令存不存在 —— 那是 planCommandInput 的事） */
export function expandPlaybook(pb: PlaybookDef, vars: Record<string, string> = {}): string[] {
  return (pb.steps || []).map((s) => applyVars(s, vars).trim()).filter(Boolean);
}

/**
 * 整行是不是一次**剧本召唤**（`@信息收集`）。
 * ★ 只在"整行就是一个 `@名字`"时命中：聊天框里 `@` 还兼着**文件引用**（`看看 @report.md 讲了什么`），
 *   那种 `@` 在句子中间，不能当成召唤。两者靠"是不是独立一行"区分，语义不重叠。
 * @returns 命中的剧本 + 展开后的命令行（未命中返回 null）
 */
export function planPlaybookSummon(
  line: string,
  playbooks: PlaybookDef[],
  vars: Record<string, string> = {},
): { playbook: PlaybookDef; steps: string[] } | null {
  const t = String(line || '').trim();
  if (!t.startsWith('@') || t.includes('\n')) return null;
  // 只允许 `@名字` 后面跟可选空白（`@信息收集 10.0.0.1` 也认：第一个词当剧场名，其余当 target）
  const m = t.match(/^@([^\s]+)\s*(.*)$/);
  if (!m) return null;
  const pb = findPlaybook(playbooks, m[1]);
  if (!pb) return null;
  const rest = m[2].trim();
  return { playbook: pb, steps: expandPlaybook(pb, rest ? { ...vars, target: rest } : vars) };
}

/**
 * 位置参数 + 选项 → **工具入参对象**（kind='tool' 的命令用）。
 *
 * ★ `params` 是 CommandDef 里的**有序字段名**，位置参数按顺序塞进去：
 *   `params:['target','ports']` + `/portscan 10.0.0.1 80,443` → `{target, ports}`。
 * ★ 长选项直接当字段名（`--banner` → `{banner:true}`；`--ports=80,443` → `{ports:'80,443'}`）。
 * ★ 纯数字/true/false 的**选项值**转成数字/布尔：命令行里拿到的都是字符串，而工具的 schema
 *   写的是 number/boolean（不转的话 `concurrency:'50'` 会被 schema 校验挡下，报一个看不懂的错）。
 *   位置参数**不转**（`ports:'80'` 该是字符串，转了反而错）—— 这条区别很关键。
 * ★ 必填校验**不在这里做**：工具自己的 schema 判得更准，两处判必然漂移。
 */
export function buildToolArgs(def: CommandDef, parsed: ParsedCommand): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  (def.params || []).forEach((field, i) => {
    const v = parsed.args[i];
    if (v !== undefined) args[field] = v;
  });
  for (const [k, v] of Object.entries(parsed.flags)) {
    if (typeof v === 'string') {
      if (/^-?\d+$/.test(v)) { args[k] = Number(v); continue; }
      if (v === 'true' || v === 'false') { args[k] = v === 'true'; continue; }
    }
    args[k] = v;
  }
  return args;
}
