// skill 草稿自动提炼（自进化 P1，2026-10-09）
// ─────────────────────────────────────────────────────────────
// 触发判据（调用方把关）：同一主题的 ✅步骤 在经验档案里累计 ≥2 次（appendExperienceEntry
// 返回 entryCount>=2 且 deduped=true）→ 说明这是"重复出现的完整流程"，值得固化为技能。
//
// 产出：`.yan-zhi/skill-drafts/<slug>/SKILL.md` —— **不静默生效**：
//   · drafts 目录不在项目技能加载路径（loadProjectSkills 只扫 .yan-zhi/skills/）
//   · 会话内回一条轻量消息，用户确认后移入 .yan-zhi/skills/（或让模型调 api_skill_create 入库）
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from './logger.js';
import type { Platform, Model } from '@yan-zhi/shared';

const logger = createLogger('skill-distill');

export interface SkillDraftInput {
  llm: { platform: Platform; model: Model };
  /** 任务会话转录（调用方已备好的 recent 消息文本） */
  transcript: string;
  /** 触发主题（经验档案 topic） */
  triggerTopic: string;
  /** 触发条目标题 */
  triggerTitle: string;
  /** 草稿落盘根目录（<root>/.yan-zhi/skill-drafts） */
  draftsRoot: string;
}

export interface SkillDraftResult {
  ok: boolean;
  name?: string;
  slug?: string;
  path?: string;
  /** true = 草稿已存在（跳过重写，不重复打扰） */
  existed?: boolean;
  reason?: string;
}

function slugify(name: string): string {
  const s = String(name || '').trim().toLowerCase()
    .replace(/[<>:"|?*\x00-\x1f\\/]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return s || null as unknown as string;
}

/**
 * 把重复流程提炼为 SKILL.md 草稿。全程 fail-safe（返回 ok:false 而不是抛错）。
 * LLM 输出 JSON：{name, description, triggers:[], body}，body 为 Markdown 操作步骤。
 */
export async function proposeSkillDraft(input: SkillDraftInput): Promise<SkillDraftResult> {
  try {
    const { LlmClient } = await import('@yan-zhi/core');
    const client = new LlmClient(input.llm.platform, input.llm.model);
    const resp = await client.chat([
      {
        id: '', conversationId: '', role: 'system', createdAt: 0,
        content: '你是技能提炼助手。对话记录里有一个**已被重复验证成功**的任务流程，请把它提炼成可复用的技能（Skill）。'
          + '输出 JSON 对象：{"name":"技能名（简短中文）","description":"一句话描述何时用","triggers":["触发词","..."],"body":"技能正文 Markdown"}。'
          + 'body 要求：写清操作步骤（ numbered 步骤）、每步用什么工具/方法、关键参数与注意事项、坑的规避。步骤要**可直接照做**，不要空话。'
          + '只提炼对话中实际验证过的内容，不要编造没出现过的步骤。只输出 JSON。',
      },
      { id: '', conversationId: '', role: 'user', content: `触发主题：${input.triggerTopic}\n触发步骤：${input.triggerTitle}\n\n--- 对话记录 ---\n${input.transcript}`, createdAt: 0 },
    ], { temperature: 0.2, maxTokens: 1200, responseFormat: { type: 'json_object' } });

    let parsed: any = null;
    try { parsed = JSON.parse(resp.delta?.content || ''); } catch { /* 输出异常按失败处理 */ }
    const name = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
    const body = typeof parsed?.body === 'string' ? parsed.body.trim() : '';
    if (!name || !body) return { ok: false, reason: '模型输出缺少 name/body' };

    const slug = slugify(name);
    if (!slug) return { ok: false, reason: '技能名无法转为目录名' };

    const dir = path.join(input.draftsRoot, slug);
    let existed = false;
    try {
      await readdir(dir);
      existed = true; // 同名草稿已存在：跳过重写，不重复打扰用户
      return { ok: true, name, slug, path: path.join(dir, 'SKILL.md'), existed };
    } catch { /* 不存在，继续写 */ }

    const triggers: string[] = Array.isArray(parsed?.triggers)
      ? parsed.triggers.filter((t: unknown) => typeof t === 'string' && t.trim()).slice(0, 8)
      : [];
    const description = typeof parsed?.description === 'string' ? parsed.description.trim().slice(0, 200) : '';
    const fm = [
      '---',
      `name: ${name}`,
      description ? `description: ${description.replace(/\n/g, ' ')}` : null,
      triggers.length ? `triggers: [${triggers.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(', ')}]` : null,
      '---',
      '',
      body,
    ].filter((l) => l !== null).join('\n');

    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'SKILL.md'), `${fm}\n`, 'utf-8');
    logger.info(`[skill-distill] 草稿已生成: ${slug}（触发：${input.triggerTopic}）`);
    return { ok: true, name, slug, path: path.join(dir, 'SKILL.md'), existed };
  } catch (e: any) {
    logger.warn('[skill-distill] 提炼失败:', e?.message || e);
    return { ok: false, reason: e?.message || String(e) };
  }
}

/** 草稿就绪后给用户的轻量提示（调用方用 insertMessage 发出） */
export function skillDraftNotifyText(r: SkillDraftResult): string | null {
  if (!r.ok || r.existed) return null;
  return [
    `🔁 检测到重复任务流程（${r.name}），已自动生成技能草稿：`,
    `📍 ${r.path}`,
    '该草稿**尚未启用**。确认没问题后，把它移入 `.yan-zhi/skills/` 目录（或直接说"把草稿 X 做成技能"让我用 api_skill_create 入库）即可在后续任务中自动生效；不需要就忽略或删掉。',
  ].join('\n');
}
