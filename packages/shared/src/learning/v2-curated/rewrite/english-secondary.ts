import type {
  LearningV2CuratedCoursePlan,
  LearningV2EventDetail,
  LearningV2Practice,
  LearningV2StudyPoint,
} from '../../v2-types.js';
import type { CuratedCoursePlanPatchMap } from '../types.js';

type CourseSeed = Omit<LearningV2CuratedCoursePlan, 'contentStatus'>;

const point = (
  label: LearningV2StudyPoint['label'],
  text: string,
  stepIndex: number,
): LearningV2StudyPoint => ({ label, text, stepIndex });

const question = (
  prompt: string,
  correct: string,
  distractors: readonly [string, string, string],
  answer: number,
  explanation: string,
  focus: string,
): LearningV2Practice => {
  const options = [...distractors];
  options.splice(answer, 0, correct);
  return {
    prompt,
    options,
    answer,
    explanation: `${explanation}，并结合题型核对原文或语境依据。`,
    focus,
  };
};

const source = (id: string, title: string, issuer: string, date: string, url: string, usedFor: string) =>
  ({ id, title, issuer, date, url, usedFor });

const course = (seed: CourseSeed): LearningV2CuratedCoursePlan => ({
  contentStatus: 'reviewed',
  ...seed,
});

const JUNIOR_ONE_ARCHIVE = {
  id: 'english-junior-one-self-introduction',
  kind: 'concept',
  title: '从词到段：校园自我介绍怎样组织',
  period: '初级英语写作',
  summary:
    '自我介绍不是信息随机堆叠。先选身份、学校、兴趣和日常活动，再检查 be 动词、一般现在时、主谓一致、冠词和介词。',
  background:
    '初学者常把中文信息逐词翻成英语，漏掉 be 动词或第三人称单数。真实任务需要先搭信息框架，再做句子和小段检查。',
  timeline: [
    { date: '信息', title: '先选五类可介绍信息', body: '姓名、年龄、学校、家庭兴趣和日常活动构成基本框架。每类只保留一个核心信息，避免句子失控。', sourceIds: ['cambridge-starters', 'bc-levels'] },
    { date: '句型', title: 'be 动词描述身份和状态', body: 'I am、He is、They are 后接名词或形容词。先判断主语和身份关系，再写完整句，不能把中文“我是”直接省略。', sourceIds: ['cambridge-dictionary', 'bc-grammar'] },
    { date: '动作', title: '一般现在时描述习惯与日常', body: 'I play、She likes、We study 等句表达日常活动。第三人称单数要检查动词变化，实义动词句不要重复加 be。', sourceIds: ['bc-grammar'] },
    { date: '小词', title: '冠词与介词决定句子自然度', body: 'a student、the school、at seven、in Grade Seven 等搭配需要逐句核对。中文“在”不能对应所有英语介词。', sourceIds: ['cambridge-dictionary'] },
    { date: '阅读', title: '从短读提取 who、where、what', body: '阅读校园短文先找人物、地点、活动和态度，再处理生词。摘要只写原文支持的信息，不添加个人想象。', sourceIds: ['bc-levels'] },
    { date: '修改', title: '朗读与检查表完成最后一遍', body: '朗读录音检查尾音和停顿，再按 be、主谓一致、冠词、介词四项检查。每次只改一类错误更容易看见进步。', sourceIds: ['bc-grammar', 'purdue-sentences'] },
  ],
  outcome: '可观察结果是能写六到八句校园自我介绍，完成四项语法检查和一次朗读修正。',
  significance: '初级写作从完整句和信息顺序开始，为后续叙事和阅读摘要打基础。',
  sourceCards: [
    source('cambridge-starters', 'Pre A1 Starters and A1 Movers', 'Cambridge English', '2025 年访问版', 'https://www.cambridgeenglish.org/exams-and-tests/starters/', '核对初级英语任务与能力范围。'),
    source('bc-levels', 'English Levels', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/english-levels', '核对初级阅读与表达任务。'),
    source('bc-grammar', 'English Grammar Reference', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/grammar', '核对 be、一般现在时与主谓一致。'),
    source('cambridge-dictionary', 'Cambridge Dictionary', 'Cambridge Dictionary', '2025 年访问版', 'https://dictionary.cambridge.org/', '核对词义、例句和发音。'),
    source('purdue-sentences', 'Sentence Structure', 'Purdue Online Writing Lab', '2025 年访问版', 'https://owl.purdue.edu/owl/general_writing/mechanics/sentence_structure.html', '核对完整句和主谓结构。'),
  ],
} satisfies LearningV2EventDetail;

const JUNIOR_TWO_ARCHIVE = {
  id: 'english-junior-two-event-comparison',
  kind: 'concept',
  title: '事件叙事：时间线、过去时、将来和比较',
  period: '中级英语读写',
  summary:
    '叙事先排事件时间线，再选择过去时；计划和预测使用不同将来结构，比较级要求对象同类。连接词与事实/观点标记让短文更清楚。',
  background:
    '周末活动短文常出现动词过去式错误、比较对象缺失和连接词空用。阅读摘要需要区分事件事实与人物评价。',
  timeline: [
    { date: '时间线', title: '先排事件顺序', body: '用 first、then、after that 标事件先后，再确定主时间线。时间线清楚后，时态选择才有依据。', sourceIds: ['bc-grammar'] },
    { date: '过去', title: '已结束事件使用一般过去', body: '规则与不规则过去式要逐词核对。叙事中的动作顺序不能只靠中文“了”，还要看是否已结束。', sourceIds: ['bc-grammar', 'cambridge-dictionary'] },
    { date: '将来', title: '计划与预测分开表达', body: 'be going to 常表达已有计划，will 可表达即时决定或预测。选择要看语境，不能只因中文“会”就互换。', sourceIds: ['cambridge-grammar'] },
    { date: '比较', title: '比较对象必须同类', body: 'This book is easier than that one 中两个对象同级。不能写成 This book is easier than that book is difficult 这类错配。', sourceIds: ['cambridge-grammar'] },
    { date: '事实观点', title: '摘要区分事实和人物态度', body: '阅读活动报道时，事件、时间和结果属于事实，评价形容词可能体现人物观点。摘要不能把观点写成客观结论。', sourceIds: ['bc-reading'] },
    { date: '修改', title: '连接与朗读后测', body: '写八句短文后检查连接词是否表达真实关系，再朗读录音检查过去式尾音。24 小时后换事件复述，验证结构迁移。', sourceIds: ['bc-reading', 'purdue-writing'] },
  ],
  outcome: '可观察结果是能写八句活动短文，至少使用过去时、将来结构、比较句和一个真实逻辑连接词。',
  significance: '叙事、比较和事实/观点分层构成初中读写的主要迁移能力。',
  sourceCards: [
    source('bc-grammar', 'English Grammar', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/grammar', '核对过去时、将来和比较结构。'),
    source('cambridge-grammar', 'English Grammar Today', 'Cambridge Dictionary Grammar', '2025 年访问版', 'https://dictionary.cambridge.org/grammar/british-grammar/', '核对将来表达与比较级。'),
    source('cambridge-dictionary', 'Cambridge Dictionary', 'Cambridge Dictionary', '2025 年访问版', 'https://dictionary.cambridge.org/', '核对不规则动词、例句和音标。'),
    source('bc-reading', 'Reading', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/skills/reading', '核对事实、态度与阅读摘要。'),
    source('purdue-writing', 'Purdue Online Writing Lab', 'Purdue University', '2025 年访问版', 'https://owl.purdue.edu/owl/purdue_owl.html', '核对短文结构与段落修改。'),
  ],
} satisfies LearningV2EventDetail;

const JUNIOR_THREE_ARCHIVE = {
  id: 'english-junior-three-exam-reading-writing',
  kind: 'concept',
  title: '中考阅读与短文：定位同义改写而不是找同词',
  period: '初中英语考试训练',
  summary:
    '阅读题需要先确定题干任务，再回原文找同义改写和逻辑关系。写作要覆盖要点、组织结构并检查时态、语态、从句和拼写。',
  background:
    '只找相同单词容易被干扰项误导。现在完成与一般过去、被动语态和从句还要求检查句子功能，不能只记形式。',
  timeline: [
    { date: '题干', title: '先确定题目在问什么', body: '主旨、细节、推断和词义题需要不同证据。先圈任务词和对象，避免未读题干就逐句翻译。', sourceIds: ['bc-reading'] },
    { date: '定位', title: '用同义改写回原文', body: '题干词可能在原文换成近义表达。定位要比较人物、时间、否定、程度和范围，不能只凭一个相同单词。', sourceIds: ['bc-reading', 'cambridge-exams'] },
    { date: '时态', title: '现在完成与一般过去分开', body: '现在完成连接过去与现在结果，一般过去指向已结束时间。看到明确结束时间时要检查是否应改用过去时。', sourceIds: ['bc-grammar'] },
    { date: '语态', title: '被动语态调整信息焦点', body: 'be 加过去分词表达被动，执行者未知或不重要时可省略 by 短语。改写后仍要检查时态和主谓一致。', sourceIds: ['cambridge-grammar'] },
    { date: '从句', title: '连接词表达真实逻辑', body: '原因、条件、宾语和定语从句各有结构限制。先确定两句关系，再选择从句，不能为“高级”连续堆叠。', sourceIds: ['purdue-sentences'] },
    { date: '写作', title: '要点、结构、语言三层评分', body: '短文先覆盖题目要点，再检查段落顺序、连接、时态、语态和拼写。模拟后按错因分类，下一轮只强化最影响得分的两类。', sourceIds: ['cambridge-exams', 'purdue-writing'] },
  ],
  outcome: '可观察结果是完成一篇限时阅读定位、同义改写和八十词短文，并按四项标准形成修正清单。',
  significance: '本课把考试技巧与真实语言能力连接，避免只背模板或只找同词；复习要用限时训练与错因分类，而不是刷题后只对答案。',
  sourceCards: [
    source('cambridge-exams', 'Cambridge English Exams and Tests', 'Cambridge English', '2025 年访问版', 'https://www.cambridgeenglish.org/exams-and-tests/', '核对 A2/B1 阅读与写作任务范围。'),
    source('bc-reading', 'Reading', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/skills/reading', '核对定位、主旨和推断策略。'),
    source('bc-grammar', 'English Grammar', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/grammar', '核对时态与从句。'),
    source('cambridge-grammar', 'English Grammar Today', 'Cambridge Dictionary Grammar', '2025 年访问版', 'https://dictionary.cambridge.org/grammar/british-grammar/', '核对被动语态与动词形式。'),
    source('purdue-sentences', 'Sentence Structure', 'Purdue Online Writing Lab', '2025 年访问版', 'https://owl.purdue.edu/owl/general_writing/mechanics/sentence_structure.html', '核对从句与复杂句结构。'),
    source('purdue-writing', 'Purdue Online Writing Lab', 'Purdue University', '2025 年访问版', 'https://owl.purdue.edu/owl/purdue_owl.html', '核对短文结构与修改清单。'),
  ],
} satisfies LearningV2EventDetail;

const JUNIOR_ONE_SOURCES = [
  'Cambridge English, Pre A1 Starters and A1 Movers。https://www.cambridgeenglish.org/exams-and-tests/starters/',
  'British Council LearnEnglish, English Levels。https://learnenglish.britishcouncil.org/english-levels',
  'Cambridge Dictionary, English Dictionary and Pronunciation。https://dictionary.cambridge.org/',
  'Purdue Online Writing Lab, Sentence Structure。https://owl.purdue.edu/owl/general_writing/mechanics/sentence_structure.html',
];

const JUNIOR_TWO_SOURCES = [
  'British Council LearnEnglish, English Grammar。https://learnenglish.britishcouncil.org/grammar',
  'Cambridge Dictionary Grammar, English Grammar Today。https://dictionary.cambridge.org/grammar/british-grammar/',
  'British Council LearnEnglish, Reading。https://learnenglish.britishcouncil.org/skills/reading',
  'Purdue Online Writing Lab, Writing。https://owl.purdue.edu/owl/purdue_owl.html',
];

const JUNIOR_THREE_SOURCES = [
  'Cambridge English, Exams and Tests。https://www.cambridgeenglish.org/exams-and-tests/',
  'British Council LearnEnglish, Reading。https://learnenglish.britishcouncil.org/skills/reading',
  'British Council LearnEnglish, English Grammar。https://learnenglish.britishcouncil.org/grammar',
  'Purdue Online Writing Lab, Writing。https://owl.purdue.edu/owl/purdue_owl.html',
];

export const ENGLISH_SECONDARY_REWRITE: CuratedCoursePlanPatchMap = {
  'english:初一': course({
    prerequisite: '能读常见单词，使用 be 和一般现在时写简单句。',
    plainLanguageGoal: '学完后，你能用 be、一般现在时、代词和基础介词完成校园自我介绍，并读取短文人物与事件。',
    guidedPractice: '写十句自我介绍，逐句检查 be、主谓一致、冠词和介词，录音后修正一处。',
    independentPractice: '读一篇百词校园短文，列出 who、where、what、attitude，并写五句英文摘要。',
    commonErrors: ['be 动词和实义动词同时出现。', '第三人称单数漏加 -s。', '逐词翻译中文语序，不检查冠词和介词。'],
    sourceRefs: JUNIOR_ONE_SOURCES,
    studyPoints: [
      point('必背', 'be 后接身份或状态，实义动词表达动作；一般现在时第三人称单数要检查动词形式。', 1),
      point('重点', '自我介绍按身份、学校、兴趣和日常活动组织，每句只放一个核心信息。', 2),
      point('易错', '冠词和介词不能按中文“一个、在”逐字替换。', 3),
      point('考点', '阅读摘要先找人物、地点、活动和态度，再写原创完整句。', 4),
    ],
    eventDetails: [JUNIOR_ONE_ARCHIVE],
    steps: [
      { title: '情境与诊断｜十句自我介绍为什么像词表', body: '先做前测：用英语写姓名、学校、兴趣和一天活动各一句，要求标主语、谓语和中文对照。听一段校园自我介绍，记录人物、地点和活动。变式把主语改为第三人称。反例是 I am like music 或 She go to school。后测保留四句，朗读录音并修正一个主谓一致错误。完成后把四句按主语、谓语、小词三栏检查，并说明哪一句仍缺信息。', note: '一句只放一个核心信息。', objective: '能用句型与信息框架诊断自我介绍中的句子不完整和主谓错误。', practice: '完成四句前测、听力人物表、中文对照、首轮录音和一个纠错点。', checkpoint: '检查主语、be/实义动词、主谓一致、冠词、介词、中文对照和录音。' },
      { title: '材料与概念｜be、一般现在时与句子成分', body: 'be 动词描述身份、状态和位置，实义动词描述动作。一般现在时表达习惯与日常，第三人称单数需要变化。完整句要有主语和谓语，冠词、介词与名词短语一起检查。自我介绍可用姓名、年龄、学校、兴趣和日常活动框架，每句只承载一个核心信息。听读短文时先找 who、where、what，再处理生词。中文对照帮助确认意思，但英语语序仍要独立核对，不能逐词平移。', note: '先完整句，再小词。', objective: '能解释 be、一般现在时、主谓一致、冠词、介词和摘要信息。', practice: '为六类个人信息写完整句、中文对照、主语谓词标记和一句摘要。', checkpoint: '检查句子成分、be/实义动词、单复数、冠词、介词、中文对照和摘要事实。' },
      { title: '示范与推导｜从四项信息到六句短文', body: '示范 I am a Grade Seven student. I study at Green Middle School. I like music and basketball. I play basketball after school. 先标主语和谓语，再检查 a/an、at、after school 等搭配。朗读录音听第三人称尾音。反例是 I am study at school。变式把 I 改为 She，观察 be 与动词变化。最后按开场、兴趣、日常、收束写六句短文。', note: '改主语后重新检查谓语。', objective: '能由信息框架生成六句短文并完成主谓与介词检查。', practice: '完成六句短文、主语变式、中文对照、两轮录音和一处修正说明。', checkpoint: '检查 be/do、第三人称、冠词、介词、句序、事实和录音。' },
      { title: '引导练习｜阅读与改写双任务', body: '准备一篇百词校园短文和八个句子改写任务。阅读先做前测标人物、地点、活动和态度，再写五句摘要；语法任务把 I 改为 he/she，或把两个短句合为一句。后测朗读摘要并录音。记录 be 重复、第三人称、冠词、介词四类错误，每类写一个正确短句。变式改变学校或兴趣，检查结构是否仍成立，并交回一张错因表。', note: '阅读证据与语法检查都要留。', objective: '能做人物信息提取、英文摘要和主谓一致的变式改写。', practice: '提交人物表、五句摘要、八句改写、中文对照、两轮录音和错误分类。', checkpoint: '检查摘要事实、完整句、主谓一致、冠词、介词、中文对照和尾音。' },
      { title: '独立迁移与评价｜制作校园自我介绍卡', body: '制作一张自我介绍卡，写姓名、学校、家庭兴趣、两项日常活动和一个目标，共六到八句。先做前测列信息，再写英文、标中文对照、查发音并录音。24 小时后遮住英文复述。评价四项：信息完整、句子完整、主谓与小词正确、录音清楚。最后写一个 I am go to school 的反例，并说明如何删去 be 或改成正确结构。', note: '朗读和复述一起验。', objective: '能把初级句型迁移到校园介绍，并用完整句、语法、中文对照和录音评价。', practice: '提交信息卡、六到八句、中文对照、两轮录音、24 小时复述、错因和反例。', checkpoint: '四项自评：信息齐全、主谓清楚、冠词介词有据、录音可理解；否则重写。' },
    ],
    quiz: [
      question('哪句结构正确？', 'She goes to school by bus.', ['She go to school by bus.', 'She is go to school by bus.', 'She going to school by bus.'], 0, 'She 是第三人称单数，一般现在时实义动词 go 要变为 goes。be 不能与 go 同时充当谓语，going 需要助动词。', '事实与定义'),
      question('I am a student. 中 am 的主要作用是什么？', '连接身份信息并充当谓语', ['表示过去时间', '替代所有实义动词', '标记疑问句'], 1, 'be 动词可连接主语与身份、状态或位置。I am a student 是完整主系表结构，不能再插入 study 等实义谓语。', '材料与推导'),
      question('哪种写法最需要修正？', 'She like music and play basketball.', ['She likes music.', 'She plays basketball.', 'She is a student.'], 2, 'She 是第三人称单数，likes 和 plays 都需要变化。原句两个谓语形式都漏掉第三人称单数，需要逐项修改。', '常见误区'),
      question('写校园摘要时，哪种顺序最合理？', '先标人物、地点、活动和态度，再用完整句写有原文依据的摘要', ['先逐词翻译全文', '只写自己的想象', '把所有生词抄一遍'], 0, '摘要需要事实依据和完整句。先提取人物和事件结构，再写句子，能防止遗漏或加入原文没有的观点。', '迁移应用'),
    ],
  }),
  'english:初二': course({
    prerequisite: '完成初一，能写一般现在时简单句和五句短文。',
    plainLanguageGoal: '学完后，你能用时间线、一般过去、将来、比较级和连接词写八句活动短文，并区分事实与观点。',
    guidedPractice: '把一次周末经历排成时间线，写八句短文，标过去式、连接词、比较句和中文对照。',
    independentPractice: '读一篇校园活动短文，提取事实与人物态度，再写四十词活动通知。',
    commonErrors: ['规则与不规则过去式混用。', '比较级重复加 more 和 -er。', '连接词只凑长度，不表达真实逻辑。'],
    sourceRefs: JUNIOR_TWO_SOURCES,
    studyPoints: [
      point('必背', '已结束事件用一般过去，计划和预测用不同将来结构；比较对象必须同类。', 1),
      point('重点', '先排时间线，再用 first、then、because 等连接词表达真实关系。', 2),
      point('易错', 'more easier、than 后对象错配和无理由切换时态都要修正。', 3),
      point('考点', '摘要区分事件事实与人物态度，通知覆盖时间、地点、对象和行动要求。', 4),
    ],
    eventDetails: [JUNIOR_TWO_ARCHIVE],
    steps: [
      { title: '情境与诊断｜时间词齐全为什么文章仍乱', body: '先做前测：把“先去图书馆、然后打球、最后回家”写成三句英语，排时间线并标过去式。听一段周末活动音频，记录事实和人物态度。变式改为下周计划。反例是 Yesterday I go and then I am play。后测写五句并录音，检查过去式尾音、连接逻辑和比较对象。完成后用中文说明每句的事件时间和事实/观点标记。', note: '先排事件，再选时态。', objective: '能用时间线、过去式和连接词诊断活动叙事顺序与形式错误。', practice: '完成三句前测、听力事实态度表、时间线、首轮录音和一个纠错点。', checkpoint: '检查事件顺序、过去式、连接逻辑、事实观点、比较对象和录音。' },
      { title: '材料与概念｜过去、将来、比较与事实观点', body: '一般过去叙述已结束事件，规则与不规则形式需要逐词核对。will 和 be going to 都可谈将来，但语境侧重不同。比较级要求比较对象同类，不能重复 more 与 -er。连接词要表达顺序、原因、转折或结果，不能只增加长度。阅读校园报道时，时间、地点和事件是事实，评价形容词可能体现人物观点。中文对照帮助理解，但摘要必须用原文支持的完整英语句。', note: '形式、逻辑和证据一起看。', objective: '能解释过去时、将来结构、比较级、连接词和事实/观点分层。', practice: '为六个句子写时间线、比较对象、连接关系、中文对照和一个事实观点标记。', checkpoint: '检查时态、比较结构、连接逻辑、对象同类、事实观点和中文对照。' },
      { title: '示范与推导｜八句活动短文的骨架', body: '示范 Last Saturday, I went to the library. I read for an hour. Then I played basketball with my friend. It was more fun than staying home. I will join the club next week. 先排时间线，再检查 went、played、was、more fun than 的同类比较。朗读录音听过去式尾音。反例是 I goed and more better。变式改为 be going to 计划，观察形式变化。', note: '每处时态切换都要有理由。', objective: '能写八句活动短文并检查过去式、比较和将来表达。', practice: '完成时间线、八句短文、中文对照、两轮录音和一个比较变式。', checkpoint: '检查事件顺序、过去式、比较对象、连接词、将来结构、中文和录音。' },
      { title: '引导练习｜事实、观点与通知', body: '准备一篇校园活动短文和八个任务，覆盖时间、过去式、比较、连接词、事实/观点和通知信息。先做前测标 who、when、where、what、attitude，再写摘要和四十词通知。后测朗读录音并核对时间、地点、对象和行动要求。变式改变活动日期或参与者。记录过去式、比较、连接、信息遗漏四类错误，并写一条修正动作。', note: '摘要与通知各查一次。', objective: '能提取事实/观点并写活动摘要和通知，完成语法与录音修正。', practice: '提交阅读表、八句短文、四十词通知、中文对照、两轮录音和错误分类。', checkpoint: '检查事实依据、观点标记、时态、比较、连接、通知信息和录音。' },
      { title: '独立迁移与评价｜写一次周末活动', body: '写一次真实或模拟的周末活动，共八句，至少使用三种过去式、一个比较句、一个将来计划和两个连接词。先做前测排时间线，再写中文对照并朗读录音。24 小时后改成通知或口头复述。评价四项：顺序清楚、时态准确、比较同类、事实观点分开。最后写一个 more easier 的反例并修正。完成后用连接词检查表说明每处逻辑关系。', note: '叙事要能迁移到通知。', objective: '能把叙事与比较迁移到活动写作，并用时间线、语法、观点和录音评价。', practice: '提交时间线、八句、中文对照、两轮录音、24 小时通知变式、错误清单和反例。', checkpoint: '四项自评：事件有序、过去式正确、比较同类、通知信息完整；否则重写。' },
    ],
    quiz: [
      question('Yesterday I ___ to the library. 最合适的形式是什么？', 'went', ['go', 'goed', 'am going'], 0, 'Yesterday 指明确结束的过去事件，go 的不规则过去式是 went。goed 不是标准形式，am going 表示进行或将来。', '事实与定义'),
      question('哪句比较结构正确？', 'This game is more fun than that one.', ['This game is more funner than that.', 'This game is fun than that.', 'This game is more fun than that one is fun.'], 1, 'more fun 已是完整比较形式，不能再加 -er；than 后比较对象要与前句同类。that one 指另一个同类对象。', '材料与推导'),
      question('哪种连接词使用最可能错误？', 'I stayed home because I wanted to go out with my friends.', ['I stayed home because I was tired.', 'I was tired, so I stayed home.', 'I stayed home, but I wanted to go out.'], 2, 'because 应表达 stayed home 的原因；想和朋友出去不是留在家里的合理解释。连接词必须与实际逻辑一致。', '常见误区'),
      question('把校园报道转成通知时，哪种信息最重要？', '目的、时间、地点、参加对象和行动要求', ['只保留人物态度', '只抄比较句', '只写作者感受'], 0, '通知服务行动，必须让读者知道何时何地做什么以及如何参加。事实与要求要完整，观点不能替代关键信息。', '迁移应用'),
    ],
  }),
  'english:初三': course({
    prerequisite: '完成初二叙事与比较写作，能读中等长度短文。',
    plainLanguageGoal: '学完后，你能用现在完成、被动语态和基础从句完成中考型阅读定位、同义改写与八十词短文。',
    guidedPractice: '完成一篇限时阅读，标题干关键词、原文证据和同义改写，再改写三句主动/被动句。',
    independentPractice: '按“问题—措施—结果”写八十词短文，使用现在完成、被动语态和一个从句，并做四项自评。',
    commonErrors: ['现在完成与明确过去时间混用。', '被动语态漏掉 be 或过去分词。', '阅读只找相同单词，忽略同义改写和否定范围。'],
    sourceRefs: JUNIOR_THREE_SOURCES,
    studyPoints: [
      point('必背', '阅读答案必须由原文同义改写和逻辑支持；现在完成连接过去与现在，一般过去指已结束时间。', 1),
      point('重点', '被动语态必须保留 be 与过去分词，从句连接词要符合两句真实关系。', 2),
      point('易错', '题干出现相同单词不等于答案，必须核对人物、时间、否定和范围。', 3),
      point('考点', '短文先覆盖要点，再查结构、时态、语态和拼写，按错因进入下一轮。', 4),
    ],
    eventDetails: [JUNIOR_THREE_ARCHIVE],
    steps: [
      { title: '情境与诊断｜题干有同词为什么还是选错', body: '先做前测：给一道细节题和一道推断题，要求圈题干任务、回原文找证据并写同义改写。听一段校园通知并记录人物、时间、行动，再核对选项里的人物、否定和范围是否与原文一致。变式把肯定改否定。反例是只凭相同单词选择。后测写两句解释“原文哪句支持答案”，用中文标出同义替换，并修正一个现在完成/过去时错误。', note: '找证据，不找同词。', objective: '能用题干任务、同义改写和原文证据诊断阅读定位问题。', practice: '完成两题前测、证据句、同义改写、中文对照、听力记录和纠错点。', checkpoint: '检查题型、关键词、原文证据、同义关系、否定范围、时态和中文。' },
      { title: '材料与概念｜时态、语态、从句与阅读定位', body: '现在完成连接过去动作与现在结果，明确结束的过去时间通常用一般过去。被动语态由 be 加过去分词构成，调整信息焦点但保留时态。原因、条件、宾语和定语从句要先确定信息关系，再选择结构。阅读定位要核对人物、时间、否定、程度和范围，同义改写可能换词、换语序或概括。中文对照帮助确认意思，但答案句必须回到原文证据，不能凭常识补全。', note: '形式服务于信息关系。', objective: '能解释时态、语态、从句和阅读定位中的同义改写边界。', practice: '为六句写时态/语态标记、从句关系、中文对照和一个同义改写。', checkpoint: '检查完成/过去、be+分词、从句连接、原文证据、否定范围和中文对照。' },
      { title: '示范与推导｜从原文证据到答案句', body: '示范题干 The school has improved its recycling. 原文改为 More waste is now reused, and the school has reduced rubbish. 推理列出同义关系、时态和被动结构，再写答案依据。反例是只看到 school 就选包含 school 的干扰项。变式要求把主动句改为被动句并保持时态。最后用两句话说明哪个词发生同义替换、哪个范围词决定排除。', note: '答案要能引用证据。', objective: '能由原文证据、同义改写和语法转换生成有依据的答案解释。', practice: '完成证据表、同义替换、主被动改写、中文对照和两个干扰项排除理由。', checkpoint: '检查原文证据、同义关系、时态、被动形式、范围词和排除理由。' },
      { title: '引导练习｜限时阅读与短文', body: '完成一篇限时阅读和一篇中考短文（约八十词）。阅读先做前测标题型与关键词，后测标原文证据和同义改写；写作按问题、措施、结果列要点，使用一次现在完成、一次被动和一个从句。变式改变对象或时间。记录定位、同义、时态、语态、从句和拼写六类错误，并选择最影响分数的两项进入下一轮。最后把其中一项错因写成可执行的下一步检查动作。', note: '限时后必须复盘错因。', objective: '能在限时任务中完成证据定位、语法改写和要点短文。', practice: '提交阅读证据表、三句改写、八十词短文、中文对照、录音和错因表。', checkpoint: '检查证据链、同义改写、时态语态、从句、要点覆盖、拼写和朗读。' },
      { title: '独立迁移与评价｜形成下一轮训练清单', body: '完成一套阅读与写作小练，先做前测标时间和要点，再写答案依据、八十词短文和中文对照。24 小时后只重做错题类型与短文修改。评价四项：证据可追、语法准确、要点完整、修改具体。最后写一个“同词即答案”的反例，并说明如何用人物、时间和否定范围排除。下一轮只设两个最需强化的训练目标，并写成具体动作。', note: '错因要转成下一步行动。', objective: '能把考试策略迁移到限时任务，并用证据、语法、结构和错因评价。', practice: '提交限时记录、证据表、短文、中文对照、24 小时重练、评分和两项计划。', checkpoint: '四项自评：答案有证据、时态语态正确、要点与结构完整、训练计划可执行；否则重做。' },
    ],
    quiz: [
      question('题干与原文只共享一个单词时，最合理做法是什么？', '继续核对人物、时间、否定、程度和同义改写，再决定是否支持答案', ['立即选该选项', '只数相同单词数量', '忽略题干任务'], 0, '相同单词可能只是干扰。正确选项需要与原文信息关系一致，人物、时间、否定和范围都可能改变结论。', '事实与定义'),
      question('现在完成与一般过去的主要区别是什么？', '现在完成把过去与现在结果相连，一般过去指向已结束时间', ['现在完成只谈未来', '一般过去不能有动词', '两者任何语境都可互换'], 1, '现在完成强调结果、经历或持续与现在相关；一般过去指向明确结束的过去事件。不能只按中文“了”机械选择。', '材料与推导'),
      question('哪句被动语态最需要修正？', 'The classroom cleaned every day.', ['The classroom is cleaned every day.', 'The windows were opened.', 'The rule has been changed.'], 2, '被动语态需要 be 加过去分词。The classroom cleaned every day 缺少 is，读起来像不完整主动句。', '常见误区'),
      question('完成限时阅读和写作后，哪种复盘最有效？', '按定位、同义、时态、语态、从句和拼写分类，并选两项进入下一轮', ['只看总分', '抄答案不看原因', '把所有生词都背一遍'], 0, '分数只能提示结果，错因分类才能指导下一次行动。选择最影响得分的两项，能让训练具体可执行。', '迁移应用'),
    ],
  }),
};
