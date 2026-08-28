// 运行时服务端状态（进程内存）。UI 选定工作目录后通过 /api/workspace/dir 推送到这里，
// 供 cmd_exec / listWorkspaceDir / searchWorkspaceFiles 作为默认 cwd 兜底使用。
export const serverState = {
  workspaceDir: '' as string,
};
