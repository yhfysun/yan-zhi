// 运行平台门控：区分 desktop / web / mobile 三端
// 注意：与 useIsMobile（基于 viewport 宽度的断点判断）语义不同，二者互补，请勿合并。
import type { RuntimePlatform } from '@yan-zhi/shared';
import { getPlatformAdapter } from '@yan-zhi/core';

// 延迟解析：本模块在 import 阶段就会被加载（早于入口 setPlatformAdapter 调用），
// 若在模块顶层立即解析会误判回退到 "web"。改为在 usePlatform() 调用时解析——
// 此时组件 setup 已在 app.mount 之后执行，适配器必定就绪。
function resolvePlatform(): RuntimePlatform {
  try {
    return getPlatformAdapter().platform;
  } catch (e) {
    // 适配器尚未初始化（理论上 setup 阶段已就绪；此处兜底防崩溃）
    console.warn('[usePlatform] PlatformAdapter 未初始化，回退到 "web"', e);
    return 'web';
  }
}

export function usePlatform() {
  const platform = resolvePlatform();
  return {
    platform,
    isDesktop: platform === 'desktop',
    isWeb: platform === 'web',
    isMobile: platform === 'mobile',
  };
}
