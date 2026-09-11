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
import type { OpsConn } from './OpsConnectionDialog.vue';

export type ViewKey = 'term' | 'container' | 'db' | 'chat';
export type ConnType = 'ssh' | 'docker' | 'database';
export interface OpsGroup { id: string; name: string; createdAt: number }
export interface DockerRow { Id?: string; Names?: string; Image?: string; State?: string; Status?: string; [k: string]: unknown }
export interface DbResult { rows: Record<string, unknown>[]; fields: string[]; truncated?: boolean }
export interface OpsMsg {
  id: string;
  role: 'user' | 'assistant' | string;
  content: string;
  subAgentName?: string | null;
  streaming?: boolean;
  createdAt: number;
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
  termSessionId: string;
  termOpen: boolean;
  termConnecting: boolean;
  pendingInput: string;
  lastCommands: string[];
  outputBuffer: string;
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
}

export interface TermHandle {
  term: Terminal;
  fitAddon: FitAddon;
  stream: AbortController | null;
  ro: ResizeObserver | null;
  timer: number | null;
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

// ===== 跨路由切换保留的会话状态 =====
export const opsWindows = ref<OpsWin[]>([]);
export const opsActiveWinId = ref('');
/** 「文件」面板开关：与具体连接无关的**整体设置**，放最上面一行，所有窗口共用 */
export const opsFilePanelOpen = ref(false);
export const opsTerms = new Map<string, TermHandle>();
export const opsChatAborts = new Map<string, AbortController>();
// 资源树数据也留着：切回来时组件先渲染旧数据（否则 tab 上的连接名会短暂变成「连接已删除」），
// init() 随后照常刷新。
export const opsGroups = ref<OpsGroup[]>([]);
export const opsConnections = ref<OpsConn[]>([]);
export const opsCollapsedGroups = ref(new Set<string>());
