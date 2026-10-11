/**
 * browser_navigate「同 URL 幂等」防回归测试。
 *
 * 背景（用户 2026-10-11 实测，日志铁证）：AI 在抖音发布流程中
 * 23:08 / 23:13 / 23:19 三次 navigate 回
 * https://creator.douyin.com/creator-micro/content/upload ——
 * 每一次重新导航都把发布流程重置：已上传的视频、已填好的标题**全部丢失**，
 * 于是模型再填一遍 → 「填好了又没了、任务一直反复」的死循环。
 *
 * 修法：目标 URL 与当前页相同时**不真正导航**，直接返回 `alreadyOpen`；
 * 保留 `force:true` 作为确需刷新的唯一出口（不把路堵死）。
 *
 * 验证方式（与仓库既有做法一致）：直接读主进程源码钉死实现不变量 ——
 * 这类跨进程行为没法在单测里真跑浏览器，但「有没有这段判定」是可以钉住的。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const MAIN = fs.readFileSync(
  path.join(REPO_ROOT, 'apps/desktop/main.cjs'),
  'utf8',
);
const BROWSER_TOOL = fs.readFileSync(
  path.join(REPO_ROOT, 'packages/core/src/tool/builtin/browser/index.ts'),
  'utf8',
);

describe('browser_navigate 同 URL 幂等', () => {
  it('★ navigate 分支在真正 loadURL 之前先做「同 URL 已打开」短路', () => {
    // 以 alreadyOpen 所在位置为准向前找它所属的 case 'navigate'（文件里有多个 navigate 分支），
    // 判定必须排在 loadURL 之前，否则等于没做。
    const idemAbs = MAIN.indexOf('alreadyOpen');
    expect(idemAbs).toBeGreaterThan(0);
    const caseStart = MAIN.lastIndexOf("case 'navigate': {", idemAbs);
    expect(caseStart).toBeGreaterThan(0);
    const seg = MAIN.slice(caseStart, caseStart + 5000);
    const idemAt = seg.indexOf('alreadyOpen');
    const loadAt = seg.indexOf('wc.loadURL(');
    expect(idemAt).toBeGreaterThan(0);
    expect(loadAt).toBeGreaterThan(0);
    expect(idemAt).toBeLessThan(loadAt);   // 幂等判定必须在 loadURL 之前
  });

  it('URL 比较走归一化（去协议/去末尾斜杠/小写），不是裸字符串相等', () => {
    expect(MAIN).toContain('const normUrl = (u) =>');
    expect(MAIN).toContain('normUrl(curUrl) === normUrl(cleanUrl)');
    // 归一化三要素：去协议前缀 / 去末尾斜杠 / 转小写
    const line = MAIN.slice(MAIN.indexOf('const normUrl = (u) =>'), MAIN.indexOf('const normUrl = (u) =>') + 220);
    expect(line).toContain('https?');
    expect(line).toContain('toLowerCase()');
  });

  it('保留 force:true 出口（确需刷新时仍能真的导航）', () => {
    expect(MAIN).toMatch(/args\.force\s*!==\s*true/);
  });

  it('返回体带 alreadyOpen + 明确提示（模型据此不再换 URL 重试）', () => {
    const seg = MAIN.slice(MAIN.indexOf('alreadyOpen'), MAIN.indexOf('alreadyOpen') + 700);
    expect(seg).toContain('alreadyOpen: true');
    expect(seg).toMatch(/不要换 URL 重试/);
  });

  it('about:blank 不受幂等影响（它本来就是"重置页面"语义）', () => {
    expect(MAIN).toMatch(/if \(!isBlank && args\.force !== true/);
  });
});

describe('browser_navigate 工具契约（core）', () => {
  it('向模型暴露 force 入参并说明语义', () => {
    expect(BROWSER_TOOL).toMatch(/force:\s*\{\s*type:\s*'boolean'/);
    expect(BROWSER_TOOL).toMatch(/force/);
  });

  it('★ 下游收到 alreadyOpen 时回传明确文案，而不是谎称已导航', () => {
    expect(BROWSER_TOOL).toMatch(/data\.alreadyOpen/);
    expect(BROWSER_TOOL).toMatch(/未重复导航/);
  });
});
