/**
 * 全局 Ctrl/Cmd+A「全选」作用域限制。
 *
 * 问题：浏览器默认 Ctrl+A 全选整个 document——在弹窗/抽屉/浮层里按 Ctrl+A，
 * 会把弹窗底下的整个应用界面一起选中，再 Ctrl+C 就把"全应用"都复制走了。
 *
 * 方案：document 捕获阶段拦截 Ctrl/Cmd+A，按事件目标向上找最近的"作用域容器"：
 *   1. Element Plus 浮层（dialog/drawer/message-box/popper——含 popover、下拉面板）
 *   2. 终端面板（OpsConsole 的 .ops-term xterm 容器）
 *   3. 主内容区 .main-content（当前路由页面，排除侧栏/标题栏）
 * 命中容器就只选中容器内容并 preventDefault；没命中（如焦点在 body 上）保持默认行为。
 *
 * 注意：
 * - 可编辑区域（input/textarea/contenteditable）不拦截，交给原生全选（CodeMirror/xterm
 *   的隐藏 textarea 也是 editable，天然绕开，不影响它们自己的快捷键）。
 * - <webview>/BrowserView 里网页的键盘事件走各自 webContents，根本不会到这份文档，天然隔离。
 * - capture 阶段注册，先于页面内任何组件的 keydown 处理。
 */

/** 作用域容器选择器：从内到外无所谓，closest() 永远返回离目标最近的那个（天然支持嵌套浮层） */
const SCOPE_SELECTORS = [
  '.el-dialog',
  '.el-drawer',
  '.el-message-box',
  '.el-popper',
  '.ops-term',
  '.main-content',
].join(',');

/** 目标是否在可编辑元素里（原生 select-all 语义正确，不劫持） */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea')) return true;
  // contenteditable="true" / "plaintext-only" 视为可编辑；"" / "false" 不算
  const ce = target.closest('[contenteditable]');
  if (ce) {
    const v = ce.getAttribute('contenteditable');
    return v === 'true' || v === 'plaintext-only';
  }
  return false;
}

/** 把选中范围限定到容器内容 */
function selectNodeContents(container: Element): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(container);
  sel.removeAllRanges();
  sel.addRange(range);
}

function onKeyDown(e: KeyboardEvent): void {
  // 只管 Ctrl+A / Cmd+A；别的组合或已被阻止的事件不碰
  if (!((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A'))) return;
  if (e.altKey || e.shiftKey || e.defaultPrevented) return;
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (isEditableTarget(target)) return;

  const container = target.closest(SCOPE_SELECTORS);
  if (!container) return; // 焦点在容器外（body 等）→ 保持浏览器默认行为

  e.preventDefault();
  selectNodeContents(container);
}

/** 安装全局 Ctrl+A 作用域限制（幂等；在共享 App.vue 的 onMounted 里调用一次即可） */
export function installSelectAllScope(): void {
  if (typeof document === 'undefined') return;
  const doc = document as Document & { __selectAllScopeInstalled?: boolean };
  if (doc.__selectAllScopeInstalled) return;
  doc.__selectAllScopeInstalled = true;
  document.addEventListener('keydown', onKeyDown, { capture: true });
}
