/**
 * 安全闸/权限闸自检 —— 通用检查器（跨项目可复用）。
 *
 * ═══ 为什么需要它 ═══
 * 2026-09-29 实测事故：我给「运行时生成子智能体」写的工具白名单里加了
 * `if (ids.size === 0) for (...填入通用工具...)`，理由是"避免 DB 抖动导致链路不可用"。
 * 结果：基准集为空时闸门**静默取消** —— 子智能体凭空拿到 file_write / cmd_exec。
 *
 * 这类缺陷的共同特征，也是本工具的检查项：
 *   ① **fail-open**：判据集为空/异常时走"放宽"分支（而不是拒绝）
 *   ② **只报告不拦截**：把违规项记进 dropped/violations，但没从结果集里剔除
 *   ③ **运行时兜底代替构建期拦截**：靠 `if (depth >= 1) return` 拒绝，
 *      但工具仍暴露给模型（白烧 token + 诱导重试）
 *   ④ **闸门清单漏登记**：新增写类工具没进 WRITE_TOOLS / 黑名单
 *      ★ 本项目已犯三次：api_space_set_task_type、api_space_memory_append、
 *        api_memory_create/delete（2026-09-29 自检抓到）
 *
 * ★★ 判断"写类要不要登记"的关键判据（踩过才明白）：
 *   **"没挂载"≠"安全"**。未挂载的工具平时不出现在模型工具面上，但有两条路径仍能触达：
 *     ① `get_api_tools` 是按需发现入口 —— 模型能查到并**直接调用**；
 *     ② 运行时拦截只认 WRITE_TOOLS —— 没登记的写工具在只读会话里被兜底放行。
 *   → **权限边界必须是 WRITE_TOOLS 清单本身，不是"有没有挂载"。**
 *   还有：**别按名字判读写，按实现判** —— `api_kb_builtin_guide_reset` 与
 *   `api_ollama_delete` 名字不含 create/update/delete 形态，却分别是"重置指南"与"删模型文件"。
 *
 * 用法：
 *   node tools/audit-safety-gates.cjs                # 扫全仓
 *   node tools/audit-safety-gates.cjs <文件路径...>   # 只扫指定文件
 *
 * ★ 这是**启发式**检查（正则 + 结构扫描），不是证明。它的价值在于把
 *   "值得人看一眼的地方"列出来 —— 命中不等于有缺陷，但**必须逐条人工确认**。
 *   真正的证明靠"构造越权输入实跑"（见 tools/verify-spawn-subagent.cjs 的做法）。
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const SCAN_ROOTS = ['apps/server/src', 'packages/core/src', 'packages/ui/src'];
const EXT = new Set(['.ts', '.vue']);
/** 跳过的目录（测试/产物/依赖） */
const SKIP_DIR = new Set(['node_modules', 'dist', 'tmp', '.workbuddy', '__tests__']);

/** 判定"这是安全/权限相关代码"的信号词 */
const GATE_SIGNAL = /(?:allowed|permission|白名单|黑名单|whitelist|blacklist|exclude|SPEC_TOOL|WRITE_TOOLS|DELEGATION_TOOLS|parentSet|universe|gate|闸|裁剪|resolve\w*Tool)/i;

const findings = [];
const push = (sev, file, line, kind, detail) => findings.push({ sev, file, line, kind, detail });

function stripComments(src) {
  // 保守剥离：块注释 + 整行 //
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/^(\s*)\/\/.*$/gm, '$1');
}

/** 剥注释后按行取，但**保留原始行号**（替换为等长空白，不破坏行结构） */
function stripKeepLines(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^(\s*)\/\/.*$/gm, (m, p1) => p1);
}

function walk(dir, out) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) walk(p, out); continue; }
    if (EXT.has(path.extname(e.name))) out.push(p);
  }
}

