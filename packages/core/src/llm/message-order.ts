/**
 * 发送前消息顺序规整 —— **唯一出口**（2026-10-09）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ 为什么必须有（用户实报：「追加任务立即发送按钮又失效了点击无用」的隐形杀手）
 *
 * OpenAI 兼容协议对 `tool_calls` 的**顺序**是硬约束：
 *   「assistant 带 tool_calls 的消息，其后必须**紧跟**与之一一配对的 tool 消息」
 * 违反时上游直接 400 —— 报错文案正是 `tool_calls must be followed by tool messages`。
 *
 * 而「运行中追加消息」（输入框「立即发送」）的语义天然**就是**插一条 user 消息：
 * 它被写在**当前轮**的
 *     assistant(content + tool_calls=[A,B])   ← 本轮正在跑，工具还没回执
 *     ⟵ 插入点（injectUserMessage 落库 + 前端可见）
 *     tool(A) / tool(B)                        ← 本轮工具结果，稍后才落库
 * 之间。库里这样没问题（可见性优先，用户要立刻看到自己说了什么），但**原样回放给上游
 * 就是 400**。此前 `toApiMessage` / `sanitizeToolMessages` 只做**按 id 配对**（orphan 剥离、
 * id 自愈），**从不校验相邻顺序** → 这类历史每次重放都撞 400，表现为"注入了但整轮失败"。
 *
 * ★ 处置：**发送前只读规整**（不写库，库里顺序保持可查原貌 —— 与 `sanitizeToolMessages`
 *   的「发送前清洗」同一取向）：把夹在 `tool_calls` 与其配对 tool 消息之间的其它消息
 *   （user / 无 tool_calls 的 assistant）**后移**到该组之后。
 *   语义不变（消息内容一字未改），只把「谁先谁后」摆正。
 *
 * ★ 与 `healToolCallIds` 的分工（别混）：
 *   · healToolCallIds  —— 补**缺失的 id**（让配对"对得上"）；
 *   · 本函数          —— 摆正**相邻顺序**（让配对"紧挨着"）。
 *   两道都跑完，才同时满足「对得上 + 紧挨着」。
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** OpenAI 约定形态的消息（`toApiMessage` 的产物）：tool_calls 为 snake_case、tool 消息带 tool_call_id */
type ApiMessage = Record<string, any>;

/** 该消息是否为「带 tool_calls 的 assistant」（即一个工具调用组的开头） */
function isToolCallHead(m: ApiMessage | undefined): boolean {
  return !!m && m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0;
}

/**
 * 摆正 tool 调用组与其回执的相邻顺序（只读，返回新数组；消息对象本身不复制）。
 *
 * 规则：
 *   1. 遇到「带 tool_calls 的 assistant」→ 进入该组：先收拢紧随其后的、属于本组的 tool 回执；
 *   2. 收拢过程中**夹在中间**的其它消息（user / 无 tool_calls 的 assistant）暂存为 displaced；
 *   3. 本组收齐（本组所有 id 都拿到回执）或遇到下一个组头 / 非本组 tool 消息时结束，
 *      随后把 displaced 按原相对顺序**追加到本组之后**；
 *   4. 组内**没到齐**也照样结束 —— 缺的那条由 `sanitizeToolMessages` 的 orphan 分支处理，
 *      本函数绝不臆造回执。
 *
 * ★ 幂等：顺序已正确时输出与输入逐项相同（只新建数组，不动对象），可安全重入。
 */
export function reorderToolGroups(messages: ApiMessage[]): ApiMessage[] {
  const out: ApiMessage[] = [];
  let i = 0;
  while (i < messages.length) {
    const head = messages[i];
    if (!isToolCallHead(head)) {
      out.push(head);
      i++;
      continue;
    }
    // ── 进入一个工具调用组 ──
    out.push(head);
    i++;
    const pending = new Set<string>(
      head.tool_calls.map((tc: any) => tc?.id).filter((id: unknown): id is string => typeof id === 'string' && !!id),
    );
    const displaced: ApiMessage[] = [];
    while (i < messages.length && pending.size > 0) {
      const n = messages[i];
      if (n?.role === 'tool') {
        if (pending.has(n.tool_call_id)) {
          out.push(n);
          pending.delete(n.tool_call_id);
          i++;
          continue;
        }
        // 非本组的 tool 回执：本组到此为止，交由外层继续处理（不吞、不重排）
        break;
      }
      if (isToolCallHead(n)) break; // 下一个组头：本组到此为止
      // ★ 夹在中间的其它消息（「立即发送」注入的 user 就在这里）→ 后移到本组之后
      displaced.push(n);
      i++;
    }
    for (const d of displaced) out.push(d);
  }
  return out;
}