import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 小说推文产线「任务执行不顺」三类故障的防回归测试（2026-10-08）。
 *
 * 背景（用户安装版实报 + server.log 实证）：
 *   1. 长任务经常断，一个会话执行不下去 → 日志 `浏览器工具 X 前端暂时不可达（SSE 断连或超时）`
 *   2. 表单填写不顺畅 → 输入框看着填了，提交时是空的
 *   3. 视频上传不顺畅 → 投递后页面还在处理，被 18s 总闸误判超时
 *
 * 三条根因与修法见下方各 describe 的注释。断言钉住实现不被退化。
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');
const mainPath = path.join(REPO_ROOT, 'apps/desktop/main.cjs');
const chatPath = path.join(REPO_ROOT, 'packages/ui/src/stores/chat.ts');
const pythonRuntimePath = path.join(REPO_ROOT, 'packages/core/src/tool/builtin/python-runtime.ts');

const main = fs.readFileSync(mainPath, 'utf8');
const chat = fs.readFileSync(chatPath, 'utf8');
const pythonRuntime = fs.readFileSync(pythonRuntimePath, 'utf8');

/** 截取源码中从 startMarker 起的 length 个字符（用于把断言限定在某个函数/分支内） */
function sliceFrom(src: string, startMarker: string, length = 4000): string {
  const i = src.indexOf(startMarker);
  return i < 0 ? '' : src.slice(i, i + length);
}

