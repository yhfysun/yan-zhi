// 等价静态断言执行器 —— 镜像 apps/server/test/custom-tool-deps.test.ts 的断言。
//
// 为什么需要：本机 pnpm 的 vitest / typescript / sql.js 包目录为空（项目已知环境问题），
// `vitest run` 与真实 DB 核验都跑不起来。此脚本让"改完立刻能验"仍然可行。
//
// ★★ 两个必避的坑（本项目各踩过一次，代价是 10 条假红）：
//   1) `code.slice(anchor(code, needle), LEN)` —— slice 第二参是 **end 下标**，
//      锚点在 10 万字符处时返回**空串** → 断言全红且"像是真功能缺陷"。一律用 win()。
//   2) 源码/本文件的**块注释里不能出现「星号紧跟斜杠」**（如 glob 写法 `rules/*.md`）：
//      会提前闭合注释，把后面整段吞掉 → 症状是"代码明明写了却不生效"。
//
// 用法：node tools/assert-custom-tool-deps.cjs   （在仓库根执行）
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf-8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const DEPS = strip(read('apps/server/src/services/tool-deps.ts'));
const EXECUTOR = strip(read('apps/server/src/mcp/api-tool-executor.ts'));
const LTM = strip(read('apps/server/src/llm-task-manager.ts'));
const SANDBOX = strip(read('packages/core/src/tool/sandbox.ts'));
const PY_RUNTIME = strip(read('packages/core/src/tool/builtin/python-runtime.ts'));
const TOOL_API = strip(read('packages/core/src/tool/builtin/api-tools/tool.ts'));
const CHAT = strip(read('packages/ui/src/stores/chat.ts'));
const CONV = strip(read('apps/server/src/routes/conversations.ts'));
const IDX = strip(read('apps/server/src/index.ts'));
const SHARED = strip(read('packages/shared/src/types/index.ts'));
const REGISTRY = strip(read('packages/core/src/tool/registry.ts'));
const NODES = strip(read('packages/core/src/workflow/nodes.ts'));

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

group('① runtime 与 dependencies 必须可由模型指定', () => {
  it('create 不硬编码 node + 读 runtime/dependencies', () => {
    const b = win(EXECUTOR, "case 'api_custom_tool_create'", 2600, 'create');
    notHas(b, "VALUES (?, ?, ?, ?, ?, ?, 'node',", '★ runtime 仍硬编码（造不出 python 工具）');
    has(b, "str(args, 'runtime')", '★ 未读 runtime');
    has(b, "'python'", '★ 未识别 python');
    has(b, 'args.dependencies', '★ 未读 dependencies');
    has(b, 'JSON.stringify(deps)', '★ deps 未落库');
  });
  it('update 支持 runtime / dependencies', () => {
    const b = win(EXECUTOR, "case 'api_custom_tool_update'", 1600, 'update');
    has(b, "sets.push('runtime = ?')", '★ update 不支持 runtime');
    has(b, "sets.push('dependencies_json = ?')", '★ update 不支持 deps');
  });
  it('schema 声明 runtime(enum node|python) / dependencies', () => {
    const b = win(TOOL_API, "name: 'api_custom_tool_create'", 2400, 'create schema');
    has(b, 'runtime:', '★ 未声明 runtime');
    matches(b, /enum:\s*\['node',\s*'python'\]/, '★ runtime 未限定');
    has(b, 'dependencies:', '★ 未声明 dependencies');
    has(b, 'python', '★ 描述未点明 python');
  });
  it('创建后回显挂载指引', () => {
    const b = win(EXECUTOR, "case 'api_custom_tool_create'", 2600, 'create');
    matches(b, /customToolIds|api_agent_mount/, '★ 未回显挂载指引');
  });
});

