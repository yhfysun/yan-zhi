/**
 * P1-4「自定义工具依赖按需安装 + 沙箱注入」的守门测试。
 *
 * 背景（2026-09-29 用户诉求原话）：
 *   「大模型做任务发现没有对应的工具，会不会自己用 Python 或者 node 搞个自定义工具然后挂载上去调用？」
 *
 * 源码实况（已核查）：
 *   · `custom_tool.runtime` 列存在、`runUserCode` 也支持 python，但
 *     **`api_custom_tool_create` 把 runtime 硬编码成 'node'** → 模型造不出 python 工具；
 *   · `custom_tool.dependencies_json` 建了字段、写了 INSERT，**执行前从不读取**
 *     （`python-runtime.ts` 注释还写着「运行期不再 pip」）→ 声明了依赖的工具必跑失败；
 *   · 两条执行入口（ReAct 的 custom_ 分支、api_custom_tool_execute）**各写一遍**，两处都漏了安装。
 *
 * 本测试钉四件事：
 *   ① runtime 与 dependencies 在 create/update 上都必须可指定、且真的落库；
 *   ② 两条执行入口必须走**同一个**统一实现（否则又会各自漂移、漏掉依赖安装）；
 *   ③ 包名白名单必须拒绝注入面（flag / URL / 本地路径 / 命令拼接）；
 *   ④ 依赖隔离目录必须落在**数据目录**，不得落到用户工作目录（我第一版踩过）。
 *
 * ★ 本机 pnpm 的 vitest / typescript / sql.js 包目录为空（已知环境问题，见 skill），
 *   故断言做成**读源码剥注释的静态断言**；纯函数行为的真实执行见
 *   `tools/assert-custom-tool-deps.cjs`（真装 npm 包并调用、沙箱安全边界）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
/** ★ 剥注释 —— 不剥的话注释里提到函数名会让 `.not.toMatch` 断言假红（本项目踩过两次） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const DEPS = strip(read('apps/server/src/services/tool-deps.ts'));
const EXEC_CMD = strip(read('apps/server/src/services/exec-cmd.ts'));
const EXECUTOR = strip(read('apps/server/src/mcp/api-tool-executor.ts'));
const LTM = strip(read('apps/server/src/llm-task-manager.ts'));
const SANDBOX = strip(read('packages/core/src/tool/sandbox.ts'));
const PY_RUNTIME = strip(read('packages/core/src/tool/builtin/python-runtime.ts'));
const TOOL_API = strip(read('packages/core/src/tool/builtin/api-tools/tool.ts'));
// ★ ⑨ 会话级 customToolIds 全链路用的前端 store。
//   ⚠️ 先前这里**漏定义** → 引用 `CHAT` 时抛 ReferenceError → 该文件的整条断言在
//   `vitest run` 下直接失败（不是"实现有问题"，是测试自己跑不起来）。2026-10-01 补上。
const CHAT = strip(read('packages/ui/src/stores/chat.ts'));

/** 锚点必须存在（锚点失效会让后续窗口偏移，报出"像是真缺陷"的假红） */
function at(code: string, needle: string, label: string): number {
  const i = code.indexOf(needle);
  expect(i, `★ 锚点失效（源码结构变了，测试需同步）：${label} —— 找不到 ${JSON.stringify(needle.slice(0, 60))}`)
    .toBeGreaterThan(-1);
  return i;
}
/** ★ 正确取窗口：slice(i, i+len)。绝不写 slice(anchor(...), len) —— slice 第二参是 end 下标，会返回空串。 */
function win(code: string, needle: string, len: number, label?: string): string {
  const i = at(code, needle, label || needle);
  return code.slice(i, i + len);
}

