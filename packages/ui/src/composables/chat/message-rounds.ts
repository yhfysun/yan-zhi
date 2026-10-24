// 消息分轮：把扁平的 message 列表组装成「一轮 = 用户提问 + 智能体执行过程 + 最终回答」。
//
// ★★★ 为什么抽成独立模块（2026-10-12）：
//   这是内容区**渲染与否的唯一判定**。它出错的表现就是**整页空白**（用户实报
//   「内容区域不显示了？」），而根因极其隐蔽 —— 分页窗口里"恰好没有主链路 user"时，
//   旧逻辑会把整页消息全部丢弃。这种 bug **只能靠行为测试抓**，不能靠 grep 源码
//   （本项目反复栽在"断言存在 ≠ 断言生效"）。而 `useChat.ts` 顶层会拉起一片依赖
//   （router / pinia / api client），测试里加载代价大且易耦合 —— 与 `plan-buckets.ts` /
//   `stale-run-sweep.ts` 同一模式：抽出来，main 侧 import 它（唯一实现），测试也 import 它（真跑行为）。
//
// ★ 入参 `isToolError` 由调用方注入（原实现直接调 `isToolErrorContent`），
//   保持本模块**零依赖**、可独立单测。
import type { Message } from '@yan-zhi/shared';

export interface AgentStep {
  reasoningContent?: string;
  toolCalls: any[];
  toolResults: Array<{ callId: string; content: string; isError: boolean; at?: number }>;
  partialContent?: string;
  subAgentRounds?: SubAgentRound[];
  /** 关联的真实助手消息 id，用于匹配交付文件等按消息 id 索引的资源 */
  messageId?: string;
  /** 该步消息的创建时间（ms）。配合 toolResults[].at 可算每次工具调用的耗时（2026-10-23） */
  at?: number;
}

export interface SubAgentRound {
  toolCallId: string;
  subAgentId: string;
  subAgentName?: string;
  depth: number;
  steps: AgentStep[];
  finalContent?: string;
}

export interface MessageRound {
  user: Message | null;
  steps: AgentStep[];
  allToolCalls: any[];
  finalAssistant: Message | null;
  hasAgentProcess?: boolean;
  agentStats?: { stepCount: number; reasoningCount: number; toolCallCount: number };
  /** 子智能体最终结果（已从 call_agent 工具结果提上来，直接在主内容区展示） */
  subAgentResults?: Array<{ subAgentName: string; finalContent: string }>;
  /**
   * 本轮的压缩标记（2026-10-02）。
   * ★ 后端推 `context:compacted` 时落一条 system 消息（带 compactMarker），这里把它
   *   提到轮次上供 UI 渲染「此处已压缩」分隔线 —— 压缩是**有损**的，不该完全隐形。
   */
  compactMarkers?: Array<{ coveredCount: number; keptCount: number; tokens: number }>;
}

/**
 * 组装消息轮次（纯函数）。
 *
 * @param msgs 当前会话的消息列表（**已按时间正序**：旧 → 新）
 * @param isToolError 工具结果是否算错误的判定（由调用方注入，避免本模块依赖 UI 层）
 */
