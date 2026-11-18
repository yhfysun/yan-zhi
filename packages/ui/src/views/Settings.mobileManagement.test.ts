import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, 'Settings.vue'), 'utf8');
const ROUTER = readFileSync(resolve(__dirname, '../router/index.ts'), 'utf8');

describe('移动设置 · 模型与智能管理入口', () => {
  it('首层提供模型平台、智能体、Skill 技能入口', () => {
    expect(SOURCE).toContain("key: 'intelligence'");
    expect(SOURCE).toContain("label: '模型与智能'");
    expect(SOURCE).toContain("label: '模型平台'");
    expect(SOURCE).toContain("label: '智能体'");
    expect(SOURCE).toContain("label: 'Skill 技能'");
    expect(SOURCE).toContain("path: '/models'");
    expect(SOURCE).toContain("path: '/agents'");
    expect(SOURCE).toContain("path: '/skills/local'");
  });

  it('入口点击使用路由跳转，不落入设置 tab 的空页', () => {
    expect(SOURCE).toMatch(
      /function\s+openMobileSettingLink\([^)]*\)\s*\{[\s\S]*?router\.push\(link\.path\)/,
    );
    expect(SOURCE).toContain('v-if="!pageShell || !mobileGroup?.links?.length"');
  });

  it('三个管理页面未被 Capacitor 重功能路由名单拦截', () => {
    const blockedStart = ROUTER.indexOf('const MOBILE_BLOCKED_PATHS');
    const blocked = ROUTER.slice(blockedStart, ROUTER.indexOf(']);', blockedStart));
    expect(blocked).not.toContain("'/models'");
    expect(blocked).not.toContain("'/agents'");
    expect(blocked).not.toContain("'/skills'");
  });
});