// ────────────────────────────────────────────────────────────
describe('① runtime 与 dependencies 必须可由模型指定', () => {
  it('★★ create 不得把 runtime 硬编码成 node（否则造不出 python 工具）', () => {
    const body = win(EXECUTOR, "case 'api_custom_tool_create'", 2600, 'create 分支');
    expect(body, '★ runtime 仍被硬编码（模型造不出 Python 工具 —— 用户诉求落不了地）')
      .not.toMatch(/VALUES\s*\([^)]*,\s*'node'\s*,/);
    expect(body, "★ 未读取 args.runtime").toMatch(/str\(args,\s*'runtime'\)/);
    expect(body, '★ 未把 python 识别为合法 runtime').toMatch(/'python'/);
  });

  it('★★ create 必须落 dependencies（不能永远是空数组）', () => {
    const body = win(EXECUTOR, "case 'api_custom_tool_create'", 2600, 'create 分支');
    expect(body, '★ 未读取 args.dependencies').toMatch(/args\.dependencies/);
    expect(body, '★ dependencies 未序列化落库').toMatch(/JSON\.stringify\(deps\)/);
  });

  it('★ update 也必须能改 runtime / dependencies（造完发现要改是常态）', () => {
    const body = win(EXECUTOR, "case 'api_custom_tool_update'", 1600, 'update 分支');
    expect(body, '★ update 不支持改 runtime（只能删了重建，工具 id 变、已挂载引用全失效）')
      .toMatch(/sets\.push\('runtime = \?'\)/);
    expect(body, '★ update 不支持改 dependencies').toMatch(/sets\.push\('dependencies_json = \?'\)/);
  });

  it('★ schema 必须声明 runtime / dependencies 并在描述里点明"要 IO 得用 python"', () => {
    const body = win(TOOL_API, "name: 'api_custom_tool_create'", 2400, 'create schema');
    expect(body, '★ schema 未声明 runtime').toMatch(/runtime:/);
    expect(body, '★ runtime 未限定为 node|python').toMatch(/enum:\s*\['node',\s*'python'\]/);
    expect(body, '★ schema 未声明 dependencies').toMatch(/dependencies:/);
    expect(body, '★ 描述未点明"需要文件/网络必须用 python"（模型会拿 node 沙箱碰壁）')
      .toMatch(/python/);
  });

  it('★★ 创建后必须告诉模型"还需挂载才能调用"（否则造完就卡住）', () => {
    const body = win(EXECUTOR, "case 'api_custom_tool_create'", 2600, 'create 分支');
    expect(body, '★ 未回显挂载指引（模型造完不知道要挂载）').toMatch(/customToolIds|api_agent_mount/);
  });
});

