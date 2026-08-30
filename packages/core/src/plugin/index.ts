// 插件系统入口与单例
export * from './types';
export * from './registry';
export * from './permissions';
export * from './manifest';
export * from './api';
export * from './loader';
export * from './manager';

import { PluginManager } from './manager';
import type { PlatformAdapter } from '../platform/types';

let _mgr: PluginManager | null = null;

/** 获取插件管理器单例（首次需传入 adapter 初始化） */
export function getPluginManager(adapter?: PlatformAdapter): PluginManager {
  if (!_mgr && adapter) _mgr = new PluginManager(adapter);
  if (!_mgr) throw new Error('PluginManager 未初始化，请先传入 adapter');
  return _mgr;
}

/** 重置单例（测试用） */
export function resetPluginManager(): void {
  _mgr = null;
}