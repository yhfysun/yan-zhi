export type EnglishPathStepKind = 'phonics' | 'roots' | 'grammar' | 'story' | 'speaking';

export type EnglishPathStep = {
  id: string;
  kind: EnglishPathStepKind;
  title: string;
  goal: string;
  minutes: number;
  explanation: string;
  pattern?: string;
  tip: string;
  examples: Array<{ en: string; zh: string }>;
  task: string;
};

export type EnglishPathStage = {
  id: string;
  title: string;
  subtitle: string;
  level: string;
  steps: EnglishPathStep[];
};

/**
 * 零基础英语主线。
 *
 * 内容为原创改写，吸收自然拼读、词根词缀、结构语法、可理解输入和情景输出等公开学习方法；
 * 不复制任何付费课程原文。每个阶段只放少量可立即练习的微课，避免把教材目录原样搬进页面。
 */
export const ENGLISH_PATH: EnglishPathStage[] = [
  {
    id: 'sounds',
    title: '先会读',
    subtitle: '看到词能拆音，听到词能拼回去',
    level: '零基础',
    steps: [
      {
        id: 'sound_short_vowels',
        kind: 'phonics',
        title: '五个短元音',
        goal: '先分清 a/e/i/o/u 在闭音节里的基本声音',
        minutes: 8,
        explanation: '短元音像汉语拼音里的短促音，但嘴形更固定。先读单个音，再把辅音拼上去，不要一上来背整张音标表。',
        pattern: 'a /æ/ · e /e/ · i /ɪ/ · o /ɒ/ · u /ʌ/',
        tip: 'cat 里的 a、bed 里的 e、sit 里的 i，先把“辅音 + 元音 + 辅音”读顺。',
        examples: [
          { en: 'cat · bed · sit · hot · cup', zh: '猫 · 床 · 坐 · 热 · 杯子' },
          { en: 'A cat sat on a red mat.', zh: '一只猫坐在红色垫子上。' },
        ],
        task: '慢读三遍：cat, bed, sit, hot, cup。每读一个词，指出中间的元音字母。',
      },
      {
        id: 'sound_blending',
        kind: 'phonics',
        title: '拼读而不是逐字母念',
        goal: '把 c-a-t 连成 /kæt/，建立字母和声音的映射',
        minutes: 10,
        explanation: '自然拼读的关键是“合音”：先读首音，再接元音，最后接尾音。连续做几次后，大脑会直接把词形和声音连起来。',
        pattern: 'c + a + t → ca → cat',
        tip: '遇到长词时先切块：sun-set、bed-room、note-book。',
        examples: [
          { en: 'sunset · bedroom · notebook', zh: '日落 · 卧室 · 笔记本' },
          { en: 'Sun + set makes sunset.', zh: 'sun 和 set 合起来就是 sunset。' },
        ],
        task: '把 sunset、bedroom、notebook 各拆成两个词，再连续读五遍。',
      },
      {
        id: 'sound_common_pairs',
        kind: 'phonics',
        title: '高频字母组合',
        goal: '先掌握 sh/ch/th/ee/oo 这些最常见组合',
        minutes: 10,
        explanation: '字母组合要当成一个声音块记。先记最常见的一组，在单词里反复见，不要孤立背符号。',
        pattern: 'sh /ʃ/ · ch /tʃ/ · th /θ/ · ee /iː/ · oo /uː/',
        tip: '先用“听—指—读”三步：听到声音，指向词块，再完整读词。',
        examples: [
          { en: 'ship · chair · think · green · moon', zh: '船 · 椅子 · 想 · 绿色 · 月亮' },
          { en: 'The green ship is near the moon.', zh: '那艘绿色的船在月亮附近。' },
        ],
        task: '从今天遇到的单词里找 5 个含 sh、ch、th、ee 或 oo 的词。',
      },
    ],
  },
  {
    id: 'word-building',
    title: '会造词',
    subtitle: '高频词打底，词根词缀扩展词汇量',
    level: '入门',
    steps: [
      {
        id: 'roots_port',
        kind: 'roots',
        title: '词根 port：携带、搬运',
        goal: '用一个词根串起 import/export/transport/portable',
        minutes: 10,
        explanation: 'port 表示“带、运”。先记这个词根，再看前缀方向和后缀词性，比逐个死背四个词更稳。',
        pattern: 'im-(向内) + port = import；ex-(向外) + port = export',
        tip: '词根负责核心意思，前缀常常改变方向，后缀常决定词性。',
        examples: [
          { en: 'import · export · transport · portable', zh: '进口 · 出口 · 运输 · 便携的' },
          { en: 'We import coffee and export machines.', zh: '我们进口咖啡，出口机器。' },
        ],
        task: '用 import、export、transport 各说一句和物流有关的话。',
      },
      {
        id: 'roots_spect',
        kind: 'roots',
        title: '词根 spect：看',
        goal: '理解 inspect/respect/spectator 的共同画面',
        minutes: 10,
        explanation: 'spect 表示“看”。inspect 是往里看、检查；respect 是带着敬意看；spectator 是观看的人。',
        pattern: 'spect = look / see',
        tip: '把词根想成一幅画：有人正在“看”，再叠前后缀改变视角。',
        examples: [
          { en: 'inspect · respect · spectator', zh: '检查 · 尊重 · 观众' },
          { en: 'The inspector looked closely at the machine.', zh: '检查员仔细查看机器。' },
        ],
        task: '看 spect 这个画面，分别解释 inspect 和 respect 为什么是这个意思。',
      },
      {
        id: 'affixes_direction',
        kind: 'roots',
        title: '前后缀的方向感',
        goal: '用 re-/pre-/un-/-able 快速猜新词',
        minutes: 10,
        explanation: '前缀常给方向和态度，后缀常给词性。猜词不是乱猜，而是先拆出熟悉的部分。',
        pattern: 're- 再/回；pre- 之前；un- 否定；-able 能被……的',
        tip: '看到 rebuild：re + build = 重新建；看到 readable：read + able = 可读的。',
        examples: [
          { en: 'rebuild · preview · unlock · readable', zh: '重建 · 预览 · 解锁 · 可读的' },
          { en: 'Preview the file before you export it.', zh: '导出前先预览文件。' },
        ],
        task: '拆开 rebuild、preview、unlock、readable，并说出每部分的作用。',
      },
    ],
  },
  {
    id: 'sentence-core',
    title: '会造句',
    subtitle: '从句子骨架到时间线，语法用起来才记得住',
    level: 'A1-A2',
    steps: [
      {
        id: 'grammar_skeleton',
        kind: 'grammar',
        title: '句子先抓骨架',
        goal: '先找“谁做什么”，再加时间、地点和细节',
        minutes: 9,
        explanation: '英语句子先搭主谓宾骨架。中文习惯把很多信息塞在前面，英语更常先给核心动作，再补时间地点。',
        pattern: '主语 + 动作 + 对象 + 时间/地点',
        tip: '写长句前先问自己：谁？做什么？对什么？什么时候/在哪里？',
        examples: [
          { en: 'I read English stories before bed.', zh: '我睡前读英语故事。' },
          { en: 'She sends the report every Friday.', zh: '她每周五发送报告。' },
        ],
        task: '用“我 + 动作 + 对象 + 时间”造三句与你今天生活有关的句子。',
      },
      {
        id: 'grammar_timeline',
        kind: 'grammar',
        title: '时态是一条时间线',
        goal: '用时间线理解 do/did/will do/have done',
        minutes: 12,
        explanation: '不要孤立背时态名称。先在脑子里画时间线：现在常态、过去某点、将来、过去影响现在，各自有不同形式。',
        pattern: 'do/does 现在；did 过去；will do 将来；have/has done 影响现在',
        tip: '看到 yesterday 优先想过去式；看到 already 常想完成时；看到 every day 常想一般现在时。',
        examples: [
          { en: 'I study every day. / I studied yesterday. / I will study tomorrow.', zh: '每天学；昨天学了；明天会学。' },
          { en: 'I have finished today’s lesson.', zh: '我已经完成今天的课程了。' },
        ],
        task: '用 study 分别造出现在、过去、将来、完成时四句话。',
      },
      {
        id: 'grammar_questions',
        kind: 'grammar',
        title: '疑问句的移动规则',
        goal: '把陈述句稳定地变成问句',
        minutes: 10,
        explanation: '有 be 或情态动词就把它提到前面；没有就把 do/does/did 放前面，后面的动词回到原形。',
        pattern: '疑问词 + 助动词 + 主语 + 动词原形？',
        tip: '先找助动词，再移动；没有助动词就借一个。',
        examples: [
          { en: 'She works here. → Where does she work?', zh: '她在这里工作。→ 她在哪里工作？' },
          { en: 'They are ready. → Are they ready?', zh: '他们准备好了。→ 他们准备好了吗？' },
        ],
        task: '把三句陈述句改成问句，并圈出你移动或借来的助动词。',
      },
    ],
  },
  {
    id: 'story-input',
    title: '读故事',
    subtitle: '在真实语境里吸收词汇和句型',
    level: 'A2',
    steps: [
      {
        id: 'story_cafe',
        kind: 'story',
        title: '小故事：The Helpful Stranger',
        goal: '读懂一段短故事，并找出时间顺序',
        minutes: 12,
        explanation: '先读英文抓事件顺序，再看中文确认。不要逐字翻译，先回答“谁、在哪里、发生了什么”。',
        pattern: 'First... Then... After that... Finally...',
        tip: '故事阅读先找人物和动作，再处理不认识的形容词。',
        examples: [
          { en: 'Mia missed the last bus. A stranger gave her a ride home. She did not know his name, so she wrote a thank-you note and left it at the station.', zh: '米娅错过了末班车。一位陌生人开车送她回家。她不知道他的名字，于是写了一封感谢信留在车站。' },
          { en: 'Who helped Mia? Why did she leave a note?', zh: '谁帮助了米娅？她为什么留下便条？' },
        ],
        task: '用 First、Then、Finally 复述这个小故事，控制在三句话内。',
      },
      {
        id: 'story_morning',
        kind: 'story',
        title: '场景故事：A Quiet Morning',
        goal: '学习用一般现在时描写习惯',
        minutes: 10,
        explanation: '描写日常习惯时，一般现在时最自然。注意第三人称单数要加 -s。',
        pattern: 'Every morning, he/she + 动词(-s) + ...',
        tip: '把故事里的动作换成你自己的早晨，就能直接输出。',
        examples: [
          { en: 'Every morning, Leo opens the window and makes tea. He does not check work messages before seven.', zh: '每天早上，利奥打开窗户、泡茶。他七点前不看工作消息。' },
          { en: 'What do you do before breakfast?', zh: '你早饭前会做什么？' },
        ],
        task: '用三句话描述你的早晨，至少使用两个一般现在时动作。',
      },
      {
        id: 'story_retell',
        kind: 'story',
        title: '故事复述：从看懂到说出来',
        goal: '用连接词把零散句子连成一段话',
        minutes: 12,
        explanation: '复述不是背诵。先选三个关键动作，再用连接词串起来；不会的词可以换成更简单的表达。',
        pattern: 'At first... but... so... in the end...',
        tip: '先说清人物和冲突，再说解决方式，最后补一句感受。',
        examples: [
          { en: 'At first, the café was going to close. The neighbors helped, so it stayed open. In the end, everyone felt proud.', zh: '起初咖啡馆要关门。邻居们帮忙，所以它继续开着。最后大家都感到自豪。' },
        ],
        task: '任选今天读过的故事，用四句话复述：人物、问题、解决、感受。',
      },
    ],
  },
  {
    id: 'real-speaking',
    title: '能开口',
    subtitle: '把学到的词、句和故事迁移到真实交流',
    level: 'A2-B1',
    steps: [
      {
        id: 'speak_self',
        kind: 'speaking',
        title: '一分钟自我介绍',
        goal: '用固定结构稳定完成自我介绍',
        minutes: 8,
        explanation: '先给结构，再填自己的信息。熟练后替换细节，不要每次从零组织语言。',
        pattern: 'My name is... I am from... I usually... I want to...',
        tip: '每句只放一个重点，先清楚再追求复杂。',
        examples: [
          { en: 'My name is Lin. I am from Chengdu. I usually study English after dinner. I want to speak with confidence.', zh: '我叫林，来自成都。我通常晚饭后学英语。我想自信地开口。' },
        ],
        task: '录一段 45 秒自我介绍，必须包含姓名、地点、习惯和 goal。',
      },
      {
        id: 'speak_story',
        kind: 'speaking',
        title: '把故事讲给别人听',
        goal: '练习连接词、过去时和人物动作',
        minutes: 12,
        explanation: '讲故事时先交代场景，再讲问题，最后讲结果。过去时是主线，人物说的话可以用一般现在时。',
        pattern: 'Last week... Suddenly... So... In the end...',
        tip: '不会的单词用简单解释，不要因为一个词停下来。',
        examples: [
          { en: 'Last week, I missed a bus. A stranger helped me. I did not know his name, so I left a thank-you note. In the end, I felt grateful.', zh: '上周我错过了公交。一位陌生人帮助了我。我不知道他的名字，所以留了感谢信。最后我很感激。' },
        ],
        task: '用自己的话讲一个“得到帮助”的小故事，至少使用三个连接词。',
      },
      {
        id: 'speak_free',
        kind: 'speaking',
        title: '自由发挥，不设场景',
        goal: '在没有台词的情况下持续交流',
        minutes: 15,
        explanation: '自由对话没有标准答案。选择一个你真正想聊的话题，让 AI 跟随你；遇到卡顿就让对方换简单说法。',
        pattern: 'I’d like to talk about... / Can you ask me more about...?',
        tip: '先定话题，再定目标：练流利度、练发音，还是练某个句型。',
        examples: [
          { en: 'I’d like to talk about my favorite city. Please ask me one question at a time.', zh: '我想聊最喜欢的城市。请一次问一个问题。' },
          { en: 'Could you say that in a simpler way?', zh: '你能换个更简单的说法吗？' },
        ],
        task: '打开自由陪练，选一个真实话题连续聊至少 5 轮。',
      },
    ],
  },
];

export function getEnglishPath(): EnglishPathStage[] {
  return ENGLISH_PATH.map((stage) => ({ ...stage, steps: stage.steps.map((step) => ({ ...step })) }));
}