describe('修复一：SSE 断连自动重连（长任务不再中途断死）', () => {
  it('存在重连包装函数，且在流结束后查询任务是否仍在运行', () => {
    expect(chat).toContain('subscribeTaskSseWithReconnect');
    // 判定依据必须是「后端任务仍在 running」而不是盲猜 —— 只有真没跑完才续订
    const fn = sliceFrom(chat, 'async function subscribeTaskSseWithReconnect', 3000);
    expect(fn).toContain('/llm/tasks/active');
    expect(fn).toMatch(/status\s*===\s*'running'/);
  });

  it('重连必须按 taskEventCounts 续传（since），否则会重放旧事件造成消息重复', () => {
    const fn = sliceFrom(chat, 'async function subscribeTaskSseWithReconnect', 3000);
    expect(fn).toContain('taskEventCounts.get(taskId)');
    // 续传值作为 subscribeTaskSse 的 since 参数（第 5 个实参）
    expect(fn).toMatch(/subscribeTaskSse\([^)]*taskEventCounts\.get\(taskId\)/);
  });

  it('重连有次数上限与退避，避免服务端长期不可用时无限空转', () => {
    const fn = sliceFrom(chat, 'async function subscribeTaskSseWithReconnect', 3000);
    expect(fn).toContain('MAX_RETRY');
    expect(fn).toMatch(/Math\.min\(\s*500\s*\*\s*Math\.pow\(2,\s*attempt\)/);
  });

  it('用户主动停止（signal.aborted）后不得继续重连', () => {
    const fn = sliceFrom(chat, 'async function subscribeTaskSseWithReconnect', 3000);
    const abortedChecks = fn.match(/signal\.aborted/g) || [];
    // 循环起点 + 退避等待后各一次，至少 2 处守卫
    expect(abortedChecks.length).toBeGreaterThanOrEqual(2);
  });

  it('主链路 callLlm 必须走重连版本（不能退回裸 subscribeTaskSse）', () => {
    const callLlm = sliceFrom(chat, 'async function callLlm', 12000);
    expect(callLlm).toContain('subscribeTaskSseWithReconnect(');
    // 裸调用只允许出现在重连函数自身与 reconnectActiveTask 内部
    expect(callLlm).not.toMatch(/await subscribeTaskSse\(/);
  });
});

describe('修复二：tool:execute 不阻塞 SSE 帧循环（连接不再假死被掐）', () => {
  it('tool:execute 分支用即发即忘派发，禁止在帧循环直接 await 工具执行', () => {
    // 只取 switch 分支体（到下一个 case 之前），避免越界把别的调用算进来
    const start = chat.indexOf("case 'tool:execute':");
    const end = chat.indexOf("case 'file:registered':", start);
    const branch = chat.slice(start, end > start ? end : start + 4000);
    // 必须包在即发即忘的 async IIFE 里
    expect(branch).toContain('void (async () => {');
    // ★ 核心：dispatchToolCall 必须出现在 void (async ...) 之后（在 IIFE 内部合法），
    //   绝不能出现在分支体直排层级（那会阻塞帧循环，把 reader.read() 卡停）。
    const iifeAt = branch.indexOf('void (async () => {');
    const callAt = branch.indexOf('await dispatchToolCall(');
    expect(callAt).toBeGreaterThan(iifeAt);
  });

  it('工具去重与结果回传语义保持（改造不得顺手删掉）', () => {
    const start = chat.indexOf("case 'tool:execute':");
    const end = chat.indexOf("case 'file:registered':", start);
    const branch = chat.slice(start, end > start ? end : start + 4000);
    expect(branch).toContain('executedToolCallIds');
    expect(branch).toContain('/tool-result');
    expect(branch).toContain('postResult');
    expect(branch).toContain('postError');
  });
});

describe('修复三-a：browser_type 受控组件兼容（表单填写生效）', () => {
  it('type 分支改用原生 value setter + input/change 事件，禁止退回 sendInputEvent 逐字符', () => {
    const branch = sliceFrom(main, "case 'type': {", 3200);
    // 必须派发 input 事件（受控组件据此同步 state）
    expect(branch).toContain("new Event('input'");
    expect(branch).toContain("new Event('change'");
    // 必须走原型上的原生 value setter（React/Vue 重写了实例 setter）
    expect(branch).toContain('getOwnPropertyDescriptor');
    expect(branch).toMatch(/set\.call\(el/);
    // 且不再用 sendInputEvent 伪造输入（注释里提及旧实现不算）
    expect(branch).not.toMatch(/sendInputEvent\(\s*\{\s*type:\s*'char'/);
  });

  it('支持 contentEditable（富文本/arco 部分输入位）', () => {
    const branch = sliceFrom(main, "case 'type': {", 3200);
    expect(branch).toContain('isContentEditable');
    expect(branch).toContain('textContent');
  });

  it('回读核验：未生效时回传 applied=false + hint，让模型能自纠而非盲重试', () => {
    const branch = sliceFrom(main, "case 'type': {", 3200);
    expect(branch).toContain('applied');
    expect(branch).toContain('hint');
  });

  it('type 只有唯一实现（BrowserView 引擎分支），不许再退回 sendInputEvent 伪造输入', () => {
    // 只断言"真的调用 sendInputEvent 发字符事件"的代码不存在（注释里提及旧实现是允许的）
    expect(main).not.toMatch(/sendInputEvent\(\s*\{\s*type:\s*'char'/);
    // sendInputEvent 仍可用于鼠标/按键，但 char 事件不再出现
    const charImpls = main.match(/sendInputEvent\(\s*\{\s*type:\s*'char'/g) || [];
    expect(charImpls.length).toBe(0);
  });
});

describe('修复三-b：视频上传超时放宽（不再被 18s 误判）', () => {
  it('主进程对 upload/screenshot 用更宽的总闸', () => {
    expect(main).toContain('SLOW_ACTIONS');
    expect(main).toMatch(/SLOW_ACTIONS\s*=\s*new Set\(\['upload'/);
    // upload 总闸必须显著大于默认 18s
    expect(main).toMatch(/SLOW_ACTIONS\.has\(action\)\s*\?\s*(\d{4,})/);
  });

  it('前端 IPC 竞速窗口对 upload/screenshot 同步放宽，且大于主进程总闸（留余量）', () => {
    const branch = sliceFrom(chat, "const ipcTimeout", 400);
    expect(branch).toContain("action === 'upload'");
    expect(branch).toContain("action === 'screenshot'");
  });

  it('filechooser 等待时间已从 6s 放宽（视频站点点按钮后挂载上传控件更慢）', () => {
    // 断言不存在旧的 6000 硬等待写法
    expect(main).not.toMatch(/!chooserBackendId\s*&&\s*!chooserErr\s*&&\s*Date\.now\(\)\s*-\s*t0\s*<\s*6000/);
    expect(main).toMatch(/!chooserBackendId\s*&&\s*!chooserErr\s*&&\s*Date\.now\(\)\s*-\s*t0\s*<\s*(\d{5,})/);
  });
});

describe('附：python-runtime 工作目录副本同步（novel_tuiwen 任务必走路径）', () => {
  it('ESM 文件里不得出现裸 require —— 否则 hashOf 必抛 require is not defined', () => {
    // 该文件是 ESM（用 import.meta.url 定位），CJS 的 require 在打包产物里不存在。
    // 历史故障：安装版日志 `[python-runtime] 工作目录副本同步失败，回退内置脚本: ReferenceError: require is not defined`
    // → 工作目录副本同步永久失效，用户对管线的修改永远存不下来。
    expect(pythonRuntime).not.toMatch(/[^.\w]require\s*\(/);
  });

  it('crypto 走顶部静态 import（与 path/fs/os 同一写法）', () => {
    expect(pythonRuntime).toMatch(/^import \* as crypto from 'crypto';/m);
    // hashOf 内直接使用导入的 crypto，不再局部 require
    const fn = sliceFrom(pythonRuntime, 'const hashOf = (dir: string)', 400);
    expect(fn).toContain('crypto.createHash');
    expect(fn).not.toContain('require(');
  });
});