export function buildMessageRounds(
  msgs: Message[],
  isToolError: (content: string) => boolean,
): MessageRound[] {

  const rounds: MessageRound[] = [];
  let currentRound: MessageRound | null = null;
  const stepByToolCallId = new Map<string, AgentStep>();

  for (const msg of msgs) {
    // 压缩标记（role='system' + compactMarker）：附到当前轮，不参与正文分轮逻辑
    if ((msg as any).compactMarker) {
      if (currentRound) {
        if (!currentRound.compactMarkers) currentRound.compactMarkers = [];
        currentRound.compactMarkers.push((msg as any).compactMarker);
      }
      continue;
    }
    if (msg.role === 'system') continue;
    // 子智能体消息：归入父 step 的 subAgentRounds
    if (msg.parentToolCallId) {
      const parentStep = stepByToolCallId.get(msg.parentToolCallId);
      if (!parentStep) {
        // ★★★ 2026-10-19：父步骤不在本页时**不能直接丢**。
        //   分页首拉（limit=50）经常整页都是子智能体的尾部消息（父步骤在更早的页），
        //   旧逻辑 `continue` 会把整页丢光 ⇒ rounds=0 ⇒ 会话内容空白（本次实报）。
        //   降级为普通步骤渲染：内容至少可见；父步骤在窗口内时仍走正常的子智能体分组。
        if (!currentRound) currentRound = { user: null, steps: [], allToolCalls: [], finalAssistant: null };
        if (msg.role === 'assistant') {
          const step: AgentStep = {
            reasoningContent: msg.reasoningContent,
            toolCalls: msg.toolCalls || [],
            toolResults: [],
            partialContent: msg.content || undefined,
            messageId: msg.id,
            at: msg.createdAt,
          };
          currentRound.steps.push(step);
          for (const tc of step.toolCalls) {
            if (tc?.id) stepByToolCallId.set(tc.id, step);
          }
        } else if (msg.role === 'tool') {
          for (let s = currentRound.steps.length - 1; s >= 0; s--) {
            const step = currentRound.steps[s];
            if (step.toolCalls.some((tc: any) => tc.id === msg.toolCallId)) {
              step.toolResults.push({
                callId: msg.toolCallId || '',
                content: msg.content || '',
                isError: isToolError(msg.content || ''),
                at: msg.createdAt,
              });
              break;
            }
          }
        }
        continue;
      }
      if (!parentStep.subAgentRounds) parentStep.subAgentRounds = [];
      let subRound = parentStep.subAgentRounds.find((r) => r.toolCallId === msg.parentToolCallId);
      if (!subRound) {
        subRound = {
          toolCallId: msg.parentToolCallId,
          subAgentId: msg.subAgentId || '',
          subAgentName: msg.subAgentName,
          depth: msg.subAgentDepth || 1,
          steps: [],
        };
        parentStep.subAgentRounds.push(subRound);
      }
      if (msg.role === 'assistant') {
        const subStep: AgentStep = {
          reasoningContent: msg.reasoningContent,
          toolCalls: msg.toolCalls || [],
          toolResults: [],
          partialContent: msg.content || undefined,
          messageId: msg.id,
          at: msg.createdAt,
        };
        subRound.steps.push(subStep);
        for (const tc of subStep.toolCalls) {
          if (tc?.id) stepByToolCallId.set(tc.id, subStep);
        }
      } else if (msg.role === 'tool') {
        for (let s = subRound.steps.length - 1; s >= 0; s--) {
          const step = subRound.steps[s];
          if (step.toolCalls.some((tc: any) => tc.id === msg.toolCallId)) {
            step.toolResults.push({
              callId: msg.toolCallId || '',
              content: msg.content || '',
              isError: isToolError(msg.content || ''),
              at: msg.createdAt,
            });
            break;
          }
        }
      }
      continue;
    }
    if (msg.role === 'user') {
      if (currentRound) rounds.push(currentRound);
      currentRound = { user: msg, steps: [], allToolCalls: [], finalAssistant: null };
    } else if (msg.role === 'assistant') {
      // ★★★ 2026-10-12 修复「任务后期内容区整页空白」（用户实报，26:48 时白屏）：
      //
      //   症状：任务跑到中后期，左侧聊天区整页空白，但 store 里明明有 353 条消息。
      //   实测（CDP 直连渲染进程 + 后端接口对照）：
      //     `store.currentMessages.length = 353` 而 `messageRounds.length = 0`
      //     `limit=50`（前端首拉值）返回的 50 条 **100% 是子智能体消息**
      //     （25 条 assistant+sub + 25 条 tool+sub，主链路消息一条都没有）
      //
      //   根因：子智能体（`call_agent`）执行期会产生**海量子消息**（`parent_tool_call_id` 非空）。
      //     它们把"最新 50 条"填满 ⇒ 首拉这一页里**没有任何主链路 `user`** ⇒
      //     旧逻辑只在 `role === 'user'` 时建 `currentRound` ⇒ `currentRound` 恒为 null ⇒
      //     下面的 `if (!currentRound) continue` **把整页消息全部丢弃** ⇒ rounds = 0 ⇒ 白屏。
      //     （子消息本身也因找不到父 step（父在更早的页）而被 `continue` 丢弃。）
      //
      //   ★ 修法：遇到 assistant 而还没有轮时，**补一个隐式轮**（`user: null`）。
      //     分页窗口没有轮头时，**在窗口内渲染窗口内的内容**才是正确语义 ——
      //     "必须有 user 才能开轮"是个**在分页下不成立的隐含假设**（与本次
      //     `browserSteps` 长度冻结同族教训：别把"代理信号"当成必要条件）。
      //   ★ 渲染层已天然兼容 `user: null`：
      //     `ChatMessageList.vue` 用 `<div v-if="round.user" class="msg msg-user">` 守卫，
      //     且 `:key="round.user?.id || 'r' + ri"` 有兜底 —— 不会出现空气泡。
      if (!currentRound) currentRound = { user: null, steps: [], allToolCalls: [], finalAssistant: null };
      const step: AgentStep = {
        reasoningContent: msg.reasoningContent,
        toolCalls: msg.toolCalls || [],
        toolResults: [],
        partialContent: msg.content || undefined,
        messageId: msg.id,
        at: msg.createdAt,
      };
      currentRound.steps.push(step);
      for (const tc of step.toolCalls) {
        if (tc?.id) stepByToolCallId.set(tc.id, step);
      }
      if (msg.toolCalls?.length) {
        currentRound.allToolCalls.push(...msg.toolCalls);
      }
    } else if (msg.role === 'tool') {
      if (!currentRound) continue;
      for (let s = currentRound.steps.length - 1; s >= 0; s--) {
        const step = currentRound.steps[s];
        if (step.toolCalls.some((tc: any) => tc.id === msg.toolCallId)) {
          step.toolResults.push({
            callId: msg.toolCallId || '',
            content: msg.content || '',
            isError: isToolError(msg.content || ''),
            at: msg.createdAt,
          });
          break;
        }
      }
    }
  }
  if (currentRound) rounds.push(currentRound);

  for (const round of rounds) {
    // 子智能体最终回答 = call_agent 工具返回结果（role=tool 且 toolCallId == subRound.toolCallId，
    // 归入父 step.toolResults）。把它提到主内容区直接展示，而非埋在工具结果的 pre 里。
    const subAgentResults: Array<{ subAgentName: string; finalContent: string }> = [];
    for (const step of round.steps) {
      if (!step.subAgentRounds) continue;
      for (const subRound of step.subAgentRounds) {
        const res = step.toolResults.find(r => r.callId === subRound.toolCallId);
        if (res && res.content) {
          subRound.finalContent = res.content;
          subAgentResults.push({ subAgentName: subRound.subAgentName || subRound.subAgentId, finalContent: res.content });
          // 清除最终回答步骤的 partialContent，避免与主内容区结果双重渲染
          const finalStep = subRound.steps.find(s => s.toolCalls.length === 0);
          if (finalStep) finalStep.partialContent = undefined;
        }
      }
    }
    if (subAgentResults.length) round.subAgentResults = subAgentResults;
    const lastStep = round.steps[round.steps.length - 1];
    if (lastStep && !lastStep.toolCalls.length) {
      round.finalAssistant = {
        id: lastStep.messageId || (round.user?.id ? round.user.id + '-fa' : 'fa'),
        conversationId: '',
        role: 'assistant',
        content: lastStep.partialContent || '',
        reasoningContent: lastStep.reasoningContent,
        createdAt: 0,
      };
      round.steps.pop();
    }
    // 兜底：历史数据（重启后加载）或中断的轮次可能没有收尾的纯文本助手消息
    // （最后一轮以工具调用/子智能体结果结束），此时 finalAssistant 为 null，
    // 主内容区的复制/下载/折叠会全部失效（引用空 id）。合成一个 finalAssistant
    // 保证旧数据交互一致；内容为空时导出会回退到子智能体结果。
    if (!round.finalAssistant && round.user && (round.steps.length > 0 || round.allToolCalls.length > 0)) {
      round.finalAssistant = {
        id: round.user.id + '-fa',
        conversationId: '',
        role: 'assistant',
        content: '',
        createdAt: 0,
      };
    }
    round.hasAgentProcess = round.steps.length > 0 || round.allToolCalls.length > 0;
    round.agentStats = {
      stepCount: round.steps.length,
      reasoningCount: round.steps.filter(s => s.reasoningContent).length,
      toolCallCount: round.steps.reduce((sum, s) => sum + s.toolCalls.length, 0),
    };
  }
  return rounds;
}

