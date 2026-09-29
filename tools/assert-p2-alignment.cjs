// 等价静态断言执行器 —— 镜像 apps/server/test/p2-alignment.test.ts（本机 vitest 不适用）。
//
// ★ 两个必避的坑：
//   1) `slice(anchor(...), LEN)` —— slice 第二参是 **end 下标**，会返回空串造成假红。一律用 win()。
//   2) 块注释里不能出现「星号紧跟斜杠」，会提前闭合注释吞掉后续代码。
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf-8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const HOOKS = strip(read('apps/server/src/services/tool-hooks.ts'));
const ARTIFACT_HOOKS = strip(read('apps/server/src/services/artifact-hooks.ts'));
const LTM = strip(read('apps/server/src/llm-task-manager.ts'));
const SPACE_MEM = strip(read('apps/server/src/services/space-memory.ts'));
const WORKSPACE = strip(read('apps/server/src/routes/workspace.ts'));
const DB = strip(read('apps/server/src/db.ts'));

let pass = 0, fail = 0;
const out = [];
function expect(cond, msg) { if (!cond) throw new Error(msg); }
function it(name, fn) {
  try { fn(); pass++; out.push(`  ✅ ${name}`); }
  catch (e) { fail++; out.push(`  ❌ ${name}\n       ${e.message}`); }
}
function group(t, fn) { out.push(`\n${t}`); fn(); }
const has = (c, n, m) => expect(c.includes(n), m);
const notHas = (c, n, m) => expect(!c.includes(n), m);
const matches = (c, re, m) => expect(re.test(c), m);
function at(code, needle, label) {
  const i = code.indexOf(needle);
  expect(i > -1, `★ 锚点失效（源码结构变了）：${label}`);
  return i;
}
function win(code, needle, len, label) {
  const i = at(code, needle, label || needle);
  return code.slice(i, i + len);
}

