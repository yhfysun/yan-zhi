import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 长任务「断流 → 进度消失 → 输入锁失效 → 压缩残缺」四环根因的防回归测试（2026-10-08）。
 *
 * 用户实报原话：
 *   ① 「pageAgent 在执行？啥进度没有？」
 *   ② 「而且用户还能操作页面？」
 *   ③ 「page 异步执行是个好思路，但是要能行啊，还有执行完成得有通知机制啊」
 *   ④ 「长任务模式下是不是需要自动压缩啊，把重要信息记录下来、后续还要干啥记录下？」
 *
 * 四个症状同源（见各 describe 注释）；本文件把修法钉死，防止回退。
 * ★ 全部断言基于**真实源码**（不做模块导入，避免 better-sqlite3 ABI 不匹配整文件挂）。
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');
const chatSrc = fs.readFileSync(path.join(REPO_ROOT, 'packages/ui/src/stores/chat.ts'), 'utf8');
const panelSrc = fs.readFileSync(path.join(REPO_ROOT, 'packages/ui/src/components/BrowserPanel.vue'), 'utf8');
const useChatSrc = fs.readFileSync(path.join(REPO_ROOT, 'packages/ui/src/composables/chat/useChat.ts'), 'utf8');
const sseSrc = fs.readFileSync(path.join(REPO_ROOT, 'apps/server/src/services/sse.ts'), 'utf8');
const windowSrc = fs.readFileSync(path.join(REPO_ROOT, 'packages/core/src/compress/window.ts'), 'utf8');
const memSrc = fs.readFileSync(path.join(REPO_ROOT, 'apps/server/src/services/memory-service.ts'), 'utf8');
const taskMgrSrc = fs.readFileSync(path.join(REPO_ROOT, 'apps/server/src/llm-task-manager.ts'), 'utf8');
const planFileSrc = fs.readFileSync(path.join(REPO_ROOT, 'apps/server/src/services/task-plan-file.ts'), 'utf8');

/** 截取从 startMarker 起的 length 个字符（把断言限定在某函数内） */
function sliceFrom(src: string, startMarker: string, length = 4000): string {
  const i = src.indexOf(startMarker);
  return i < 0 ? '' : src.slice(i, i + length);
}

