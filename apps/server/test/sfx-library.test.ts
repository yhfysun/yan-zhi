/**
 * 音效库单测（apps/server/src/services/sfx-library）。
 *
 * ★★★ 为什么必须在测试里钉住两条：
 *   ① **aac 编码器不支持单声道**（实测踩到 `Unsupported channel layout "1 channels"`）——
 *      sfx 生成的命令必须显式 `-ac 2`，否则某些音效直接失败；
 *   ② **无限源必须带 -t**（anoisesrc 是无限源，不给时长会一直写盘）——
 *      maxSec 必须存在且合理。
 *   这两条都不会在类型检查里体现，只能在数据契约层面钉住。
 *
 * ★ ffmpeg 层面"真能生成"由 tools/gen-sfx-verify.cjs 实跑核验（11/11 通过）。
 */
import { describe, it, expect } from 'vitest';
import { SFX_LIBRARY, sfxById } from '../src/services/sfx-library';

describe('音效库 · 数据契约', () => {
  it('id 唯一且格式安全（会进文件名，不能含路径分隔符）', () => {
    const ids = SFX_LIBRARY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SFX_LIBRARY) {
      expect(s.id, `${s.id} 含非法字符`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('每项都有 label/desc/group/input/af/maxSec', () => {
    for (const s of SFX_LIBRARY) {
      expect(s.label, `${s.id} 缺 label`).toBeTruthy();
      expect(s.desc, `${s.id} 缺 desc`).toBeTruthy();
      expect(s.group, `${s.id} 缺 group`).toBeTruthy();
      expect(s.input.length, `${s.id} 缺 input`).toBeGreaterThan(0);
      expect(s.af, `${s.id} 缺 af`).toBeTruthy();
    }
  });

  it('★★ maxSec 必须 > 0 且合理（无限源必须靠 -t 截断，否则一直写盘）', () => {
    for (const s of SFX_LIBRARY) {
      expect(s.maxSec, `${s.id} 的 maxSec 必须为正`).toBeGreaterThan(0);
      // 超过 60s 的"音效"不是音效（是配乐，而配乐我们做不了）
      expect(s.maxSec, `${s.id} 的 maxSec 过大`).toBeLessThanOrEqual(60);
    }
  });

  it('★★ input 必须是 lavfi 源（合成式；不得依赖外部文件，否则打包后失效）', () => {
    for (const s of SFX_LIBRARY) {
      expect(s.input.join(' '), `${s.id} 不是 lavfi 源`).toContain('-f lavfi');
      // 不得出现本机绝对路径（会随环境失效）
      expect(s.input.join(' '), `${s.id} 含绝对路径`).not.toMatch(/[A-Za-z]:[\\/]/);
    }
  });

  it('★ af 里不得出现单引号（会提前闭合 shell/滤镜参数）', () => {
    for (const s of SFX_LIBRARY) {
      expect(s.af, `${s.id} 的 af 含单引号`).not.toContain("'");
    }
  });

  it('分组齐备（转场/提示/节奏/氛围）', () => {
    const groups = new Set(SFX_LIBRARY.map((s) => s.group));
    for (const g of ['转场', '提示', '节奏', '氛围']) {
      expect(groups.has(g as never), `缺分组 ${g}`).toBe(true);
    }
  });

  it('★ 数量达到"有点用"的规模（回归：太少用户会觉得没素材可用）', () => {
    expect(SFX_LIBRARY.length).toBeGreaterThanOrEqual(8);
  });

  it('★ sfxById：命中返回项，未命中返回 null（不得静默回落成某个音效）', () => {
    expect(sfxById('whoosh')?.label).toBeTruthy();
    expect(sfxById('不存在的音效')).toBeNull();
    expect(sfxById('')).toBeNull();
  });

  it('★★ 氛围类必须是长音（10s 级循环），不能是零点几秒（否则垫不住）', () => {
    const ambient = SFX_LIBRARY.filter((s) => s.group === '氛围');
    expect(ambient.length).toBeGreaterThan(0);
    for (const s of ambient) {
      expect(s.maxSec, `${s.id} 氛围音太短`).toBeGreaterThanOrEqual(5);
    }
  });

  it('★★ 节奏类必须是短促的（卡点用；超过 1s 就不是"点"了）', () => {
    const rhythm = SFX_LIBRARY.filter((s) => s.group === '节奏');
    expect(rhythm.length).toBeGreaterThan(0);
    for (const s of rhythm) {
      expect(s.maxSec, `${s.id} 节奏音太长`).toBeLessThanOrEqual(1);
    }
  });
});