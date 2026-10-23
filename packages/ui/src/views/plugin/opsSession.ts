// 运维控制台（OpsConsole）的类型与**会话级状态**。
//
// 为什么状态放在模块作用域（而不是组件内）：
//   App.vue 的 router-view 没有 keep-alive，切到别的页面时 OpsConsole 会被销毁。
//   如果窗口列表 / PTY 句柄 / 对话会话跟着组件一起消失，用户切回来就会发现 shell
//   连接没了。放在模块里，组件重新挂载时只需把已有的 xterm DOM 接回新容器
//   （见 OpsConsole.vue 的 attachTerm），SSH 会话与输出内容都不中断。
import { ref } from 'vue';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { ReleaseProject } from '@yan-zhi/shared';
import type { OpsConn } from './OpsConnectionDialog.vue';

export type ViewKey = 'term' | 'container' | 'db' | 'chat';
export type ConnType = 'ssh' | 'docker' | 'database';
export interface OpsGroup { id: string; name: string; createdAt: number; parentId?: string }
export interface DockerRow { Id?: string; Names?: string; Image?: string; State?: string; Status?: string; [k: string]: unknown }
export interface DbResult { rows: Record<string, unknown>[]; fields: string[]; truncated?: boolean }
export interface OpsToolCall { id: string; name: string; arguments?: string }
export interface OpsMsg {
  id: string;
  role: 'user' | 'assistant' | string;
  content: string;
  subAgentName?: string | null;
  streaming?: boolean;
  createdAt: number;
  /** assistant 消息发起的工具调用（步骤卡的来源） */
  toolCalls?: OpsToolCall[];
  /** role === 'tool' 的结果消息回填到哪个 toolCallId */
  toolCallId?: string;
  /**
   * 模型思考内容（深度思考）。后端 `message.reasoning_content` 有落库、SSE 也发 `reasoning`，
   * 但此前**前端完全没接** —— 表现就是用户看不到任何思考过程（2026-10-21 实报）。
   */
  reasoning?: string;
  /**
   * 用户自己直接执行命令（执行模式 / `/` 前缀）的输出消息。
   *
   * ★ 渲染规则与工具调用**完全不同**：它不是模型的一次工具调用，而是用户的操作，
   *   结果要像命令行一样**完整铺开**（等宽、不折叠、自动滚到底）。
   *   2026-10-21 用户实报「直接显示这个完整的啊，还折叠起来干嘛用户怎么看啊」。
   */
  exec?: boolean;
  /** exec 消息对应的命令原文（回车那一刻记下，避免再从别处反推） */
  execCommand?: string;
}

/** 取 exec 消息的命令（没有则回退到 content 的第一行，兼容早期消息） */
function execCommandOf(m: OpsMsg): string {
  if (m.execCommand) return m.execCommand;
  return (m.content || '').split('\n')[0] || '';
}

/**
 * 一轮执行（用户一句话 → 模型的多步推理与最终回答）。
 *
 * ★ 为什么要在前端组装"轮"（2026-10-21 用户实报「参考人家的交互：思考内容、工具内容、
 *   响应内容的展示」）：此前是两层平铺 —— 消息列表按条渲染（assistant 的中间态和最终答复
 *   混在一起，多次工具调用后会出现好几段互不相干的话），步骤卡又整体堆在列表底部。
 *   用户无法回答"这句话对应哪次执行、它的思考/工具/结论分别是什么"。
 *   组装成轮之后，思考 / 工具 / 回复就近排在同一轮里，和主对话的呈现保持一致。
 */
export interface OpsRound {
  /** 用户消息（本轮起点）；没有则为空（历史残缺数据） */
  user?: OpsMsg;
  /** 本轮的思考内容（多个 assistant 分段累加） */
  reasoning: string;
  /** 本轮所有工具步骤（已按调用顺序回填结果） */
  steps: OpsStep[];
  /** 本轮最终回复（最后一条非空 assistant 正文） */
  answer: string;
  /**
   * 流式期的过渡叙述（"我先看下目录…"）：已归入 reasoning，但本轮还没结束时
   * 正文区为空，需要用它顶上，否则用户对着一个空白的回答区等。
   * 本轮结束（answer 出现）后由 UI 忽略。
   */
  liveNarration: string;
  /** 本轮仍在流式输出 */
  streaming: boolean;
  /**
   * 用户直接执行的命令块（可能多个，按顺序）。
   * 与 answer 分开：这些是"用户敲的命令 + 它的输出"，渲染成终端样式，
   * 不能混进模型的回答里（否则会被 markdown 当普通段落重排、换行丢失）。
   */
  execs: Array<{ command: string; output: string; streaming: boolean }>;
  createdAt: number;
}

