/**
 * 本地模型安装面板与路由回归测试（2026-10-22 第三段）。
 *
 * 为什么值得测：
 *   1) **双通道必须共用同一实现** —— UI 的「下载安装」与 AI 的 `install_resource`
 *      如果各写一套，必然出现「UI 装好了、AI 说没装」（或反之）。
 *      本测试断言两者都经由 `INSTALLERS[id].install`。
 *   2) **路由必须挂上** —— 写了 routes/install.ts 但忘记 `app.use`，
 *      UI 会 404，而 TypeScript 不会报错（这是本仓库踩过的经典坑：
 *      写了 case / 写了 schema，忘了登记白名单或注册）。
 *   3) **ACE-Step 的"装了但不可用"必须能显示** —— 权重 8.9GB 齐全、torch 却是
 *      CPU 版时，只显示"已安装"会误导用户；面板要能读到 error 详情并给「修复安装」。
 *   4) **并发保护** —— 8.9GB 被点两次是两个下载线程抢同一批文件。
 *
 * 只做源码级断言，不启动 server（避免占用 3001 端口与真实下载）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const S = path.join(ROOT, 'apps/server/src');
const UI = path.join(ROOT, 'packages/ui/src');

const routeSrc = readFileSync(path.join(S, 'routes/install.ts'), 'utf-8');
const indexSrc = readFileSync(path.join(S, 'index.ts'), 'utf-8');
const regSrc = readFileSync(path.join(S, 'services/installer-registry.ts'), 'utf-8');
const panelPath = path.join(UI, 'components/LocalModelPanel.vue');
const settingsSrc = readFileSync(path.join(UI, 'views/Settings.vue'), 'utf-8');
const dialogSrc = readFileSync(path.join(UI, 'components/SettingsDialog.vue'), 'utf-8');

describe('本地模型面板 · 文件与接线', () => {
  it('面板组件存在', () => {
    expect(existsSync(panelPath)).toBe(true);
  });

  it('路由已挂载到 /api/install（写了文件但忘 app.use 是经典坑）', () => {
    expect(indexSrc).toContain("import installRoutes from './routes/install.js'");
    expect(indexSrc).toContain("app.use('/api/install', installRoutes)");
  });

  it('设置页有对应 tab，且菜单能点到', () => {
    expect(settingsSrc).toContain('name="localmodel"');
    expect(settingsSrc).toContain('LocalModelPanel');
    // 桌面弹窗左导航
    expect(dialogSrc).toContain("pane: 'localmodel'");
  });

  it('移动端分组菜单也收录（否则手机上找不到）', () => {
    expect(settingsSrc).toMatch(/\{ key: 'service'[\s\S]*?name: 'localmodel'/);
  });
});

describe('本地模型面板 · 双通道共用同一实现', () => {
  it('路由层调用 INSTALLERS 的 install（不是自己写下载）', () => {
    expect(routeSrc).toContain('getInstaller');
    expect(routeSrc).toContain('inst.install(');
    // 反向断言：路由里不该出现下载实现细节
    expect(routeSrc).not.toContain('createWriteStream');
    expect(routeSrc).not.toContain("from 'node:fs/promises'");
  });

  it('面板只调 /api/install，不直接碰底层', () => {
    const panel = readFileSync(panelPath, 'utf-8');
    expect(panel).toContain("'/install/list'");
    expect(panel).toContain('/install/${it.id}');
    // 不该绕过路由直连别的安装接口
    expect(panel).not.toContain('/tts-packs');
    expect(panel).not.toContain('/api/ollama');
  });

  it('AI 通道与新路由指向同一份注册表', () => {
    // 工具侧
    expect(regSrc).toContain('export const INSTALLERS');
    // 路由侧
    expect(routeSrc).toContain('INSTALLERS');
    expect(routeSrc).toContain('listInstallers');
  });
});

describe('本地模型面板 · 健壮性', () => {
  it('并发保护：同一资源不允许两个安装线程', () => {
    expect(routeSrc).toContain('inflight');
    expect(routeSrc).toContain('409');
    expect(routeSrc).toContain('正在安装中');
  });

  it('已安装时幂等返回，不重复下载', () => {
    expect(routeSrc).toContain('alreadyInstalled');
    expect(routeSrc).toMatch(/await inst\.isInstalled\(variant\)/);
  });

  it('长任务不阻塞请求：立即返回，前端轮询进度', () => {
    expect(routeSrc).toContain('started: true');
    expect(routeSrc).toContain('void (async () =>');
    expect(routeSrc).toContain("router.get('/:id/progress'");
  });

  it('ACE-Step 的 error 详情单独返回（权重全但 torch 是 CPU 版要能显示）', () => {
    expect(routeSrc).toContain('acestepDetail');
    expect(routeSrc).toContain('acestepStatus');
  });

  it('面板能显示「已安装但不可用」并给修复入口', () => {
    const panel = readFileSync(panelPath, 'utf-8');
    expect(panel).toContain('已安装但不可用');
    expect(panel).toContain('修复安装');
    expect(panel).toContain("acestepDetail?.state === 'error'");
  });

  it('安装前的确认框展示体积与用途（用户要知道在下什么）', () => {
    const panel = readFileSync(panelPath, 'utf-8');
    expect(panel).toContain('humanBytes');
    expect(panel).toContain('ElMessageBox.confirm');
  });

  it('提供手动放置路径（下载失败时的兜底）', () => {
    expect(routeSrc).toContain('manualHint');
    const panel = readFileSync(panelPath, 'utf-8');
    expect(panel).toContain('手动放置路径');
  });

  it('面板卸载时停止轮询（不泄漏定时器）', () => {
    const panel = readFileSync(panelPath, 'utf-8');
    expect(panel).toContain('onUnmounted(stopPoll)');
  });
});
