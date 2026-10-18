// 会话级系统提示词合成（2026-10-19）—— 修复"陈旧快照钉死旧提示词"。
//
// 背景（实测根因）：前端在会话首条消息时把 `agent.systemPrompt + 场景提示词` 合并写入
// conversation.system_prompt（useChat.ts:2913-2917），而后端 buildSystemPromptForBackend
// 的取值是 `conv 提示词 || agent 提示词` —— 会话一旦创建，agent 提示词**此后所有更新**
// 都被这份快照永久遮蔽。实测后果：开发模式新提示词（任务分级/小活自己干）上线后，
// 进行中的开发会话仍在跑"你不是搬砖的、一律委派"的旧版，模型行为没有任何改善。
//
// 合成规则（保持用户自定义会话提示词的覆盖语义，只刷新"看起来是快照"的那类）：
//   1. 会话没有提示词 → 用 agent 当前提示词；
//   2. 会话提示词已包含 agent 当前提示词 → 原样使用（已是最新，别重复拼接）；
//   3. 会话提示词与 agent 提示词**首行角色声明相同**但内容不同 → 判定为陈旧快照：
//      用 agent 当前提示词 + 会话里保留的场景段（"## 当前场景"起）重建；
//   4. 其余（用户自写的会话提示词）→ 维持覆盖语义，原样返回。

/** 角色声明首行前 24 字符：新旧版本提示词共享的开头（如「你是「代码编写助手」…」） */
function promptHead(s: string): string {
  return (s.split('\n')[0] || '').slice(0, 24);
}

/**
 * 从会话提示词里抽出场景段。scenes 的提示词统一以 `## 当前场景` 开头，
 * 前端写快照时用 `\n\n` 与 agent 提示词分隔 —— 找到该标记即取其后的全部内容。
 */
function extractSceneSection(convPrompt: string): string {
  const idx = convPrompt.search(/\n## 当前场景/);
  return idx >= 0 ? convPrompt.slice(idx + 1).trim() : '';
}

export function composeConversationBasePrompt(
  convPrompt: string | null | undefined,
  agentPrompt: string | null | undefined,
): string {
  const conv = (convPrompt || '').trim();
  const agent = (agentPrompt || '').trim();
  if (!conv) return agent;
  if (!agent) return conv;
  // 已是最新（或用户以 agent 提示词为底改写过）→ 不重复拼
  if (conv.includes(agent)) return conv;
  // 陈旧快照：同一角色声明开头、但正文不同 → 刷新 agent 部分，保留场景段
  if (promptHead(conv) === promptHead(agent)) {
    const scene = extractSceneSection(conv);
    return [agent, scene].filter(Boolean).join('\n\n');
  }
  // 用户自定义会话提示词：维持"会话级覆盖 agent 级"的既有语义
  return conv;
}