/** 一个执行步骤（由 assistant.toolCalls + 对应 tool 结果消息推导，无后端改动） */
export interface OpsStep {
  index: number;
  callId: string;
  toolName: string;
  argsText: string;
  status: 'running' | 'done' | 'failed';
  /** 工具真实输出（tool 结果消息的 content） */
  output: string;
  /** 耗时 ms（tool 结果时间 - 发起时间）；未知为 null */
  durationMs: number | null;
  /** 输出/参数里出现确认要求（生产连接二次确认等） */
  needConfirm: boolean;
}

/**
 * 窗口（会话）模型。
 * 每个窗口 = (连接, 视图) 且持有**独立**的终端会话 / 容器列表 / SQL 状态 / 对话会话，
 * 因此同一个连接可以多开且互不干扰。同一连接 + 同一视图的窗口默认复用（activate），
 * 需要再开一个走「新窗口」入口。
 */
export interface OpsWin {
  id: string;
  connectionId: string;
  view: ViewKey;
  // 终端
  termOpen: boolean;
  termConnecting: boolean;
  /** 本次会话正在被录制（服务端在 ready 帧里告知；录制默认开启） */
  termRecording: boolean;
  pendingInput: string;
  lastCommands: string[];
  outputBuffer: string;
  /**
   * 远端 shell 的当前目录（从提示符解析，字符串为空 = 未知）。
   * ★ 与服务端 SFTP 的路径、连接配置里的目录**不是一回事**：用户 `cd` 后服务端无从得知，
   *   只能靠 shell 自己打出来的提示符（见 remote-cwd.ts）。
   */
  remoteCwd: string;
  /**
   * 目录 popover 开着时当前目录的子目录清单（SFTP list 拉的，仅前端状态，不落库）。
   * 2026-10-23 实报「这些目录要列出来啊」：目录 popover 要能看/点进当前目录下的子目录。
   */
  cwdSubdirs: string[];
  // 容器
  containers: DockerRow[];
  containersError: string;
  // 数据库
  dbTables: string[];
  dbTable: string;
  dbSql: string;
  dbLoading: boolean;
  dbError: string;
  dbResult: DbResult | null;
  // 对话（窗口独立会话）
  conversationId: string;
  chatMessages: OpsMsg[];
  chatInput: string;
  chatStreaming: boolean;
  /** 命令模式底部折叠对话条是否展开（任务 7.8；与 AI 模式共用同一份会话） */
  cmdChatOpen: boolean;
  /**
   * 本会话（窗口）内选定的模型 id；空 = 跟随设置里的默认模型（零迁移）。
   * 只存在窗口状态里，不落库 —— 窗口本来就是会话态，切连接/重开回到默认。
   */
  modelId?: string;
  /**
   * 本窗口绑定的发布项目（7b）。会话侧另存 release_project_id；
   * 这里保留一份对象用于拼对话上下文，避免每次发送都回查。
   */
  releaseProject?: ReleaseProject;
  /**
   * 输入框提交模式：agent=AI 对话 / exec=直接写终端 / background=后台 AI 任务。
   * 空 = agent（零迁移）；`/` 前缀始终按直接执行处理。
   */
  chatMode?: 'agent' | 'exec' | 'background';
}

/**
 * 终端传输通道。两种实现：
 *   - WebSocket（首选）：二进制帧走 PTY I/O，文本帧走控制消息（resize）。
 *   - SSE + POST（回退）：SSE 收输出、POST 送按键 —— 给 WS 被代理拦掉的部署场景兜底。
 * 把差异收在这一个接口后面，xterm 侧的接线只有一份。
 */
