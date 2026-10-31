// clip_project 工具面守门 —— 防止「工程能做的，模型调不到」再次发生。
//
// ★ 为什么需要（2026-10-30 实测踩到）：
//   applyClipOp 早就支持 mask（蒙版）与 transition（转场），但工具 schema 的
//   add_clip items 里**一个都没声明**；set_audio_fx 也不在 op enum 里。
//   后果是模型根本不知道这些能力存在 —— 剪辑模式最"酷炫"的两块（蒙版取景、转场）
//   在对话里完全用不上，而 UI 里点得到，两边能力不一致且不报错。
//
// ★ 判据必须**从源码派生**，不能抄一份常量：抄下来的清单会与实现一起慢慢腐烂，
//   而这条测试的价值恰恰是"实现改了、schema 没跟上"时立刻红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getApiToolRegistry, initApiToolRegistry } from '@yan-zhi/core';

/** clip-project.ts 里 applyClipOp 实际处理的 op（从 switch 的 case 字面量派生）。 */
function opsFromSource(): string[] {
  const src = readFileSync(resolve(__dirname, '../src/services/clip-project.ts'), 'utf8');
  const body = src.slice(src.indexOf('export function applyClipOp'));
  const ops = new Set<string>();
  for (const m of body.matchAll(/case '([a-z_]+)':/g)) ops.add(m[1]);
  return [...ops];
}

function clipTool() {
  initApiToolRegistry();
  for (const tools of getApiToolRegistry().values()) {
    const hit = tools.find((t) => t.name === 'clip_project');
    if (hit) return hit;
  }
  throw new Error('没找到 clip_project 工具定义');
}

/** 只在工具执行器层实现的 op（需要 ffprobe/ffmpeg，不适合放进纯函数 applyClipOp）。 */
const EXECUTOR_ONLY_OPS = ['render', 'beat_cut', 'add_tts', 'list_recipes', 'apply_recipe', 'save_recipe', 'delete_recipe'];

describe('clip_project 工具面与 applyClipOp 对齐', () => {
  it('op enum 覆盖 applyClipOp 的每一个 case（外加执行器独有 op）', () => {
    const tool = clipTool();
    const schema = tool.inputSchema as any;
    const declared: string[] = schema.properties.op.enum;
    const expected = new Set([...opsFromSource(), ...EXECUTOR_ONLY_OPS]);

    const missing = [...expected].filter((op) => !declared.includes(op));
    const extra = declared.filter((op) => !expected.has(op));
    expect(missing, `工具 schema 缺 op：${missing.join(', ')}（模型将无法调用）`).toEqual([]);
    expect(extra, `工具 schema 多了不存在的 op：${extra.join(', ')}`).toEqual([]);
  });

  it('add_clip 的段字段声明了 crop / mask / transition / keyframes', () => {
    const items = (clipTool().inputSchema as any).properties.clips.items.properties;
    for (const k of ['crop', 'mask', 'transition', 'keyframes', 'kenburns']) {
      expect(items[k], `add_clip 缺字段 ${k}：模型加不了这一项`).toBeTruthy();
    }
    expect(items.mask.properties.key).toBeTruthy();
    expect(items.transition.properties.type).toBeTruthy();
  });

  it('字幕字段声明了样式所需的 outlinePx / backColor', () => {
    const t = (clipTool().inputSchema as any).properties.texts.items.properties;
    for (const k of ['outlinePx', 'backColor', 'outlineColor', 'safeArea', 'position']) {
      expect(t[k], `add_text 缺字段 ${k}`).toBeTruthy();
    }
  });

  it('add_tts 声明了 text / start / subtitle（配音的能力模型要看得见）', () => {
    const props = (clipTool().inputSchema as any).properties;
    for (const k of ['text', 'start', 'subtitle', 'voice', 'character', 'rate']) {
      expect(props[k], `add_tts 缺参数 ${k}`).toBeTruthy();
    }
  });

  it('set_audio_fx 有对应的顶层 fx 参数', () => {
    const props = (clipTool().inputSchema as any).properties;
    expect(props.fx, 'set_audio_fx 没有参数入口（模型无法设置音效链）').toBeTruthy();
    expect(Array.isArray(props.fx.items.enum)).toBe(true);
    // 音效链上限 4 个 → enum 里不该出现占位项
    expect(props.fx.items.enum).not.toContain('none');
  });
});