group('② 两条执行入口走同一实现', () => {
  it('runCustomTool 已定义', () => at(DEPS, 'export async function runCustomTool', 'runCustomTool'));
  it('主循环 custom_ 分支走统一入口', () => {
    const b = win(LTM, 'if (isCustom) {', 1200, 'custom 分支');
    matches(b, /runCustomToolCode|runCustomTool\(/, '★ 未走统一入口');
  });
  it('api_custom_tool_execute 走统一入口且不再直连 runUserCode', () => {
    const b = win(EXECUTOR, "case 'api_custom_tool_execute'", 900, 'execute');
    has(b, 'runCustomTool', '★ 未走统一入口');
    notHas(b, 'runUserCode(', '★ 仍直连 runUserCode（绕过依赖安装）');
  });
  it('执行前检查/安装依赖 + 失败给指引', () => {
    const b = win(DEPS, 'export async function runCustomTool', 2600, 'runCustomTool');
    has(b, 'depsReady(', '★ 未检查依赖');
    has(b, 'installToolDependencies(', '★ 未安装依赖');
    matches(b, /处理建议|python_exec/, '★ 安装失败无指引');
  });
  it('按 runtime 分流注入', () => {
    const b = win(DEPS, 'export async function runCustomTool', 2600, 'runCustomTool');
    has(b, 'pythonPath', '★ python 未注站点包');
    has(b, 'modules:', '★ node 未注模块');
  });
});

group('③ 包名白名单防注入', () => {
  it('拒绝 flag / 本地路径 / 冒号', () => {
    const b = win(DEPS, 'export function isSafePackageName', 900, 'isSafePackageName');
    has(b, "startsWith('-')", '★ 未拒 flag');
    has(b, "startsWith('.')", '★ 未拒本地路径');
    matches(b, /\\:/, '★ 未拒冒号（git+/file: 注入）');
  });
  it('partition 返回 rejected 且去重', () => {
    const b = win(DEPS, 'export function partitionDependencies', 800, 'partition');
    has(b, 'rejected', '★ 无 rejected');
    has(b, 'seen.has', '★ 未去重');
  });
  it('命令用 execFile 数组传参', () => {
    const b = win(DEPS, 'function run(', 900, 'run');
    has(b, 'execFile(', '★ 未用 execFile');
  });
  it('Windows 显式挑 .cmd + 过滤存在性', () => {
    const b = win(DEPS, 'async function which', 800, 'which');
    matches(b, /\.\(cmd\|exe\|bat\)/, '★ 未优先挑 .cmd（会拿到不可执行的 sh 脚本）');
    has(b, 'existsSync', '★ 未过滤存在性');
  });
  it('不用 shell:true（Node 会 EINVAL）+ 显式 cmd.exe /c', () => {
    notHas(DEPS, 'shell: true', '★ 仍用 shell:true（Node 18.20.2+ 抛 spawn EINVAL）');
    matches(DEPS, /ComSpec|cmd\.exe/, '★ 未显式走 cmd.exe');
  });
});

group('④ 隔离目录落数据目录', () => {
  it('toolRuntimeDir 不用 workspaceDir，走 DATA_DIR', () => {
    const b = win(DEPS, 'export function toolRuntimeDir', 700, 'toolRuntimeDir');
    notHas(b, 'workspaceDir', '★ 用了 workspaceDir（污染用户项目目录）');
    has(b, 'DATA_DIR', '★ 未走 DATA_DIR');
    has(b, 'tool-runtime', '★ 目录名不对');
  });
  it('npm --prefix / pip --target', () => {
    has(DEPS, "'--prefix'", '★ npm 未指定 --prefix');
    has(DEPS, "'--target'", '★ pip 未指定 --target');
  });
  it('安装有超时', () => {
    matches(DEPS, /INSTALL_TIMEOUT_MS|timeout:/, '★ 无安装超时');
  });
});

group('⑤ 沙箱注入后不得变宽松', () => {
  it('require 是白名单查找，不回退真实 require', () => {
    const b = win(SANDBOX, 'const sandboxCode', 2600, '沙箱模板');
    has(b, 'hasOwnProperty.call(__yz_modules__', '★ 未做白名单判断');
    matches(b, /未注入|dependencies/, '★ 拒绝时无提示');
    notHas(b, 'globalThis.require', '★ 白名单外可拿到模块（沙箱失效）');
  });
  it('process/globalThis/timer 仍屏蔽', () => {
    const b = win(SANDBOX, 'const sandboxCode', 2600, '沙箱模板');
    has(b, 'const process = undefined', '★ process 未屏蔽');
    has(b, 'const globalThis = undefined', '★ globalThis 未屏蔽');
    has(b, 'const setTimeout = undefined', '★ 定时器未屏蔽');
  });
  it('标准内建仍可用', () => {
    const b = win(SANDBOX, 'const sandboxCode', 2600, '沙箱模板');
    for (const m of ['JSON', 'Math', 'Date', 'RegExp', 'Map']) {
      matches(b, new RegExp(`globalThis\\.${m}`), `★ ${m} 未暴露`);
    }
  });
  it('函数体走 runInContext（超时才罩得住）', () => {
    const b = win(SANDBOX, 'export async function runInSandbox', 4200, 'runInSandbox');
    matches(b, /runInContext\('__yz_fn__\(__yz_args__\)'/, '★ 未走 runInContext（while(true) 会挂死）');
  });
});

group('⑥ python 侧依赖注入', () => {
  it('接受 pythonPath 并写 PYTHONPATH', () => {
    const b = win(PY_RUNTIME, 'export async function runPythonCode', 1800, 'runPythonCode');
    has(b, 'pythonPath', '★ 未接受 pythonPath');
    has(b, 'PYTHONPATH', '★ 未写 PYTHONPATH');
  });
  it('PYTHONPATH 追加而非覆盖', () => {
    const b = win(PY_RUNTIME, 'export async function runPythonCode', 1800, 'runPythonCode');
    matches(b, /env\.PYTHONPATH\s*=\s*env\.PYTHONPATH\s*\?/, '★ 覆盖了既有 PYTHONPATH');
  });
  it('分隔符按平台（win 用分号 / posix 用冒号）', () => {
    const b = win(PY_RUNTIME, 'export async function runPythonCode', 1800, 'runPythonCode');
    matches(b, /win32'\s*\?\s*';'\s*:\s*':'/, '★ 分隔符写死（Windows 上会解析错）');
  });
});

group('⑦ core / server 职责边界', () => {
  it('deps 以注入方式传入 core（core 不自己跑 npm/pip）', () => {
    const b = win(SANDBOX, 'export interface RunUserCodeOptions', 1500, 'RunUserCodeOptions');
    matches(b, /deps\?/, '★ 未定义 deps 注入结构');
    notHas(SANDBOX, 'child_process', '★ core 出现 child_process（浏览器端打包会炸）');
  });
  it('execute 在支持清单里', () => at(EXECUTOR, "'api_custom_tool_execute'", 'execute 支持清单'));
});


group('⑧ 所有自定义工具执行入口都必须带依赖安装（防入口漂移）', () => {
  it('全仓不得再有直连 runUserCode 执行 custom_tool 的入口', () => {
    const files = [
      'apps/server/src/mcp/inbound-server.ts',
      'apps/server/src/routes/tools.ts',
      'apps/server/src/workflow-runner.ts',
      'apps/server/src/mcp/api-tool-executor.ts',
      'apps/server/src/llm-task-manager.ts',
    ];
    for (const f of files) {
      const code = strip(read(f));
      const direct = /runUserCode\(\s*(c|row|t|tool)\.(code|entry)/.test(code);
      expect(!direct, '★ ' + f + ' 仍直连 runUserCode → 该入口漏依赖安装');
    }
  });
  it('core 侧入口走 runCustomToolRow', () => {
    has(REGISTRY, 'runCustomToolRow', '★ registry 未走统一入口');
    has(NODES, 'runCustomToolRow', '★ workflow nodes 未走统一入口');
  });
  it('core 提供依赖准备器钩子', () => {
    has(SANDBOX, 'CustomToolDepPreparer', '★ 未定义准备器接口');
    has(SANDBOX, 'setCustomToolDepPreparer', '★ 未提供注入函数');
    has(SANDBOX, 'customToolDepPreparer.prepare', '★ 钩子未被调用');
  });
  it('server 启动注入准备器', () => {
    has(IDX, 'setCustomToolDepPreparer(', '★ server 未注入准备器');
    has(IDX, 'installToolDependencies', '★ 注入未接依赖安装');
  });
});

group('⑨ 会话级 customToolIds 全链路闭合', () => {
  it('会话 PATCH 支持 customToolIds', () => {
    matches(CONV, /req\.body\.customToolIds/, '★ 会话 PATCH 不接收 customToolIds（前端算的存不进去）');
    has(CONV, 'custom_tool_ids_json', '★ 未落库');
  });
  it('前端读取并合入会话级 customToolIds', () => {
    has(CHAT, 'custom_tool_ids_json', '★ rowToConv 未读');
    const body = win(CHAT, 'function getMergedMounts', 2600, 'getMergedMounts');
    matches(body, /conv\?\.customToolIds/, '★ 合并时未并入会话级');
  });
  it('共享类型声明会话级 customToolIds', () => {
    matches(SHARED, /customToolIds\?:\s*string\[\]/, '★ Conversation 类型缺 customToolIds');
  });
});
console.log(out.join('\n'));
console.log(`\n===== custom-tool-deps 断言：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail > 0 ? 1 : 0);