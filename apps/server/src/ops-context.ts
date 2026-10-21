/**
 * 运维现场上下文（OpsConsole 对话模式）—— **服务端**组装与注入。
 *
 * ★★★ 为什么放在服务端（2026-10-21 用户指出「应该后端拼接提示词带上吧」）：
 *
 *   旧实现是前端在 sendWinChat 里把
 *     `用户原话 + （当前选定连接…） + （当前终端现场…） + （已绑定发布项目…）`
 *   拼成一整段塞进 userContent 提交。后果是一串连锁问题：
 *     ① 用户消息**入库即脏** —— 数据库里存的是「用户原话 + 一大坨前端内部格式」，
 *        导出/检索/后续会话记忆全被污染；
 *     ② 消息列表直接把 m.content 渲染出来，用户看到自己"说过"一堆没打过的话，
 *        只能在显示层用正则剥离 —— 一旦拼接格式改一个字，剥离就失效，且历史消息永远剥不干净；
 *     ③ 会话越聊越长，每轮都把整份现场重复塞进**用户回合**（真 token 成本，还挤占上下文）。
 *
 *   正确分工：**用户原话只进用户回合（干净入库），现场信息进系统提示词（每轮现算）**。
 *   系统提示词本来就是"每轮重新组装"的，现场天然可以保持最新，且不会污染历史。
 *
 * 取值来源：前端随任务下发 `opsContext`（薄描述，只有 id + 终端尾部若干行），
 *   连接名/主机/类型/发布项目详情**一律服务端按 id 回查** —— 前端传什么就信什么会
 *   导致"显示 A 实际连 B"，且连接改了名字后旧值长期残留。
 */

/** 前端下发的运维上下文（薄描述，不含任何可被伪造的连接详情） */
export interface OpsContextInput {
  /** 当前窗口绑定的连接 id（可为空：用户还没选连接） */
  connectionId?: string | null;
  /** 终端最近执行过的命令（前端已裁到最近几条） */
  recentCommands?: string[];
  /** 终端输出尾部（前端已裁长；这里只做二次截断，防止超长冲垮提示词） */
  terminalTail?: string;
  /** 绑定的发布项目 id（服务端回查详情） */
  releaseProjectId?: string | null;
}

/** 服务端回查连接（由调用方注入，避免本模块直接依赖 db / 插件内部） */
export interface OpsConnectionInfo {
  id: string;
  name: string;
  type?: string;
  host?: string;
  port?: number;
  username?: string;
  tag?: string;
  dbType?: string;
  database?: string;
}

/** 服务端回查发布项目 */
export interface OpsReleaseProjectInfo {
  name: string;
  localDir?: string;
  techStack?: { buildType?: string } | null;
  buildHint?: { command?: string; artifact?: string } | null;
  targets?: Array<{ name: string; connectionId?: string; remotePath?: string; restartScript?: string }>;
}

const TYPE_LABELS: Record<string, string> = { ssh: 'SSH', docker: 'Docker', database: '数据库' };

/** 终端输出尾部上限（字符）：再长对模型无益，只会挤占上下文 */
const TERMINAL_TAIL_MAX = 1200;
/** 最近命令最多带几条 */
const RECENT_CMDS_MAX = 6;

/**
 * 组装「运维现场」段。返回空串 = 没有任何现场信息（不注入）。
 *
 * ★ 输出是**系统提示词的一段**，不是用户消息的附加物 —— 措辞明确告诉模型
 *   "这是环境现场，不是用户说的"，避免模型在回答里复述这些元信息。
 */
export function buildOpsFieldContext(args: {
  input?: OpsContextInput | null;
  connection?: OpsConnectionInfo | null;
  releaseProject?: OpsReleaseProjectInfo | null;
  /** 发布目标里的连接名解析（服务端按 id 查表） */
  resolveConnectionName?: (id: string) => string | undefined;
}): string {
  const { input, connection, releaseProject } = args;
  const lines: string[] = [];

  if (connection) {
    const type = connection.type === 'docker' || connection.type === 'database' ? connection.type : 'ssh';
    const addr = type === 'database'
      ? `${connection.dbType === 'postgres' ? 'PostgreSQL' : 'MySQL'} · ${connection.username || ''}@${connection.host || ''}:${connection.port || ''}/${connection.database || ''}`
      : `${connection.username || ''}@${connection.host || ''}:${connection.port || ''}`;
    lines.push(`- 当前连接：${connection.name}（${TYPE_LABELS[type]}，${addr}${connection.tag ? `，标签 ${connection.tag}` : ''}）`);
    lines.push('  调用 ssh_*/docker_*/db_query/sftp_* 时 connection 参数填上面这个连接名；用户明确指定其他连接时以用户为准。');
  } else if (input && input.connectionId === null) {
    lines.push('- 当前没有选定连接：需要连接名时先 conn_list 查清现有资源，或向用户确认。');
  }

  // 终端现场：只在终端已连接且有内容时才有意义。
  // 截断策略与服务端工具输出同口径（读尾部），因为报错现场永远在最后几行。
  const cmds = (input?.recentCommands || []).filter((c) => c.trim()).slice(-RECENT_CMDS_MAX);
  const tail = (input?.terminalTail || '').replace(/\s+$/g, '');
  if (cmds.length || tail) {
    lines.push('');
    lines.push('### 终端现场（用户 shell 里的真实状态，非用户发言）');
    if (cmds.length) {
      lines.push('最近执行：');
      for (const c of cmds) lines.push('```\n' + c.trim() + '\n```');
    }
    if (tail) {
      const cut = tail.length > TERMINAL_TAIL_MAX ? '…（前略）\n' + tail.slice(-TERMINAL_TAIL_MAX) : tail;
      lines.push('最近输出（尾部）：');
      lines.push('```\n' + cut + '\n```');
    }
    lines.push('用途：判断用户遇到的现场问题（报错、服务状态）时直接利用上面的输出，**不要重复跑同一条命令**确认；现场与你的工具输出冲突时以工具输出为准（终端可能已过时）。');
  }

  if (releaseProject) {
    const p = releaseProject;
    const targets = (p.targets || []).map((t) => {
      const connName = (t.connectionId && args.resolveConnectionName?.(t.connectionId)) || '连接已删除';
      return `  - ${t.name}：${connName}；发布目录 ${t.remotePath || '（未填）'}；重启 ${t.restartScript || '（未填）'}`;
    });
    const build = [
      p.techStack?.buildType ? `技术栈 ${p.techStack.buildType}` : '',
      p.buildHint?.command ? `构建命令 ${p.buildHint.command}` : '',
      p.buildHint?.artifact ? `产物 ${p.buildHint.artifact}` : '',
    ].filter(Boolean).join('；');
    lines.push('');
    lines.push(`### 已绑定的发布项目：${p.name}`);
    if (p.localDir) lines.push(`- 本地目录：${p.localDir}`);
    if (build) lines.push(`- ${build}`);
    if (targets.length) {
      lines.push('- 部署目标：');
      lines.push(...targets);
    }
  }

  if (!lines.length) return '';
  return [
    '## 运维现场',
    '以下是当前运维窗口的环境现场（系统注入，**不是用户说的话**；回答时不要复述这些元信息）：',
    ...lines,
  ].join('\n');
}