export interface TermTransport {
  /** 发送按键（原始文本，含控制字符） */
  send(data: string): void;
  /** 上报 PTY 尺寸 */
  resize(cols: number, rows: number): void;
  /**
   * 直接执行一条命令（P1）：写进当前 PTY 并回车，不经过模型。
   * 服务端做黑名单 / 生产非只读确认；确认流程抛出的错误带 code='NEED_CONFIRM'。
   */
  exec(command: string, opts?: { confirmed?: boolean }): Promise<void>;
  /** 关闭通道与服务端 PTY */
  close(): void;
}

export interface TermHandle {
  term: Terminal;
  fitAddon: FitAddon;
  /** 当前传输通道；终端未连上时为 null */
  transport: TermTransport | null;
  ro: ResizeObserver | null;
  timer: number | null;
  /** 已排队但还没跑的那一帧 fit（同一帧内的多次 RO 通知合并成一次；见 OpsConsole 的 watchTermSize） */
  fitFrame: number | null;
  sent: { cols: number; rows: number };
  el: HTMLElement;
}

export const TYPE_LABELS: Record<ConnType, string> = { ssh: 'SSH', docker: 'Docker', database: '数据库' };
export const VIEW_LABEL: Record<ViewKey, string> = {
  term: '命令模式', container: '容器', db: '数据查询', chat: '对话模式',
};
/** 每种连接类型的默认主视图 */
export const PRIMARY_VIEW: Record<ConnType, ViewKey> = { ssh: 'term', docker: 'container', database: 'db' };
/** 每种连接类型可切换的视图（主视图 + 对话模式） */
export const TYPE_VIEWS: Record<ConnType, ViewKey[]> = {
  ssh: ['term', 'chat'],
  docker: ['container', 'chat'],
  database: ['db', 'chat'],
};

/** 从窗口消息推导执行步骤：assistant.toolCalls 发起 → role=tool 消息回填输出 */
/** 单步投影（buildSteps 与 buildOpsRounds 共用同一口径，避免两套"是否失败"判定漂移） */
function makeStep(index: number, tc: OpsToolCall, result: OpsMsg | undefined, startedAt: number): OpsStep {
  const raw = result?.content || '';
  const failed = /^(执行失败|错误|Error)/i.test(raw.trim()) || /失败[:：]/.test(raw.slice(0, 80));
  return {
    index,
    callId: tc.id,
    toolName: tc.name || 'tool',
    argsText: tc.arguments || '',
    status: result ? (failed ? 'failed' : 'done') : 'running',
    output: raw,
    durationMs: result && result.createdAt && startedAt ? Math.max(0, result.createdAt - startedAt) : null,
    needConfirm: /确认|confirmed/i.test(raw) || /确认|confirmed/i.test(tc.arguments || ''),
  };
}

export function buildSteps(messages: OpsMsg[]): OpsStep[] {
  const out: OpsStep[] = [];
  for (const m of messages) {
    if (m.role !== 'assistant' || !m.toolCalls?.length) continue;
    for (const tc of m.toolCalls) {
      const result = messages.find((r) => r.role === 'tool' && r.toolCallId === tc.id);
      out.push(makeStep(out.length + 1, tc, result, m.createdAt));
    }
  }
  return out;
}

/**
 * 只取**最后一轮**（最后一条 user 消息之后）的步骤。
 *
 * 为什么（2026-10-21 用户实报「最后面还有工具调用详情」）：会话里历史各轮的步骤
 * 被 buildSteps 全量摊平堆在消息列表末尾，聊几轮之后底部就挂着几十张早就过期的卡，
 * 和当前这句指令毫无关系。执行过程属于「那一轮」，应当贴在该轮助手回复附近，
 * 而不是在列表尾部无限累加。历史轮的步骤仍可在「操作日志」里查。
 */
export function buildRoundSteps(messages: OpsMsg[]): OpsStep[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return buildSteps(messages.slice(i + 1));
  }
  return buildSteps(messages);
}

/**
 * 把平铺的消息组装成「轮」：每轮 = 用户一句话 + 该轮的思考 / 工具 / 最终回复。
 *
 * 规则（与主对话的 MessageRound 语义对齐，但数据源是消息表而非流事件）：
 *   - 以 user 消息为切分点，user 之后的所有 assistant/tool 归入该轮；
 *   - 轮内**所有** assistant 的 reasoning 按顺序拼接（模型可能多步推理）；
 *   - 工具步骤按 assistant.toolCalls 的调用顺序收集，结果从 role=tool 回填；
 *   - answer 取**最后一条非空** assistant 正文：中间轮次里模型常有"我来看一下…"这类过渡句，
 *     拼起来会变成一坨；只留最终答复，过渡句归到思考区（见 collectNarration）；
 *   - 连续多轮之间按发生顺序返回；开头没有 user 的孤立消息单独成轮（恢复不完整的历史会话）。
 */
