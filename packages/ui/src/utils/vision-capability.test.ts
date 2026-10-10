/**
 * 视觉能力三态与探测缓存（C3，2026-10-10）守门测试。
 *
 * 背景（实测缺口）：
 *   `model.capabilities_json` 语义是「**测出来才勾的累加集合**」（`services/model-caps.ts` 明说），
 *   **不是**"完整清单" ⇒ 不能把"未标注 vision"当"不支持 vision"（否则误判多模态模型，
 *   甚至误裁对话模型的工具面 —— model-caps 记录过这类事故）。
 *   于是运行时只能试错，而**失败的候选不被记住**（`platform.ts` 只写回成功项：
 *   `if (r.ok && r.capability)`）⇒ **每次识图都白试一遍**（长任务里反复发生）。
 *
 * 修法：三态缓存（`yes` / `no` / 未记录=unknown），`no` 带 30 分钟 TTL；
 *   运行时先跳过已证不支持的候选。**内存版**（零迁移、可回退），不改 `capabilities_json` 语义。
 *
 * 本测试钉（**以真跑为主**）：
 *   ① 默认态是 `unknown`（允许尝试）—— **不得**把缺标记当"不支持"；
 *   ② 记录 `no` 后 `getVisionCapability` 返回 `no`（⇒ 运行时跳过）；
 *   ③ **TTL 到期回到 unknown**（防"一次抖动被永久记成不支持"）；
 *   ④ **网络类错误不得记 `no`**（超时/断连 ≠ 不支持）；
 *   ⑤ 明确的"不支持"措辞 / 4xx 才记 `no`；
 *   ⑥ 成功记 `yes`（永久有效）；
 *   ⑦ 运行时必须**真的用缓存**（不是定义了不用）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ★ 本文件在 `packages/ui/src/utils/` 下 → 到仓库根要**上四级**
//   （utils → src → ui → packages → 仓库根）。少一级会拼出 `packages/packages/...` → ENOENT。
const REPO = resolve(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const CHAT = read('packages/ui/src/stores/chat.ts');
/** 本模块源码（用于断言"实现里真的分层了"这类结构事实） */
const SRC = read('packages/ui/src/utils/vision-capability.ts');

describe('① 三态语义（真跑）', () => {
  it('★★★ 默认是 unknown（缺标记不得当"不支持"）', async () => {
    const m = await import('./vision-capability');
    m.clearVisionCapabilityCache();
    expect(m.getVisionCapability('p1', 'm1'), '★ 未记录时不是 unknown —— 会把缺标记当不支持（model-caps 警告的坑）')
      .toBe('unknown');
  });

  it('★★★ 记 no 后应为 no（运行时据此跳过）', async () => {
    const m = await import('./vision-capability');
    m.clearVisionCapabilityCache();
    m.setVisionCapability('p1', 'm1', 'no');
    expect(m.getVisionCapability('p1', 'm1')).toBe('no');
  });

  it('★★★ 记 yes 后应为 yes（且不过期）', async () => {
    const m = await import('./vision-capability');
    m.clearVisionCapabilityCache();
    const t0 = Date.now();
    m.setVisionCapability('p1', 'm1', 'yes', t0);
    expect(m.getVisionCapability('p1', 'm1', t0 + 10 * 60 * 1000), '★ yes 不应过期').toBe('yes');
    expect(m.getVisionCapability('p1', 'm1', t0 + 365 * 24 * 3600 * 1000), '★ yes 不应过期').toBe('yes');
  });

  it('★★★ no 必须在 TTL 到期后回到 unknown（防永久误判）', async () => {
    const m = await import('./vision-capability');
    m.clearVisionCapabilityCache();
    const t0 = Date.now();
    m.setVisionCapability('p1', 'm1', 'no', t0);
    expect(m.getVisionCapability('p1', 'm1', t0 + 1000)).toBe('no');
    expect(
      m.getVisionCapability('p1', 'm1', t0 + m.VISION_NO_TTL_MS + 1),
      '★ no 过期后未回到 unknown → 一次抖动会被永久记成"不支持"（再也试不了）',
    ).toBe('unknown');
  });
});

