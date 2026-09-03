// 桌面端侧栏折叠状态（仅 desktop 语义；web/mobile 不走可折叠侧栏分支）
// 通过模块级 ref 共享同一实例，并在切换时持久化到 localStorage。
import { ref } from 'vue';

// v2：导航重构后（分组 + AI 能力入口）默认展开，旧折叠态不再沿用，避免用户看到"和之前一样"的图标条
const STORAGE_KEY = 'yz:sidenav:collapsed:v2';

// 读取初始值：'1' 表示折叠，其它（含 null / SSR 环境）表示展开
function readInitial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch (e) {
    // SSR 或禁用 localStorage 的环境，回退为展开
    return false;
  }
}

// 模块级单例：跨组件共享同一份折叠状态
const collapsed = ref<boolean>(readInitial());

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed.value ? '1' : '0');
  } catch (e) {
    // 写入失败（隐私模式 / 配额）静默忽略，不影响 UI 行为
  }
}

function toggle() {
  collapsed.value = !collapsed.value;
  persist();
}

export function useSidebarState() {
  return { collapsed, toggle };
}
