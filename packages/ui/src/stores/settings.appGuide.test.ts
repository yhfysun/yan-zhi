import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, 'settings.ts'), 'utf8');

describe('内置应用使用说明', () => {
  it('覆盖当前产品主线和授权边界', () => {
    for (const name of [
      '应用简介',
      '多模式工作台',
      '会话与聊天',
      '模型平台、本地模型与候选池',
      '知识库与内置应用说明',
      '五维记忆',
      '智能体、Skill、工具与 MCP',
      '学习模式与图书馆',
      '授权与许可',
      '常见问题与排查',
    ]) {
      expect(SOURCE).toContain(`name: '${name}'`);
    }
    expect(SOURCE).toContain('桌面端提供办公、开发、运维、安全、工作流、自动化、剪辑、店铺运营、学习九个内置模式');
    expect(SOURCE).toContain('移动端收敛为办公、店铺、运维、安全、学习五个模式');
    expect(SOURCE).toContain('YAN-ZHI 商业授权协议');
    expect(SOURCE).not.toContain('应用自动沉淀三层记忆');
  });

  it('旧设置会按说明版本迁移，system prompt 不再长期注入旧说明', () => {
    expect(SOURCE).toContain('appGuideVersion: number');
    expect(SOURCE).toContain("const guideNeedsMigration = Number(parsed.appGuideVersion) !== APP_GUIDE_VERSION");
    expect(SOURCE).toContain('settings.value.appGuide = DEFAULT_APP_GUIDE');
    expect(SOURCE).toContain('settings.value.appGuideVersion = APP_GUIDE_VERSION');
  });
});