// ── 检查① fail-open：「判据集为空 → 填入默认/放宽」 ──
// ★ 只匹配**真的在放宽**的形态，避免把 `catch { return true }`（表示"不安全/要跳过"）误报。
//   判定放宽要看**语义**：加进白名单/允许集 是放宽；返回 true 在 `isUnsafe*` / `isBlocked*`
//   这类谓词里反而是收紧。因此对 `return true` 做**函数名启发式**排除。
const FAIL_OPEN_PATTERNS = [
  { re: /if\s*\(\s*[\w.$]+\.(?:size|length)\s*===?\s*0\s*\)\s*\{?[^\n]{0,80}\b(?:add|push|set)\s*\(/i,
    kind: 'fail-open?', detail: '集合为空时**往白名单里填内容** —— 需确认这不是在取消闸门' },
  { re: /catch\s*(?:\([^)]*\))?\s*\{\s*[^\n]{0,40}(?:allowed\s*[:=]\s*true|\{\s*allowed:\s*true)/i,
    kind: 'fail-open(异常放行)', detail: 'catch 里设 allowed:true —— 异常时必须走拒绝分支' },
  { re: /catch\s*\{\s*\}\s*[^\n]{0,60}(?:ids|allowed|list|whitelist)\.(?:add|push)/i,
    kind: 'fail-open(异常补充)', detail: 'catch 后补白名单 —— 异常路径不应扩大权限面' },
];

/** 谓词命名信号：函数名像"是否不安全/是否禁止/是否拒绝"时，`return true` 是**收紧**不是放宽 */
const TIGHTENING_PREDICATE = /function\s+(?:is|has|should|must|need|can|check)(?:Unsafe|Blocked|Denied|Forbidden|Rejected|Danger|Invalid|Bad|Excluded)/i;

// ── 检查② 只报告不拦截 ──
const REPORT_ONLY = /\b(?:dropped|violations|rejected|denied|violations?)\b\s*\.\s*push\s*\(/;

// ── 检查③ 只靠运行时拒绝（depth/gate 判断而无构建期排除） ──
const RUNTIME_ONLY = /if\s*\(\s*depth\s*>=\s*1\s*\)\s*return/;

// ── 检查④ 闸门清单必须是显式枚举 ──
const SET_DEF = /(?:const|let)\s+(WRITE_TOOLS|DELEGATION_TOOLS|SPEC_TOOL_BLACKLIST|UNCONTROLLABLE_PREFIXES)\s*=\s*new\s+(?:Set|Array)\s*\(/;

function checkFile(file) {
  const raw = fs.readFileSync(file, 'utf-8');
  const isGateFile = GATE_SIGNAL.test(raw) || /permission|gate|tool-deps|subagent-spec/.test(file);
  if (!isGateFile) return;
  const src = stripKeepLines(raw);
  const lines = src.split('\n');

  lines.forEach((l, i) => {
    const n = i + 1;
    if (!l.trim()) return;
    // fail-open：先排除"收紧型谓词"里的 return true
    for (const { re, kind, detail } of FAIL_OPEN_PATTERNS) {
      if (!re.test(l)) continue;
      if (/allowed\s*[:=]\s*true/.test(l)) {
        // 往前找当前函数名，若像 isUnsafe* 这类谓词则是收紧
        let fnName = '';
        for (let k = i; k >= Math.max(0, i - 40); k--) {
          const m = lines[k].match(/function\s+(\w+)/);
          if (m) { fnName = m[1]; break; }
        }
        if (fnName && TIGHTENING_PREDICATE.test(`function ${fnName}`)) continue;
      }
      push('HIGH', file, n, kind, detail);
    }
    if (REPORT_ONLY.test(l)) {
      const ctx = (lines[i - 3] || '') + (lines[i - 2] || '') + (lines[i - 1] || '') + l;
      if (/for\s*\(|\.filter\(|\.map\(/.test(ctx)) {
        push('MED', file, n, '只报告未拦截?', '往 dropped/violations 里记了，但需确认**同一循环里**有 continue/skip 把它剔出结果集');
      }
    }
  });

  if (RUNTIME_ONLY.test(src)) {
    const hasBuildTimeExclude = /continue|blacklist|BLACKLIST|exclude/.test(src);
    if (!hasBuildTimeExclude) {
      push('MED', file, 0, '仅运行时拒绝', '用 depth/gate 拒绝执行，但未见构建期排除 —— 工具仍会暴露给模型');
    }
  }

  const m = src.match(SET_DEF);
  if (m) {
    const i = src.indexOf(m[0]);
    const seg = src.slice(i, i + 3000);
    const count = (seg.match(/'[^']+'/g) || []).length;
    if (count === 0) push('HIGH', file, src.slice(0, i).split('\n').length, '闸门清单为空?', `${m[1]} 附近没看到显式工具名`);
  }
}

// ── 跨文件核对：写类工具是否登记进 WRITE_TOOLS ──
function auditWriteToolRegistration() {
  const permPath = path.join(REPO, 'apps/server/src/tool-permission.ts');
  if (!fs.existsSync(permPath)) return null;
  const perm = stripComments(fs.readFileSync(permPath, 'utf-8'));
  const wIdx = perm.indexOf('const WRITE_TOOLS');
  const writeSeg = perm.slice(wIdx, wIdx + 12000);
  const registered = new Set([...writeSeg.matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]));

  // 收集所有 api_* 工具名（来自注册表定义）
  const apiFiles = [];
  walk(path.join(REPO, 'packages/core/src/tool/builtin/api-tools'), apiFiles);
  const allApi = new Set();
  for (const f of apiFiles) {
    const t = fs.readFileSync(f, 'utf-8');
    for (const mm of t.matchAll(/name:\s*'((?:api_|media_)[a-z0-9_]+)'/g)) allApi.add(mm[1]);
  }

  // ★ 判定不只看名字：从 executor 里找**真实写证据**（SQL 写 / 写盘 / 卸载）
  const execPath = path.join(REPO, 'apps/server/src/mcp/api-tool-executor.ts');
  const exec = fs.existsSync(execPath) ? fs.readFileSync(execPath, 'utf-8') : '';
  const WRITE_EVIDENCE = /INSERT INTO|UPDATE \s*\w+\s*SET|DELETE FROM|writeFile|appendFile|mkdirSync|rmSync|unlinkSync|uninstall|deleteOllamaModel|resetBuiltinAppGuide/i;
  const NAME_WRITEY = /_?(create|update|delete|install|toggle|set|add|append|import|remove|clear|move|rename|upload|publish)/;

  /** 已知的**有意放行**清单（注释里明确写了决策）——不报为问题 */
  const INTENTIONAL_OK = new Set([
    'api_image_generate', 'api_video_generate', 'api_tts_speak', 'api_srt_generate',
    'media_compose', 'media_edit', 'api_media_normalize', 'api_media_fetch',
    'media_install_ffmpeg', 'media_install_ytdlp',   // 媒体生产/安装：用户 2026-09-29 决策放行
  ]);

  const suspects = [];
  for (const n of allApi) {
    if (registered.has(n) || INTENTIONAL_OK.has(n)) continue;
    const i = exec.indexOf(`case '${n}':`);
    // ★★ 必须切到**下一个 case 边界**再判证据：直接切固定长度会跨进下一个 case，
    //    把邻居的 INSERT 当成自己的 —— 实测这样会把 api_ollama_list / api_space_list
    //    这类纯查询误报成"实现层已确证是写"（10 个候选里 9 个是这么来的）。
    let seg = '';
    if (i >= 0) {
      const rest = exec.slice(i + 10);
      const nextCase = rest.search(/\n {6}case '/);
      seg = nextCase >= 0 ? rest.slice(0, nextCase) : rest.slice(0, 1400);
    }
    const implWrite = !!seg && WRITE_EVIDENCE.test(seg);
    const nameWritey = NAME_WRITEY.test(n);
    if (implWrite || nameWritey) {
      suspects.push({ name: n, nameWritey, implWrite });
    }
  }
  // 实现层面确证是写的排前面（最该先看）
  suspects.sort((a, b) => (b.implWrite ? 1 : 0) - (a.implWrite ? 1 : 0));
  return { allApiCount: allApi.size, registeredCount: registered.size, suspects };
}

// ── 主流程 ──
const args = process.argv.slice(2);
let files = [];
if (args.length) {
  files = args.map((a) => path.resolve(a)).filter((p) => fs.existsSync(p) && fs.statSync(p).isFile());
} else {
  for (const r of SCAN_ROOTS) walk(path.join(REPO, r), files);
}

const out = [];
out.push('安全闸自检（启发式）');
out.push('='.repeat(64));
out.push(`扫描文件数：${files.length}`);
out.push('');
out.push('★ 命中 ≠ 有缺陷；本工具是"指出值得人看一眼的地方"，');
out.push('  真正的证明要靠构造越权/空基准输入**实跑**。');
out.push('');

for (const f of files) checkFile(f);

const HIGH = findings.filter((x) => x.sev === 'HIGH');
const MED = findings.filter((x) => x.sev === 'MED');

if (!findings.length) {
  out.push('✅ 未发现 fail-open / 只报告不拦截 的可疑写法。');
} else {
  out.push(`发现 ${findings.length} 处待人工确认（HIGH ${HIGH.length} / MED ${MED.length}）：`);
  out.push('');
  for (const sev of ['HIGH', 'MED']) {
    const list = findings.filter((x) => x.sev === sev);
    if (!list.length) continue;
    out.push(`── ${sev} ──`);
    for (const x of list) {
      const rel = path.relative(REPO, x.file).replace(/\\/g, '/');
      out.push(`  [${x.kind}] ${rel}:${x.line}`);
      out.push(`      ${x.detail}`);
    }
    out.push('');
  }
}

const reg = auditWriteToolRegistration();
if (reg) {
  out.push('── 写类工具登记核对（WRITE_TOOLS）──');
  out.push(`  API 工具 ${reg.allApiCount} 个；WRITE_TOOLS 已登记 ${reg.registeredCount} 个。`);
  out.push('');
  out.push('  ★★ 注意：「没挂载」不等于安全 —— get_api_tools 能按需发现并直接调用，');
  out.push('     而运行时拦截只认 WRITE_TOOLS。权限边界就是这份清单本身。');
  if (reg.suspects.length) {
    out.push('');
    out.push(`  ⚠️ ${reg.suspects.length} 个未登记且**形似/确证是写类**（按证据强度排序，需逐条确认）：`);
    for (const s of reg.suspects.slice(0, 40)) {
      const tag = s.implWrite ? '【实现层已确证是写】' : '【仅名字像写，需看实现】';
      out.push(`     - ${s.name}  ${tag}`);
    }
    if (reg.suspects.length > 40) out.push(`     … 其余 ${reg.suspects.length - 40} 个`);
    out.push('');
    out.push('  ★ 本项目已因漏登记犯过三次：api_space_set_task_type、');
    out.push('    api_space_memory_append、api_memory_create/delete。');
  } else {
    out.push('  ✅ 未发现明显漏登记。');
  }
}

console.log(out.join('\n'));
process.exit(HIGH.length ? 1 : 0);