// Skill 蒸馏 store —— 从对话记录蒸馏出可复用 Skill（2026-10-15 对标 WorkMateAI 融合方案重构）
// 变更：① tasks 从内存 ref 改为 DB 持久化草稿（skill_draft 表 + /api/skill-drafts）；
//      ② 两段式生成：generateOverview()（AI 生成概览，人可修正）→ distillFromOverview()（概览做硬约束提炼 SKILL.md）；
//      ③ autoFilter()：AI 给消息打噪标签自动置 excluded，可撤销；
//      ④ SkillOverview ↔ SKILL.md 互转。
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getPlatformAdapter, LlmClient } from '@yan-zhi/core';
import { uid } from '@yan-zhi/shared';
import type { SkillOverview } from '@yan-zhi/shared';
import { api } from '../api/client';
import { useSkillStore } from './skill';
import { usePlatformStore } from './platform';
import { useSettingsStore } from './settings';

/** 默认蒸馏系统提示词 —— 结构化 Skill 模板 */
export const DEFAULT_DISTILL_PROMPT = `你是一位 Skill 蒸馏专家。你的任务是把用户提供的对话记录蒸馏成一个可复用的 Skill。

Skill 是一个 Markdown 文档，由 front-matter 和 body 组成，格式如下：

---
name: <英文短名，kebab-case>
description: <一句话中文描述>
triggers:
  - <触发词1>
  - <触发词2>
---

<body 内容>

请从对话中提炼出可复用的能力，按以下结构输出 body：
## 角色定义
<这个 Skill 扮演什么角色>

## 工作流程
<执行步骤，有序列表>

## 输出格式
<期望的输出格式和规范>

## 注意事项
<边界条件、约束、最佳实践>

要求：
1. name 用英文 kebab-case，简洁有辨识度
2. description 用中文一句话
3. triggers 给 3-5 个相关触发词（中英文混合）
4. body 内容用中文
5. 只输出 Skill Markdown，不要输出其他解释

以下是待蒸馏的对话记录：`;

/** 概览生成系统提示词：从对话记录提炼结构化「技能概览」（对标 WorkMateAI 技能概览表单） */
export const OVERVIEW_SYSTEM_PROMPT = `你是技能概览提炼助手。用户会给你一段任务对话记录，请提炼出这个可复用技能的结构化概览。
只输出 JSON 对象，结构如下（字段全部必填）：
{
  "nameZh": "技能中文名称（简短）",
  "slug": "英文标识（kebab-case，小写字母数字连字符）",
  "description": "一句话说明这个技能做什么、何时使用",
  "inputs": ["前置输入1", "..."],
  "steps": ["处理过程概述步骤1", "..."],
  "outputs": ["输出内容1", "..."],
  "triggers": ["触发词1", "触发词2", "..."]
}
要求：
1. 只提炼对话中实际发生过/验证过的内容，不要编造没出现过的步骤
2. inputs/outputs/steps 用简洁的名词短语或短句
3. triggers 给 3-5 个中英文混合触发词
4. 只输出 JSON，不要输出其他解释`;

/** 概览→SKILL.md 提炼系统提示词：概览是硬约束，只允许细化不允许超出 */
export const DISTILL_FROM_OVERVIEW_PROMPT = `你是技能提炼专家。用户会给你「技能概览」（已由人确认）和原始对话记录，请把概览提炼成完整可复用的 Skill（Markdown，含 front-matter）。

输出格式：
---
name: <英文短名，kebab-case，与概览的 slug 一致>
description: <与概览的 description 一致>
triggers:
  - <概览的触发词>
---

## 角色定义
## 工作流程
## 输出格式
## 注意事项

硬约束：
1. 工作流程必须覆盖概览的全部 steps，顺序一致
2. 前置输入/输出内容必须与概览的 inputs/outputs 对应
3. 只提炼对话中实际发生过的内容，可以补充细节（工具、参数、注意事项），不得新增概览之外的新步骤
4. body 用中文，步骤要可直接照做
5. 只输出 Skill Markdown，不要输出其他解释`;

export interface DistillConfig {
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  platformId: string;
  modelId: string;
}

const DEFAULT_CONFIG: DistillConfig = {
  systemPrompt: DEFAULT_DISTILL_PROMPT,
  temperature: 0.3,
  topP: 0.9,
  maxTokens: 2048,
  platformId: '',
  modelId: '',
};

