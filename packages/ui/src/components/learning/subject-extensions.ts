// 学习科目声明式扩展表 —— 新科目接线的唯一入口（docs/传统文化与音乐学习模式方案-2026-11-14.md §4.5）。
// ★ 设计：存量三科目（英语/软考/网络安全）保持 Learning.vue 原硬编码分支不动（准则 §5 按科目分批）；
//   新科目只在本表登记，Learning.vue 的三个通用点（tabDefs / switchSubject / 中栏挂载）先查表、
//   查不到再回落存量分支。加新科目 = 本表加一项 + 服务端 LEARNING_SUBJECTS/课程目录登记 + Workbench 组件。

export type LearningTabKey = 'culture' | 'canon' | 'studio' | 'music' | 'compose' | 'coach' | 'zhouyi' | 'divination';

export type SubjectExtension = {
  /** 切到该科目时落入的默认 tab */
  tab: LearningTabKey;
  /** 中栏 Tab 定义（单 Tab 科目不显示 Tab 条；key 必须是窄字面量，供 switchTab 类型收窄） */
  tabDefs: ReadonlyArray<{ key: LearningTabKey; label: string }>;
  /**
   * 该科目陪练智能体 id。
   * ★ 与 apps/server/src/builtin-learning-agents.ts 的 CULTURE_COACH_AGENT_ID / MUSIC_COACH_AGENT_ID
   *   成对维护（服务端有契约单测），改一边必须同步另一边。
   */
  agentId: string;
};

export const SUBJECT_EXTENSIONS = {
  '传统文化': {
    tab: 'culture',
    tabDefs: [
      { key: 'culture', label: '零基础主线' },
      { key: 'studio', label: '创作实践' },
      { key: 'canon', label: '典籍文库' },
      { key: 'coach', label: '陪练对话' },
    ],
    agentId: 'a_builtin_culture_coach',
  },
  '音乐': {
    tab: 'music',
    tabDefs: [
      { key: 'music', label: '识谱与编曲' },
      { key: 'compose', label: '编曲台' },
      { key: 'coach', label: '陪练对话' },
    ],
    agentId: 'a_builtin_music_coach',
  },
  // 周易独立学科（docs/周易课程方案-2026-11-15.md §3.0）：课程主线 + 测算实践 + 陪练对话
  '周易': {
    tab: 'zhouyi',
    tabDefs: [
      { key: 'zhouyi', label: '课程主线' },
      { key: 'divination', label: '测算实践' },
      { key: 'coach', label: '陪练对话' },
    ],
    agentId: 'a_builtin_zhouyi_coach',
  },
} as const satisfies Record<string, SubjectExtension>;

export function subjectExtensionOf(key: string): SubjectExtension | undefined {
  return (SUBJECT_EXTENSIONS as Record<string, SubjectExtension>)[key];
}
