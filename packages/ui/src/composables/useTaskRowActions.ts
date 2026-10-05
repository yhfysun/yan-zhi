// 任务行共享操作逻辑 —— 办公侧栏（ChatSidebar）与四模式工作台任务段（TaskListSection）共用。
//
// 背景（upgrade-ui-task-mobile Task 2.1）：置顶 / 重命名 / 删除 / 移动空间 / 打开激活
// 这五类行内操作此前散在两套组件的模板与脚本里各自实现，交互口径逐渐漂移；这里收敛为一处。
//
// ★ 分层约定：
//   · 底层状态与动作仍来自 useChat 单例（不另起一套数据逻辑，TaskListSection 注释里
//     「复用 useChat 的同一份状态与动作」的口径不变）；
//   · 本层按「任务对象」抽象：两列表数据源形态不同（空间树 vs 平铺分组），
//     但行上拿到的都是同一份 Conversation，方法签名统一收 Conversation；
//   · DOM 层差异（重命名输入框怎么聚焦）由调用方通过 focusRenameInput 注入适配，
//     useChat 的 renameInputRef 只被办公侧栏绑定，TaskListSection 靠选择器查找。
import { nextTick, reactive } from 'vue';
import type { Conversation } from '@yan-zhi/shared';
import { useChat } from './chat/useChat';
import { useChatStore } from '../stores/chat';
import { clampMenuPos } from '../utils/menuPosition';

export interface UseTaskRowActionsOptions {
  /**
   * 重命名输入框聚焦适配：两列表 DOM 结构不同，各自定位自己的输入框。
   * 不注入时仅走 useChat 内置的 renameInputRef 聚焦（办公侧栏够用）。
   */
  focusRenameInput?: () => void;
}

/** 重命名输入校验：去首尾空白后非空才有效；返回归一化标题，非法返回 null */
export function normalizeRenameTitle(raw: string): string | null {
  const title = raw.trim();
  return title ? title : null;
}

export function useTaskRowActions(options: UseTaskRowActionsOptions = {}) {
  const chat = useChat();
  const chatStore = useChatStore();

  /** 行尾 hover 按钮 / 右键菜单：置顶（已置顶则取消） */
  function togglePinned(task: Conversation | null) {
    void chat.togglePin(task);
  }

  /** 进入重命名编辑态（useChat 内会关浮层；聚焦适配在此追加） */
  function startRename(task: Conversation) {
    chat.startRename(task);
    const focus = options.focusRenameInput;
    if (focus) void nextTick(focus);
  }

  /** 提交重命名（含输入校验：空白标题不落库，直接收起编辑框） */
  async function commitRename() {
    if (!normalizeRenameTitle(chat.renamingTitle.value)) {
      chat.renamingId.value = '';
      return;
    }
    await chat.commitRename();
  }

  /** 取消重命名（ESC） */
  function cancelRename() {
    chat.renamingId.value = '';
  }

  /** 删除任务（useChat 内含确认弹窗） */
  function remove(task: Conversation | null) {
    void chat.deleteConv(task);
  }

  /** 移动到空间（spaceId=null 即移出为「未归类」），顺带收起共享右键菜单 */
  function moveTo(task: Conversation | null, spaceId: string | null) {
    if (!task) return;
    chat.closeCtxMenu();
    void chat.moveConvToSpace(task.id, spaceId);
  }

  // ===== 行内 hover「移动」按钮的空间选择浮层（upgrade-ui-task-mobile checklist ①） =====
  // 右键/长按菜单的「移动到空间」是二级子菜单；行内按钮没有宿主菜单项，
  // 故在按钮位置弹一个只含空间列表的同款浮层（.ctx-menu 皮肤），选定后走同一 moveTo。
  const moveMenu = reactive<{ visible: boolean; x: number; y: number; conv: Conversation | null }>({
    visible: false, x: 0, y: 0, conv: null,
  });

  /** 行内操作组「移动」入口：在点击位置弹空间选择浮层（触屏无 hover，仍走长按面板） */
  function openMoveMenu(task: Conversation, e: MouseEvent) {
    const p = clampMenuPos(e);
    moveMenu.x = p.x;
    moveMenu.y = p.y;
    moveMenu.conv = task;
    moveMenu.visible = true;
  }

  function closeMoveMenu() {
    moveMenu.visible = false;
  }

  /** 浮层里选定目标空间：与右键菜单「移动到空间」同一 moveTo 流程 */
  function pickMoveTarget(spaceId: string | null) {
    const task = moveMenu.conv;
    moveMenu.visible = false;
    moveTo(task, spaceId);
  }

  /** 打开/激活任务：触屏抽屉态顺带收起；已是当前任务则不重复加载 */
  function activate(task: Conversation | null) {
    if (!task) return;
    chat.drawerOpen.value = false;
    if (task.id !== chatStore.currentConvId) void chat.selectConv(task.id);
  }

  return {
    /** 当前重命名中的任务 id / 标题（模板渲染编辑框用，与 useChat 同一份 ref） */
    renamingId: chat.renamingId,
    renamingTitle: chat.renamingTitle,
    togglePinned,
    startRename,
    commitRename,
    cancelRename,
    remove,
    moveTo,
    /** 行内「移动」按钮的空间选择浮层状态与动作（模板 Teleport 渲染用） */
    moveMenu,
    openMoveMenu,
    closeMoveMenu,
    pickMoveTarget,
    activate,
  };
}

export default useTaskRowActions;