/**
 * 蒸馏草稿（持久化到 skill_draft 表）。
 * ★ 与旧内存 DistillTask 兼容：保留 sourceMessages（仅运行期内存里有原文），DB 行存 sourceMsgIds。
 */
export interface DistillTask {
  id: string;
  title: string;
  sourceMessages: Array<{ role: string; content: string }>;
  status: 'overview' | 'pending' | 'running' | 'done' | 'failed' | 'draft' | 'published';
  resultMd: string;
  error?: string;
  createdAt: number;
  /** 概览中间态（两段式）；null = 未生成 */
  overview: SkillOverview | null;
  /** 草稿归属会话（重蒸/回跳用） */
  sourceConvId: string | null;
  /** 持久化草稿行是否已落库（内存新建任务在首次成功持久化前置 false） */
  persisted: boolean;
}

const STORAGE_KEY = 'settings:distill';

export const useDistillStore = defineStore('distill', () => {
  const config = ref<DistillConfig>({ ...DEFAULT_CONFIG });
  const loaded = ref(false);
  /** 草稿列表（skill_draft 表的内存镜像，按 updatedAt 降序） */
  const tasks = ref<DistillTask[]>([]);
  const loading = ref(false);

  /** 加载持久化的蒸馏配置 */
  async function loadConfig() {
    const adapter = getPlatformAdapter();
    const raw = await adapter.keyring.get(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        config.value = { ...DEFAULT_CONFIG, ...parsed };
      } catch {}
    }
    loaded.value = true;
  }

  /** 保存配置到 keyring */
  async function saveConfig() {
    const adapter = getPlatformAdapter();
    await adapter.keyring.set(STORAGE_KEY, JSON.stringify(config.value));
  }

  /** 更新配置（自动持久化） */
  async function updateConfig(patch: Partial<DistillConfig>) {
    config.value = { ...config.value, ...patch };
    await saveConfig();
  }

  /** 恢复默认提示词 */
  async function resetPrompt() {
    config.value.systemPrompt = DEFAULT_DISTILL_PROMPT;
    await saveConfig();
  }

  /** 解析平台和模型（优先用配置指定的，回退到 settings 默认） */
  function resolvePlatformModel() {
    const platformStore = usePlatformStore();
    const settingsStore = useSettingsStore();

    const pid = config.value.platformId || settingsStore.settings.defaultPlatformId;
    const mid = config.value.modelId || settingsStore.settings.defaultModelId;

    const platform = platformStore.platforms.find((p) => p.id === pid);
    if (!platform) return null;
    const model = platformStore.resolveModel(mid, pid);
    if (!model) return null;
    return { platform, model };
  }

  /** 把对话记录拼成文本 */
  function formatMessages(messages: Array<{ role: string; content: string }>): string {
    return messages
      .map((m) => {
        const role = m.role === 'user' ? '用户' : m.role === 'assistant' ? '助手' : m.role;
        return `【${role}】\n${m.content || ''}`;
      })
      .join('\n\n---\n\n');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 草稿持久化（skill_draft 表 / /api/skill-drafts）
  // ─────────────────────────────────────────────────────────────────────────

  async function apiGet<T>(path: string): Promise<T | null> {
    try {
      const r = await api.get<T>(path);
      if ('error' in r) return null;
      return r.data;
    } catch {
      return null;
    }
  }

  /** 行 → DistillTask（sourceMessages 运行期无原文，需要时按 sourceMsgIds 回查） */
  function rowToTask(row: any): DistillTask {
    return {
      id: row.id,
      title: row.title || '未命名草稿',
      sourceMessages: [],
      status: (row.status || 'overview') as DistillTask['status'],
      resultMd: row.resultMd || '',
      error: row.error || undefined,
      createdAt: row.createdAt || 0,
      overview: row.overview ?? null,
      sourceConvId: row.sourceConvId ?? null,
      persisted: true,
    };
  }

  /** 拉取草稿列表（进页面时调） */
  async function loadTasks() {
    loading.value = true;
    try {
      const r = await api.get<any[]>('/skill-drafts');
      if ('data' in r) {
        tasks.value = (r.data as any[]).map(rowToTask);
      }
    } catch {
      // 网络失败保持现状，不打断页面
    } finally {
      loading.value = false;
    }
  }

  /** 内存任务 → DB upsert。失败不抛（持久化尽力而为，主流程继续） */
  async function persistTask(task: DistillTask, patch: Partial<Record<string, unknown>> = {}): Promise<void> {
    const body: Record<string, unknown> = {
      title: task.title,
      status: task.status,
      overview: task.overview ?? undefined,
      resultMd: task.resultMd,
      error: task.error ?? '',
      ...patch,
    };
    try {
      if (task.persisted) {
        await api.patch(`/skill-drafts/${task.id}`, body);
      } else {
        body.sourceConvId = task.sourceConvId ?? undefined;
        const r = await api.post<any>('/skill-drafts', body);
        if ('data' in r && r.data?.id) {
          // 服务端生成的 id 回填：后续 PATCH/删除都以服务端 id 为准
          task.id = r.data.id;
          task.persisted = true;
        }
      }
    } catch {
      // 持久化失败不阻塞主流程
    }
  }

  /** 把概览表单的编辑结果写回任务并持久化（人修正概览 = 两段式流程的质量控制点） */
  async function updateOverview(taskId: string, overview: SkillOverview): Promise<void> {
    const t = tasks.value.find((x) => x.id === taskId);
    if (!t) throw new Error('草稿不存在');
    t.overview = overview;
    t.status = t.status === 'published' ? 'draft' : t.status;
    await persistTask(t);
  }

  /** 编辑态改完 SKILL.md 原文后保存（结果进草稿，状态推进到 draft） */
  async function updateResultMd(taskId: string, md: string): Promise<void> {
    const t = tasks.value.find((x) => x.id === taskId);
    if (!t) throw new Error('草稿不存在');
    t.resultMd = md;
    t.status = t.status === 'published' ? 'draft' : t.status;
    await persistTask(t);
  }

  /** 直接保存 Markdown 到 Skill 商店（不需要 task） */
  async function saveMdAsSkill(md: string): Promise<string> {
    const parsed = parseSkillMd(md);
    const skillStore = useSkillStore();
    const skillId = await skillStore.createCustom(
      parsed.name,
      parsed.description,
      parsed.body,
      parsed.triggers,
    );
    return skillId;
  }

  /** 右屏「存为草稿」：把一段 SKILL.md 存成新草稿（不进 Skill 商店） */
  async function saveMdAsDraft(md: string, title?: string): Promise<string> {
    const task = createTask([], { title: title || '草稿' });
    task.resultMd = md;
    task.status = 'draft';
    await persistTask(task);
    // persistTask 刻意 fail-safe（失败不抛，主流程继续），但「存为草稿」的**唯一**产出就是这一行
    // 落库：没落上库等于什么都没做，此时再报「已存为草稿」就是假成功——用户下次进页面
    // （loadTasks 从服务端重建列表）草稿凭空消失，且不会有任何提示。
    // 故此处单独严格化：抛出去让调用方给真实失败提示，并清掉内存里的幻影草稿。
    if (!task.persisted) {
      removeTask(task.id);
      throw new Error('草稿未保存成功（服务端不可达或返回异常），请稍后重试');
    }
    return task.id;
  }

  /**
   * 发布草稿为正式技能（进 Skill 商店，状态推进到 published）。
   * P1-9 双语命名：概览里的中文名称作为技能显示名（我们的 skill.name 本就支持中文），
   * slug 保留在 SKILL.md front-matter 的 name 字段里。
   */
  async function publishDraft(taskId: string): Promise<string> {
    const t = tasks.value.find((x) => x.id === taskId);
    if (!t) throw new Error('草稿不存在');
    if (!t.resultMd) throw new Error('尚无蒸馏结果');

    const parsed = parseSkillMd(t.resultMd);
    const skillStore = useSkillStore();
    // P1-9 双语命名：概览中文名作为技能显示名（skill.name 支持中文），slug 留在 front-matter name
    const displayName = (t.overview?.nameZh || '').trim() || parsed.name;
    const skillId = await skillStore.createCustom(
      displayName,
      parsed.description,
      parsed.body,
      parsed.triggers,
    );
    t.status = 'published';
    await persistTask(t);
    return skillId;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SkillOverview ↔ SKILL.md 互转
  // ─────────────────────────────────────────────────────────────────────────

  /** SKILL.md front-matter → SkillOverview（老草稿反推；字段缺失给空值不抛错） */
  function overviewFromMd(md: string): SkillOverview {
    const parsed = parseSkillMd(md);
    return {
      nameZh: parsed.description?.slice(0, 30) || parsed.name,
      slug: parsed.name,
      description: parsed.description || '',
      inputs: [],
      steps: extractStepsFromBody(parsed.body),
      outputs: [],
      triggers: parsed.triggers,
    };
  }

  /** 从 body 提取有序步骤（## 工作流程 段的有序列表项；无则退化为所有行首序号行） */
  function extractStepsFromBody(body: string): string[] {
    const wfMatch = body.match(/##\s*工作流程([\s\S]*?)(?=\n##\s|\s*$)/);
    const seg = wfMatch ? wfMatch[1] : body;
    const steps: string[] = [];
    for (const line of seg.split('\n')) {
      const m = line.match(/^\s*\d+[.、)）]\s*(.+)$/);
      if (m) steps.push(m[1].trim());
    }
    return steps;
  }

  /** 概览 → 可读文本（提炼提示词的用户段） */
  function formatOverview(o: SkillOverview): string {
    return [
      `【技能概览】`,
      `中文名称：${o.nameZh}`,
      `英文标识：${o.slug}`,
      `说明：${o.description}`,
      o.inputs.length ? `前置输入：\n${o.inputs.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '前置输入：（无）',
      o.steps.length ? `处理过程：\n${o.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '处理过程：（无）',
      o.outputs.length ? `输出内容：\n${o.outputs.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '输出内容：（无）',
      o.triggers.length ? `触发词：${o.triggers.join('、')}` : '触发词：（无）',
    ].join('\n');
  }

  /** 校验 LLM 输出的概览 JSON（逐字段类型收敛，坏字段给默认值） */
  function sanitizeOverview(raw: any): SkillOverview {
    const strArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, 20) : [];
    return {
      nameZh: typeof raw?.nameZh === 'string' && raw.nameZh.trim() ? raw.nameZh.trim() : '未命名技能',
      slug: typeof raw?.slug === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(raw.slug.trim())
        ? raw.slug.trim()
        : 'distilled-skill',
      description: typeof raw?.description === 'string' ? raw.description.trim() : '',
      inputs: strArr(raw?.inputs),
      steps: strArr(raw?.steps),
      outputs: strArr(raw?.outputs),
      triggers: strArr(raw?.triggers),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 核心动作
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * 执行蒸馏（一键直通：勾选消息 → SKILL.md）。
   * 兼容旧调用方（SkillDistill.vue / DistillDialog.vue），返回内存任务 id。
   */
  async function distill(
    messages: Array<{ role: string; content: string }>,
    opts?: { title?: string; sourceConvId?: string },
  ): Promise<string> {
    const task = createTask(messages, opts);
    const resolved = resolvePlatformModel();
    if (!resolved) {
      task.status = 'failed';
      task.error = '未配置可用的平台/模型，请先在模型平台配置或在蒸馏配置中选择';
      throw new Error(task.error);
    }

    task.status = 'running';
    try {
      const client = new LlmClient(resolved.platform, resolved.model);
      const llmMessages: any[] = [
        { role: 'system', content: config.value.systemPrompt },
        { role: 'user', content: formatMessages(messages) },
      ];
      const response = await client.chat(llmMessages, {
        temperature: config.value.temperature,
        topP: config.value.topP,
        maxTokens: config.value.maxTokens,
      });
      const content = response.delta?.content || '';
      if (!content) throw new Error('LLM 返回空内容');

      task.resultMd = content.trim();
      task.status = 'done';
      await persistTask(task);
    } catch (e: any) {
      task.status = 'failed';
      task.error = e?.message || String(e);
      await persistTask(task);
      throw e;
    }
    return task.id;
  }

  /** 创建内存任务并入列表（此时未落库） */
  function createTask(
    messages: Array<{ role: string; content: string }>,
    opts?: { title?: string; sourceConvId?: string },
  ): DistillTask {
    const task: DistillTask = {
      id: uid('draft_'),
      title: opts?.title || `蒸馏任务 ${new Date().toLocaleString()}`,
      sourceMessages: messages,
      status: 'pending',
      resultMd: '',
      createdAt: Date.now(),
      overview: null,
      sourceConvId: opts?.sourceConvId || null,
      persisted: false,
    };
    tasks.value.unshift(task);
    return task;
  }

  /** 把源消息挂到已有任务（两段式第一步之后，用户可能改选消息再提炼） */
  function attachSourceMessages(taskId: string, messages: Array<{ role: string; content: string }>): void {
    const t = tasks.value.find((x) => x.id === taskId);
    if (t) t.sourceMessages = messages;
  }

  /**
   * 两段式·第一段：AI 生成技能概览（人可修正）。
   * 产出 status='overview' 的任务并落库。
   */
  async function generateOverview(
    messages: Array<{ role: string; content: string }>,
    opts?: { title?: string; sourceConvId?: string },
  ): Promise<string> {
    const task = createTask(messages, opts);
    const resolved = resolvePlatformModel();
    if (!resolved) {
      task.status = 'failed';
      task.error = '未配置可用的平台/模型，请先在模型平台配置或在蒸馏配置中选择';
      throw new Error(task.error);
    }

    task.status = 'running';
    try {
      const client = new LlmClient(resolved.platform, resolved.model);
      const llmMessages: any[] = [
        { role: 'system', content: OVERVIEW_SYSTEM_PROMPT },
        { role: 'user', content: formatMessages(messages) },
      ];
      const response = await client.chat(llmMessages, {
        temperature: config.value.temperature,
        topP: config.value.topP,
        maxTokens: Math.max(config.value.maxTokens, 1200),
        responseFormat: { type: 'json_object' },
      });
      const content = response.delta?.content || '';
      if (!content) throw new Error('LLM 返回空内容');

      let parsed: any = null;
      try { parsed = JSON.parse(content); } catch { throw new Error('概览输出不是合法 JSON'); }
      task.overview = sanitizeOverview(parsed);
      task.status = 'overview';
      await persistTask(task);
    } catch (e: any) {
      task.status = 'failed';
      task.error = e?.message || String(e);
      await persistTask(task);
    }
    return task.id;
  }

  /**
   * 两段式·第二段：以（人修正过的）概览为硬约束提炼 SKILL.md。
   * 需要源消息——优先内存里的 sourceMessages，没有（老草稿刷新后）则按 sourceMsgIds 回查失败直接报错。
   */
  async function distillFromOverview(taskId: string): Promise<void> {
    const task = tasks.value.find((t) => t.id === taskId);
    if (!task) throw new Error('草稿不存在');
    if (!task.overview) throw new Error('请先生成或填写技能概览');

    const resolved = resolvePlatformModel();
    if (!resolved) throw new Error('未配置可用的平台/模型');

    if (!task.sourceMessages.length) {
      throw new Error('源消息已不在内存中（页面刷新后需重新勾选消息再提炼）');
    }

    task.status = 'running';
    try {
      const client = new LlmClient(resolved.platform, resolved.model);
      const llmMessages: any[] = [
        { role: 'system', content: DISTILL_FROM_OVERVIEW_PROMPT },
        { role: 'user', content: `${formatOverview(task.overview)}\n\n--- 原始对话记录 ---\n${formatMessages(task.sourceMessages)}` },
      ];
      const response = await client.chat(llmMessages, {
        temperature: config.value.temperature,
        topP: config.value.topP,
        maxTokens: config.value.maxTokens,
      });
      const content = response.delta?.content || '';
      if (!content) throw new Error('LLM 返回空内容');

      task.resultMd = content.trim();
      task.status = 'done';
      await persistTask(task);
    } catch (e: any) {
      task.status = 'failed';
      task.error = e?.message || String(e);
      await persistTask(task);
    }
  }

  /** 通过对话改造 Skill（保留旧方法名与行为） */
  async function refineSkill(taskId: string, instruction: string): Promise<void> {
    const task = tasks.value.find((t) => t.id === taskId);
    if (!task) throw new Error('任务不存在');
    if (!task.resultMd) throw new Error('尚无蒸馏结果，无法改造');

    const resolved = resolvePlatformModel();
    if (!resolved) throw new Error('未配置可用的平台/模型');

    task.status = 'running';
    try {
      const client = new LlmClient(resolved.platform, resolved.model);
      const llmMessages: any[] = [
        {
          role: 'system',
          content:
            '你是 Skill 改造助手。用户会给你当前的 Skill Markdown 和一条改造指令，请根据指令修改 Skill 并输出完整的修改后 Skill Markdown。只输出 Skill Markdown，不要输出其他解释。',
        },
        {
          role: 'user',
          content: `当前 Skill：\n\n${task.resultMd}\n\n改造指令：${instruction}`,
        },
      ];
      const response = await client.chat(llmMessages, {
        temperature: config.value.temperature,
        topP: config.value.topP,
        maxTokens: config.value.maxTokens,
      });
      const content = response.delta?.content || '';
      if (!content) throw new Error('LLM 返回空内容');
      task.resultMd = content.trim();
      task.status = 'done';
      await persistTask(task);
    } catch (e: any) {
      task.status = 'failed';
      task.error = e?.message || String(e);
      await persistTask(task);
    }
  }

  /** 解析 Skill Markdown 的 front-matter */
  function parseSkillMd(md: string): { name: string; description: string; triggers: string[]; body: string } {
    const fmMatch = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    if (!fmMatch) return { name: 'distilled-skill', description: '', triggers: [], body: md };
    const [, fmRaw, body] = fmMatch;
    const result = { name: 'distilled-skill', description: '', triggers: [] as string[], body: body.trim() };
    const lines = fmRaw.split('\n');
    let currentKey = '';
    for (const line of lines) {
      const keyMatch = line.match(/^(\w+)\s*:\s*(.*)$/);
      if (keyMatch) {
        currentKey = keyMatch[1];
        if (currentKey === 'triggers') {
          result.triggers = [];
        } else if (currentKey === 'name') {
          result.name = keyMatch[2].trim();
        } else if (currentKey === 'description') {
          result.description = keyMatch[2].trim();
        }
      } else if (currentKey === 'triggers') {
        const itemMatch = line.match(/^\s+-\s+(.*)/);
        if (itemMatch) result.triggers.push(itemMatch[1].trim());
      }
    }
    return result;
  }

  /** 保存蒸馏结果到 Skill 商店（正式发布），并把草稿状态推进到 published */
  async function saveAsSkill(taskId: string): Promise<string> {
    const task = tasks.value.find((t) => t.id === taskId);
    if (!task) throw new Error('任务不存在');
    if (!task.resultMd) throw new Error('尚无蒸馏结果');

    const skillId = await saveMdAsSkill(task.resultMd);
    task.status = 'published';
    await persistTask(task);
    return skillId;
  }

  /** 直接改造 Markdown（不需要 task，返回改造后的 Markdown） */
  async function refineMd(md: string, instruction: string): Promise<string> {
    const resolved = resolvePlatformModel();
    if (!resolved) throw new Error('未配置可用的平台/模型');

    const client = new LlmClient(resolved.platform, resolved.model);
    const llmMessages: any[] = [
      {
        role: 'system',
        content:
          '你是 Skill 改造助手。用户会给你当前的 Skill Markdown 和一条改造指令，请根据指令修改 Skill 并输出完整的修改后 Skill Markdown。只输出 Skill Markdown，不要输出其他解释。',
      },
      {
        role: 'user',
        content: `当前 Skill：\n\n${md}\n\n改造指令：${instruction}`,
      },
    ];
    const response = await client.chat(llmMessages, {
      temperature: config.value.temperature,
      topP: config.value.topP,
      maxTokens: config.value.maxTokens,
    });
    const content = response.delta?.content || '';
    if (!content) throw new Error('LLM 返回空内容');
    return content.trim();
  }

  /** 重新蒸馏（一键直通重跑） */
  async function redistill(taskId: string): Promise<void> {
    const task = tasks.value.find((t) => t.id === taskId);
    if (!task) throw new Error('任务不存在');
    if (!task.sourceMessages.length) {
      throw new Error('源消息已不在内存中（页面刷新后需重新勾选消息）');
    }
    const resolved = resolvePlatformModel();
    if (!resolved) throw new Error('未配置可用的平台/模型');
    task.status = 'running';
    task.error = undefined;
    try {
      const client = new LlmClient(resolved.platform, resolved.model);
      const llmMessages: any[] = [
        { role: 'system', content: config.value.systemPrompt },
        { role: 'user', content: formatMessages(task.sourceMessages) },
      ];
      const response = await client.chat(llmMessages, {
        temperature: config.value.temperature,
        topP: config.value.topP,
        maxTokens: config.value.maxTokens,
      });
      task.resultMd = (response.delta?.content || '').trim();
      task.status = 'done';
      await persistTask(task);
    } catch (e: any) {
      task.status = 'failed';
      task.error = e?.message || String(e);
      await persistTask(task);
    }
  }

  /**
   * AI 自动过滤：给消息打噪标签，把无效消息自动置 excluded。
   * 返回被判为噪消息的 id 列表（调用方置 excluded，可撤销）。
   * 只对候选（工具态/超长/空消息）打标，分批（每批 ≤50 条）控制成本。
   */
  async function autoFilter(
    messages: Array<{ id: string; role: string; content: string }>,
  ): Promise<string[]> {
    const resolved = resolvePlatformModel();
    if (!resolved) throw new Error('未配置可用的平台/模型');

    // 候选：空消息 / 明显是工具中间态或超长的 assistant 消息（正常短对话不打扰模型）
    const isCandidate = (m: { role: string; content: string }) => {
      const c = m.content || '';
      return !c.trim() || (m.role === 'assistant' && (c.length > 2000 || /^\s*\[?工具|tool_call/i.test(c)));
    };
    const candidates = messages.filter(isCandidate);
    if (!candidates.length) return [];

    const noiseIds: string[] = [];
    const BATCH = 50;
    for (let i = 0; i < candidates.length; i += BATCH) {
      const batch = candidates.slice(i, i + BATCH);
      const listing = batch
        .map((m, idx) => `${idx + 1}. [id=${m.id}] ${(m.content || '(空)').slice(0, 200).replace(/\n/g, ' ')}`)
        .join('\n');
      try {
        const client = new LlmClient(resolved.platform, resolved.model);
        const response = await client.chat(
          [
            {
              id: '', conversationId: '', role: 'system' as const, createdAt: 0,
              content:
                '你是数据清洗助手。给定任务对话中的若干消息片段，判断哪些是「无效信息」（工具调用的中间态输出、报错重试记录、空消息、与任务流程无关的调试输出）。'
                + '只输出 JSON：{"noise": [id1, id2, ...]}，noise 数组里放被判为无效消息的 id 原文。只输出 JSON。',
            },
            { id: '', conversationId: '', role: 'user' as const, createdAt: 0, content: listing },
          ],
          {
            temperature: 0,
            maxTokens: 800,
            responseFormat: { type: 'json_object' },
          },
        );
        const parsed = JSON.parse(response.delta?.content || '');
        if (Array.isArray(parsed?.noise)) {
          const idSet = new Set(batch.map((m) => m.id));
          for (const nid of parsed.noise) {
            if (typeof nid === 'string' && idSet.has(nid)) noiseIds.push(nid);
          }
        }
      } catch {
        // 单批失败跳过，不影响其他批次
      }
    }
    return noiseIds;
  }

  function removeTask(id: string) {
    tasks.value = tasks.value.filter((t) => t.id !== id);
    void api.delete(`/skill-drafts/${id}`);
  }

  function clearTasks() {
    for (const t of tasks.value) {
      void api.delete(`/skill-drafts/${t.id}`);
    }
    tasks.value = [];
  }

  function getTask(id: string): DistillTask | undefined {
    return tasks.value.find((t) => t.id === id);
  }

  return {
    config,
    loaded,
    tasks,
    loading,
    loadConfig,
    saveConfig,
    updateConfig,
    resetPrompt,
    loadTasks,
    distill,
    generateOverview,
    distillFromOverview,
    autoFilter,
    attachSourceMessages,
    refineSkill,
    refineMd,
    redistill,
    saveAsSkill,
    saveMdAsSkill,
    saveMdAsDraft,
    publishDraft,
    updateOverview,
    updateResultMd,
    parseSkillMd,
    overviewFromMd,
    sanitizeOverview,
    removeTask,
    clearTasks,
    getTask,
    DEFAULT_DISTILL_PROMPT,
  };
});
