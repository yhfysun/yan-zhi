// 工作台 → 底部状态栏的「当前上下文」回填口
//
// 状态栏第二项要回答「我现在在哪个上下文里干活」，但每个模式的口径不一样：
// 办公=工作区目录、开发=项目目录、店铺=当前会话（项目），
// 而运维/安全/工作流/剪辑的当前项只活在各自工作台内部（局部 ref 或模块级会话）。
// 那些就地计算不出来的，由工作台在自己的状态变化时回填到这里（模式 key → 一项），
// 状态栏只认这一份，不反向去 import 各插件的内部状态。
//
// ★ 不做清理：这些值描述的是「该模式上一次的当前项」，只有切到那个模式时才被读；
//   页面没挂载过就说不知道（null），状态栏据此整项不渲染，而不是硬凑一个假值。
import { reactive } from 'vue';

export interface WorkbenchContext {
  label: string;
  value: string;
}

const registry = reactive<Record<string, WorkbenchContext | null>>({});

export function setWorkbenchContext(mode: string, ctx: WorkbenchContext | null): void {
  registry[mode] = ctx;
}

export function workbenchContextOf(mode: string): WorkbenchContext | null {
  return registry[mode] ?? null;
}
