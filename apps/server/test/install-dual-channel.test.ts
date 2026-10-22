/**
 * 安装双通道 + 强制确认 回归测试（2026-10-22）。
 *
 * 用户口径（原话）：「两条路嘛，用户点击下载可以，大模型下载可以，
 *   之前不是有个语音包下载么这次也可以兼容过来」。
 * 以及：「这些需要下载别的应用也要弄成工具…但是要弹出让用户确认」。
 *
 * 为什么值得测（每条对应一次真实风险）：
 *   1) **两套实现漂移** —— 若 UI 通道与工具通道各写一份下载逻辑，
 *      必然出现"UI 说装好了、工具说没装"或反之。本测试断言**同一个 install 函数**。
 *   2) **确认被跳过** —— 改造前授权闸只在 `readonly` 模式生效
 *      （llm-task-manager `perm.needsAuthorization && mode === 'readonly'`），
 *      default/all 模式下"模型一句话就下 100MB"，用户无感知。
 *   3) **语音包缺口** —— `tts-pack` 原本只有 REST 路由、没有工具，
 *      `api_tts_voices` 报"未安装语音包，可在设置中下载"时模型只能让用户手动点。
 *   4) **国内源排序** —— 用户明确要求"国内优先、国外次之、多点冗余"。
 *
 * 只 import 纯数据/注册表模块；不实际下载（mock 掉 install）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DOWNLOAD_SOURCES_FOR_TEST,
  cnFirst,
  RESOURCE_BYTES,
  humanBytes,
  TOOL_CATEGORY,
} from '@yan-zhi/shared';

const SRC = path.resolve(__dirname, '../src');

describe('安装双通道 · 契约完整性', () => {
  it('installer-registry 里每个资源都实现了契约要求的方法', () => {
    const src = readFileSync(path.join(SRC, 'services/installer-registry.ts'), 'utf-8');
    // 契约方法可能是 `m(v){…}` 或 `m: (v) => …`，两种写法都算实现
    for (const m of ['bytes', 'sources', 'targetDir', 'eta', 'isInstalled', 'install', 'progress', 'manualHint']) {
      const re = new RegExp(`\\b${m}\\s*[(:]`);
      expect(re.test(src), `Installer 缺少 ${m}`).toBe(true);
    }
  });

  it('语音包已接入注册表（原缺口：只有 REST 路由没有工具）', () => {
    const src = readFileSync(path.join(SRC, 'services/installer-registry.ts'), 'utf-8');
    expect(src).toContain("'tts-pack': ttsPackInstaller");
    expect(src).toContain('installTtsPack');
  });

  it('每个 installer 的 install 都转发到既有服务，不自己写下载', () => {
    const src = readFileSync(path.join(SRC, 'services/installer-registry.ts'), 'utf-8');
    const forwarded = [
      'installFfmpeg', 'installYtdlp', 'installWhisper',
      'installSingingRuntime', 'installTtsPack',
    ];
    for (const fn of forwarded) {
      expect(src, `${fn} 未被复用（不该重写下载逻辑）`).toContain(fn);
    }
  });
});

describe('安装双通道 · 两条路共用一个函数', () => {
  it('UI 通道（tts-packs 路由）与工具通道都调 installTtsPack', () => {
    const route = readFileSync(path.join(SRC, 'routes/tts-packs.ts'), 'utf-8');
    const registry = readFileSync(path.join(SRC, 'services/installer-registry.ts'), 'utf-8');
    // 通道 A：REST 路由直接调 service
    expect(route).toContain('installTtsPack');
    // 通道 B：注册表转发到同一个 service 函数
    expect(registry).toContain('installTtsPack');
    // ★ 关键：注册表**不能**自己实现下载（否则就是第二套实现）
    expect(registry).not.toMatch(/createWriteStream|fetch\(url/);
  });

  it('注册表不包含任何下载实现细节（全部委托给既有 service）', () => {
    const src = readFileSync(path.join(SRC, 'services/installer-registry.ts'), 'utf-8');
    for (const forbidden of ['createWriteStream', 'expand-archive', 'Expand-Archive', 'pip install']) {
      expect(src, `注册表里不该出现下载/解压细节：${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe('安装双通道 · 强制确认', () => {
  const llmSrc = readFileSync(path.join(SRC, 'llm-task-manager.ts'), 'utf-8');

  it('存在 install_resource 的强制确认函数', () => {
    expect(llmSrc).toContain('confirmResourceInstall');
  });

  it('★ 确认位置在权限闸之前（否则 default/all 模式会被跳过）', () => {
    const iConfirm = llmSrc.indexOf('await confirmResourceInstall(task, args)');
    const iPerm = llmSrc.indexOf("const perm = checkToolPermission(task.permissionMode");
    expect(iConfirm).toBeGreaterThan(0);
    expect(iPerm).toBeGreaterThan(0);
    expect(iConfirm, '确认必须在权限闸之前').toBeLessThan(iPerm);
  });

  it('确认不依赖 readonly 模式（任何模式都问）', () => {
    const start = llmSrc.indexOf('async function confirmResourceInstall');
    const end = llmSrc.indexOf('\n}\n', start);
    const body = llmSrc.slice(start, end);
    expect(body).toContain('subscribers.size === 0');
    // 确认逻辑里不应出现「只有 readonly 才确认」这类收窄
    expect(body).not.toContain("permissionMode === 'readonly'");
  });

  it('已安装则跳过确认（幂等，避免每次都骚扰）', () => {
    const start = llmSrc.indexOf('async function confirmResourceInstall');
    const end = llmSrc.indexOf('\n}\n', start);
    const body = llmSrc.slice(start, end);
    expect(body).toContain('isInstalled');
    expect(body).toContain('authorizedTools');
  });

  it('拒绝后明确告知不要重试（防模型循环重弹）', () => {
    const start = llmSrc.indexOf('async function confirmResourceInstall');
    const end = llmSrc.indexOf('\n}\n', start);
    const body = llmSrc.slice(start, end);
    expect(body).toMatch(/不要重试/);
  });

  it('list / status 动作不弹确认（只有 install 才打扰用户）', () => {
    const start = llmSrc.indexOf('async function confirmResourceInstall');
    const end = llmSrc.indexOf('\n}\n', start);
    const body = llmSrc.slice(start, end);
    expect(body).toContain("action !== 'install'");
  });
});

describe('安装双通道 · 下载源国内优先', () => {
  it('每组下载源的第一个都是国内源', () => {
    for (const [name, list] of Object.entries(DOWNLOAD_SOURCES_FOR_TEST)) {
      if (!list.length) continue;
      expect(list[0].region, `${name} 首个源应为 cn`).toBe('cn');
    }
  });

  it('cnFirst 把所有国内外源排到国外源前面', () => {
    const mixed = [
      { id: 'a', region: 'global' as const },
      { id: 'b', region: 'cn' as const },
      { id: 'c', region: 'global' as const },
      { id: 'd', region: 'cn' as const },
    ];
    const sorted = cnFirst(mixed);
    expect(sorted.map((s) => s.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('cnFirst 不丢源、不改原数组顺序语义', () => {
    const mixed = [
      { id: 'x', region: 'global' as const },
      { id: 'y', region: 'cn' as const },
    ];
    expect(cnFirst(mixed)).toHaveLength(2);
    expect(mixed.map((s) => s.id)).toEqual(['x', 'y']); // 原数组不变
  });

  it('PyTorch 轮子保留官方源（国内镜像不全，不能只有国内）', () => {
    const torch = DOWNLOAD_SOURCES_FOR_TEST.torchWheel;
    expect(torch.some((s) => s.region === 'global')).toBe(true);
  });
});

describe('安装双通道 · 体积与清单', () => {
  it('humanBytes 正确换算', () => {
    expect(humanBytes(1024 * 1024)).toBe('1 MB');
    expect(humanBytes(8 * 1024 * 1024 * 1024)).toBe('8.0 GB');
    expect(humanBytes(512)).toBe('1 KB');
  });

  it('关键资源的体积常量已定义（确认卡要展示）', () => {
    for (const k of ['ffmpeg', 'ytdlp', 'diffsinger', 'acestep', 'tts-pack']) {
      expect(RESOURCE_BYTES[k as keyof typeof RESOURCE_BYTES], `${k} 缺体积常量`).toBeGreaterThan(0);
    }
  });

  it('install_resource 已登记分类', () => {
    expect(TOOL_CATEGORY.install_resource).toBe('media-install');
  });
});
