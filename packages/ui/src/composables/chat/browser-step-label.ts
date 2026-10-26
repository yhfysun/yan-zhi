/**
 * 浏览器工具 → 一句人话（实况条 / 步骤日志展示用）。
 *
 * 参考 AgentScope 客户端 `agent-history-cards.ts` 的 `toolExecutingText`：
 * 状态条不能只说「执行中」，要能说「正在点击「发布」」「正在输入「标题」」，
 * 用户才看得出 agent 到底在动哪块、动的是不是自己不想让它动的地方。
 *
 * 只做展示：任何未知工具/畸形参数都退化成通用文案，绝不抛错。
 */
export function describeBrowserAction(toolName: string, args?: Record<string, unknown> | null): string {
  // 兼容 `browser_navigate(openInNewTab)` 这类带后缀的内部动作名
  const name = String(toolName || '').replace(/^browser_/, '').split('(')[0];
  const a = (args || {}) as Record<string, unknown>;

  const cut = (v: unknown, max = 14): string => {
    const s = String(v ?? '').replace(/\s+/g, ' ').trim();
    return s.length > max ? `${s.slice(0, max)}…` : s;
  };
  const target = cut(a.text ?? a.label ?? a.name ?? a.selector ?? a.index);

  switch (name) {
    case 'navigate': return a.url ? `打开 ${shortHost(String(a.url))}` : '打开网页';
    case 'click': return target ? `点击「${target}」` : '点击';
    case 'type':
    case 'fill':
      return a.text != null ? `输入「${cut(a.text, 16)}」` : '输入';
    case 'fill_form':
      return Array.isArray(a.fields) ? `填写表单 ${a.fields.length} 项` : '填写表单';
    case 'press':
    case 'press_key':
      return a.key ? `按键 ${cut(a.key, 10)}` : '按键';
    case 'select_option': return target ? `选择「${target}」` : '选择选项';
    case 'check': return '勾选';
    case 'uncheck': return '取消勾选';
    case 'submit_form': return '提交表单';
    case 'search': return a.query ? `搜索「${cut(a.query, 12)}」` : '搜索';
    case 'scroll': return a.dy != null ? `滚动${Number(a.dy) < 0 ? '↑' : '↓'}` : '滚动页面';
    case 'hover': return target ? `悬停「${target}」` : '悬停';
    case 'wait':
    case 'wait_for':
      return a.seconds != null ? `等待 ${a.seconds}s` : '等待页面';
    case 'screenshot': return '截图';
    case 'get_page_info':
    case 'get_page_content':
    case 'get_dom':
      return '读取页面';
    case 'upload': return '上传文件';
    case 'run_script': return '执行页面脚本';
    case 'new_tab': return '打开新标签';
    case 'close_tab': return '关闭标签';
    case 'switch_tab': return '切换标签';
    case 'list_tabs': return '查看标签';
    case 'back': return '后退';
    case 'forward': return '前进';
    case 'reload': return '刷新页面';
    case 'drag': return '拖拽';
    default: return '浏览器操作';
  }
}

/** 只留主机名：状态条空间有限，「打开 creator.douyin.com」比整条 URL 有用得多 */
function shortHost(raw: string): string {
  const s = raw.trim();
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
    return cutText(u.hostname || s, 24);
  } catch {
    return cutText(s.replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0], 24);
  }
}

function cutText(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
