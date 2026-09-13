// Git AI 能力：提交信息生成（规则 + 自定义提示词，持久化到 localStorage）
import { ref } from 'vue';
import type { Platform, Model } from '@yan-zhi/shared';
import { LlmClient } from '@yan-zhi/core';
import { useSettingsStore } from '../../stores/settings';
import { usePlatformStore } from '../../stores/platform';

export interface AiCommitRule {
  value: string;
  label: string;
  desc: string;
}

export const AI_COMMIT_RULES: AiCommitRule[] = [
  { value: 'conventional', label: '标准格式', desc: 'feat/fix/docs 等类型前缀 + 简述' },
  { value: 'concise', label: '一句话摘要', desc: '只用一行文字概括变更内容' },
  { value: 'detailed', label: '详细描述', desc: '一行摘要 + 正文说明具体变更' },
  { value: 'custom', label: '自定义提示词', desc: '用你自己的指令生成提交信息' },
];

const LS_RULE = 'yz:git:ai-commit-rule';
const LS_CUSTOM = 'yz:git:ai-commit-custom';

function readLs(key: string): string {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function writeLs(key: string, v: string): void {
  try { localStorage.setItem(key, v); } catch { /* ignore */ }
}

export function buildCommitPrompt(rule: string, customRule = ''): string {
  switch (rule) {
    case 'conventional':
      return '你是 Git commit message 生成器。根据给出的 git diff 生成 Conventional Commits 规范的提交信息。格式：type(scope): description。type 包括 feat/fix/docs/style/refactor/perf/test/chore。只输出 commit message 正文，不要解释、不要 markdown 代码块。';
    case 'concise':
      return '你是 Git commit message 生成器。根据给出的 git diff 用一行简短的文字概括变更内容。只输出这一行文字，不要解释、不要前缀。';
    case 'detailed':
      return '你是 Git commit message 生成器。根据给出的 git diff 生成提交信息：第一行是简短摘要，空一行后用正文说明具体变更内容。只输出 commit message，不要解释、不要 markdown 代码块。';
    case 'custom':
      return `你是 Git commit message 生成器。根据给出的 git diff 生成提交信息。规则：${customRule || '按你的判断生成合适的提交信息'}。只输出 commit message 正文，不要解释。`;
    default:
      return '你是 Git commit message 生成器。根据给出的 git diff 生成合适的提交信息。只输出 commit message 正文。';
  }
}

/** 供提交弹窗使用：规则选择 + 自定义提示词 + 生成 */
export function useGitAi() {
  const settingsStore = useSettingsStore();
  const platformStore = usePlatformStore();

  const rule = ref<string>(readLs(LS_RULE) || 'conventional');
  const customRule = ref<string>(readLs(LS_CUSTOM) || '');
  const loading = ref(false);

  function setRule(v: string): void {
    rule.value = v;
    writeLs(LS_RULE, v);
  }
  function setCustomRule(v: string): void {
    customRule.value = v;
    writeLs(LS_CUSTOM, v);
  }

  async function resolveAiPlatform(): Promise<{ platform: Platform; model: Model }> {
    if (platformStore.platforms.length === 0) await platformStore.loadPlatforms();
    if (platformStore.models.length === 0) await platformStore.loadModels();
    const pid = settingsStore.settings.defaultPlatformId;
    const mid = settingsStore.settings.defaultModelId;
    const platform = platformStore.platforms.find((p) => p.id === pid);
    const model = platform ? platformStore.resolveModel(mid, pid) : undefined;
    if (platform && model) return { platform, model };
    const llm = platformStore.models.find((m) => m.type === 'llm' && m.isDefault)
      || platformStore.models.find((m) => m.type === 'llm');
    const fp = llm && platformStore.platforms.find((p) => p.id === llm.platformId);
    if (!llm || !fp) throw new Error('未配置可用的 AI 模型，请先在设置中配置模型平台');
    return { platform: fp, model: llm };
  }

  /** 根据 diff 生成提交信息 */
  async function generateCommitMessage(diff: string): Promise<string> {
    if (!diff.trim()) throw new Error('没有可分析的变更内容');
    const { platform, model } = await resolveAiPlatform();
    const client = new LlmClient(platform, model);
    // 与既有调用一致：内部 Message 与 OpenAI snake_case 结构不同构，这里用 any 规避类型摩擦
    const resp = await client.chat([
      { role: 'system', content: buildCommitPrompt(rule.value, customRule.value) },
      { role: 'user', content: `以下是 git diff，请生成 commit message：\n\n${diff}` },
    ] as never, { temperature: 0.3, maxTokens: 512 });
    const content = (resp.delta?.content || '').trim();
    if (!content) throw new Error('AI 返回空内容');
    return content.replace(/^```[\s\S]*?\n/, '').replace(/```$/, '').trim();
  }

  return { rule, customRule, loading, setRule, setCustomRule, generateCommitMessage };
}