export function buildOpsRounds(messages: OpsMsg[]): OpsRound[] {
  const rounds: OpsRound[] = [];
  let cur: OpsRound | null = null;
  /** 工具结果索引（toolCallId → 结果消息），一次建表避免每步全表 find（O(n²)） */
  const resultByCall = new Map<string, OpsMsg>();
  for (const m of messages) {
    if (m.role === 'tool' && m.toolCallId) resultByCall.set(m.toolCallId, m);
  }

  const flush = () => {
    if (!cur) return;
    const hasAny = cur.user || cur.reasoning || cur.steps.length || cur.answer;
    if (hasAny) rounds.push(cur);
    cur = null;
  };
  const ensure = (): OpsRound => {
    if (!cur) {
      cur = { reasoning: '', steps: [], answer: '', liveNarration: '', streaming: false, execs: [], createdAt: 0 };
    }
    return cur;
  };

  for (const m of messages) {
    if (m.role === 'user') {
      flush();
      cur = {
        user: m,
        reasoning: '',
        steps: [],
        answer: '',
        liveNarration: '',
        streaming: false,
        execs: [],
        createdAt: m.createdAt || 0,
      };
      continue;
    }
    const r = ensure();
    if (r.createdAt === 0 && m.createdAt) r.createdAt = m.createdAt;
    if (m.streaming) r.streaming = true;

    // 用户直接执行的命令块：独立收集，不参与 answer / reasoning 的判定
    if (m.role === 'assistant' && m.exec) {
      r.execs.push({ command: execCommandOf(m), output: m.content || '', streaming: !!m.streaming });
      continue;
    }
    if (m.role === 'assistant') {
      if (m.reasoning && m.reasoning.trim()) {
        r.reasoning += (r.reasoning ? '\n\n' : '') + m.reasoning.trim();
      }
      const text = (m.content || '').trim();
      if (text) {
        // 带工具调用的正文 = 过渡叙述（"我先看下目录…"）→ 一律归思考区；
        // 无工具调用的正文 = 最终答复 → 后到的覆盖先到的。
        // 流式期"只有过渡句"的情况由 UI 兜底：answer 为空但有 liveNarration 时照常显示，
        // 避免思考区默认收起导致画面空白（见 OpsRound.liveNarration）。
        if (m.toolCalls?.length) {
          r.reasoning = r.reasoning ? `${text}\n\n${r.reasoning}` : text;
          r.liveNarration = text;
        } else {
          r.answer = text;
          r.liveNarration = '';
        }
      }
      for (const tc of m.toolCalls || []) {
        r.steps.push(makeStep(r.steps.length + 1, tc, resultByCall.get(tc.id), m.createdAt));
      }
    }
  }
  flush();
  return rounds;
}

// ===== 跨路由切换保留的会话状态 =====
export const opsWindows = ref<OpsWin[]>([]);
export const opsActiveWinId = ref('');
/** 「文件」面板开关：与具体连接无关的**整体设置**，放最上面一行，所有窗口共用 */
export const opsFilePanelOpen = ref(false);
export const opsTerms = new Map<string, TermHandle>();
export const opsChatAborts = new Map<string, AbortController>();
/**
 * 窗口 → 服务端任务 id。停止时必须直接按 id 终止 —— 只靠 `/llm/tasks/active`
 * 反查在「刚提交、active 还没落表」或请求失败时会把任务留在服务端继续跑。
 */
export const opsChatTasks = new Map<string, string>();
// 资源树数据也留着：切回来时组件先渲染旧数据（否则 tab 上的连接名会短暂变成「连接已删除」），
// init() 随后照常刷新。
export const opsGroups = ref<OpsGroup[]>([]);
export const opsConnections = ref<OpsConn[]>([]);
export const opsCollapsedGroups = ref(new Set<string>());
