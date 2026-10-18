/**
 * tool_call `arguments` 合法性判定与修复（2026-10-18 实据修复，用户实报 high）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ 现场（生产会话 3f646e6a「手机定时拍照传输桌面应用开发」，2026-10-18 20:11:33）：
 *
 * 模型（GLM-5.3-Flash / Z.ai）一批吐出 5 个工具调用，第 5 个 python_exec 的
 * arguments 是 **68KB 的长 JSON，生成到一半被 max_tokens 截断** ——
 * hex 级实据：尾部停在 `...await capture.stop();\n      if`，没有闭合引号/花括号
 * （`JSON.parse` 报 "Unterminated string"）。
 *
 * 工具侧当时就发现并拒绝了（回执：「参数解析失败，本工具未执行。arguments 不是合法 JSON」），
 * 但**原始坏 arguments 被原样落库**。之后每次请求回放这段历史：
 *   · `reorderToolGroups`（摆顺序）/ `healToolCallIds`（补 id）/ `sanitizeToolMessages`（配对）
 *     全部放行 —— 三道自愈只校验「对得上、紧挨着」，**没有一个校验 arguments 的内容合法性**；
 *   · 上游 GLM 校验 arguments ⇒ 400 `1214 The messages parameter is illegal`；
 *   · 整轮请求死、任务 failed，用户 13 秒内连吃两个 400；
 *   · 直到上下文压缩把毒丸消息稀释进摘要，会话才自愈（不是被修好的）。
 *
 * ★ 修法（在发送侧唯一出口 `sanitizeToolMessages` 内调用；只读、不写库
 *   —— 与既有三道自愈同一取向，库里历史保持原貌可查）：
 *   ① 合法        → 原样返回（**恒等**：绝不变动正常历史）；
 *   ② 非法转义    → 加倍反斜杠修复（`\U`/`\A` 等 Windows 路径单反斜杠是模型常见手误；
 *                    加倍后解出的正是模型本意 `r"C:\Users"`，语义无损）；
 *   ③ 截断/结构性损坏 → 返回 null，由调用方把该调用**连同回执整组剥离**
 *      （与既有的「未执行空参剥离」同一条判据路径：模型本就没拿到结果，
 *        留着只会被模仿成"可以吐坏参数"）。
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * 判定并尝试修复 tool_call arguments。
 *
 * @param raw API 形态的 `tool_calls[].function.arguments`（字符串）。
 * @returns 合法（或修好后合法）的 JSON 字符串；**无法修复返回 null**。
 *          ★ 恒等约定：输入已合法时返回**原串本身**（调用方据此跳过无意义的重写，
 *            也保证幂等——同一份历史每次发送行为一致）。
 *          ★ 空串原样返回：空参交由既有的「未执行空参」判据处理，本函数不插手。
 */
export function healToolArguments(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  try {
    JSON.parse(trimmed);
    return raw;
  } catch {
    /* 落到修复分支 */
  }
  // 修复非法转义：`\X`（X 不在 `" \ / b f n r t u`，或 `\u` 后不是 4 位十六进制）
  // → 替换为字面反斜杠 `\\X`。只动非法转义，合法的 `\n` `\"` `\\` `\uXXXX` 原样保留。
  const repaired = trimmed.replace(/\\(u(?![0-9a-fA-F]{4})|(?![\\"\/bfnrtu]))/g, '\\\\');
  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    return null; // 截断/结构性损坏——修不了，让调用方剥离整组
  }
}
