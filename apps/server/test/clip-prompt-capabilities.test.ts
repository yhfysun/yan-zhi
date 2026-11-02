/**
 * 剪辑提示词守门（2026-11-02 用户要求「提示词要弄好」）。
 *
 * 背景：蒙版 / 转场 / 关键帧 / 曲线变速 / 画中画 / 贴纸等能力早已在 clip_project
 * 工具 schema 与渲染链路里，但模型不会用 —— 系统提示词只写到 speed / fade / colorPreset，
 * 而 skill 正文的「做不到」还写着「曲线变速 / 混合模式 / 钢笔蒙版」这些**已经实现**的能力，
 * 等于主动劝退模型。本测试钉住：
 *   ① 剪辑师系统提示词必须带这些能力的**关键规则**（不只是名字）；
 *   ② skill 正文不超 2000 字硬预算（超出会被 truncateSkillBody 静默截断）；
 *   ③「做不到」段不得再出现已实现能力（防提示词再次落后于代码）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLIP_AGENT_SYSTEM_PROMPT } from '../src/plugins/clip-mode/seed.js';

const DB_SRC = readFileSync(resolve(__dirname, '..', 'src', 'db.ts'), 'utf8');

/** 取 skill_video_editing 的正文（模板串内容），长度口径与 truncateSkillBody 一致 */
function skillBody(): string {
  const idAt = DB_SRC.indexOf("id: 'skill_video_editing'");
  expect(idAt, '找不到 skill_video_editing 定义').toBeGreaterThan(-1);
  const bodyAt = DB_SRC.indexOf('body: `', idAt);
  expect(bodyAt, '找不到 skill 正文模板串').toBeGreaterThan(-1);
  const endAt = DB_SRC.indexOf('`,', bodyAt + 7);
  expect(endAt, 'skill 正文模板串未闭合').toBeGreaterThan(-1);
  return DB_SRC.slice(bodyAt + 7, endAt);
}

describe('剪辑师系统提示词覆盖已实现能力', () => {
  it('带蒙版 / 转场 / 关键帧 / 曲线变速的硬规则', () => {
    for (const kw of ['mask', 'transition', 'keyframes', 'speedCurve', '起点锚', '后一段', 'key 优先']) {
      expect(CLIP_AGENT_SYSTEM_PROMPT, `系统提示词缺少「${kw}」`).toContain(kw);
    }
  });

  it('带画中画 / 贴纸 / 音效链 / 一键卡点', () => {
    for (const kw of ['add_overlay', 'add_sticker', 'set_audio_fx', 'beat_cut']) {
      expect(CLIP_AGENT_SYSTEM_PROMPT, `系统提示词缺少「${kw}」`).toContain(kw);
    }
  });

  it('带调色强度 / 手动调节 / 方向与画幅规则', () => {
    for (const kw of ['colorStrength', 'adjust', 'rotate', 'reverse']) {
      expect(CLIP_AGENT_SYSTEM_PROMPT, `系统提示词缺少「${kw}」`).toContain(kw);
    }
  });
});

describe('视频剪辑 skill 正文', () => {
  it('不超 2000 字硬预算（超出会被静默截断）', () => {
    expect(skillBody().length).toBeLessThanOrEqual(2000);
  });

  it('流程段带蒙版 / 转场 / 关键帧 / 画中画 / 贴纸', () => {
    const body = skillBody();
    for (const kw of ['mask', 'transition', 'keyframes', 'add_overlay', 'add_sticker']) {
      expect(body, `skill 正文缺少「${kw}」`).toContain(kw);
    }
  });

  it('「做不到」段不再出现已实现能力（防提示词落后于代码）', () => {
    const body = skillBody();
    const at = body.indexOf('## 做不到');
    expect(at, '缺少「做不到」段').toBeGreaterThan(-1);
    const section = body.slice(at);
    for (const kw of ['曲线变速', '混合模式', '钢笔蒙版', '多视频轨', '多段 BGM']) {
      expect(section, `「做不到」仍把已支持的「${kw}」列为做不到`).not.toContain(kw);
    }
  });
});

/**
 * 2026-11-02 增量：字幕动画 8→11、音效按描述检索、录音/剪口播（UI 能力）。
 * ★ 这些能力上线后提示词必须跟上 —— 否则模型会继续只从 8 种动画里挑、
 *   继续用旧的关键词式 sfx 搜索（甚至不知道 sfx 存在）。
 */
describe('提示词覆盖 2026-11-02 新能力', () => {
  it('系统提示词带抖动/擦除/翻转与音效检索', () => {
    for (const kw of ['shake', 'wipe', 'flip3d', 'sfx', 'action=search', 'matched=false']) {
      expect(CLIP_AGENT_SYSTEM_PROMPT, `系统提示词缺少「${kw}」`).toContain(kw);
    }
  });

  it('skill 正文带上新动画与 sfx search（并仍在预算内）', () => {
    const body = skillBody();
    for (const kw of ['shake', 'wipe', 'flip3d', 'sfx search']) {
      expect(body, `skill 正文缺少「${kw}」`).toContain(kw);
    }
    expect(body.length).toBeLessThanOrEqual(2000);
  });
});