// ────────────────────────────────────────────────────────────
describe('② 两条执行入口必须走同一实现（否则必然各自漂移）', () => {
  it('★★ 必须存在统一入口 runCustomTool（含依赖安装）', () => {
    at(DEPS, 'export async function runCustomTool', 'runCustomTool 定义');
  });

  it('★★ ReAct 主循环的 custom_ 分支必须调用统一入口', () => {
    // ★ 锚点必须用**代码**而不是注释：本测试的 strip() 会剥掉 `//` 注释，拿注释当锚点必然失效
    const body = win(LTM, 'if (isCustom) {', 1200, 'custom_ 分支');
    expect(body, '★ custom_ 分支未走统一入口（会漏依赖安装）').toMatch(/runCustomToolCode|runCustomTool\(/);
  });

  it('★★ api_custom_tool_execute 也必须走统一入口', () => {
    const body = win(EXECUTOR, "case 'api_custom_tool_execute'", 900, 'execute 分支');
    expect(body, '★ execute 分支未走统一入口（与主循环漂移，漏依赖安装）').toMatch(/runCustomTool/);
    expect(body, '★ execute 分支仍直连 runUserCode（绕过了依赖安装）').not.toMatch(/runUserCode\(/);
  });

  it('★★ 执行前必须检查/安装依赖，且安装失败要给可行动指引', () => {
    const body = win(DEPS, 'export async function runCustomTool', 2600, 'runCustomTool');
    expect(body, '★ 未检查依赖是否就绪').toMatch(/depsReady\(/);
    expect(body, '★ 未安装依赖').toMatch(/installToolDependencies\(/);
    expect(body, '★ 安装失败未给处理建议（模型只能瞎试）').toMatch(/处理建议|python_exec/);
  });

  it('★ 依赖必须按 runtime 分流注入（node 注模块 / python 注站点包路径）', () => {
    const body = win(DEPS, 'export async function runCustomTool', 2600, 'runCustomTool');
    expect(body, '★ python 未注入站点包路径').toMatch(/pythonPath/);
    expect(body, '★ node 未注入模块').toMatch(/modules:/);
  });
});

// ────────────────────────────────────────────────────────────
describe('③ 包名白名单（防注入：这些字符串会拼进 npm/pip 命令）', () => {
  it('★★ 必须校验包名且拒绝 flag / URL / 本地路径 / 命令拼接', () => {
    const body = win(DEPS, 'export function isSafePackageName', 900, 'isSafePackageName');
    expect(body, '★ 未拒绝以 - 开头（flag 注入，可改安装源）').toMatch(/startsWith\('-'\)/);
    expect(body, '★ 未拒绝以 . 开头（本地路径注入）').toMatch(/startsWith\('\.'\)/);
    expect(body, '★ 未拒绝冒号（URL scheme: git+https / file:）').toMatch(/\\:/);
  });

  it('★ 必须分离出「安全 / 被拒」两组，且被拒要带原因', () => {
    const body = win(DEPS, 'export function partitionDependencies', 800, 'partitionDependencies');
    expect(body, '★ 未返回 rejected（被拒的包会静默消失）').toMatch(/rejected/);
    expect(body, '★ 未去重').toMatch(/seen\.has/);
  });

  it('★★ 命令必须用数组传参（不拼 shell 字符串 → 无注入面）', () => {
    const body = win(DEPS, 'function run(', 900, 'run 实现');
    // exec-cmd 收口（2026-10-04）：execFile 唯一实现下沉到 services/exec-cmd.ts，
    // 数组传参（无注入面）的保证随之单点化 —— 这里断言走的是统一出口 runCmd。
    expect(body, '★ 未走统一出口 runCmd（应 import services/exec-cmd）').toMatch(/runCmd\(/);
    expect(EXEC_CMD, '★ exec-cmd 底层未用 execFile（拼 shell 字符串会有命令注入面）').toMatch(/execFile\(/);
    expect(EXEC_CMD, '★ exec-cmd 未强制数组 args（注入面回潮）').toMatch(/args: string\[\]/);
  });

  it('★★ Windows 必须显式挑 .cmd（where 首个结果是不可执行的 sh 脚本 → 静默失败）', () => {
    const body = win(DEPS, 'async function which', 800, 'which 实现');
    expect(body, '★ 未优先挑 .cmd/.exe（Windows 上会拿到不可执行的 sh 脚本，报"退出码 1"）')
      .toMatch(/\.\(cmd\|exe\|bat\)|\.cmd/);
    expect(body, '★ which 结果未过滤存在性').toMatch(/existsSync/);
  });

  it('★★ 不能再用 execFile + shell:true 调 .cmd（Node 会抛 spawn EINVAL）', () => {
    // 正解是显式 cmd.exe /c；断言"没有 shell: true 这个写法"
    expect(DEPS, '★ 仍用 shell:true（Node 18.20.2+ 禁止，会抛 spawn EINVAL）').not.toMatch(/shell:\s*true/);
    expect(DEPS, '★ 未显式走 cmd.exe /c').toMatch(/ComSpec|cmd\.exe/);
  });
});

// ────────────────────────────────────────────────────────────
describe('④ 隔离目录必须落数据目录，不得污染用户工作目录', () => {
  it('★★ toolRuntimeDir 不得基于 workspaceDir（那是用户的项目文件夹）', () => {
    const body = win(DEPS, 'export function toolRuntimeDir', 600, 'toolRuntimeDir');
    expect(body, '★ 用了 workspaceDir → 会把 tool-runtime 建到用户项目里（我第一版踩过）')
      .not.toMatch(/workspaceDir/);
    expect(body, '★ 未走 DATA_DIR').toMatch(/DATA_DIR/);
    expect(body, '★ 目录名不是 tool-runtime').toMatch(/tool-runtime/);
  });

  it('★ 安装必须落到隔离目录（--prefix / --target），不污染全局环境', () => {
    expect(DEPS, '★ npm 未指定 --prefix（会装进全局或 cwd）').toMatch(/'--prefix'/);
    expect(DEPS, '★ pip 未指定 --target（会装进系统 site-packages）').toMatch(/'--target'/);
  });

  it('★★ 依赖安装必须有超时上限（装大包不能挂死任务）', () => {
    expect(DEPS, '★ 无安装超时（pandas 之类可能挂很久）').toMatch(/INSTALL_TIMEOUT_MS|timeout:/);
  });
});

// ────────────────────────────────────────────────────────────
describe('⑤ 沙箱注入依赖后不得变宽松（防"注入 = 沙箱形同虚设"）', () => {
  it('★★ node 沙箱的 require 必须是白名单查找，绝不回退真实 require', () => {
    const body = win(SANDBOX, 'const sandboxCode', 2600, '沙箱代码模板');
    expect(body, '★ 未做白名单判断（未声明的包会被放行）').toMatch(/hasOwnProperty\.call\(__yz_modules__/);
    expect(body, '★ 未在拒绝时给可行动提示').toMatch(/未注入|dependencies/);
    expect(body, '★ 白名单外仍能拿到模块（沙箱失效）').not.toMatch(/require\s*=\s*globalThis\.require/);
  });

  it('★★ process / globalThis / timer 必须仍然被屏蔽', () => {
    const body = win(SANDBOX, 'const sandboxCode', 2600, '沙箱代码模板');
    expect(body, '★ process 未屏蔽（可读环境变量/退出进程）').toMatch(/const process = undefined/);
    expect(body, '★ globalThis 未屏蔽（可绕过白名单摸到宿主）').toMatch(/const globalThis = undefined/);
    expect(body, '★ 定时器未屏蔽（可绕过 vm timeout 挂死）').toMatch(/const setTimeout = undefined/);
  });

  it('★ 标准内建仍要可用（别把沙箱做废 —— JSON/Math/Date 等）', () => {
    const body = win(SANDBOX, 'const sandboxCode', 2600, '沙箱代码模板');
    for (const b of ['JSON', 'Math', 'Date', 'RegExp', 'Map']) {
      expect(body, `★ 标准内建 ${b} 未暴露（工具写不了正常逻辑）`).toMatch(new RegExp(`globalThis\\.${b}`));
    }
  });

  it('★★ 函数调用仍必须走 runInContext（否则 vm timeout 罩不住函数体）', () => {
    const body = win(SANDBOX, 'export async function runInSandbox', 4200, 'runInSandbox');
    expect(body, '★ 未用 runInContext 执行函数体 → while(true) 会永久挂死调用方')
      .toMatch(/runInContext\('__yz_fn__\(__yz_args__\)'/);
  });
});

// ────────────────────────────────────────────────────────────
describe('⑥ python 侧必须支持依赖注入（PYTHONPATH 追加而非覆盖）', () => {
  it('★★ runPythonCode 必须接受并注入 pythonPath', () => {
    const body = win(PY_RUNTIME, 'export async function runPythonCode', 1800, 'runPythonCode');
    expect(body, '★ 未接受 pythonPath 参数').toMatch(/pythonPath/);
    expect(body, '★ 未写入 PYTHONPATH（装了包也用不上）').toMatch(/PYTHONPATH/);
  });

  it('★★ PYTHONPATH 必须**追加**而不是覆盖（覆盖会废掉用户既有配置）', () => {
    const body = win(PY_RUNTIME, 'export async function runPythonCode', 1800, 'runPythonCode');
    expect(body, '★ 未保留既有 PYTHONPATH（直接赋值 = 覆盖）')
      .toMatch(/env\.PYTHONPATH\s*=\s*env\.PYTHONPATH\s*\?/);
  });

  it('★ 平台分隔符要正确（win 用 ; / posix 用 :）', () => {
    const body = win(PY_RUNTIME, 'export async function runPythonCode', 1800, 'runPythonCode');
    // 允许任意空白：实际写法是 `process.platform === 'win32' ? ';' : ':'`
    expect(body, '★ 分隔符写死（Windows 上 PYTHONPATH 会解析错）').toMatch(/win32'\s*\?\s*';'\s*:\s*':'/);
  });
});

// ────────────────────────────────────────────────────────────
describe('⑦ core 与 server 的职责边界（core 不得依赖存储层/安装器）', () => {
  it('★★ 依赖以「注入」方式传入 core，core 不自己跑 npm/pip', () => {
    const body = win(SANDBOX, 'export interface RunUserCodeOptions', 1500, 'RunUserCodeOptions');
    expect(body, '★ 未定义 deps 注入结构（core 若自己装包会绑死 node 环境）').toMatch(/deps\?/);
    expect(SANDBOX, '★ core 出现 child_process（违反纯逻辑包边界，浏览器端打包会炸）')
      .not.toMatch(/child_process/);
  });

  it('★ 注册表必须仍允许 api_custom_tool_execute（cc 已挂载的工具能立即试跑）', () => {
    at(EXECUTOR, "'api_custom_tool_execute'", 'execute 在支持清单里');
  });
});
// ────────────────────────────────────────────────────────────
describe('⑧ 所有自定义工具执行入口都必须带依赖安装（防"入口漂移"）', () => {
  it('★★ 全仓不得再有「直连 runUserCode 执行 custom_tool 行」的入口', () => {
    // 为什么会漏：自定义工具有 5+ 个执行入口（ReAct 主循环 / api_custom_tool_execute /
    // MCP inbound-server / routes/tools 试跑 / workflow-runner 节点 / core 侧两处）。
    // 每处各写一遍 → 必然漂移。实测一轮自检就发现 4 处漏了依赖安装。
    const serverFiles = [
      'apps/server/src/mcp/inbound-server.ts',
      'apps/server/src/routes/tools.ts',
      'apps/server/src/workflow-runner.ts',
      'apps/server/src/mcp/api-tool-executor.ts',
      'apps/server/src/llm-task-manager.ts',
    ];
    for (const f of serverFiles) {
      const code = strip(read(f));
      // 允许存在（sandbox 内部/注释），但不得出现 runUserCode(...c.code/row.code/t.code...)
      const directCall = /runUserCode\(\s*(c|row|t|tool)\.(code|entry)/.test(code);
      expect(directCall, `★ ${f} 仍直连 runUserCode 执行自定义工具 → 该入口漏依赖安装`).toBe(false);
    }
  });

  it('★★ core 侧入口必须走 runCustomToolRow（依赖准备器注入式）', () => {
    expect(strip(read('packages/core/src/tool/registry.ts')), '★ registry 未走统一入口')
      .toMatch(/runCustomToolRow/);
    expect(strip(read('packages/core/src/workflow/nodes.ts')), '★ workflow nodes 未走统一入口')
      .toMatch(/runCustomToolRow/);
  });

  it('★★ core 必须提供依赖准备器钩子（core 不能自己装包）', () => {
    expect(SANDBOX, '★ 未定义准备器接口').toMatch(/CustomToolDepPreparer/);
    expect(SANDBOX, '★ 未提供注入函数').toMatch(/setCustomToolDepPreparer/);
    expect(SANDBOX, '★ 钩子未在 runCustomToolRow 里被调用').toMatch(/customToolDepPreparer\.prepare/);
  });

  it('★★ server 启动时必须注入准备器（否则 core 侧入口等于没依赖安装）', () => {
    const idx = strip(read('apps/server/src/index.ts'));
    expect(idx, '★ server 未注入准备器').toMatch(/setCustomToolDepPreparer\(/);
    expect(idx, '★ 注入未接依赖安装').toMatch(/installToolDependencies/);
  });
});

// ────────────────────────────────────────────────────────────
describe('⑨ 会话级 customToolIds 全链路必须闭合', () => {
  it('★★ 会话 PATCH 必须支持 customToolIds（否则前端算出来的存不进去）', () => {
    const conv = strip(read('apps/server/src/routes/conversations.ts'));
    expect(conv, '★ 会话 PATCH 不接收 customToolIds → 前端合并逻辑是半套实现')
      .toMatch(/req\.body\.customToolIds/);
    expect(conv, '★ 未落库').toMatch(/custom_tool_ids_json/);
  });

  it('★★ 前端必须读取会话级 customToolIds 并并入合并结果', () => {
    expect(CHAT, '★ rowToConv 未读 custom_tool_ids_json').toMatch(/custom_tool_ids_json/);
    const body = win(CHAT, 'function getMergedMounts', 2600, 'getMergedMounts');
    expect(body, '★ 合并时未并入会话级（模型挂上的工具前端认不出）')
      .toMatch(/conv\?\.customToolIds/);
  });

  it('★ 共享类型必须声明会话级 customToolIds（否则前端拿不到类型）', () => {
    const types = strip(read('packages/shared/src/types/index.ts'));
    expect(types, '★ Conversation 类型缺 customToolIds').toMatch(/customToolIds\?: string\[\]/);
  });
});
