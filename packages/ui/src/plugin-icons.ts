// 插件图标解析：将清单中的图标名（lucide 命名）映射为组件
import { GitBranch, Palette, LayoutGrid, Puzzle, FolderOpen, Settings as SettingsIcon } from 'lucide-vue-next';

const map: Record<string, unknown> = {
  GitBranch,
  Palette,
  LayoutGrid,
  Puzzle,
  FolderOpen,
  Settings: SettingsIcon,
};

/** 按图标名解析为组件，未登记回退拼图图标 */
export function resolvePluginIcon(name: string): unknown {
  return map[name] || Puzzle;
}