/**
 * P3b 工具/运行时自安装 —— 守门测试。
 *
 * 用户拍板（2026-09-27 方案 §八 第 5 条）：
 *   **≤50MB 静默自动下载；>50MB 必须确认**（复用 ffmpeg 那套下载+重试框架，阈值可配）。
 *
 * 为什么这条要钉死：
 *   体积策略不是「保守/激进的取舍」，而是让**确认只留给真正需要确认的事**。
 *   一律确认 → 连装个 2MB 的 MCP 都要点同意，用户被训练成盲点，真该看的 100MB 提示也一起被忽略；
 *   一律静默 → 用户磁盘少了几个 G 却不知道是谁干的。
 *   所以「未知体积」必须落到 confirm（绝不能当成「很小」而静默），这条最容易写反。
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  decideInstallPolicy, resolveSilentMaxBytes, DEFAULT_SILENT_MAX_BYTES,
  formatBytes, knownSizeOf, planInstall, precheckMcpCommand, precheckDependencies,
  AUTO_PULL_LAUNCHERS,
} from '../src/services/runtime-installer';

const MB = 1024 * 1024;
const SERVER_SRC = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(SERVER_SRC, p), 'utf8');

describe('① 体积策略：阈值判定', () => {
  it('★ 默认阈值 50MB（用户拍板）', () => {
    expect(DEFAULT_SILENT_MAX_BYTES).toBe(50 * MB);
    expect(resolveSilentMaxBytes({})).toBe(50 * MB);
  });

  it('★★ ≤50MB → 静默；>50MB → 确认（策略的核心，写反就完全走样）', () => {
    expect(decideInstallPolicy(3 * MB).decision, '★ 3MB 应静默').toBe('silent');
    expect(decideInstallPolicy(50 * MB).decision, '★ 恰好 50MB 属"不超过阈値"→ 静默（边界含在内）').toBe('silent');
    expect(decideInstallPolicy(50 * MB + 1).decision, '★★ 刚过阈值就必须确认').toBe('confirm');
    expect(decideInstallPolicy(100 * MB).decision, '★★ ffmpeg 量级必须确认').toBe('confirm');
  });

  it('★★ 体积未知必须 confirm（"不知道多大"绝不能当成"很小"）', () => {
    for (const v of [null, undefined, 0, -1, NaN, Infinity]) {
      expect(decideInstallPolicy(v as number).decision, `★★ 体积 ${String(v)} 被当成可静默（静默下载未知体积的东西正是要防的）`).toBe('confirm');
    }
  });

  it('★ 系统级安装（提权/不可逆）一律 manual，不看体积', () => {
    const p = decideInstallPolicy(1 * MB, { manual: true });
    expect(p.decision).toBe('manual');
    expect(p.reason).toMatch(/系统级|手动/);
  });

  it('★ 阈值可配（企业环境可收紧），非法值回落默认而不是变成"一律静默"', () => {
    expect(resolveSilentMaxBytes({ YZ_INSTALL_SILENT_MAX_MB: '10' }), '★ 配 10MB 应生效').toBe(10 * MB);
    expect(decideInstallPolicy(20 * MB, { silentMaxBytes: 10 * MB }).decision, '★ 收紧阈值后 20MB 要确认').toBe('confirm');
    // ★ 反向判据：写错的环境变量不能让策略变宽
    for (const bad of ['abc', '0', '-5', '']) {
      expect(resolveSilentMaxBytes({ YZ_INSTALL_SILENT_MAX_MB: bad }), `★ 非法阈值 ${bad} 未回落默认（可能是安全洞）`).toBe(50 * MB);
    }
  });

  it('★ 判定依据要可解释（回显体积与阈值，"为什么这次没问我"能答上来）', () => {
    const s = decideInstallPolicy(3 * MB);
    expect(s.reason).toMatch(/3\.0 MB/);
    expect(s.reason).toMatch(/50\.0 MB/);
    expect(decideInstallPolicy(100 * MB).reason).toMatch(/100\.0 MB/);
  });

  it('★ 体积格式化（判据与提示文案共用一套舍入）', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2 * 1024)).toBe('2.0 KB');
    expect(formatBytes(3 * MB)).toBe('3.0 MB');
    expect(formatBytes(2 * 1024 * MB)).toBe('2.00 GB');
    expect(formatBytes(0)).toBe('0 B');
  });
});

describe('② 已知依赖体积表与安装计划', () => {
  it('★ ffmpeg 标为 ~100MB（与实测一致，才会正确落到 confirm 档）', () => {
    expect(knownSizeOf('ffmpeg')).toBe(100 * MB);
    expect(planInstall('ffmpeg').decision, '★ ffmpeg 应需确认').toBe('confirm');
  });

  it('★ 常见 MCP server 包标为小体积（→ 静默，避免噪音确认）', () => {
    for (const pkg of ['@modelcontextprotocol/server-filesystem', '@modelcontextprotocol/server-memory']) {
      const plan = planInstall(pkg, { kind: 'npm-package' });
      expect(plan.decision, `★ ${pkg} 应静默（小体积包不该打扰用户）`).toBe('silent');
      expect(plan.kind).toBe('npm-package');
    }
  });

  it('★ 大体积运行时（playwright chromium）要确认', () => {
    expect(planInstall('playwright-chromium', { kind: 'npm-package' }).decision, '★ chromium ~180MB 应确认').toBe('confirm');
  });

  it('★ 未登记的依赖 → 体积未知 → confirm（宁可多问一次）', () => {
    const plan = planInstall('some-unknown-package-xyz', { kind: 'npm-package' });
    expect(knownSizeOf('some-unknown-package-xyz')).toBeNull();
    expect(plan.decision).toBe('confirm');
    expect(plan.estimatedBytes).toBeNull();
  });

  it('★ 显式给的体积优先于体积表（可覆盖表里的保守估值）', () => {
    expect(planInstall('ffmpeg', { bytes: 5 * MB }).decision, '★ 显式小体积应被采纳').toBe('silent');
  });
});

describe('③ 命令探测（MCP 依赖预检）', () => {
  it('★ 存在性探测：真实存在的命令返回可用（用 node 自身，跨平台都存在）', async () => {
    const r = await precheckMcpCommand(process.execPath);
    expect(r.available, '★ 用绝对路径探测自身可执行文件应可用').toBe(true);
    expect(r.resolvedPath).toBeTruthy();
  });

  it('★ 显式路径不存在 → 不可用（不能因为"是路径"就默认可信）', async () => {
    const r = await precheckMcpCommand('C:/definitely/not/here/nope.exe');
    expect(r.available).toBe(false);
    expect(r.hint).toMatch(/未找到|安装|PATH/);
  });

  it('★★ 自动拉包型启动器要识别出来（npx -y pkg 本身就是按需拉包，"包不在本机"不是错误）', async () => {
    const r = await precheckMcpCommand('npx');
    expect(r.autoPull, '★★ npx 未识别为自动拉包型（会让用户以为配置坏了）').toBe(true);
    // 无论本机有没有 npx，提示里都要说清"启动器就绪即可，不用预装包本体"
    expect(r.hint).toMatch(/自动拉|启动器/);
    expect(AUTO_PULL_LAUNCHERS).toContain('npx');
    expect(AUTO_PULL_LAUNCHERS).toContain('uvx');
  });

  it('★ 普通命令不误判为自动拉包型', async () => {
    const r = await precheckMcpCommand('python-not-a-launcher');
    expect(r.autoPull, '★ 普通命令被误判为自动拉包型').toBe(false);
  });

  it('★ 空命令要给出明确原因（不是静默失败）', async () => {
    const r = await precheckMcpCommand('');
    expect(r.available).toBe(false);
    expect(r.hint).toMatch(/command/);
  });

  it('★ 批量预检回传每项的 ok + 安装计划', async () => {
    const out = await precheckDependencies([
      { id: '@modelcontextprotocol/server-filesystem', command: 'npx', kind: 'npm-package' },
      { id: 'ffmpeg', kind: 'archive' },
    ]);
    expect(out.length).toBe(2);
    expect(out[1].plan.decision, '★ ffmpeg 计划应为确认档').toBe('confirm');
    // 带 command 的项要带回探测结果
    expect(out[0].probe).toBeTruthy();
  });
});

describe('④ 接线：MCP 预检接口 + ffmpeg 走同一套策略', () => {
  const MCP_ROUTE = read('src/routes/mcp.ts');
  const EXECUTOR = read('src/mcp/api-tool-executor.ts');
  const RUNTIME = read('src/services/runtime-installer.ts');
  const MEDIA_TOOL = readFileSync(resolve(SERVER_SRC, '..', '..', 'packages/core/src/tool/builtin/api-tools/media.ts'), 'utf8');

  it('★ 必须有预检接口（保存配置前能探测 command）', () => {
    expect(MCP_ROUTE, '★ 缺 /precheck 接口').toMatch(/router\.post\('\/precheck'/);
    expect(MCP_ROUTE, '★ 接口未调用 precheckMcpCommand').toMatch(/await precheckMcpCommand\(/);
    expect(MCP_ROUTE, '★ 接口未回传安装计划（前端拿不到"要不要问用户"）').toMatch(/planInstall\(/);
  });

  it('★★ ffmpeg 必须接入同一套体积策略（不能只做个没人用的抽象）', () => {
    expect(EXECUTOR, '★★ ffmpeg 提示未走 decideInstallPolicy（策略成了摆设）').toMatch(/decideInstallPolicy\(FFMPEG_ESTIMATED_BYTES\)/);
    expect(EXECUTOR, '★ ffmpeg 体积常量缺失').toMatch(/FFMPEG_ESTIMATED_BYTES = 100 \* 1024 \* 1024/);
    // 回执里要带上策略结果，用户/模型看得到决策
    expect(EXECUTOR, '★ 安装回执未含 policy').toMatch(/policy:\s*\{\s*decision/);
  });

  it('★ 工具描述要写明体积策略（模型才知道"调用前先问用户"）', () => {
    expect(MEDIA_TOOL, '★ 工具描述未提 50MB 策略').toMatch(/50MB/);
    expect(MEDIA_TOOL, '★ 工具描述未要求先 confirm_user').toMatch(/confirm_user/);
  });

  it('★★ 通用安装器必须强制"非静默不可执行"（静默是执行器的前置条件，不是调用方的自觉）', () => {
    expect(RUNTIME, '★★ 通用安装器缺策略门禁').toMatch(/if \(policy\.decision !== 'silent' && !opts\.confirmed\)/);
    // 带重试（大文件经代理隧道 ECONNRESET 是常态）
    expect(RUNTIME, '★ 通用安装器缺下载重试').toMatch(/for \(let i = 1; i <= 3; i\+\+\)/);
    // ★ 不得引入系统级安装（提权/不可逆）
    for (const danger of [/apt-get/, /winget\s+install/, /reg\.exe/, /Set-ItemProperty/]) {
      expect(RUNTIME, `★★ 通用安装器出现系统级安装调用 ${danger}（需提权且不可逆）`).not.toMatch(danger);
    }
  });

  it('★ 归档安装必须校验"要放置的文件都在"（缺文件不能假装成功）', () => {
    expect(RUNTIME, '★ 缺缺失文件的判定').toMatch(/missing\.push/);
    expect(RUNTIME, '★ 缺缺失即失败的处理').toMatch(/if \(missing\.length\)[\s\S]{0,200}ok: false/);
  });

  it('★ 模块可独立导入（不连带起库；预检必须在保存配置的同步路径上快速可用）', () => {
    // 顶层不得 import db.ts（那会连带 better-sqlite3 + 全套 seed，让预检变慢且难测）
    const top = RUNTIME.split('\n').filter((l) => l.trim().startsWith('import ')).join('\n');
    expect(top, '★★ runtime-installer 顶层引入了 db（预检会被拖慢且无法独立单测）').not.toMatch(/from '\.\.\/db\.js'/);
    expect(typeof decideInstallPolicy).toBe('function');
  });

  it('★ 前端接线：测试连接前先跑预检（否则用户只看到"连接失败"，不知是命令没装）', () => {
    const REPO = resolve(SERVER_SRC, '..', '..');
    const STORE = readFileSync(resolve(REPO, 'packages/ui/src/stores/mcp.ts'), 'utf8');
    const PANEL = readFileSync(resolve(REPO, 'packages/ui/src/components/McpPanel.vue'), 'utf8');
    expect(STORE, '★ store 缺 precheckServer').toMatch(/async function precheckServer/);
    expect(STORE, '★ store 未调用预检接口').toMatch(/\/mcp-servers\/precheck/);
    expect(STORE, '★ precheckServer 未导出（组件用不到）').toMatch(/testServerConfig, precheckServer,/);
    // 面板：stdio 类型在测试连接前必须先预检
    expect(PANEL, '★★ McpPanel 未在测试前预检（用户仍会只看到"连接失败"）').toMatch(/store\.precheckServer\(form\.value\.command, args\)/);
    expect(PANEL, '★ 预检失败未给出可读原因').toMatch(/pre\.probe\.available/);
    // ★ 预检失败不能阻塞测试（老后端没这个接口时要能静默跳过）
    expect(PANEL, '★★ 预检抛错会阻塞测试连接（旧后端上没有该接口）').toMatch(/预检失败不阻塞测试/);
  });
});