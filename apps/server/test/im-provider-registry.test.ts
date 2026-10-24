import { describe, it, expect } from 'vitest';
import { imProviders, ImProviderRegistry } from '../src/services/im/index';
import { feishuProvider } from '../src/services/im/providers/feishu';
import { wechatPersonalProvider } from '../src/services/im/providers/wechat-personal';

describe('ImProviderRegistry：按平台路由', () => {
  it('★ 四个平台都已注册，且能按 provider 取到实现', () => {
    expect(imProviders.platforms().sort()).toEqual(
      ['dingtalk', 'feishu', 'wechat', 'wechat-personal'].sort(),
    );
    for (const platform of imProviders.platforms()) {
      const provider = imProviders.require(platform);
      expect(provider.platform).toBe(platform);
      expect(typeof provider.send).toBe('function');
      expect(typeof provider.test).toBe('function');
    }
  });

  it('★ 未注册的平台抛「不支持的 provider」（沿用原有错误文案）', () => {
    expect(() => imProviders.require('telegram')).toThrow('不支持的 provider');
  });

  it('★ 重复注册同一平台立即失败，避免实现互相覆盖', () => {
    expect(() => new ImProviderRegistry([feishuProvider, feishuProvider])).toThrow(
      /重复注册: feishu/,
    );
  });
});

describe('平台能力声明：发消息时的展示身份', () => {
  it('★ 飞书/企微/钉钉是应用身份，个人微信是用户本人身份', () => {
    expect(imProviders.require('feishu').capabilities.sendingMode).toBe('APP_PROXY');
    expect(imProviders.require('wechat').capabilities.sendingMode).toBe('APP_PROXY');
    expect(imProviders.require('dingtalk').capabilities.sendingMode).toBe('APP_PROXY');
    expect(imProviders.require('wechat-personal').capabilities.sendingMode).toBe('USER_NATIVE');
  });

  it('★ 钉钉暂不支持文件，其余平台支持', () => {
    expect(imProviders.require('dingtalk').capabilities.supportsFile).toBe(false);
    expect(imProviders.require('feishu').capabilities.supportsFile).toBe(true);
    expect(imProviders.require('wechat').capabilities.supportsFile).toBe(true);
    expect(wechatPersonalProvider.capabilities.supportsFile).toBe(true);
  });
});
