// Skill 蒸馏 store —— 从对话记录蒸馏出可复用 Skill
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getPlatformAdapter, LlmClient } from '@yan-zhi/core';
import { uid } from '@yan-zhi/shared';
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

export interface DistillTask {
  id: string;
  title: string;
  sourceMessages: Array<{ role: string; content: string }>;
  status: 'pending' | 'running' | 'done' | 'failed';
  resultMd: string;
  error?: string;
  createdAt: number;
}

const STORAGE_KEY = 'settings:distill';

export const useDistillStore = defineStore('distill', () => {
  const config = ref<DistillConfig>({ ...DEFAULT_CONFIG });
  const loaded = ref(false);
  const tasks = ref<DistillTask[]>([]);

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

  /** 执行蒸馏 */
  async function distill(
    messages: Array<{ role: string; content: string }>,
    opts?: { title?: string },
  ): Promise<string> {
    const resolved = resolvePlatformModel();
    if (!resolved) throw new Error('未配置可用的平台/模型，请先在模型平台配置或在蒸馏配置中选择');

    const taskId = uid('distill_');
    const task: DistillTask = {
      id: taskId,
      title: opts?.title || `蒸馏任务 ${new Date().toLocaleString()}`,
      sourceMessages: messages,
      status: 'running',
      resultMd: '',
      createdAt: Date.now(),
    };
    tasks.value.unshift(task);

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
    } catch (e: any) {
      task.status = 'failed';
      task.error = e?.message || String(e);
      throw e;
    }
    return taskId;
  }

  /** 通过对话改造 Skill */
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
    } catch (e: any) {
      task.status = 'failed';
      task.error = e?.message || String(e);
      throw e;
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

  /** 保存蒸馏结果到 Skill 商店 */
  async function saveAsSkill(taskId: string): Promise<string> {
    const task = tasks.value.find((t) => t.id === taskId);
    if (!task) throw new Error('任务不存在');
    if (!task.resultMd) throw new Error('尚无蒸馏结果');

    return saveMdAsSkill(task.resultMd);
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

  /** 重新蒸馏 */
  async function redistill(taskId: string): Promise<void> {
    const task = tasks.value.find((t) => t.id === taskId);
    if (!task) throw new Error('任务不存在');
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
    } catch (e: any) {
      task.status = 'failed';
      task.error = e?.message || String(e);
      throw e;
    }
  }

  function removeTask(id: string) {
    tasks.value = tasks.value.filter((t) => t.id !== id);
  }

  function clearTasks() {
    tasks.value = [];
  }

  function getTask(id: string): DistillTask | undefined {
    return tasks.value.find((t) => t.id === id);
  }

  return {
    config,
    loaded,
    tasks,
    loadConfig,
    saveConfig,
    updateConfig,
    resetPrompt,
    distill,
    refineSkill,
    refineMd,
    redistill,
    saveAsSkill,
    saveMdAsSkill,
    parseSkillMd,
    removeTask,
    clearTasks,
    getTask,
    DEFAULT_DISTILL_PROMPT,
  };
});