/**
 * 找出本轮**正在执行**的子智能体块（`call_agent`）。
 *
 * ★ 2026-10-24 用户实报：「子智能体的工具调用、思考内容这里也放出来啊，要不然都不知道在干啥」
 *   —— 子智能体跑起来后主内容区只剩一个三点省略号，看不出它在干什么。
 *
 * ★ 判据必须是**运行事实**（`sub_agent:start` / `sub_agent:end` 维护的 runningToolCallIds），
 *   不能拿"最后一轮正在流式"来猜：主智能体自己在跑时同样流式，猜会让空态乱跳。
 *
 * @param isRunning 某 toolCallId 是否仍在执行（调用方注入，保持本模块零依赖）
 */
export function findLiveSubAgentRound(
  round: MessageRound,
  isRunning: (toolCallId: string) => boolean,
): SubAgentRound | null {
  let live: SubAgentRound | null = null;
  for (const step of round.steps) {
    for (const r of step.subAgentRounds || []) {
      if (r.toolCallId && isRunning(r.toolCallId)) live = r;
    }
  }
  return live;
}

/**
 * 单轮内默认渲染的步骤数上限（2026-10-19，「长任务一跑界面卡死」治理）。
 *
 * 背景（用户实报 + 数据库实测）：一个浏览器自动化任务跑了 2 小时，产生
 * **193 个助手步骤 / 196 条工具结果 / 124KB 结果文本**，而它们全部属于**同一轮**
 * （同一个 `user` 消息之后）。`useChat` 的窗口化按「轮」开窗（末尾 30 轮），
 * 对这种"一轮几百步"的形态完全失效 ⇒ 193 个工具卡片同时挂在 DOM 里，
 * 流式期间每帧（50–160ms）整棵列表重渲 ⇒ 主线程被压死、界面卡住。
 *
 * 处理：模板只渲染末尾 `limit` 步，更早的步骤折叠成一行「展开更早的 N 步」。
 * 用户主动展开后恢复全量（`showAll=true`）—— 既不丢信息，也不让默认 DOM 无上限。
 */
export const ROUND_STEP_RENDER_LIMIT = 40;

/** 计算某轮实际渲染的步骤区间 `[start, end)`（纯函数，供模板与单测共用） */
export function stepRenderRange(
  total: number,
  showAll: boolean,
  limit: number = ROUND_STEP_RENDER_LIMIT,
): { start: number; end: number } {
  const n = Math.max(0, total);
  const cap = Math.max(1, limit);
  if (showAll || n <= cap) return { start: 0, end: n };
  return { start: n - cap, end: n };
}
