// 学习模式陪练「按科目分派」的唯一配置表。
//
// 为什么单独抽出来：陪练会话的 agentId 早已按科目分派（SUBJECT_EXTENSIONS 与
// apps/server/src/builtin-learning-agents.ts 成对维护），但陪练**面板**的标题、角色标签、
// 空态兜底、开场 prompt 长期硬编码英语学科 —— 切到周易/传统文化/音乐仍显示
// "Hi, I'm ready. What would you like to practice today?"，并用英文开场白去请求中文陪练。
// 判据：会话身份与界面呈现是同一语义，必须收口到一张表；逐处补文案必然漏。
//
// 英语保持原有口语陪练话术（含英文空态，这是该科目的教学目标）；其余科目全中文。

export type CoachProfile = {
  /** 标题上方的眉标 */
  eyebrow: string;
  /** 面板主标题（无场景时） */
  title: string;
  /** 标题下的说明 */
  subtitle: string;
  /** 气泡头部的角色标签 */
  roleLabel: string;
  /** 空态「先开场」按钮 */
  startLabel: string;
  /** 尚无任何消息时气泡里的兜底话术 */
  emptyReply: string;
  /** 点「先开场」发给该科目陪练的预设 prompt（不计入用户真实轮次） */
  openingPrompt: string;
  /** 打字降级的输入框 placeholder（无场景时） */
  typingPlaceholder: string;
  /** 麦克风空闲提示（无场景时） */
  talkIdleHint: string;
};

const ENGLISH_OPENING_PROMPT = [
  'Hi! I want to practice English freely, without a fixed scene.',
  'Start with one short question about what I want to talk about today.',
  'Then continue naturally one question at a time, follow my topic, and recast important mistakes briefly.',
  'Do not use scene missions, role-play scripts, or scene_result unless I ask for a scene.',
].join('\n');

export const COACH_PROFILES: Record<string, CoachProfile> = {
  '英语': {
    eyebrow: '自由口语陪练',
    title: '和言言聊聊今天',
    subtitle: '不用准备台词，直接开口。说错了也没关系，言言会顺着你的意思继续聊。',
    roleLabel: '英语陪练',
    startLabel: '让言言先开场',
    emptyReply: "Hi, I'm ready. What would you like to practice today?",
    openingPrompt: ENGLISH_OPENING_PROMPT,
    typingPlaceholder: '不方便开口时，在这里打字…',
    talkIdleHint: '不用打字，开口和言言聊',
  },
  '传统文化': {
    eyebrow: '典籍答疑 · 蒙学与对句',
    title: '和先生聊聊这一课',
    subtitle: '读典籍、问注解、练对句都可以。先生只讲预写注解里的字面、白话与背景，不编造古人原话。',
    roleLabel: '传统文化陪练',
    startLabel: '请先生先开讲',
    emptyReply: '今天想读哪一篇？可以先从「天对地，雨对风」的对句规矩聊起。',
    openingPrompt: [
      '请用中文开始一次传统文化陪练，不要使用英语。',
      '先问我最近在读哪一篇典籍，再用一句话讲清当下的学习重点。',
      '讲解一律基于课程内容，不虚构典籍原文与古人注语；记不准的出处直接说明不能确定。',
      '一次只问一个问题，每次最多讲 3 个要点。',
    ].join('\n'),
    typingPlaceholder: '不方便开口时，在这里打字…',
    talkIdleHint: '不用打字，开口问先生',
  },
  '音乐': {
    eyebrow: '乐理答疑 · 识谱与编曲',
    title: '和老师聊聊这一课',
    subtitle: '听音、识谱、编小曲、填词都能问。现代乐理与中国传统音乐两套概念分开讲，不混用。',
    roleLabel: '音乐陪练',
    startLabel: '请老师先开讲',
    emptyReply: '今天想练哪一步？可以先从「听一个音、拍一下手」开始。',
    openingPrompt: [
      '请用中文开始一次音乐陪练，不要使用英语。',
      '先问我今天想练听音、识谱还是编曲，再从最基础的一步讲起。',
      '术语第一次出现要跟一句大白话；课程未覆盖的领域明说「这一课还没学到」。',
      '一次只问一个问题，每次最多讲 3 个要点。',
    ].join('\n'),
    typingPlaceholder: '不方便开口时，在这里打字…',
    talkIdleHint: '不用打字，开口问老师',
  },
  '周易': {
    eyebrow: '课程答疑 · 经传与术数',
    title: '和先生聊聊这一课',
    subtitle: '读经传、辨注疏、问象数都可以。先生只讲文献与古籍规则口径，不做个人化预测。',
    roleLabel: '周易陪练',
    startLabel: '请先生先开讲',
    emptyReply: '今天想读哪一段？可以先从「经与传有什么区别」聊起。',
    openingPrompt: [
      '请用中文开始一次周易陪练，不要使用英语。',
      '先问我今天在读经传、注疏还是象数，再严守注释（字词训诂）与注解（历代义理）两层的分别讲清一个要点。',
      '引用典籍必须给书名与注家，逐字引文只引确切记得的，记不准就明说是「大意转述」或「我不能确定」。',
      '经学（经传、注疏、易图）与术数（易占、风水、命理）按四库分类分域说明，不把风水命理说成本经内容。',
      '测算只讲古法推演与古籍规则口径，吉凶用语标「规则演示」，不做个人化预测断语。',
      '一次只问一个问题，每次最多讲 3 个要点。',
    ].join('\n'),
    typingPlaceholder: '不方便开口时，在这里打字…',
    talkIdleHint: '不用打字，开口问先生',
  },
};

/** 未知科目回落英语，避免新增科目忘了登记时面板空白。 */
export function coachProfileOf(subject: string): CoachProfile {
  return COACH_PROFILES[subject] ?? COACH_PROFILES['英语'];
}

/**
 * 所有开场预设的识别前缀。
 * 用途：预设 prompt 是系统代发的，不能算进用户真实发言轮次（否则场景进度/复盘会算错）。
 * 由科目表派生，新增科目无需再改正则。末尾几条是历史会话里的旧英文预设兼容。
 */
export function coachPresetPrefixes(): string[] {
  return [
    ...Object.values(COACH_PROFILES).map((p) => p.openingPrompt.split('\n')[0]),
    'Hi! I want to practice English',
    'I am ready. Please start',
    'Continue the current scene',
    '请根据当前场景',
    '请提示我怎么说',
  ];
}