group('P2-3 工具前后置 Hooks', () => {
  it('提供 before/after 两个钩子点', () => {
    has(HOOKS, 'registerBeforeToolHook', '★ 缺 before 钩子注册');
    has(HOOKS, 'registerAfterToolHook', '★ 缺 after 钩子注册');
  });
  it('before 钩子能拦截（block 语义）', () => {
    const b = win(HOOKS, 'export async function runBeforeToolHooks', 900, 'runBeforeToolHooks');
    has(b, 'block', '★ 未支持 block 返回值');
  });
  it('fail-open：钩子抛错不影响工具结果', () => {
    const cnt = (HOOKS.match(/console\.warn\(`\[tool-hook\]/g) || []).length;
    expect(cnt >= 2, `★ 钩子未做逐个 catch（实际 ${cnt} 处）`);
  });
  it('副作用搬到钩子，主循环只跑钩子', () => {
    has(ARTIFACT_HOOKS, 'artifact:file_write', '★ 未注册 file_write 钩子');
    has(ARTIFACT_HOOKS, 'artifact:media', '★ 未注册媒体钩子');
    const b = win(LTM, 'await runAfterToolHooks(', 700, '主循环跑钩子');
    has(b, 'runAfterToolHooks', '★ 未在主循环调用钩子');
  });
  it('登记用 _meta.path 而非 args.path', () => {
    const b = win(ARTIFACT_HOOKS, 'artifact:file_write', 900, 'file_write 钩子');
    matches(b, /ctx\.meta|m\?\.path/, '★ 未用 ctx.meta 取路径');
    matches(b, /^(?![\s\S]*args\?\.path)[\s\S]*$/, '★ 用了模型传的 args.path（会 404）');
  });
});

group('P2-4 并行子智能体', () => {
  it('同批 call_agent 并发', () => {
    matches(LTM, /Promise\.all\(batchToRun\.map/, '★ 未用 Promise.all');
  });
  it('只并发 call_agent', () => {
    const i = at(LTM, 'const agentCalls = toolCallAcc.filter', 'call_agent 过滤');
    has(LTM.slice(i, i + 300), "n === 'call_agent'", '★ 未限定只挑 call_agent');
  });
  it('结果按原序取用', () => {
    matches(LTM, /const pre = concurrentResults\.get\(String\(tc\.id/, '★ 未按原序取用');
  });
  it('嵌套深度仍限 1 层', () => {
    matches(LTM, /depth >= 1/, '★ depth 限制被误删');
  });
  it('有并发上限', () => {
    has(LTM, 'MAX_CONCURRENT_AGENTS', '★ 无并发上限');
  });
});

group('P2-5 检查点与回滚', () => {
  it('file_change 有 step 列 + 写入时记 step', () => {
    has(DB, 'ALTER TABLE file_change ADD COLUMN step INTEGER', '★ 缺 step 列迁移');
    matches(LTM, /'pending', task\.step/, '★ 写入快照时未记 step');
  });
  it('提供按步回滚 + 检查点列表接口', () => {
    matches(WORKSPACE, /router\.post\('\/tasks\/:taskId\/rollback'/, '★ 缺按步回滚接口');
    matches(WORKSPACE, /router\.get\('\/tasks\/:taskId\/checkpoints'/, '★ 缺检查点列表接口');
  });
  it('取"区间内最早的 before_content"', () => {
    const b = win(WORKSPACE, "router.post('/tasks/:taskId/rollback'", 2200, 'rollback');
    matches(b, /ORDER BY step ASC/, '★ 未按 step 升序');
    matches(b, /if \(!earliest\.has\(r\.path\)\)/, '★ 未用 earliest 去重');
  });
  it("只回退 pending（不碰已确认的）", () => {
    matches(WORKSPACE, /status = 'pending' AND step IS NOT NULL AND step >= \?/, '★ 未限定 pending');
  });
  it('失败上报 + 新建文件删除', () => {
    matches(WORKSPACE, /failed: reverted\.filter/, '★ 失败项未上报');
    matches(WORKSPACE, /info\.before == null/, '★ 未处理新建文件');
  });
});

group('P2-2 记忆分层与优先级选取', () => {
  it('不再头部截断（改用按行选取）', () => {
    const b = win(SPACE_MEM, 'export function formatSpaceMemoryContext', 1400, 'formatSpaceMemoryContext');
    matches(b, /^(?![\s\S]*\.slice\(0,\s*INJECT_MAX_CHARS\))[\s\S]*$/, '★ 仍在头部截断');
    matches(b, /selectMemoryLines\(/, '★ 未走按行选取');
  });
  it('加载函数不提前截断', () => {
    const b = win(SPACE_MEM, 'export function loadSpaceMemoryForConversation', 1200, 'load');
    matches(b, /^(?![\s\S]*content\.slice\(0,\s*INJECT_MAX_CHARS\))[\s\S]*$/, '★ 加载时就截断了');
  });
  it('进展行/决策行单独识别', () => {
    const b = win(SPACE_MEM, 'function selectMemoryLines', 2200, 'selectMemoryLines');
    has(b, '任务【', '★ 未识别进展行');
    matches(b, /问：.*→.*答：/, '★ 未识别决策行');
  });
  it('三类都从新到旧取', () => {
    const b = win(SPACE_MEM, 'take(progress, true)', 220, '三类取用');
    const ms = b.match(/take\((\w+),\s*(true|false)\)/g) || [];
    expect(ms.length >= 3, '★ 未找到三类取用调用');
    const falsy = ms.filter((m) => m.includes('false'));
    expect(falsy.length === 0, `★ 有类别按原序取：${falsy.join(', ')}`);
  });
  it('超限报告丢弃条数', () => {
    has(SPACE_MEM, '另有 ${dropped} 条', '★ 未报告丢弃条数');
  });
});

console.log(out.join('\n'));
console.log(`\n===== P2 断言：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail > 0 ? 1 : 0);