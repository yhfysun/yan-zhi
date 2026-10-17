// 安全经验库的**注入闸门**（单一事实来源）。
//
// 为什么单独一个文件：经验正文进入系统提示词后就能改变模型行为，因此"读哪一份、取哪些条目"
// 必须只有一处实现。这里的硬口径：
//   1) 只读 `status === 'approved'`；pending / rejected 一律不进提示词；
//   2) 只对安全相关智能体注入（主安全助手 + 三个子体），不影响办公/代码等其它模式；
//   3) 渲染由 expstore.renderExperiencePrompt 统一做（引用块 + 条数/字符预算）。
//
// ★ 不做缓存：提示词每个任务重建一次，SQLite 单行读取成本可忽略；缓存反而会让
//   "刚批准的经验要重启才生效"这种问题出现。
import { db } from '../db.js';
import {
  renderExperiencePrompt,
  type ExperienceEntry,
} from '../plugins/sec-lab-tools/expstore.js';

/** 会收到安全经验注入的智能体（主助手 + P4 三个子体） */
export const SEC_EXPERIENCE_AGENT_IDS: ReadonlySet<string> = new Set([
  'a_builtin_sec_agent',
  'a_builtin_sec_recon_agent',
  'a_builtin_sec_web_agent',
  'a_builtin_sec_report_agent',
]);

/** 从 plugin_storage 读取 sec-lab 的经验条目（容错：表不存在/JSON 损坏都当作空） */
export function loadSecExperienceEntries(): ExperienceEntry[] {
  try {
    const row = db
      .prepare("SELECT value FROM plugin_storage WHERE plugin_id = 'sec-lab' AND key = 'experience'")
      .get() as { value?: string | null } | undefined;
    if (!row?.value) return [];
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? (parsed as ExperienceEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * 构建要拼进系统提示词的经验段。
 * ★ 返回 '' 表示不注入（没有已批准条目 / 读失败）。
 */
export function buildSecExperiencePromptSection(): string {
  return renderExperiencePrompt(loadSecExperienceEntries());
}

/** 该智能体是否属于安全域（决定要不要注入经验库） */
export function isSecExperienceAgent(agentId: string | null | undefined): boolean {
  return !!agentId && SEC_EXPERIENCE_AGENT_IDS.has(agentId);
}
