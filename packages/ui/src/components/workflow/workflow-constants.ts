// 工作流工具的共享常量（前后端各有一份，值必须一致）。
//
// 为什么 UI 侧也要有一份：勾选上限需要在用户点击时立刻反馈，等后端 400 再提示体验太差。
// 后端权威值在 apps/server/src/services/workflow-tool-registry.ts，改动时两处同步。
export const MAX_WF_TOOLS_PER_CONVERSATION = 8;