describe('② 从一次尝试推断结论（真跑，含网络类不记）', () => {
  it('★★★ 成功 → 记 yes', async () => {
    const m = await import('./vision-capability');
    m.clearVisionCapabilityCache();
    const marked = m.recordVisionAttempt('p', 'm', true);
    expect(marked, '★ 成功不该返回"记为不支持"').toBe(false);
    expect(m.getVisionCapability('p', 'm')).toBe('yes');
  });

  it('★★★ 网络/超时类失败**不得**记 no（与"是否支持视觉"无关）', async () => {
    const m = await import('./vision-capability');
    for (const msg of ['timeout of 30000ms exceeded', '请求超时', 'ECONNREFUSED', 'ECONNRESET', 'fetch failed', '429 Too Many Requests', 'HTTP 502', 'socket hang up']) {
      m.clearVisionCapabilityCache();
      const marked = m.recordVisionAttempt('p', 'm', false, msg);
      expect(marked, `★ "${msg}" 被记为不支持 → 一次网络抖动会永久误判`).toBe(false);
      expect(m.getVisionCapability('p', 'm'), `★ "${msg}" 后状态应仍为 unknown`).toBe('unknown');
    }
  });

  it('★★★ 网络例外必须是**独立的一层**（不能只靠"能力正则恰好不匹配"）', async () => {
    // ★★★ 这条是**变异验证补出来的**：删掉 `recordVisionAttempt` 里的网络例外分支时，
    //   上面那条**照样通过** —— 因为当前的"能力性失败"正则**恰好**不匹配那些网络措辞。
    //   也就是说：那行在网络措辞不变时是"冗余"，但它**防的是正则将来被放宽**
    //   （例如有人把 `4(00|04|22)` 改成 `4\d\d`，则 `HTTP 502/503` 会被误判为"不支持"）。
    //   ⇒ 必须显式断言**网络例外分支存在且在网络判定之前**，否则这层保护会被当冗余删掉。
    const i = SRC.indexOf('export function recordVisionAttempt');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    // ★ 必须**剥注释** —— 说明注释里就写着网络/超时类，不剥则断言被注释满足（变异验证抓出）
    const body = SRC.slice(i, i + 1600).replace(/^\s*\/\/.*$/gm, '');
    const netIdx = body.search(/timeout|timed out|超时/);
    const abilityIdx = body.indexOf('不支持');
    expect(netIdx, '★ 网络例外分支缺失 → 正则放宽后会把网络错误误判为"不支持"').toBeGreaterThan(-1);
    expect(abilityIdx, '★ 锚点缺失：能力判定').toBeGreaterThan(-1);
    expect(netIdx, '★ 网络例外必须**先于**能力判定（否则网络措辞含"不支持"时仍会被误判）')
      .toBeLessThan(abilityIdx);
  });

  it('★★★ 明确的能力性失败才记 no', async () => {
    const m = await import('./vision-capability');
    const cases = ['模型不支持图片输入', '我看不到图片', "I can't see the image", 'unable to view', 'no image', 'HTTP 400 Bad Request', 'HTTP 422'];
    for (const msg of cases) {
      m.clearVisionCapabilityCache();
      const marked = m.recordVisionAttempt('p', 'm', false, msg);
      expect(marked, `★ "${msg}" 未被记为不支持（仍会每次重试）`).toBe(true);
      expect(m.getVisionCapability('p', 'm')).toBe('no');
    }
  });

  it('★★ 无法判断的失败不记（保守：宁可多试一次）', async () => {
    const m = await import('./vision-capability');
    m.clearVisionCapabilityCache();
    expect(m.recordVisionAttempt('p', 'm', false, '莫名其妙的一个错误'), '★ 无法判断时不记 → 应保持 unknown').toBe(false);
    expect(m.getVisionCapability('p', 'm')).toBe('unknown');
  });
});

describe('③ 键与观测', () => {
  it('★★ 键必须含 platformId（不同平台的同名 modelId 不能串）', async () => {
    const m = await import('./vision-capability');
    m.clearVisionCapabilityCache();
    m.setVisionCapability('pA', 'same', 'no');
    expect(m.getVisionCapability('pA', 'same')).toBe('no');
    expect(m.getVisionCapability('pB', 'same'), '★ 不同平台串了（键未含 platformId）').toBe('unknown');
  });

  it('★★ 有观测出口（缓存规模）', async () => {
    const m = await import('./vision-capability');
    m.clearVisionCapabilityCache();
    m.setVisionCapability('p', 'a', 'yes');
    m.setVisionCapability('p', 'b', 'no');
    expect(m.visionCapabilityCacheSize(), '★ 无观测出口 → 排障看不到缓存状态').toBe(2);
  });
});

describe('④ 运行时必须真的用缓存', () => {
  it('★★★ 跳过已证不支持的候选', () => {
    expect(CHAT, '★ 运行时未查缓存 → 每次仍白试一遍').toMatch(/getVisionCapability\(p\.id, m\.id\)/);
    expect(CHAT, '★ 未真的跳过（只查了不用）').toMatch(/===\s*'no'[\s\S]{0,200}return null/);
  });

  it('★★★ 每次尝试后必须记录结论（否则缓存永远为空）', () => {
    expect(CHAT, '★ 未记录尝试结论 → 缓存无内容、机制空转').toMatch(/recordVisionAttempt\(p\.id, m\.id/);
  });

  it('★★ 缓存模块异常必须 fail-open（不能因缓存问题让识图失败）', () => {
    const i = CHAT.indexOf('getVisionCapability(p.id, m.id)');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const around = CHAT.slice(Math.max(0, i - 800), i + 1200);
    expect(around, '★ 未兜住缓存异常（会让一次普通识图直接失败）').toMatch(/能力缓存异常/);
  });

  it('★★★ 不得改 capabilities_json 语义（那是 model-caps 明确警告的坑）', () => {
    expect(CHAT, '★ 把"不支持"写进了 capabilities（会污染"累加集合"语义）')
      .not.toMatch(/capabilities[^\n]{0,60}(remove|filter)[^\n]{0,40}'vision'/);
  });
});