import type { ImPlatform, ImProvider } from './types.js';

/**
 * 按平台索引 IM Provider。新增平台只注册实现，工具与编排层不用改。
 * 重复注册同一平台直接失败，避免同名实现互相覆盖导致发错平台。
 */
export class ImProviderRegistry {
  private readonly providers = new Map<ImPlatform, ImProvider>();

  constructor(providers: ImProvider[] = []) {
    for (const provider of providers) this.register(provider);
  }

  register(provider: ImProvider): void {
    if (this.providers.has(provider.platform)) {
      throw new Error(`IM Provider 重复注册: ${provider.platform}`);
    }
    this.providers.set(provider.platform, provider);
  }

  platforms(): ImPlatform[] {
    return [...this.providers.keys()];
  }

  require(platform: string): ImProvider {
    const provider = this.providers.get(platform as ImPlatform);
    if (!provider) throw new Error('不支持的 provider');
    return provider;
  }
}
