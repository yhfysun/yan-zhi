import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, 'Settings.vue'), 'utf8');
const ROUTER = readFileSync(resolve(__dirname, '../router/index.ts'), 'utf8');
const APP = readFileSync(resolve(__dirname, '../App.vue'), 'utf8');
const SIDE_NAV = readFileSync(resolve(__dirname, '../components/SideNav.vue'), 'utf8');
const MODELS = readFileSync(resolve(__dirname, 'Models.vue'), 'utf8');
const MOBILE_MAIN = readFileSync(resolve(__dirname, '../../../../apps/mobile/src/main.ts'), 'utf8');
const AGENTS = readFileSync(resolve(__dirname, 'Agents.vue'), 'utf8');
const SKILL_MARKET = readFileSync(resolve(__dirname, 'skill-market/LocalSkillMarket.vue'), 'utf8');
const PLATFORM_DETAIL = readFileSync(resolve(__dirname, 'PlatformDetail.vue'), 'utf8');

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
      /function\s+openMobileSettingLink\([^)]*\)\s*\{[\s\S]*?router\.push\(\{[\s\S]*?path:\s*link\.path/,
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

  it('管理页声明为移动设置子页，使用返回顶栏且底栏归属“我的”', () => {
    expect(ROUTER).toMatch(/path: '\/models'[\s\S]{0,140}mobileSettingsChild: true/);
    expect(ROUTER).toMatch(/path: '\/agents'[\s\S]{0,140}mobileSettingsChild: true/);
    expect(ROUTER).toMatch(/path: '\/skills\/:id'[\s\S]{0,140}mobileSettingsChild: true/);
    expect(APP).toContain('isMobileSettingsChild');
    expect(APP).toContain('aria-label="返回设置"');
    expect(APP).toContain('.platform-mobile.is-mobile-settings-child .page-frame > .pf-header .pf-heading');
    expect(APP, '设置子页不能连 PageFrame 操作按钮一起隐藏')
      .toContain('.page-frame > .pf-header:not(:has(.pf-actions))');
    expect(SIDE_NAV).toMatch(/isActive\('\/settings'\) \|\| settingsChildActive/);
  });

  it('设置子页返回恢复“模型与智能”，并接入 Android 系统返回', () => {
    expect(SOURCE).toMatch(/query:\s*\{\s*from:\s*'settings',\s*group:\s*'intelligence'\s*\}/);
    expect(SOURCE).toContain("document.addEventListener('yz:mobile-back'");
    expect(APP).toMatch(/appRouter\.replace\(\{[\s\S]{0,160}query:\s*group\s*\?/);
    expect(MOBILE_MAIN).toContain('current.meta?.mobileSettingsChild');
    expect(MOBILE_MAIN).toContain("new CustomEvent('yz:mobile-back', { cancelable: true })");
    expect(MOBILE_MAIN).toContain('再滑动或按一次返回退出应用');
  });

  it('模型卡片操作在移动端收为 3×2 等宽网格，不再退化成零散换行', () => {
    expect(MODELS).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.card-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    );
  });

  it('移动端下拉浮层必须高于 Dialog 遮罩', () => {
    expect(APP).toMatch(
      /\.platform-mobile\s+\.el-select__popper\s*\{[\s\S]*?z-index:\s*10050\s*!important/,
    );
  });

  it('移动端模型类型不用悬浮下拉，改为可见按钮组', () => {
    expect(PLATFORM_DETAIL).toContain('class="model-type-grid"');
    expect(PLATFORM_DETAIL).toContain('@click="form.type = option.value"');
    expect(PLATFORM_DETAIL).toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  });

  it('设置子页不重复返回区，新增按钮在移动端只显示图标', () => {
    expect(APP).toContain(
      '.platform-mobile.is-mobile-settings-child .page-frame > .pf-header .pf-heading',
    );
    expect(APP).toMatch(/\.platform-mobile\s+\.el-button\.fab-add\s*\{[\s\S]*?font-size:\s*0/);
    expect(APP).toMatch(/\.fab-add\s+\.fab-add-label\s*\{\s*display:\s*none/);
    for (const source of [AGENTS, SKILL_MARKET]) {
      expect(source).toContain('class="fab-add"');
      expect(source).toContain('class="fab-add-label"');
      expect(source).toMatch(/aria-label="(?:新建智能体|新增 Skill)"/);
    }
  });
});