// ═══════════════════════════════════════════════════════════════════════════
describe('环一：SSE 游标错位 —— connected 帧绝不能计入 since', () => {
  /**
   * 根因：服务端 `subscribe(taskId, since, ...)` 的 since 是 `task.events` **数组下标**，
   * 而 connected 帧由 sseStream 直接写、**不进数组**（services/sse.ts 与 routes/llm-tasks.ts
   * 双处注释都写明"前端也不要为它累加游标"）。前端无条件 +1 → 每次重连恒定漏一条事件。
   */

  it('taskEventCounts 的累加必须排除 connected 帧', () => {
    // 累加语句必须被 `event.type !== 'connected'` 守卫包住
    expect(chatSrc).toMatch(/if\s*\(\s*event\.type\s*!==\s*'connected'\s*\)\s*\{\s*taskEventCounts\.set\(/);
  });

  it('不存在"无条件累加游标"的旧写法（防回退）', () => {
    // 旧写法形态： 紧邻 try{JSON.parse} 之后直接 set。用"解析行 + 紧随 3 行内无条件 set"判
    const badPattern = /catch\s*\{\s*return;\s*\}\s*\n\s*\n\s*taskEventCounts\.set\(taskId/;
    expect(chatSrc).not.toMatch(badPattern);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('环二：跨重连状态必须存活（否则重放会重复执行工具）', () => {
  /**
   * 根因：这些状态原是 subscribeTaskSse 的**函数内局部变量**，重连即重置 →
   * ① executedToolCallIds 重置 → 服务端重放的同一 tool:execute 被**再执行一遍**
   * ② assistantMsgId 重置 → message:updated 找不到目标消息，流式正文丢失
   * ③ chunkBuffer/flushTimer 重置 → 上一段未提交的增量被丢在旧闭包
   */

  it('存在按 taskId 分桶的跨重连状态容器与取用/清理函数', () => {
    expect(chatSrc).toContain('sseStreamStates');
    expect(chatSrc).toMatch(/function\s+streamStateOf\(taskId: string\)/);
    expect(chatSrc).toMatch(/function\s+dropStreamState\(taskId: string\)/);
  });

  it('subscribeTaskSse 内部必须从 streamStateOf 取状态，而不是新建局部变量', () => {
    const fn = sliceFrom(chatSrc, 'async function subscribeTaskSse(', 3000);
    expect(fn).toMatch(/const\s+st\s*=\s*streamStateOf\(taskId\)/);
    // 不能再出现"函数内新建这三个局部状态"的旧形态
    expect(fn).not.toMatch(/let\s+assistantMsgId\s*=\s*''/);
    expect(fn).not.toMatch(/const\s+subAgentMsgIds\s*=\s*new\s+Map/);
    expect(fn).not.toMatch(/const\s+executedToolCallIds\s*=\s*new\s+Set/);
  });

  it('去重集合与助手消息 id 都必须走 st.*（跨重连存活）', () => {
    expect(chatSrc).toContain('st.executedToolCallIds.has(callId)');
    expect(chatSrc).toContain('st.executedToolCallIds.add(callId)');
    expect(chatSrc).toContain('st.assistantMsgId');
    expect(chatSrc).toContain('st.subAgentMsgIds');
  });

  it('任务终态必须清掉跨重连状态与游标（防无界增长）', () => {
    for (const evt of ['task:completed', 'task:aborted', 'task:error']) {
      const line = chatSrc.split('\n').find((l) => l.includes(`case '${evt}'`)) || '';
      expect(line, `${evt} 分支缺清理`).toContain('dropStreamState(taskId)');
      expect(line, `${evt} 分支缺游标清理`).toContain('taskEventCounts.delete(taskId)');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('环三：流结束无条件落缓冲（finally 而非正常路径）', () => {
  /**
   * 根因：此前 flushNow 只在"正常路径"调用，而 task:error 分支 throw 会直接跳出
   * → 最后 ~50ms 的流式增量永久丢失。改 try/finally 后任何退出路径都落盘。
   */

  it('subscribeTaskSse 必须用 try/finally 包住 consumeSseStream', () => {
    // ★ 切片要到下一个顶层函数声明为止 —— 函数体很长（含大量事件分支注释），
    //   固定长度会截断在 finally 之前。
    const start = chatSrc.indexOf('async function subscribeTaskSse(');
    const end = chatSrc.indexOf('async function subscribeTaskSseWithReconnect(', start);
    const fn = start < 0 ? '' : chatSrc.slice(start, end > start ? end : start + 9000);
    expect(fn).toMatch(/try\s*\{/);
    expect(fn).toMatch(/\}\s*finally\s*\{\s*[\s\S]{0,600}?flushNow\(convId\)/);
  });

  it('consumeSseStream 回调显式标注 Promise<void | false>（否则 TS2345）', () => {
    expect(chatSrc).toMatch(/consumeSseStream\(sseRes\.body,\s*async\s*\(payload\):\s*Promise<void \| false>\s*=>/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('环四：手动重连必须走续传版本', () => {
  /**
   * 根因：reconnectActiveTask 此前直接调 subscribeTaskSse，于是
   * ① 它拿到的 connected 帧会把游标虚高 1（该任务之后所有自动重连都错位）
   * ② 它自己的流再被掐断就永久停（无重连包装）
   */

  it('reconnectActiveTask 必须调用 subscribeTaskSseWithReconnect', () => {
    const fn = sliceFrom(chatSrc, 'async function reconnectActiveTask(', 2500);
    expect(fn).toContain('subscribeTaskSseWithReconnect');
    // 不能再自己拼 since 后直调裸版本
    expect(fn).not.toMatch(/const\s+since\s*=\s*taskEventCounts\.get\(taskId\)[\s\S]{0,200}?await\s+subscribeTaskSse\(/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('服务端：SSE 心跳保活', () => {
  /**
   * 根因：sseStream 只写 connected 然后干等业务事件，LLM 思考 / 前端执行工具期间
   * **双向静默**数十秒 → 中间层判空闲掐断。加注释帧心跳（前端 sse 层已跳过 ':' 帧）。
   */

  it('导出心跳间隔常量且设为 15s 量级', () => {
    expect(sseSrc).toContain('SSE_HEARTBEAT_MS');
    const m = sseSrc.match(/SSE_HEARTBEAT_MS\s*=\s*(\d[\d_]*)/);
    expect(m, '未找到心跳常量').toBeTruthy();
    const v = Number(String(m![1]).replace(/_/g, ''));
    expect(v).toBeGreaterThanOrEqual(10000);
    expect(v).toBeLessThanOrEqual(60000);
  });

  it('写的是注释帧（: 开头）—— 前端 extractSsePayloads 会跳过，不进 since 游标', () => {
    expect(sseSrc).toMatch(/res\.write\(['"`]:\s*hb/);
  });

  it('close 时必须 clearInterval（否则泄漏 + 写已关闭响应）', () => {
    expect(sseSrc).toMatch(/req\.on\('close'[\s\S]{0,200}?clearInterval\(heartbeat\)/);
  });

  it('unref 心跳定时器，避免阻止进程退出', () => {
    expect(sseSrc).toMatch(/heartbeat\.unref\(\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('输入锁：判据必须来自会话级记账，不能依赖 browserSteps（断流即空）', () => {
  /**
   * 根因：browserSteps 是**事件日志**，SSE 断流时最先归零，而 inputLocked /
   * liveControlVisible / agentCursorVisible **共用同一个空数组** → 三症状同时出现
   * （无进度条 + 能操作页面 + 无虚拟鼠标）。
   */

  it('store 提供会话级浏览器任务记账与 API', () => {
    expect(chatSrc).toContain('browserTaskConvs');
    expect(chatSrc).toMatch(/function\s+markBrowserTaskActive\(convId: string\)/);
    expect(chatSrc).toMatch(/function\s+clearBrowserTaskActive\(convId\?: string\)/);
    expect(chatSrc).toMatch(/const\s+browserTaskActive\s*=\s*computed\(/);
    // 必须导出给 BrowserPanel 用
    expect(chatSrc).toContain('browserTaskActive, markBrowserTaskActive, clearBrowserTaskActive');
  });

  it('记账必须由三条独立路径登记（tool:start / tool:result / tool:execute）', () => {
    const start = sliceFrom(chatSrc, "case 'tool:start'", 700);
    expect(start, 'tool:start 未登记').toContain('markBrowserTaskActive(convId)');
    const result = sliceFrom(chatSrc, "case 'tool:result'", 700);
    expect(result, 'tool:result 未登记').toContain('markBrowserTaskActive(convId)');
    const exec = sliceFrom(chatSrc, "case 'tool:execute':", 1400);
    expect(exec, 'tool:execute 未登记').toContain('markBrowserTaskActive(convId)');
  });

  it('BrowserPanel 的 inputLocked 判据必须是 browserTaskActive（不是 browserSteps.length）', () => {
    // ★ 只取 inputLocked 这一条 computed 本体（到下一个 computed 声明为止），
    //   否则切片会串进 liveControlVisible —— 后者**允许**引用 browserSteps（展示用）。
    const start = panelSrc.indexOf('const inputLocked = computed(');
    const end = panelSrc.indexOf('const liveControlVisible = computed(', start);
    const fn = panelSrc.slice(start, end);
    expect(fn).toContain('chatStore.browserTaskActive');
    expect(fn, 'inputLocked 不得再依赖 browserSteps.length').not.toContain('browserSteps.length');
  });

  it('实况条与虚拟鼠标同源（断流后仍显示"接管中"）', () => {
    const live = sliceFrom(panelSrc, 'const liveControlVisible = computed(', 400);
    expect(live).toContain('chatStore.browserTaskActive');
    const cursor = sliceFrom(panelSrc, 'const agentCursorVisible = computed(', 400);
    expect(cursor).toContain('chatStore.browserTaskActive');
  });

  it('任务收尾按 convId 精确清记账（不误伤其他会话正在跑的任务）', () => {
    const fn = sliceFrom(useChatSrc, 'store.onTaskFinished(', 700);
    expect(fn).toContain('store.clearBrowserTaskActive(convId)');
  });

  it('切会话**不能**清记账（切回来时任务仍在跑，锁必须还在）', () => {
    const fn = sliceFrom(useChatSrc, 'async function selectConv(', 900);
    expect(fn, 'selectConv 误清了浏览器任务记账').not.toContain('clearBrowserTaskActive');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('压缩补强一：抢救必须覆盖"待办"，且落到 task_plan（不是 memory 表）', () => {
  /**
   * 根因：抢救指令只产出 daily/session 两类**事实**，而 writeMemoryItems 的 type 白名单
   * 是 ['profile','agent','session','daily'] —— 没有任何类别承载"接下来该做什么"。
   * todo 若塞进 memory 会被**静默降级成 agent**，既不被当计划执行、又污染记忆检索。
   */

  it('抢救指令必须新增 todo 类别', () => {
    expect(memSrc).toContain('"type":"daily|session|todo"');
    expect(memSrc).toMatch(/type=todo/);
  });

  it('抢救 prompt 必须带上当前计划现状（判增量，避免重复登记）', () => {
    expect(memSrc).toContain('planText');
    expect(memSrc).toMatch(/当前任务计划（已登记，不要重复输出其中的步骤）/);
  });

  it('todo 分流进 task_plan 的读写出口（loadPlanJson / savePlanJson / writeTaskPlanFile）', () => {
    expect(memSrc).toMatch(/loadPlanJson\(params\.conversationId\)/);
    expect(memSrc).toMatch(/savePlanJson\(params\.conversationId/);
    expect(memSrc).toMatch(/writeTaskPlanFile\(params\.conversationId/);
    // 按 title 去重，避免同一待办反复追加
    expect(memSrc).toContain('known.has(t)');
  });

  it('todo 不得进 memory 的写入列表（facts 与 todos 必须分流）', () => {
    expect(memSrc).toMatch(/const\s+todoItems\s*=\s*items\.filter/);
    expect(memSrc).toMatch(/const\s+factItems\s*=\s*items\.filter\(\(x\)\s*=>\s*x\?\.type\s*!==\s*'todo'\)/);
    // writeItems 必须来自 factItems
    expect(memSrc).toMatch(/const\s+writeItems:\s*MemoryWriteItem\[\]\s*=\s*factItems/);
  });

  it('task-plan-file 必须导出 loadPlanJson / savePlanJson（供抢救复用，不另起炉灶）', () => {
    expect(planFileSrc).toMatch(/export\s+function\s+loadPlanJson\(/);
    expect(planFileSrc).toMatch(/export\s+function\s+savePlanJson\(/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('压缩补强二：抢救节流按"批次"而非"整任务一次"', () => {
  /**
   * 根因：flushedThisRun 是 runReActLoop 的函数级布尔量，全程只置一次 →
   * 跑 3 批的长任务只有第一批抢救了记忆，第二、三批的压缩一路白压。
   */

  it('节流游标必须是批次号（数值），不是布尔量', () => {
    expect(taskMgrSrc).toMatch(/let\s+flushedBatch\s*=\s*-1/);
    expect(taskMgrSrc).not.toMatch(/let\s+flushedThisRun\s*=\s*false/);
  });

  it('beforeCompress 内按 batch 比较并更新游标', () => {
    const fn = sliceFrom(taskMgrSrc, 'beforeCompress: async (toCompress)', 900);
    expect(fn).toMatch(/if\s*\(flushedBatch\s*===\s*batch\)\s*return/);
    expect(fn).toMatch(/flushedBatch\s*=\s*batch/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('压缩补强三：保留窗口必须保住"结果未齐全"的工具调用组', () => {
  /**
   * 根因：keepRecent=6 只数条数，很容易把一个**正在等结果**的 assistant(tool_calls)
   * 挤出保留窗口 → 模型看到自己发过调用却没有结果 → 判搞完了 / 换参重发
   * （实测："pageAgent 在执行吗？啥进度没有？"）。压缩在此制造了残缺状态。
   */

  it('切点计算后必须有不完整调用组的保护扫描', () => {
    const seg = sliceFrom(windowSrc, '悬空调用保护', 1800);
    expect(seg, '未找到悬空调用保护段').toBeTruthy();
    // 必须逐个数紧随的 tool 条数并与 tool_calls.length 比较
    expect(seg).toMatch(/n\s*>=\s*tcs\.length/);
    expect(seg).toMatch(/n\s*<\s*tcs\.length|n\s*>=\s*tcs\.length\)\s*continue/);
  });

  it('保护必须只对"不完整"的组生效（完整组 continue，否则保留窗被撑满）', () => {
    const seg = sliceFrom(windowSrc, '悬空调用保护', 1800);
    expect(seg).toMatch(/if\s*\(n\s*>=\s*tcs\.length\)\s*continue/);
  });

  it('前移后仍有 cut<2 的放弃兜底（宁可原样发也不产畸形摘要）', () => {
    const seg = sliceFrom(windowSrc, 'const cut = 0', 200) || windowSrc;
    expect(windowSrc).toMatch(/if\s*\(cut\s*<\s*2\)\s*return\s+trimmed/);
  });
});
