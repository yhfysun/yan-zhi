/**
 * 发送前消息顺序规整 —— **唯一出口**（2026-10-09，2026-10-12 扩「跨距回执归位」）。
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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ 2026-10-12 扩展：**跨距回执归位**（修上游 400 `messages 参数非法` / code 1214）
 *
 * 旧实现只做「窗口内收拢 + 夹心后移」：一旦窗口内撞上**下一个组头**就 `break`，
 * 于是「回执被远远甩在后面」的形态永远归不了位。实测现场（会话 f0a901e3，10:52:21）：
 *   组头 assistant(call_ab998b32, call_agent) 在 #1183（10:50:31）
 *   其 tool 回执却在 #1200（10:52:20，迟到 109 秒）
 *   中间夹了 **16 条**（1 条 user + 8 组完整 assistant/tool 对）
 * ⇒ 输出仍是 `assistant(call_ab99) → user → …16 条… → tool(call_ab99)` ⇒ 上游 400、整轮失败。
 *
 * 成因：并发 `call_agent`（长耗时子 ReAct 循环）的组头先落库，主循环被「追加消息」推进了
 * 新轮次，子结果回来时只能排在 16 条之后 —— 组头与回执被长距离拉开。
 *
 * ★ 补法：**全局回执索引**。遇组头时先按原逻辑在窗口内收拢；窗口关闭后若仍有 pending
 *   未满足，就从全局索引把那条回执**迁移**到组头之后（原位置移除）。
 *   —— 只调「谁紧挨着谁」，消息内容一字不改，与「只读规整」取向一致。
 * ★ 幂等：顺序已正确时窗口内即可收齐，全局迁移不触发 → 输出与输入逐项相同。
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
 *   4. 组内**没到齐**时：
 *      · 旧行为：照旧结束（缺的交给 `sanitizeToolMessages` 的 orphan 分支处理）；
 *      · ★ 新行为（2026-10-12）：先在**全局回执索引**里找该 id 的回执，找到就把它
 *        **迁移**到本组（从原位置移除）—— 修「组头与回执被长距离隔开」的 400；
 *        找不到才交给 orphan 分支。本函数绝不臆造回执。
 *
 * ★ 每个回执消息**只会被消费一次**（`consumed` 集合）—— 避免同一回执被多个组重复引用。
 * ★ 幂等：顺序已正确时输出与输入逐项相同（只新建数组，不动对象），可安全重入。
 */
export function reorderToolGroups(messages: ApiMessage[]): ApiMessage[] {
  const out: ApiMessage[] = [];
  // ★ 全局回执索引：toolCallId → 该回执在**原数组**中的下标（用于跨距迁移）。
  //   同一 id 有多条回执时保留**最早**的一条（与 OpenAI「同序配对」语义一致）。
  const receiptIndex = new Map<string, number>();
  for (let k = 0; k < messages.length; k++) {
    const m = messages[k];
    if (m?.role === 'tool' && typeof m.tool_call_id === 'string' && m.tool_call_id) {
      if (!receiptIndex.has(m.tool_call_id)) receiptIndex.set(m.tool_call_id, k);
    }
  }
  /** 已被某个组消费掉的下标（跨距迁移时从原位置跳过，避免重复引用） */
  const consumed = new Set<number>();

  let i = 0;
  while (i < messages.length) {
    const head = messages[i];
    if (!isToolCallHead(head)) {
      // ★ 已被跨距迁移走的回执：原位置直接跳过（不重复 push）
      if (consumed.has(i)) { i++; continue; }
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
    // ① 窗口内收拢：紧随其后的、属于本组的 tool 回执（原逻辑，不动）
    while (i < messages.length && pending.size > 0) {
      const n = messages[i];
      if (n?.role === 'tool') {
        if (pending.has(n.tool_call_id)) {
          out.push(n);
          pending.delete(n.tool_call_id);
          consumed.add(i);
          i++;
          continue;
        }
        // 非本组的 tool 回执：本组窗口到此为止，交由外层继续处理（不吞、不重排）
        break;
      }
      if (isToolCallHead(n)) break; // 下一个组头：本组窗口到此为止
      // ★ 夹在中间的其它消息（「立即发送」注入的 user 就在这里）→ 后移到本组之后
      displaced.push(n);
      i++;
    }
    // ② ★★★ 跨距回执归位（2026-10-12）：窗口内没到齐 → 到全局索引把回执找回来。
    //    必须放在 displaced 之前 push，保证「紧挨着组头」的顺序。
    if (pending.size > 0) {
      for (const missingId of Array.from(pending)) {
        const idx = receiptIndex.get(missingId);
        if (idx === undefined) continue;  // 库里根本没有 → 交给 orphan 分支
        if (consumed.has(idx)) continue;  // 已被别的组消费 → 不重复引用
        if (idx < i) continue;            // 只向后迁移（向前的说明形态异常，不回溯）
        out.push(messages[idx]);
        consumed.add(idx);
        pending.delete(missingId);
      }
    }
    for (const d of displaced) out.push(d);
  }
  return out;
}
