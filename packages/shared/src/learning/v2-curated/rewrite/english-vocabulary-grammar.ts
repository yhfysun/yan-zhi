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
    explanation: `${explanation}，并结合题中语境核对依据。`,
    focus,
  };
};

const source = (id: string, title: string, issuer: string, date: string, url: string, usedFor: string) =>
  ({ id, title, issuer, date, url, usedFor });

const course = (seed: CourseSeed): LearningV2CuratedCoursePlan => ({
  contentStatus: 'reviewed',
  ...seed,
});

const VERB_ARCHIVE = {
  id: 'english-verb-system-forms',
  kind: 'concept',
  title: '动词系统：形式、时态和搭配不是一张表',
  period: '现代英语语法',
  summary:
    '动词学习要同时跟踪原形、过去式、过去分词、助动词和句法环境。时态表达时间与体貌，语态调整信息焦点，固定搭配则限制词与介词的组合。',
  background:
    '只按中文意思记一个动词，常会漏掉过去式、过去分词和搭配。需要把词形、句子功能与真实短语一起记录。',
  timeline: [
    { date: '词形', title: '先把原形与屈折形式分开', body: '原形、过去式和过去分词承担不同句法位置，规则与不规则动词都要逐词核对，不能按中文一个词形机械替代。', sourceIds: ['bc-verbs'] },
    { date: '助动词', title: '助动词决定疑问、否定和时态', body: 'do、be、have 和情态动词各自控制后续形式。疑问句与否定句先确认助动词，再检查主要动词是否保持正确形态。', sourceIds: ['bc-verbs', 'cambridge-verbs'] },
    { date: '时态', title: '时态连接参照时间与动作体貌', body: '一般、进行和完成形式不只对应过去现在将来，还表达习惯、过程和与当前结果的联系，需要结合句子语境判断。', sourceIds: ['cambridge-verbs'] },
    { date: '语态', title: '语态改变信息焦点', body: '主动句突出执行者，被动句突出承受者或未知执行者。be 加过去分词必须完整，不能只把中文“被”逐字套入。', sourceIds: ['bc-verbs'] },
    { date: '搭配', title: '同一动词可带不同介词和句型', body: 'look at、look for、look after 意义不同，动词后接不定式或动名词也会改变结构。搭配必须和完整例句一起记。', sourceIds: ['cambridge-verbs', 'cambridge-dictionary'] },
    { date: '输出', title: '用朗读与造句验证掌握', body: '听例句标重音，朗读并录音，再写一个新主语和新时间下的句子。只有词形、句法和意义都能同时正确，才算可回收。', sourceIds: ['cambridge-dictionary', 'bc-listening'] },
  ],
  outcome: '可观察结果是能为动词列五种形式、一个真实搭配和两个时态句，并用录音与纠错记录验证。',
  significance: '动词系统连接词形、句法与意义，是英语输出准确性的核心。',
  sourceCards: [
    source('bc-verbs', 'English Grammar Reference: Verbs', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/verbs', '核对动词形式、时态和语态。'),
    source('cambridge-verbs', 'Verbs', 'Cambridge Dictionary Grammar', '2025 年访问版', 'https://dictionary.cambridge.org/grammar/british-grammar/verbs', '核对助动词、句型与搭配。'),
    source('cambridge-dictionary', 'English Dictionary and Pronunciation', 'Cambridge Dictionary', '2025 年访问版', 'https://dictionary.cambridge.org/', '核对词形、例句、音标与音频。'),
    source('bc-listening', 'Listening', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/skills/listening', '核对真实语流中的动词听辨。'),
  ],
} satisfies LearningV2EventDetail;

const NOUN_ARCHIVE = {
  id: 'english-noun-countability',
  kind: 'concept',
  title: '名词分类：可数性由完整英语结构决定',
  period: '现代英语语法',
  summary:
    '可数性不是中文量词直觉。限定词、复数形式、量词短语和主谓一致共同决定名词在句中怎样使用。',
  background:
    'information、advice 等词通常不可数，而 experience 在不同意义下可数性会变化。必须查词典完整短语，而非只看中文。',
  timeline: [
    { date: '结构', title: '先看限定词和名词形式', body: 'a、an、many、few 常与可数名词搭配，much、little 常与不可数名词搭配。判断要看完整短语和词典例句。', sourceIds: ['bc-nouns'] },
    { date: '复数', title: '规则与不规则复数逐词确认', body: 'books、boxes、children、sheep 的变化不同。拼写、读音和主谓一致要同时核对，不能只加一个 s。', sourceIds: ['cambridge-nouns'] },
    { date: '不可数', title: '不可数不等于不能计量', body: 'water 可用 a glass of water 计量，information 可用 a piece of information。量词结构提供计数方式，中心名词形式仍要正确。', sourceIds: ['bc-nouns', 'cambridge-dictionary'] },
    { date: '意义变化', title: '同一词在不同义项下可数性可变', body: 'experience 表示经验时通常不可数，表示一次经历时可数。必须结合句子意义查证，不能给单词贴永久标签。', sourceIds: ['cambridge-nouns'] },
    { date: '一致', title: '主语数量决定谓语形式', body: 'The news is、Two pieces of news are 的主语中心不同。先找中心名词，再判断第三人称单数与复数。', sourceIds: ['bc-nouns', 'cambridge-verbs'] },
    { date: '输出', title: '用数量短语与短句回收', body: '听读短语后写购物或信息句，朗读录音检查尾音。改错时同时检查限定词、复数和谓语，不只改一个词。', sourceIds: ['cambridge-dictionary', 'bc-listening'] },
  ],
  outcome: '可观察结果是能按词典证据给名词分类，写六个数额短语并修正限定词、复数和主谓一致。',
  significance: '可数性训练把词义、短语结构和句法一致连接起来。',
  sourceCards: [
    source('bc-nouns', 'English Grammar Reference: Nouns', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/nouns', '核对可数、不可数与名词结构。'),
    source('cambridge-nouns', 'Nouns', 'Cambridge Dictionary Grammar', '2025 年访问版', 'https://dictionary.cambridge.org/grammar/british-grammar/nouns', '核对复数、量词与义项变化。'),
    source('cambridge-dictionary', 'Cambridge Dictionary', 'Cambridge Dictionary', '2025 年访问版', 'https://dictionary.cambridge.org/', '核对真实词条、例句和发音。'),
    source('cambridge-verbs', 'Verbs', 'Cambridge Dictionary Grammar', '2025 年访问版', 'https://dictionary.cambridge.org/grammar/british-grammar/verbs', '核对主谓一致与谓语形式。'),
    source('bc-listening', 'Listening', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/skills/listening', '核对复数尾音和短语听辨。'),
  ],
} satisfies LearningV2EventDetail;

const NATURE_ARCHIVE = {
  id: 'english-nature-description',
  kind: 'concept',
  title: '动植物词汇：分类、外形与生命周期',
  period: '基础英语词汇',
  summary:
    '动植物词要通过类别、栖息地、外形、食物和生命周期建立语义网络，并在完整句中练习单复数和描述结构。',
  background:
    '把 animal、plant、fox、sheep 等词只配中文会造成替换和复数错误。真实任务需要图片、短说明和口头介绍。',
  timeline: [
    { date: '类别', title: '先分动物与植物及常见子类', body: 'mammal、bird、insect 与 tree、flower 等类别提供上位词。分类能帮助释义，但不能代替具体词条和例句。', sourceIds: ['britannica-animal'] },
    { date: '外形', title: '用 be 与 have 描述特征', body: 'It is small、It has four legs 等结构把特征放入完整句。颜色、大小和身体部位要与主语一致。', sourceIds: ['cambridge-dictionary', 'bc-vocabulary'] },
    { date: '栖息地', title: '介词表达生活环境', body: 'live in a forest、grow in water 需要合适介词。先确认地点类型，再选择动词和介词组合。', sourceIds: ['bc-prepositions'] },
    { date: '食物链', title: '用一般现在时说明习性', body: 'A fox eats small animals 描述一般习性，第三人称单数要加 s。不能把一次观察写成所有动物的固定事实。', sourceIds: ['bc-verbs', 'britannica-animal'] },
    { date: '生命周期', title: '按顺序描述生长或繁殖', body: 'first、then、after that 可组织生命周期。事实顺序与时间连接词必须一致，复数词形也要同步检查。', sourceIds: ['cambridge-dictionary'] },
    { date: '输出', title: '用图片和录音完成介绍', body: '看图片复述类别、外形、栖息地和食物，朗读录音后再写五句说明。检查复数尾音和主谓一致。', sourceIds: ['bc-vocabulary', 'bc-listening'] },
  ],
  outcome: '可观察结果是能朗读并写出一段动植物介绍，正确使用类别词、have/be、栖息地介词和复数。',
  significance: '词汇网络与句型结合，才能从记名字走向真实描述。',
  sourceCards: [
    source('britannica-animal', 'Animal', 'Encyclopaedia Britannica', '2025 年访问版', 'https://www.britannica.com/animal', '核对动物分类和基本特征。'),
    source('bc-vocabulary', 'Vocabulary', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/vocabulary', '核对基础主题词汇与练习。'),
    source('cambridge-dictionary', 'Cambridge Dictionary', 'Cambridge Dictionary', '2025 年访问版', 'https://dictionary.cambridge.org/', '核对词义、复数和发音。'),
    source('bc-prepositions', 'Prepositions of Place', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/prepositions-of-place', '核对栖息地与位置介词。'),
    source('bc-verbs', 'English Grammar Reference: Verbs', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/verbs', '核对一般现在时与第三人称单数。'),
    source('bc-listening', 'Listening', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/skills/listening', '核对动物描述与复数尾音。'),
  ],
} satisfies LearningV2EventDetail;

const OBJECT_ARCHIVE = {
  id: 'english-objects-space',
  kind: 'concept',
  title: '生活物品：用空间关系组织一段描述',
  period: '基础英语词汇与句型',
  summary:
    '物品词汇要和 there be、数量词、位置介词和用途句一起学习。说话者需建立参照物和移动路线，让听者能重建空间。',
  background:
    '随机罗列“桌子、书、杯子”难以听懂。先确定房间与参照物，再按路线描述位置、数量和用途，能显著提高表达清晰度。',
  timeline: [
    { date: '词义', title: '物品词配图片和真实用途', body: '每个名词连接一张图、一个量词和一个用途句。这样能区分相近物品，并避免只记中文对译。', sourceIds: ['bc-vocabulary', 'cambridge-dictionary'] },
    { date: '存在', title: 'there is 与 there are 先判断数量', body: '单数或不可数用 there is，复数用 there are。否定与疑问结构也要同步变化，不能只改 be 动词。', sourceIds: ['bc-grammar'] },
    { date: '位置', title: '介词需要明确参照物', body: 'in、on、under、next to 描述不同空间关系。句子要写清物体相对于什么位置，不能只用中文“在”直译。', sourceIds: ['bc-prepositions'] },
    { date: '数量', title: '数量词决定名词形式', body: 'a book、two books、a bottle of water 的中心名词和量词不同。朗读时检查复数尾音，写作时检查限定词。', sourceIds: ['bc-nouns'] },
    { date: '路线', title: '按入口到深处组织描述', body: '先写房间概览，再按移动路线描述物品。每句只放一个主要空间关系，听者更容易建立心理地图。', sourceIds: ['bc-speaking'] },
    { date: '输出', title: '遮住文字用图片复述', body: '先看图录音，再回听位置和数量是否清楚，最后写六句说明。修正时一次只处理介词、复数或语序一类问题。', sourceIds: ['bc-listening', 'cambridge-dictionary'] },
  ],
  outcome: '可观察结果是能看图片完成五到八句空间描述，正确使用 there be、介词、数量和用途句。',
  significance: '本课把词汇记忆转为可被听者重建的空间表达。',
  sourceCards: [
    source('bc-prepositions', 'Prepositions of Place', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/prepositions-of-place', '核对位置介词与空间关系。'),
    source('bc-grammar', 'English Grammar Reference', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/grammar/english-grammar-reference', '核对 there be 与基础句式。'),
    source('bc-nouns', 'Nouns', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/nouns', '核对数量与单复数。'),
    source('bc-vocabulary', 'Vocabulary', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/vocabulary', '核对生活物品词汇与图片语义。'),
    source('bc-listening', 'Listening', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/skills/listening', '核对空间描述的口头理解。'),
    source('bc-speaking', 'Speaking', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/skills/speaking', '核对口头描述与互动。'),
    source('cambridge-dictionary', 'Cambridge Dictionary', 'Cambridge Dictionary', '2025 年访问版', 'https://dictionary.cambridge.org/', '核对物品词义、音标和例句。'),
  ],
} satisfies LearningV2EventDetail;

const FOOD_ARCHIVE = {
  id: 'english-food-portion-choice',
  kind: 'concept',
  title: '食物与饮品：可数、份量、偏好与安全',
  period: '基础英语词汇与场景交流',
  summary:
    '食物词常同时涉及可数性、份量和场景表达。点单需要说明数量、偏好与过敏信息，不能只背单个名词。',
  background:
    'a bowl of rice、two cups of coffee 与 an apple 的结构不同。菜单和对话还要求礼貌请求、确认与安全边界。',
  timeline: [
    { date: '词义', title: '食物词按餐类和场景分组', body: 'breakfast、snack、main dish 等场景帮助组织词义。每个词配图片、音标与一个完整数量短语。', sourceIds: ['bc-food', 'cambridge-dictionary'] },
    { date: '可数性', title: '先查词典再决定量词', body: 'egg 可直接计数，rice 通常借 bowl 计量，salad 在不同语境可数性变化。判断依据是完整英语短语。', sourceIds: ['cambridge-nouns', 'cambridge-dictionary'] },
    { date: '份量', title: '量词和中心名词分别变化', body: 'two cups of coffee 中 cup 变复数，coffee 保持中心名词形式。朗读时听清复数尾音，写作时检查 of 结构。', sourceIds: ['bc-food', 'bc-nouns'] },
    { date: '菜单', title: '从菜单提取可执行信息', body: '价格、份量、配料和可选项目要逐项核对。阅读时不先翻译全部，而是定位点单需要的信息和关键词。', sourceIds: ['bc-reading'] },
    { date: '偏好', title: '礼貌表达喜欢、不喜欢和请求', body: 'I would like、Could I have、I prefer 比直接命令更合场景。选择表达要看对象和礼貌程度。', sourceIds: ['bc-speaking'] },
    { date: '安全', title: '过敏信息必须明确确认', body: '涉及过敏时要说清具体食材并请对方确认，不能把“应该没有”当保证。严重过敏或医疗问题需寻求专业帮助。', sourceIds: ['cambridge-dictionary', 'bc-speaking'] },
  ],
  outcome: '可观察结果是能读菜单、完成点单对话，正确使用量词、偏好表达和过敏确认。',
  significance: '食物词汇只有进入真实点单与安全沟通，才形成可迁移的交际能力。',
  sourceCards: [
    source('bc-food', 'Food', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/vocabulary/a1-a2-vocabulary/food', '核对食物词汇、份量与场景。'),
    source('bc-nouns', 'Nouns', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/nouns', '核对食物名词与量词结构。'),
    source('cambridge-nouns', 'Nouns', 'Cambridge Dictionary Grammar', '2025 年访问版', 'https://dictionary.cambridge.org/grammar/british-grammar/nouns', '核对可数、不可数与量词。'),
    source('bc-speaking', 'Speaking', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/skills/speaking', '核对点单、偏好和礼貌请求。'),
    source('bc-reading', 'Reading', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/skills/reading', '核对菜单与短文本信息定位。'),
    source('cambridge-dictionary', 'Cambridge Dictionary', 'Cambridge Dictionary', '2025 年访问版', 'https://dictionary.cambridge.org/', '核对食物词义、音标和例句。'),
  ],
} satisfies LearningV2EventDetail;

const HEALTH_ARCHIVE = {
  id: 'english-health-description-help',
  kind: 'concept',
  title: '身体与健康：描述症状并寻求帮助',
  period: '基础英语词汇与安全交际',
  summary:
    '健康主题需要身体部位、症状、时间、程度和既往情况。语言任务用于清楚描述和寻求帮助，不替代诊断或治疗建议。',
  background:
    'I have a headache 与 My head hurts 结构不同。交流还要说明持续多久、是否加重、过敏与用药，并知道何时寻求紧急帮助。',
  timeline: [
    { date: '部位', title: '身体部位配图与发音', body: 'head、throat、stomach 等词要配图片、音标和常见搭配。词形拼写相近时需听辨尾音和重音，并记录一个例句。', sourceIds: ['bc-health', 'cambridge-dictionary'] },
    { date: '症状', title: 'have 与 hurt 描述不同结构', body: 'I have a fever 描述症状，My throat hurts 以身体部位作主语。主语、冠词和第三人称单数要一致，并核对谓语形式。', sourceIds: ['bc-health', 'bc-verbs'] },
    { date: '时间', title: '说明持续时间和变化', body: 'for two days、since Monday 等表达提供病程信息。现在完成与一般过去的选择要看是否仍与现在相关，并写清参照时间。', sourceIds: ['bc-verbs', 'cambridge-verbs'] },
    { date: '询问', title: '用清楚问题收集信息', body: 'How long have you felt like this? 与 Do you have any allergies? 等问题能帮助交流，但不能替代专业问诊，回答后要复述确认。', sourceIds: ['bc-speaking'] },
    { date: '建议', title: '区分一般建议与专业判断', body: 'You should rest 可表达一般建议，严重或持续症状应建议寻求合格医疗人员。课程不提供诊断、剂量或自行用药方案，边界必须明确。', sourceIds: ['bc-health'] },
    { date: '边界', title: '危险信号优先转介', body: '呼吸困难、意识改变、严重出血等情况不是语言练习场景，应优先联系急救或专业人员，并停止自行处理。', sourceIds: ['cambridge-dictionary', 'bc-health'] },
  ],
  outcome: '可观察结果是能用英语描述身体部位、症状、持续时间和过敏信息，并明确寻求专业帮助的边界。',
  significance: '本课训练安全、清楚的健康沟通，不把语言能力误当医疗能力。',
  sourceCards: [
    source('bc-health', 'Health', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/vocabulary/a1-a2-vocabulary/health', '核对健康词汇、症状与建议表达。'),
    source('bc-verbs', 'English Grammar Reference: Verbs', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/verbs', '核对 have、hurt 与时态。'),
    source('cambridge-verbs', 'Verbs', 'Cambridge Dictionary Grammar', '2025 年访问版', 'https://dictionary.cambridge.org/grammar/british-grammar/verbs', '核对症状句中的时态与谓语结构。'),
    source('cambridge-dictionary', 'Cambridge Dictionary', 'Cambridge Dictionary', '2025 年访问版', 'https://dictionary.cambridge.org/', '核对词义、搭配和发音。'),
    source('bc-speaking', 'Speaking', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/skills/speaking', '核对询问、澄清和求助表达。'),
  ],
} satisfies LearningV2EventDetail;

const SPEAKING_ARCHIVE = {
  id: 'english-speaking-repair',
  kind: 'concept',
  title: '口语高频句：会接话、会澄清、会修复',
  period: '现代交际英语',
  summary:
    '高频句按交际功能组织，礼貌程度、语调和回应共同决定效果。没听懂时主动澄清，是交流能力而不是失败。',
  background:
    '背单句无法完成对话。请求、确认、追问和结束都需要根据对方回应选择下一句，并用录音检查停顿和语调。',
  timeline: [
    { date: '功能', title: '先确定这句话要完成什么', body: '问候、请求、确认、澄清和告别属于不同交际功能。先定功能，再选择句子和礼貌程度，并记录对方回应。', sourceIds: ['bc-speaking'] },
    { date: '礼貌', title: '请求强度随对象和负担变化', body: 'Can you、Could you、Would you mind 的礼貌和结构不同。选择时要考虑对方负担、场景和关系，并核对后续动词形式。', sourceIds: ['cambridge-grammar'] },
    { date: '语调', title: '语音曲线参与表达态度', body: '一般疑问句常用升调，确认和惊讶也可改变语调。只读文字会漏掉态度，需要听母语样例并模仿，再录音回听。', sourceIds: ['cambridge-dictionary', 'bc-listening'] },
    { date: '修复', title: '没听懂时立即澄清', body: 'Sorry?、Could you repeat that?、Do you mean…? 可修复交流。沉默或假装理解会让误解继续累积，应指出缺失信息。', sourceIds: ['bc-speaking'] },
    { date: '追问', title: '回应后补充一个相关问题', body: '听到回答后可用 Really?、What happened next? 等追问。问题必须接住对方信息，而不是背下一句台词，并保留回应链。', sourceIds: ['bc-speaking', 'bc-listening'] },
    { date: '录音', title: '双人对话以后测验证', body: '录两轮角色对话，检查是否完成发起、请求、澄清、确认和结束。回听只改一个语调或回应问题，并写明修正依据。', sourceIds: ['bc-listening', 'cambridge-dictionary'] },
  ],
  outcome: '可观察结果是能完成两分钟双人对话，主动澄清一次并根据回答追问，录音中可指出修正。',
  significance: '口语训练从背句子转向交际功能与互动修复。',
  sourceCards: [
    source('bc-speaking', 'Speaking', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/skills/speaking', '核对请求、澄清和互动策略。'),
    source('cambridge-grammar', 'English Grammar', 'Cambridge Dictionary Grammar', '2025 年访问版', 'https://dictionary.cambridge.org/grammar/british-grammar/', '核对请求结构与礼貌梯度。'),
    source('cambridge-dictionary', 'Cambridge Dictionary', 'Cambridge Dictionary', '2025 年访问版', 'https://dictionary.cambridge.org/', '核对短语、音标和音频。'),
    source('bc-listening', 'Listening', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/skills/listening', '核对语调和真实语流。'),
  ],
} satisfies LearningV2EventDetail;

const IDIOM_ARCHIVE = {
  id: 'english-idioms-context',
  kind: 'concept',
  title: '英语习语：固定意义、语境和语域',
  period: '现代英语短语学',
  summary:
    '习语的意义不能由逐词相加得到，固定搭配、语境和语域共同限制使用。一个习语在正式写作中未必自然。',
  background:
    'break the ice 不等于“打破冰”，但也不能在所有破冰场景随意使用。需要词典例句、搭配和正式程度证据。',
  timeline: [
    { date: '字面', title: '先识别字面义与整体义', body: '习语各词仍有字面意义，但整体表达形成约定含义。不能只看一个字就猜完整意思，应查完整词条。', sourceIds: ['cambridge-idioms'] },
    { date: '固定', title: '词序、冠词和介词限制较强', body: '固定搭配不能随意换词或改介词。学习时抄完整短语和一个原句，而不是只抄中文解释，并标记不可替换部分。', sourceIds: ['cambridge-idioms', 'cambridge-dictionary'] },
    { date: '语境', title: '用前后句判断真实用途', body: '同一习语可能表达安慰、幽默或批评。看说话者关系、事件结果和语气，才能判断是否合适，并记录一个情境证据。', sourceIds: ['bc-speaking', 'cambridge-dictionary'] },
    { date: '语域', title: '正式写作和口语容忍度不同', body: '部分习语适合日常口语，不适合学术论文。选择前查例句来源和词典标签，避免把所有习语当高级表达，并写使用边界。', sourceIds: ['purdue-writing'] },
    { date: '反例', title: '逐词直译常产生不自然英语', body: '把中文成语按词替换成英语，往往既不合搭配也不合文化语境。需要找英语中功能相近而非字面相同的表达，并对照例句。', sourceIds: ['cambridge-idioms'] },
    { date: '输出', title: '听说读写各用一个语境', body: '听短对话猜义，朗读录音，写一个原创情境并说明语域。后测换场景判断同一习语是否仍自然，并说明不用的理由。', sourceIds: ['bc-listening', 'purdue-writing'] },
  ],
  outcome: '可观察结果是能为习语写完整形式、语境、语域和一个逐词直译反例，并在新对话中正确选择。',
  significance: '习语教学训练搭配和语域判断，避免把文化短语当万能高级词汇。',
  sourceCards: [
    source('cambridge-idioms', 'Idioms', 'Cambridge Dictionary Grammar', '2025 年访问版', 'https://dictionary.cambridge.org/grammar/british-grammar/idioms', '核对习语结构、固定性与用法。'),
    source('cambridge-dictionary', 'Cambridge Dictionary', 'Cambridge Dictionary', '2025 年访问版', 'https://dictionary.cambridge.org/', '核对短语释义、例句和发音。'),
    source('bc-speaking', 'Speaking', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/skills/speaking', '核对口语语境与互动。'),
    source('bc-listening', 'Listening', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/skills/listening', '核对习语在真实语流中的听辨。'),
    source('purdue-writing', 'Purdue Online Writing Lab', 'Purdue University', '2025 年访问版', 'https://owl.purdue.edu/owl/purdue_owl.html', '核对正式写作与语域。'),
  ],
} satisfies LearningV2EventDetail;

const TENSE_ARCHIVE = {
  id: 'english-tense-aspect',
  kind: 'concept',
  title: '时态必背：时间轴与动作体貌要分开',
  period: '现代英语语法',
  summary:
    '时态不是只把动作放进过去、现在或将来。一般、进行和完成还表达习惯、过程、结果与参照时间，叙事中要保持意义驱动的时态一致。',
  background:
    '只看 yesterday 或 now 选时态会漏掉动作体貌。现在完成连接过去与现在，进行时强调过程，一般时表达习惯或完整事件。',
  timeline: [
    { date: '时间', title: '先画参照时间', body: '说话时间、事件时间和参照点可能不同。叙事先确定主时间线，再判断背景动作和先行动作。', sourceIds: ['bc-verbs'] },
    { date: '体貌', title: '一般时呈现事实、习惯或完整事件', body: '一般现在常用于习惯和普遍事实，一般过去用于已结束事件。时间词只是线索，不能替代意义判断。', sourceIds: ['cambridge-verbs'] },
    { date: '进行', title: '进行时突出参照时刻的过程', body: 'be 加动词 ing 表示某时正在发生。状态动词通常不用进行式，但词义变化时需查词典例句。', sourceIds: ['bc-verbs', 'cambridge-dictionary'] },
    { date: '完成', title: '现在完成连接过去与现在', body: 'have/has 加过去分词可表达结果、经历或持续。与明确结束的过去时间连用时通常选择一般过去。', sourceIds: ['cambridge-verbs'] },
    { date: '一致', title: '时态切换必须表达意义变化', body: '一个段落可以有主时间线和背景时态，但不能无理由来回切换。每个切换都写出时间关系和参照点。', sourceIds: ['bc-verbs'] },
    { date: '输出', title: '用时间轴和录音验证', body: '同一事件改写成四种时态，朗读录音并用时间轴解释选择。后测换人物和时间，检查结构而非只背规则。', sourceIds: ['bc-listening', 'cambridge-dictionary'] },
  ],
  outcome: '可观察结果是能为六句叙事画时间轴、解释时态体貌，并在改写与录音中保持意义一致。',
  significance: '本课把时态从词尾规则提升为时间关系和语篇意义的选择。',
  sourceCards: [
    source('bc-verbs', 'English Grammar Reference: Verbs', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/verbs', '核对时态、体貌和动词结构。'),
    source('cambridge-verbs', 'Verbs', 'Cambridge Dictionary Grammar', '2025 年访问版', 'https://dictionary.cambridge.org/grammar/british-grammar/verbs', '核对时态意义与形式。'),
    source('cambridge-dictionary', 'Cambridge Dictionary', 'Cambridge Dictionary', '2025 年访问版', 'https://dictionary.cambridge.org/', '核对词义、例句与状态动词用法。'),
    source('bc-listening', 'Listening', 'British Council LearnEnglish', '2025 年访问版', 'https://learnenglish.britishcouncil.org/skills/listening', '核对叙事中的时态听辨。'),
  ],
} satisfies LearningV2EventDetail;

const VERB_SOURCES = [
  'British Council LearnEnglish, English Grammar Reference: Verbs。https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/verbs',
  'Cambridge Dictionary Grammar, Verbs。https://dictionary.cambridge.org/grammar/british-grammar/verbs',
  'Cambridge Dictionary, English Dictionary and Pronunciation。https://dictionary.cambridge.org/',
  'British Council LearnEnglish, Listening。https://learnenglish.britishcouncil.org/skills/listening',
];

const NOUN_SOURCES = [
  'British Council LearnEnglish, English Grammar Reference: Nouns。https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/nouns',
  'Cambridge Dictionary Grammar, Nouns。https://dictionary.cambridge.org/grammar/british-grammar/nouns',
  'Cambridge Dictionary, English Dictionary and Pronunciation。https://dictionary.cambridge.org/',
  'British Council LearnEnglish, Vocabulary。https://learnenglish.britishcouncil.org/vocabulary',
];

const NATURE_SOURCES = [
  'Encyclopaedia Britannica, Animal。https://www.britannica.com/animal',
  'British Council LearnEnglish, Vocabulary。https://learnenglish.britishcouncil.org/vocabulary',
  'Cambridge Dictionary, English Dictionary and Pronunciation。https://dictionary.cambridge.org/',
  'British Council LearnEnglish, Prepositions of Place。https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/prepositions-of-place',
];

const OBJECT_SOURCES = [
  'British Council LearnEnglish, Prepositions of Place。https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/prepositions-of-place',
  'British Council LearnEnglish, Nouns。https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/nouns',
  'Cambridge Dictionary, English Dictionary and Pronunciation。https://dictionary.cambridge.org/',
  'British Council LearnEnglish, Speaking。https://learnenglish.britishcouncil.org/skills/speaking',
];

const FOOD_SOURCES = [
  'British Council LearnEnglish, Food。https://learnenglish.britishcouncil.org/vocabulary/a1-a2-vocabulary/food',
  'Cambridge Dictionary Grammar, Nouns。https://dictionary.cambridge.org/grammar/british-grammar/nouns',
  'British Council LearnEnglish, Speaking。https://learnenglish.britishcouncil.org/skills/speaking',
  'British Council LearnEnglish, Reading。https://learnenglish.britishcouncil.org/skills/reading',
];

const HEALTH_SOURCES = [
  'British Council LearnEnglish, Health。https://learnenglish.britishcouncil.org/vocabulary/a1-a2-vocabulary/health',
  'British Council LearnEnglish, Verbs。https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/verbs',
  'Cambridge Dictionary, English Dictionary and Pronunciation。https://dictionary.cambridge.org/',
  'British Council LearnEnglish, Speaking。https://learnenglish.britishcouncil.org/skills/speaking',
];

const SPEAKING_SOURCES = [
  'British Council LearnEnglish, Speaking。https://learnenglish.britishcouncil.org/skills/speaking',
  'Cambridge Dictionary Grammar, English Grammar。https://dictionary.cambridge.org/grammar/british-grammar/',
  'Cambridge Dictionary, English Dictionary and Pronunciation。https://dictionary.cambridge.org/',
  'British Council LearnEnglish, Listening。https://learnenglish.britishcouncil.org/skills/listening',
];

const IDIOM_SOURCES = [
  'Cambridge Dictionary Grammar, Idioms。https://dictionary.cambridge.org/grammar/british-grammar/idioms',
  'Cambridge Dictionary, English Dictionary and Pronunciation。https://dictionary.cambridge.org/',
  'British Council LearnEnglish, Speaking。https://learnenglish.britishcouncil.org/skills/speaking',
  'Purdue Online Writing Lab。https://owl.purdue.edu/owl/purdue_owl.html',
];

const TENSE_SOURCES = [
  'British Council LearnEnglish, English Grammar Reference: Verbs。https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/verbs',
  'Cambridge Dictionary Grammar, Verbs。https://dictionary.cambridge.org/grammar/british-grammar/verbs',
  'Cambridge Dictionary, English Dictionary and Pronunciation。https://dictionary.cambridge.org/',
  'British Council LearnEnglish, Listening。https://learnenglish.britishcouncil.org/skills/listening',
];

export const ENGLISH_VOCABULARY_GRAMMAR_REWRITE: CuratedCoursePlanPatchMap = {
  'english:动词全本': course({
    prerequisite: '完成字母与音标，能借助词典音标朗读短句。',
    plainLanguageGoal: '学完后，你能为动词整理形式、助动词、时态、语态和真实搭配，并用新句与录音验证。',
    guidedPractice: '分析八组动词短语，写原形、过去式、过去分词、助动词、句型、中文对照和一个搭配。',
    independentPractice: '选择十个高频动词，制作形式与搭配卡，写十句新句并录音检查词尾和重音。',
    commonErrors: ['把过去式与过去分词混用。', '疑问句加了助动词却不还原主要动词。', '只记中文意思，不记介词和句型搭配。'],
    sourceRefs: VERB_SOURCES,
    studyPoints: [
      point('必背', '原形、过去式、过去分词承担不同句法位置；助动词出现后要检查主要动词形式。', 1),
      point('重点', '时态看时间与体貌，语态看信息焦点，搭配看完整短语和例句。', 2),
      point('易错', '不规则形式不能按中文猜；look at、look for、look after 不能互相替换。', 3),
      point('考点', '先用词典确认形式和搭配，再造句、朗读、录音并纠正。', 4),
    ],
    eventDetails: [VERB_ARCHIVE],
    steps: [
      { title: '情境与诊断｜go 的三个形式能互换吗', body: '先做前测：I ___ yesterday、I have ___、I want to ___. 要求填 go/went/gone，并写中文对照与句法位置。听三句音频，标助动词和主要动词，记录是否把过去式当过去分词。变式改为 see/saw/seen。反例是助动词 have 后接过去式。后测为五个不规则动词列形式、造句并朗读录音，纠正一个词尾。', note: '先看助动词，再选形式。', objective: '能用句法位置和音频诊断动词形式与助动词错误。', practice: '完成两组前测，写五动词形式、助动词、中文对照、听辨和首轮录音。', checkpoint: '检查原形/过去式/过去分词、助动词、句法位置、不规则形式和录音证据。' },
      { title: '材料与概念｜形式、时态、语态与搭配', body: '动词原形、过去式和过去分词不是可任意互换的中文译词。助动词 do、be、have 和情态动词决定后续形式；时态表达参照时间与体貌；语态改变信息焦点；搭配限制介词、不定式或动名词。词典要同时查词形、音标、完整例句与中文语境。听读时先圈出谓语和助动词，再写句；口语录音检查第三人称单数、ed 尾音和重音。', note: '一个动词至少看形式、句法、搭配。', objective: '能解释动词形式、助动词、时态、语态和搭配之间的关系。', practice: '为六个动词写形式、助动词规则、一个搭配、中文对照和真实例句。', checkpoint: '检查形式准确、助动词、时态体貌、语态、搭配、中文对照和音频来源。' },
      { title: '示范与推导｜从词典到一句新英语', body: '示范 decide：查词典确认 decide to do，写 I decided to leave yesterday 与 I have decided to stay，比较过去事件和现在结果。听例句标重音，朗读录音，回听后只修正 -ed 尾音。反例是 decide doing 或 have decided to left。变式把主语改为第三人称并加否定句。写作时逐步检查助动词、主要动词、搭配和时间表达，再用新语境造句。', note: '先查搭配，再改时态。', objective: '能由词典例句推导时态句并完成单点录音纠错。', practice: '完成 decide 的形式表、两句时间对比、否定变式、中文对照和两轮录音。', checkpoint: '检查 decide to、助动词、过去式、过去分词、否定结构、重音和录音修正。' },
      { title: '引导练习｜八组动词回收', body: '准备八题，覆盖规则/不规则形式、do 疑问、be 被动、have 完成、情态、介词搭配和两种句型。每题先做前测找谓语，再查词典写形式和中文对照，后测造新句并朗读。变式换主语、时间和否定。记录过去式/分词、助动词双标、搭配和尾音四类错误，每类写一个可观察修正动作。所有音频可暂停、可回放，录音要保留首轮和修正轮。', note: '每题只改一类错误。', objective: '能对八组动词完成形式、句法、搭配、造句和录音纠错。', practice: '提交八张动词卡、两句/题、中文对照、两轮录音和错误分类。', checkpoint: '检查形式、助动词语序、搭配、时态与语态、尾音、回听和变式。' },
      { title: '独立迁移与评价｜做十词动词档案', body: '选十个高频动词，先做前测预测形式和搭配，再查词典、听例句、写十句不同时间的新句。24 小时后换主语复测，并把其中三句改成疑问或被动。评价四项：形式准确、搭配自然、中文对照清楚、录音有修正证据。最后写一个把 have 后接过去式的反例，说明如何用助动词和过去分词核对。完成后按形式、搭配和录音三个维度各写一条修订记录，确保下一次能直接复用。', note: '形式和搭配必须一起回收。', objective: '能把动词系统迁移到新句，并用词典、录音、复测和纠错评价。', practice: '提交十词档案、十句、两轮录音、24 小时复测、三个句型变式和反例。', checkpoint: '四项自评：形式可查、搭配有据、读音可比较、错误已定位；否则重做。' },
    ],
    quiz: [
      question('have 后面表达现在完成时，主要动词应使用什么形式？', '过去分词', ['原形', '过去式', '总是动词 ing'], 0, '现在完成结构是 have/has 加过去分词。go/went/gone 中只有 gone 适合 I have gone；用 went 会把完成结构写成错误组合。', '事实与定义'),
      question('Why did he ___? 中空格最合适的动词形式是什么？', '原形，因为 did 已承担过去和疑问', ['过去式', '过去分词', '动词 ing'], 1, '助动词 did 已表达过去和疑问，主要动词恢复原形。常见错误是 did he went；应先看助动词，再选主要动词形式。', '材料与推导'),
      question('哪种学习记录最不足以支持真实使用？', '只写“look＝看”，不记 look at/for/after 的短语和例句', ['记录完整搭配', '比较不同介词', '听例句并录音'], 2, 'look 与不同介词形成不同意义和结构。只记一个中文译词无法决定句中介词，也不能保证搭配自然。', '常见误区'),
      question('把动词迁移到新写作任务时，哪种检查顺序最合理？', '先查形式和搭配，再定助动词与时态，最后朗读录音检查尾音', ['先写生僻词再猜语法', '只看中文逐字替换', '录音一次不回听'], 0, '动词输出要同时满足形式和句法。先固定搭配与助动词，再听读核对尾音和重音，能减少连环错误。', '迁移应用'),
    ],
  }),
  'english:名词分类': course({
    prerequisite: '能读基础名词短语，会使用 a/an、some 和简单复数。',
    plainLanguageGoal: '学完后，你能按完整英语短语判断可数性，正确使用限定词、量词和主谓一致。',
    guidedPractice: '分类十二个名词，为每个词写完整数量短语、中文对照和一句主谓一致例句。',
    independentPractice: '制作购物与信息清单，使用十个可数/不可数名词，录音朗读并修正限定词、复数和谓语。',
    commonErrors: ['按中文量词直接判断英语可数性。', '不可数名词直接加 a/an 或复数。', '量词变复数后把中心名词也错误加 s。'],
    sourceRefs: NOUN_SOURCES,
    studyPoints: [
      point('必背', '可数性由限定词、复数、量词和词典例句共同决定，不能只看中文能否说“一个”。', 1),
      point('重点', 'two pieces of advice 中 piece 变复数，advice 保持中心名词形式。', 2),
      point('易错', 'information、advice 等通常不可数；experience 等词可随义项改变可数性。', 3),
      point('考点', '先查完整短语，再写限定词、复数和主谓一致三处检查。', 4),
    ],
    eventDetails: [NOUN_ARCHIVE],
    steps: [
      { title: '情境与诊断｜能说“一条建议”就能说 an advice 吗', body: '先做前测：把“一条建议、两条信息、三个苹果”写成英语，要求查词典并标可数、不可数、限定词和量词。听三组短语音频，记录是否漏掉 pieces 的复数尾音。变式改为 two coffees 与 two cups of coffee。反例是 two advices。后测写六个数量短语和中文对照，朗读录音并纠正一个主谓一致错误。', note: '中文量词不能直接搬。', objective: '能用完整短语和音频诊断可数性、量词与主谓一致错误。', practice: '完成三组翻译前测，标名词类型、限定词、量词、复数和中文对照。', checkpoint: '检查完整短语、词典证据、量词复数、中心名词、谓语和录音尾音。' },
      { title: '材料与概念｜可数、不可数、限定词与量词', body: '可数名词可与 a/an、many、few 和直接复数搭配；不可数名词常与 much、little 或量词结构搭配。不可数不等于不能计量，a piece of information、two glasses of water 都提供计数方式。限定词、单复数、量词和中心名词分别检查；主谓一致看中心名词而不是最近单词。部分名词随义项改变，要查词典完整例句。听读时注意复数尾音，写作时写中文对照防止意思漂移。', note: '先找中心名词，再看谓语。', objective: '能解释可数性、限定词、量词、单复数和主谓一致。', practice: '为六个名词写完整短语、中文对照、限定词理由和主谓一致句。', checkpoint: '检查词典依据、可数性、量词结构、中心名词、复数和谓语一致。' },
      { title: '示范与推导｜从“两条建议”到完整句', body: '示范“两条建议”：查词典得 advice 通常不可数，写 two pieces of advice；piece 因 two 变复数，advice 不变。再写 Two pieces of advice are useful，谓语看 pieces。朗读时录 pieces 尾音，回听修正一个漏音。反例是 two advices are。变式改为 two pieces of information 和 a useful suggestion，比较结构。中文对照必须解释为什么不是逐词替换。', note: '量词变复数，中心名词不乱变。', objective: '能由词典和中心名词推导量词短语与主谓一致。', practice: '完成三条量词短语、中文对照、两句谓语、首轮录音和尾音修正。', checkpoint: '检查 advice/information、piece 复数、中心名词、谓语、尾音和变式。' },
      { title: '引导练习｜十二个名词分类', body: '准备十二个词，覆盖直接可数、通常不可数、义项变化和不规则复数。每题先做前测写猜测，再查词典写完整短语和中文对照，后测造肯定、否定或疑问句。变式改变数量并朗读录音。记录中文直搬、a/an 错加、量词复数、主谓一致四类错误。每个错误要写出正确短语和一个听读检查点，并从词典例句中找出能推翻原判断的证据。', note: '每个名词都写完整短语。', objective: '能对十二个名词完成词典分类、短语、造句、朗读和错误修正。', practice: '提交十二张名词卡、数量变式、中文对照、录音、错误分类和一句修正说明。', checkpoint: '检查词条证据、完整短语、限定词、复数、中心名词、谓语和尾音。' },
      { title: '独立迁移与评价｜做购物与信息清单', body: '制作一份购物清单和一张信息清单，各用五个可数与不可数名词写数量短语。先做前测预测难点，再查词典、朗读录音、写六句说明。24 小时后遮住中文复述并改两处数量。评价四项：词典证据、短语正确、主谓一致、录音清楚。最后写一个 two advices 的反例并给出正确量词结构。完成后把两条最易错短语单独抄入复习卡。', note: '清单也要能朗读和理解。', objective: '能把可数性规则迁移到购物与信息任务，并用词典、录音和复测评价。', practice: '提交两张清单、十短语、六句、两轮录音、24 小时复测和反例。', checkpoint: '四项自评：短语完整、中心名词正确、谓语一致、尾音可辨；否则重写。' },
    ],
    quiz: [
      question('“两条建议”最自然的英语表达是什么？', 'two pieces of advice', ['two advices', 'two advice', 'a advices'], 0, 'advice 表示建议时通常不可数，需要借 piece 计数；two 使 piece 变复数，advice 保持中心名词形式。', '事实与定义'),
      question('Two pieces of information ___ useful. 谓语应怎样选？', 'are，因为主语中心是复数 pieces', ['is，因为 information 不可数', 'were，必须过去', 'be，没有数量'], 1, '主谓一致要看中心名词 pieces，而不是靠近谓语的 information。pieces 是复数，所以用 are；不可数中心名词仍保持原形。', '材料与推导'),
      question('哪种判断方式最不可靠？', '因为中文能说“一个”，就直接给英语名词加 a/an', ['查词典完整短语', '检查复数和量词', '核对中心名词与谓语'], 2, '中文量词不能直接决定英语可数性。必须看英语词典例句、限定词和量词结构，避免 a advice 之类错误。', '常见误区'),
      question('把名词用于购物清单时，哪种检查最完整？', '逐项核对数量短语、中心名词、复数和朗读尾音', ['只写中文名称', '只记单数形式', '看到 of 就忽略谓语'], 0, '购物清单会成为口头或书面句子，数量、中心名词、复数和尾音共同决定别人能否准确理解。', '迁移应用'),
    ],
  }),
  'english:动植物分类': course({
    prerequisite: '能使用 be、have 和基础一般现在时。',
    plainLanguageGoal: '学完后，你能用类别、外形、栖息地、食物和生命周期介绍一种动植物，并正确朗读复数。',
    guidedPractice: '看图分类十个动植物词，为每词写类别、一个外形句、一个栖息地句和中文对照。',
    independentPractice: '选择一种熟悉动植物，查资料、听发音，写六到八句英文介绍并录音。',
    commonErrors: ['只记中文名，不核对不规则复数。', 'have 与 be 描述结构混用。', '栖息地介词按中文“在”随机选择。'],
    sourceRefs: NATURE_SOURCES,
    studyPoints: [
      point('必背', '描述动植物常用“类别＋be＋外形＋have＋部位＋live/grow in＋栖息地”的信息链。', 1),
      point('重点', '单复数要与数量和高频词形匹配，fox→foxes、wolf→wolves、sheep→sheep。', 2),
      point('易错', 'have 后接身体部位，be 后接形容词；栖息地要使用合适介词。', 3),
      point('考点', '看图先列事实，再写完整句并朗读录音，不能用词表代替介绍。', 4),
    ],
    eventDetails: [NATURE_ARCHIVE],
    steps: [
      { title: '情境与诊断｜为什么不能说 A fox have four leg', body: '先做前测：看图写“狐狸有四条腿、生活在森林、吃小动物”。要求用 be/have、一般现在时、正确复数和中文对照填表。听 fox/foxes、sheep/sheep 音频并标尾音。变式改第三人称复数。反例是 A fox have four leg。后测写三句并朗读录音，纠正主谓或复数一处。', note: '先判断主语数量。', objective: '能用 be/have、复数与栖息地句诊断动植物描述错误。', practice: '完成三句前测、中文对照、单复数听辨、首轮朗读和一个纠错点。', checkpoint: '检查 be/have、第三人称单数、复数、介词、词义和录音尾音。' },
      { title: '材料与概念｜类别、外形、栖息地与生命周期', body: '动植物介绍按类别、外观、身体部位、栖息地、食物和生命周期组织。be 接形容词，have 接身体部位；一般现在时描述习性。名词要查规则或不规则复数，栖息地使用 live/grow in 等搭配。阅读短说明时先找类别和关键特征，不逐词翻译。中文对照帮助确认事实，但最终输出必须用完整英语句并朗读，检查复数尾音和一般现在时第三人称。', note: '先事实表，再完整句。', objective: '能使用五个信息维度组织动植物词义与描述。', practice: '为一个动植物写类别、外形、栖息地、食物、生命周期和中文对照各一行。', checkpoint: '检查事实、完整句、be/have、单复数、介词、一般现在时和发音。' },
      { title: '示范与推导｜从图片到五句介绍', body: '示范 fox：A fox is a mammal. It has four legs and a long tail. It lives in a forest. It eats small animals. Young foxes grow inside their mother and are born live. 示范先核对事实，再检查 fox 单数和 It has。听音频朗读，录音后只修正 lives 的尾音。反例是 A fox live in forest and eat small animal。变式改为两只狐狸，观察主语与谓语变化。', note: '事实、语法、发音分三遍。', objective: '能由图卡生成五句介绍，并用事实表、语法和录音逐层检查。', practice: '完成 fox 五句、中文对照、单数/复数变式、首轮录音和尾音修正。', checkpoint: '检查分类准确、be/have、第三人称单数、冠词、栖息地介词、复数和发音。' },
      { title: '引导练习｜十个动植物描述卡', body: '准备十张图，覆盖动物、植物、不规则复数和不同栖息地。每题先做前测列类别与事实，再写一句外形、一句栖息地、一句食物或生长条件，后测朗读录音。变式改为复数主语或否定句。记录 be/have、第三人称、复数、介词四类错误，每题写一个正确短语和听读修正动作，最后用一张新图检查能否迁移描述顺序。', note: '每张卡至少写完整三句。', objective: '能对十类图文完成事实整理、造句、复数变化和录音纠错。', practice: '提交十张描述卡、中文对照、三个复数变式、录音和错误分类。', checkpoint: '检查信息真实、句子完整、主谓一致、复数、介词、中文对照和尾音。' },
      { title: '独立迁移与评价｜介绍一种熟悉动植物', body: '选一种熟悉动植物，先做前测列已知与待查事实，再查资料、词典音标和复数，写六到八句介绍。24 小时后改用复数或否定句复述。评价四项：事实有来源、句子完整、单复数一致、录音可理解。最后写一个把 have/has 和 live/lives 混用的反例，并说明如何用主语数量检查。完成后把事实来源、语言修订和录音修正分别留一条记录。', note: '资料事实和语言准确性都要核。', objective: '能把动植物词网迁移到独立介绍，并用资料、语法、发音和复测评价。', practice: '提交事实表、六到八句、中文对照、两轮录音、24 小时复述和反例。', checkpoint: '四项自评：信息可查、句型完整、复数与谓语正确、录音有修正；否则重写。' },
    ],
    quiz: [
      question('描述“狐狸有四条腿”时，哪句最合适？', 'A fox has four legs.', ['A fox have four legs.', 'A fox is four legs.', 'A fox has four leg.'], 0, 'fox 是第三人称单数，have 要变为 has；leg 有数量 four，需要使用复数 legs。be 后接形容词或类别，不能替代 have 表示拥有。', '事实与定义'),
      question('fox 与 sheep 的复数最准确是哪组？', 'foxes；sheep', ['foxs；sheeps', 'foxes；sheeps', 'fox；sheepes'], 1, 'fox 加 es，sheep 单复数同形。不能只按一个规则统一处理，应查词典并用数量短语验证。', '材料与推导'),
      question('哪种描述最需要修正？', 'A fox live in a forest and eat small animals.', ['It has a long tail.', 'It lives in a forest.', 'Foxes eat small animals.'], 2, 'A fox 是单数主语，一般现在时应用 lives 和 eats。复数主语 Foxes 才使用 live/eat。先判断主语数量，再变化谓语。', '常见误区'),
      question('做动植物口头介绍时，哪种流程最完整？', '先列事实与中文对照，再写完整句、查复数、朗读录音并修正谓语或尾音', ['照着中文词表逐词读', '只背动物名称', '忽略栖息地和生命周期'], 0, '介绍需要事实、句法和语音三层。录音回听能发现第三人称尾音、复数和介词问题，完整句也能让听者理解关系。', '迁移应用'),
    ],
  }),
  'english:生活物品': course({
    prerequisite: '能使用基础名词、a/an 和简单 be 句。',
    plainLanguageGoal: '学完后，你能用 there be、数量词、位置介词和用途句描述一个真实空间。',
    guidedPractice: '观察房间图，写十句位置与数量描述，标参照物、介词和中文对照。',
    independentPractice: '拍摄或绘制自己的桌面，完成八句空间介绍并录音复述。',
    commonErrors: ['there is 与 there are 不随名词数量变化。', '位置介词按中文“在”随意替换。', '空间描述没有参照物，听者无法定位。'],
    sourceRefs: OBJECT_SOURCES,
    studyPoints: [
      point('必背', 'there is 接单数或不可数，there are 接复数；位置介词必须绑定参照物。', 1),
      point('重点', '按门口到桌面的移动路线组织描述，比随机罗列更容易听懂。', 2),
      point('易错', 'in/on/under/next to 不能只用一个中文“在”互换。', 3),
      point('考点', '写完每句都问：物体是什么、多少、相对哪里、有什么用途。', 4),
    ],
    eventDetails: [OBJECT_ARCHIVE],
    steps: [
      { title: '情境与诊断｜为什么每句都写“在”仍找不到东西', body: '先做前测：看房间图，用英语找一本书和一个杯子。要求写 there be、数量、参照物和位置介词，并朗读给同伴听。变式只改参照物。反例是 The book is in. 没有说明在什么里面。后测写五句并录音，检查听者能否按描述指出物品，同时记录 is/are 与介词错误，并说明哪一句缺少参照物。', note: '位置必须有参照物。', objective: '能用数量、参照物和介词诊断空间描述是否可理解。', practice: '完成找物前测、五句定位、中文对照、同伴复述、首轮录音和一句修正记录。', checkpoint: '检查 there be、数量、参照物、介词、路线、中文对照和听者能否定位。' },
      { title: '材料与概念｜there be、数量与空间关系', body: 'there is 用于单数或不可数名词，there are 用于复数；否定和疑问要同步变化。位置介词描述物体相对参照物的关系，in、on、under、next to、between 不能互换。每句应包含物品、数量和参照物，用途可用 for 或 use 表达。听读图片描述时先建立空间地图，再写完整句。中文对照用于确认关系，但英语输出仍要检查冠词、复数和介词。', note: '一句只放一个主要空间关系。', objective: '能解释 there be、数量、参照物、位置介词和用途句。', practice: '为六个物品写位置句，标参照物、数量、中文对照和一个用途表达。', checkpoint: '检查 is/are、名词数量、介词、参照物、语序、中文对照和用途。' },
      { title: '示范与推导｜把桌面按路线说清楚', body: '示范从门口到桌面：There is a lamp on the desk. There are two books next to the lamp. The books are for class. 先画路线，再核对 lamp 单数和 books 复数，朗读录音后只修正 next to 的连读。反例是 There are a lamp on desk。变式把两本书改为一个包，观察 there be 和数量变化。每句听回放确认参照物是否清楚。', note: '先说整体，再按路线。', objective: '能按空间路线生成完整句并完成 there be、介词和录音修正。', practice: '完成三句路线描述、中文对照、单复数变式、首轮录音和连读修正。', checkpoint: '检查路线、is/are、数量、参照物、介词、用途和录音清晰度。' },
      { title: '引导练习｜十句房间描述', body: '准备一张房间图和十句任务，覆盖单数、复数、不可数、否定、疑问和用途。每题先做前测选 there be，再写位置、中文对照和用途，后测录音让同伴按描述指出物品。变式改变一个位置或数量。记录 is/are、介词、参照物遗漏、复数四类错误，并为每类写一个可观察修正动作，最后用同伴指认结果验证。', note: '听者能指对才算描述成功。', objective: '能对十句空间描述完成 be 选择、介词、听者复述和修正。', practice: '提交十句描述、图卡、中文对照、三个变式、同伴复述和错误分类。', checkpoint: '检查 there be、参照物、介词、数量、复数、用途、可理解性和录音。' },
      { title: '独立迁移与评价｜介绍自己的桌面', body: '拍摄或画自己的桌面，先做前测标五个参照物，再写八句空间介绍。每句写明物品、数量、位置和一项用途，朗读录音。24 小时后遮住文字只看图复述。评价四项：路线清楚、there be 准确、介词自然、听者能定位。最后写一个随机罗列物品的反例，并说明如何改为有参照物的路线描述。完成后让同伴按描述找物验证。', note: '空间描述是给听者用的。', objective: '能把空间语言迁移到真实桌面，并用路线、语法、录音和复述评价。', practice: '提交图、八句、中文对照、两轮录音、24 小时复述和反例修正。', checkpoint: '四项自评：路线可跟、数量与 be 正确、介词有参照、录音清楚；否则重写。' },
    ],
    quiz: [
      question('There ___ two books on the desk. 应选什么？', 'are，因为 two books 是复数', ['is，因为 desk 单数', 'be，不需要变化', 'has，因为书被拥有'], 0, 'there be 与后面的中心名词一致。two books 是复数，因此用 there are；desk 是地点，不决定谓语。', '事实与定义'),
      question('“灯泡在桌子上”最自然的是哪句？', 'The lamp is on the desk.', ['The lamp is in the desk.', 'The lamp is under the desk.', 'The lamp is next the desk.'], 1, 'on 表示接触表面并位于上方，in 表示内部，under 表示下方。next to 还需要 to，不能省略。', '材料与推导'),
      question('哪种空间描述最不完整？', 'The book is there.', ['The book is on the desk.', 'There are two books next to the lamp.', 'The cup is under the chair.'], 2, 'The book is there 没有参照物，听者无法确定具体位置。空间描述需要物体、数量和相对参照物。', '常见误区'),
      question('用英语介绍房间时，哪种顺序最利于听者理解？', '先说房间概览，再按入口到桌面的路线逐句描述', ['随机说十个物品', '只报英文名称', '先背所有介词再读'], 0, '路线能建立心理地图，每句一个空间关系可降低追踪负担。随机罗列会让听者无法维持位置。', '迁移应用'),
    ],
  }),
  'english:食物与饮品': course({
    prerequisite: '能使用 some、a/an 和基础名词数量表达。',
    plainLanguageGoal: '学完后，你能读菜单、说清食物份量、表达偏好并确认过敏信息。',
    guidedPractice: '完成八组食物数量短语、菜单定位和点单对话，写中文对照并朗读。',
    independentPractice: '设计一份两分钟点单对话，包含份量、偏好、追问和过敏确认。',
    commonErrors: ['把不可数食物直接加 a/an 或复数。', '量词和中心名词同时错误变化。', '过敏信息只用模糊表达，不确认具体食材。'],
    sourceRefs: FOOD_SOURCES,
    studyPoints: [
      point('必背', '食物可数性看完整短语：an apple、a bowl of rice、two cups of coffee。', 1),
      point('重点', '点单使用 I would like/Could I have，并确认份量、配料和过敏信息。', 2),
      point('易错', 'two cups of coffee 中 cup 变复数，coffee 不乱加 s。', 3),
      point('考点', '菜单阅读先定位价格、份量和配料，再完成口头点单与追问。', 4),
    ],
    eventDetails: [FOOD_ARCHIVE],
    steps: [
      { title: '情境与诊断｜two coffees 和 two cups of coffee 一样吗', body: '先做前测：为 apple、rice、coffee、salad 写数量短语，并完成一句点单。要求标可数性、量词、中心名词和中文对照。听两组短语音频，记录是否漏掉 cups 的复数尾音。变式改为 a piece of cake。反例是 two rices。后测读一段菜单，选出份量并用 Could I have 造句，录音纠正一个尾音或礼貌表达。', note: '先查词条，再写份量。', objective: '能用词条证据和音频诊断食物可数性、量词与点单表达。', practice: '完成四个数量短语、菜单点单、中文对照、听辨和首轮录音，并写出一个可回听的尾音检查点。', checkpoint: '检查可数性、量词复数、中心名词、礼貌请求、菜单信息和尾音。' },
      { title: '材料与概念｜可数、份量、菜单与偏好', body: '食物词要结合餐类、份量和完整短语学习。可数名词可直接配 a/an 和复数，不可数名词借 bowl、cup、piece 等量词计数。菜单阅读定位价格、份量、配料和可选项目；口头点单使用礼貌请求并确认信息。偏好可用 I prefer、I would rather 等表达。涉及过敏时要说清具体食材并请服务人员确认，模糊的“应该没事”不能作为安全保证。', note: '点单不是只报一个食物名。', objective: '能解释食物可数性、量词、菜单信息、偏好和过敏安全表达。', practice: '为六项食物写短语、中文对照、菜单信息、礼貌点单句和一个过敏确认问题。', checkpoint: '检查词条证据、量词、中心名词、礼貌、菜单细节、偏好和过敏边界。' },
      { title: '示范与推导｜从菜单到完整对话', body: '示范 menu 中 “Grilled chicken with rice: $12”。读价格和配料，点单说 Could I have the grilled chicken, please? 再问 Does it contain nuts? 服务方回答后复述确认。量词用 a bowl of rice。听录音标语调，回听后只修正 please 的停顿或 nuts 尾音。反例是 I want chicken and a rice。变式改为素食偏好，检查礼貌和追问。', note: '读菜单后必须口头确认。', objective: '能把菜单信息转成礼貌点单、偏好和过敏确认对话。', practice: '完成菜单卡、点单句、过敏确认、中文对照、首轮录音和单点修正。', checkpoint: '检查价格配料、量词、礼貌结构、偏好、过敏确认、语调和尾音。' },
      { title: '引导练习｜八组食物交际任务', body: '准备八题，覆盖直接可数、不可数、量词、菜单定位、偏好、否定、过敏和结账。每题先做前测写短语与中文对照，再读菜单或听短对话，后测完成一问一答并录音。变式改变份量或饮食偏好。记录可数性、量词复数、礼貌、信息遗漏四类错误，并说明过敏问题必须怎样确认，最后从菜单找一条证据并复述点单内容。', note: '每个短语都要放在对话里。', objective: '能对八组食物场景完成数量表达、菜单阅读、对话和录音纠错。', practice: '提交八张场景卡、中文对照、菜单信息、三组对话录音和错误分类。', checkpoint: '检查可数性、量词、礼貌、偏好、过敏确认、信息完整和发音。' },
      { title: '独立迁移与评价｜设计两分钟点单对话', body: '设计一段两分钟点单对话，包含问候、主菜、份量、饮品、偏好、追问和过敏确认。先用中文列信息，再查词典写英语并朗读录音。24 小时后换一份菜单复测。评价四项：信息完整、量词正确、礼貌自然、过敏确认明确。最后写一个用 a rice 点餐的反例，并改为正确量词短语。完成后保留一条菜单证据和一条服务方确认记录。', note: '安全信息不能省略。', objective: '能把食物词汇迁移到真实点单，并用数量、礼貌、安全和录音评价。', practice: '提交对话稿、中文对照、两轮录音、24 小时新菜单复测和反例修正。', checkpoint: '四项自评：信息无遗漏、量词自然、请求礼貌、过敏确认可执行；否则重写。' },
    ],
    quiz: [
      question('“两杯咖啡”最自然的英语是什么？', 'two cups of coffee', ['two coffees of cup', 'two cup of coffees', 'two coffee cups of'], 0, 'coffee 作为饮品通常借 cup 计量。two 使量词 cups 变复数，中心名词 coffee 保持原形。', '事实与定义'),
      question('Which sentence is the most polite way to order?', 'Could I have the chicken salad, please?', ['Give me salad now.', 'I take salad.', 'You must bring salad.'], 1, 'Could I have...please 是常见礼貌点单结构。直接命令会显得不自然，也不适合服务场景。', '材料与推导'),
      question('涉及食物过敏时，哪种表达最不安全？', 'It should be fine, so I do not need to check the ingredients.', ['Could you confirm whether it contains nuts?', 'I am allergic to peanuts.', 'Does this dish contain milk?'], 2, '过敏需要确认具体食材和处理方式，不能凭“应该没事”推断安全。严重过敏应寻求专业建议并采取现实防护。', '常见误区'),
      question('读菜单并点单时，哪种流程最完整？', '先定位价格、份量和配料，再有礼貌地点单并复述确认过敏信息', ['只看图片猜价格', '只背食物名称', '忽略份量直接说 a rice'], 0, '菜单阅读服务于点单行动。价格、份量、配料和过敏确认要转成完整交流，而不是停在词义层面。', '迁移应用'),
    ],
  }),
  'english:身体与健康': course({
    prerequisite: '能描述时间、身体基本部位并使用一般现在时。',
    plainLanguageGoal: '学完后，你能清楚描述症状、持续时间和过敏信息，并知道何时应寻求专业医疗帮助。',
    guidedPractice: '完成八组症状描述、询问与建议对话，写中文对照和就医边界。',
    independentPractice: '录制一段一分钟健康求助对话，包含症状、时长、过敏和复述确认。',
    commonErrors: ['把 have 和 hurt 的主语结构混用。', '只描述疼痛，不说明持续时间和变化。', '把语言练习当作诊断或自行用药建议。'],
    sourceRefs: HEALTH_SOURCES,
    studyPoints: [
      point('必背', 'I have a headache 与 My head hurts 都能描述症状，但主语和谓语结构不同。', 1),
      point('重点', '健康沟通要说清部位、症状、持续时间、变化和过敏信息。', 2),
      point('易错', '语言课程不提供诊断、剂量或处方；严重症状应寻求专业帮助。', 3),
      point('考点', '能复述确认信息，并在危险信号出现时优先转介而非继续语言练习。', 4),
    ],
    eventDetails: [HEALTH_ARCHIVE],
    steps: [
      { title: '情境与诊断｜headache 和 head hurts 有什么不同', body: '先做前测：用英语说“我头痛两天了、我没有发烧、我对青霉素过敏”。要求标身体部位、症状、时间、过敏和中文对照。听短对话记录关键词，变式改为 My throat hurts。反例是 I have headache since two days 而不检查结构与时间。后测录音询问和复述一次症状，并写出何时应联系医疗人员。', note: '症状、时间、过敏都要问。', objective: '能用 have/hurt、时间和过敏表达诊断健康沟通是否清楚。', practice: '完成三句前测、听辨关键词、中文对照、首轮录音和就医边界句。', checkpoint: '检查部位、have/hurt、时间表达、过敏、复述确认和医疗边界。' },
      { title: '材料与概念｜症状、时间、询问与建议', body: 'I have a fever/I have a headache 使用 have 加症状名词；My throat hurts 使用身体部位作主语。持续时间可用 for two days 或 since Monday，时态要说明是否持续到现在。询问可收集部位、时长、变化、过敏和用药信息；建议用 should 等结构表达一般行动。语言任务不能替代诊断，严重呼吸困难、意识改变、严重出血等情况应优先联系急救或专业人员。就医边界必须写进对话结论。', note: '清楚描述，不冒充诊断。', objective: '能解释症状句型、时间表达、询问、一般建议和医疗安全边界。', practice: '为六项症状写 have/hurt 句、中文对照、持续时间、询问和边界。', checkpoint: '检查主语结构、时间、过敏、询问完整、建议语气、中文对照和专业边界。' },
      { title: '示范与推导｜一分钟症状描述', body: '示范：I have had a sore throat for two days. It hurts when I swallow. I do not have a fever. I am allergic to penicillin. Could you repeat what I should do next? 先标时长与现在关联，再复述确认。听录音检查 hurts 尾音，回听后只修正一处。反例是只说 My throat bad 两天，没有症状结构和时间。变式改为过去已好的一次症状，观察时态变化。', note: '时长和变化决定时态。', objective: '能组织一分钟症状描述，并用复述确认信息。', practice: '完成症状段、时间轴、过敏句、复述问题、首轮录音和单点纠正。', checkpoint: '检查 have/hurt、for/since、时态、过敏、复述、发音和安全边界。' },
      { title: '引导练习｜八组健康对话', body: '准备八题，覆盖疼痛、发热、咳嗽、过敏、持续时间、变化、一般建议和危险信号。每题先做前测列信息，再写询问与回答，后测双人朗读录音。变式改变时间或症状强度。记录 have/hurt、时态、过敏遗漏、越界诊断四类错误；危险信号题只练转介表达，不提供处理细节。所有录音回听一次并写修正，且用中文说明一次为何不能自行诊断。', note: '危险信号优先转介。', objective: '能对八类健康对话完成询问、描述、复述、录音和安全转介。', practice: '提交八张对话卡、中文对照、两轮录音、危险信号表和错误分类。', checkpoint: '检查句型、时间、过敏、复述、建议边界、录音和危险信号处理。' },
      { title: '独立迁移与评价｜录制健康求助对话', body: '设计一段一分钟求助对话，包含症状、持续两天、变化、过敏、既往用药和复述确认。先做前测标未知信息，再查词典和音标，完成两轮录音。24 小时后换一种症状复测。评价四项：信息完整、句型准确、复述清楚、边界安全。最后写一个“语言练习可直接判断病情”的反例，并说明何时应停止练习并寻求专业帮助。', note: '不提供现实诊断和用药。', objective: '能把健康表达迁移到求助场景，并用信息、语法、复述和安全边界评价。', practice: '提交对话稿、中文对照、两轮录音、24 小时症状变式、边界和反例。', checkpoint: '四项自评：症状清楚、时间准确、过敏完整、专业边界明确；否则重写。' },
    ],
    quiz: [
      question('“我头痛”可以用哪句表达？', 'I have a headache.', ['My headache is hurt.', 'I am headache.', 'I have head paining.'], 0, 'I have a headache 使用 have 加症状名词。My head hurts 也成立，但主语和 hurt 结构不同，不能混成 I have head hurts。', '事实与定义'),
      question('How long have you felt like this? 主要询问什么？', '症状持续了多久', ['喜欢什么食物', '是否愿意运动', '在哪里买药'], 1, 'How long 询问持续时间。回答可使用 for two days 或 since Monday，并配合现在完成说明与现在的联系。', '材料与推导'),
      question('哪种做法最不符合课程边界？', '根据一段英语症状描述自行决定药物和剂量', ['清楚描述过敏', '复述确认建议', '严重症状寻求专业帮助'], 2, '语言课程只能训练表达与求助，不能替代诊断、处方或剂量判断。严重或危险症状应立即联系专业人员。', '常见误区'),
      question('健康求助对话中，哪种信息组合最完整？', '部位、症状、持续时间和变化、过敏与既往用药，并复述下一步', ['只说 I am sick', '只报一个身体部位', '只问价格'], 0, '完整信息能减少误解。复述下一步可检查自己是否听懂，但最终医疗判断仍由合格专业人员完成。', '迁移应用'),
    ],
  }),
  'english:口语高频句': course({
    prerequisite: '能朗读简单疑问句，并愿意录音和进行双人对话。',
    plainLanguageGoal: '学完后，你能按交际功能使用问候、请求、澄清、确认和追问，并完成一段可修复误解的对话。',
    guidedPractice: '完成八组功能对话，标礼貌梯度、语调、澄清和追问，写中文对照并录音。',
    independentPractice: '录一段两分钟双人对话，包含请求、没听懂、澄清、确认和结束。',
    commonErrors: ['只背自己的台词，不根据对方回答推进。', '没听懂时沉默或假装理解。', '请求句只按中文命令直译，礼貌程度不匹配。'],
    sourceRefs: SPEAKING_SOURCES,
    studyPoints: [
      point('必背', '口语高频句按交际功能记：请求、确认、澄清、追问和结束，不能只背单句。', 1),
      point('重点', 'Can you、Could you、Would you mind 的礼貌和结构不同，要匹配对象与负担。', 2),
      point('易错', '没听懂时主动用 Sorry?/Could you repeat that? 修复，比假装理解更有效。', 3),
      point('考点', '对话要有回应链，录音检查语调、停顿和信息是否真正接上。', 4),
    ],
    eventDetails: [SPEAKING_ARCHIVE],
    steps: [
      { title: '情境与诊断｜没听懂时沉默算礼貌吗', body: '先做前测：同伴说一句含数字和时间的请求，你只听清一半。要求选择沉默、猜、或主动澄清，并用英语写一句修复表达。标交际功能、礼貌程度、语调和中文对照。听两组请求音频比较 Can/Could 的语感。变式改为对方语速更快。反例是只回答 yes 但不知道要做什么。后测录一段含一次澄清和一次确认的双人对话。', note: '交流要能修复误解。', objective: '能用功能、礼貌和澄清策略诊断口语互动问题。', practice: '完成没听懂前测、两种请求对比、中文对照、首轮对话录音和澄清句。', checkpoint: '检查交际功能、礼貌梯度、语调、澄清、确认、回应链和录音。' },
      { title: '材料与概念｜功能、礼貌、语调与修复', body: '高频句按问候、请求、确认、澄清、追问和结束组织。礼貌程度由句式和语调共同表达，Could you 与 Would you mind 的结构不同。一般疑问句常用升调，但态度还受语境影响。没听懂时使用 Sorry?、Could you repeat that?、Do you mean…? 主动修复，再复述确认。对方回答后要追问相关信息，而不是继续背下一句。中文对照帮助理解功能，录音回听检查重音、停顿和是否真正接话。', note: '先功能，后句子和语调。', objective: '能解释交际功能、礼貌梯度、语调、澄清、修复和追问。', practice: '为六个功能各写一句、中文对照、礼貌对象、预期回应和一句可能的追问。', checkpoint: '检查功能匹配、句式、礼貌、语调、澄清、追问、中文对照和互动可能。' },
      { title: '示范与推导｜一次没听清怎样接下去', body: '示范请求：Could you send me the report by Friday? 若只听清 report，回应 Sorry, could you repeat the deadline? 对方说 Friday 后复述 So, by Friday, right? 再说 Sure, I will send it. 听录音标问句升调和重读词，回听只修正一处。反例是只说 Okay 却不知道日期。变式把 burden 加大，改用 Would you mind。最后比较直接命令与礼貌请求。', note: '澄清要指向缺失信息。', objective: '能把请求、澄清、复述和确认串成完整互动。', practice: '完成三句请求链、中文对照、语调标记、首轮录音和礼貌变式。', checkpoint: '检查请求结构、缺失信息、澄清句、复述、确认、语调、礼貌和回应。' },
      { title: '引导练习｜八组功能对话', body: '准备八组场景，覆盖问候、请求、没听懂、确认数字、追问、拒绝、道歉和结束。每题先做前测标功能与礼貌，再写两轮回应，后测双人录音。变式提高语速或改变对象。记录单句背诵、沉默、语调平淡和回应不对题四类错误，每个错误配一句修复表达。录音必须保留一次真实澄清或追问，并用中文写明它解决了哪一处信息差。', note: '每轮回应都接前句。', objective: '能对八类场景完成功能选择、回应链、语调、录音和误解修复。', practice: '提交八张对话卡、中文对照、两轮双人录音、三个变式和错误分类。', checkpoint: '检查功能、礼貌、语调、澄清、确认、追问、回应链和回听修正。' },
      { title: '独立迁移与评价｜两分钟角色对话', body: '设计两分钟对话，包含发起话题、请求帮助、没听懂、澄清、复述确认和结束。先做前测写双方信息差，再分角色朗读录音。24 小时后换场景复测。评价四项：功能完整、礼貌匹配、语调可理解、误解被修复。最后写一个“听不懂就说 yes”的反例，并说明下一次应怎样提出具体澄清问题。完成后从录音中保留一次有效修复证据。', note: '能修复误解比一次听懂更重要。', objective: '能把口语功能迁移到双人对话，并用互动、礼貌、语调和修复评价。', practice: '提交对话稿、中文对照、两轮录音、24 小时变式、误解修复记录和反例。', checkpoint: '四项自评：回应接前句、请求礼貌、澄清具体、语调可理解；否则重录。' },
    ],
    quiz: [
      question('没听清对方说的时间时，哪句最适合主动澄清？', 'Sorry, could you repeat the time?', ['Yes, I understand.', 'No time.', 'You must say again now.'], 0, '主动澄清要指出缺失信息并礼貌请求重复。只说 yes 会让误解继续，直接命令则不符合交际礼貌。', '事实与定义'),
      question('Could you...? 与 Would you mind...? 使用时应重点检查什么？', '句法结构和礼貌程度是否与对象、负担匹配', ['单词长度是否最长', '是否完全不用回应', '是否只能用于朋友'], 1, '两种请求都可礼貌，但后续结构不同，如 Would you mind doing...。选择要看对象和请求负担，不能机械替换。', '材料与推导'),
      question('哪种对话最不像真实交流？', '只背自己的五句台词，完全不根据对方回答选择下一句', ['听到回答后追问细节', '没听懂时请求重复', '结束前确认下一步'], 2, '对话是双方共同构建。只背台词无法处理信息差、澄清和追问，也不能证明能根据对方回应推进交流。', '常见误区'),
      question('录音复盘口语时，哪种检查最完整？', '同时听信息回应、礼貌程度、语调停顿和是否发生澄清修复', ['只听自己声音好不好听', '只看说了多少单词', '只背一条标准答案'], 0, '口语质量取决于互动与可理解性。信息是否接上、礼貌是否合适、语调是否清楚和误解是否修复，比单纯词数更有意义。', '迁移应用'),
    ],
  }),
  'english:英语习语': course({
    prerequisite: '能查词典例句，并区分正式与日常表达。',
    plainLanguageGoal: '学完后，你能解释习语的字面义、整体义、固定搭配和语域，并在新语境中判断是否自然。',
    guidedPractice: '分析八个习语，写完整短语、字面义、习语义、中文对照、语境和语域。',
    independentPractice: '选择四个习语写短对话，标注适用关系与正式程度，并录音朗读。',
    commonErrors: ['逐词直译，只按字面猜整体义。', '随意替换习语中的词或介词。', '在正式写作中滥用只适合口语的习语。'],
    sourceRefs: IDIOM_SOURCES,
    studyPoints: [
      point('必背', '习语的整体义不能由逐词相加得到，词序、冠词和介词通常受限。', 1),
      point('重点', '学习习语要同时记录完整短语、一个真实例句、语境和正式程度。', 2),
      point('易错', '中文成语不能按字面找到英语对应，需找功能相近的表达。', 3),
      point('考点', '新语境中先判断关系和语域，再决定习语是否自然。', 4),
    ],
    eventDetails: [IDIOM_ARCHIVE],
    steps: [
      { title: '情境与诊断｜break the ice 是打破冰吗', body: '先做前测：读 break the ice 的字面句和对话，判断整体义并写中文对照。要求标固定搭配、说话关系、语气和正式程度。听短对话，记录是否只听单词而漏掉整体意图；变式改为正式邮件。反例是把中文成语逐词替换成英语。后测用该习语写一个新语境，并说明何时不适合使用，再补一条词典例句作为证据。', note: '先读整体语境，再查短语。', objective: '能用字面/整体义、固定搭配和语域诊断习语误解。', practice: '完成两组前测、中文对照、语境表、正式/口语判断和首轮造句。', checkpoint: '检查整体义、固定形式、语境、语域、中文对照、来源和反例是否完整。' },
      { title: '材料与概念｜固定搭配、习语义与语域', body: '习语是约定俗成的多词表达，字面义可能仍可识别，但整体义不等于逐词相加。词序、冠词、介词和动词常受固定限制，替换后可能不自然或变成另一意思。语境决定说话者是在安慰、批评还是幽默；语域决定它适合口语、非正式写作还是学术表达。查词典要看完整例句和标签，不把“高级表达”当使用理由。中文对照应说明功能，而不是硬找逐字对应。', note: '完整短语和语境一起记。', objective: '能解释习语的字面义、习语义、固定性和语域。', practice: '为六个习语写完整形式、中文功能义、一个语境、一个语域和一个错配反例。', checkpoint: '检查固定搭配、整体义、语境、语域、中文功能对照、来源和错配反例是否完整。' },
      { title: '示范与推导｜同一习语放错场合会怎样', body: '示范 break the ice：在初次见面活动中表示缓和陌生感，写 The teacher asked a funny question to break the ice. 听对话确认语气。若放进正式政策报告，可能显得口语化。反例是 He broke the ice with a hammer 却解释为社交缓和。变式改为学术写作，寻找更中性的表达。推导要写清说话对象、目的、语域和是否能被听者自然理解。', note: '先问场合，再用习语。', objective: '能把习语义与语境、语域匹配，并识别字面误用。', practice: '完成语境表、两个正确句、一个语域错误、一个字面反例和朗读录音。', checkpoint: '检查整体义、对象、目的、语域、搭配、反例、中文对照和听者理解。' },
      { title: '引导练习｜八个习语场景', body: '准备八个习语，覆盖日常安慰、幽默、工作、正式写作限制和中文直译陷阱。每题先做前测猜义，再查词典例句，后测写一个新对话并朗读录音。变式改变关系或正式程度，判断是否仍自然。记录逐词直译、搭配替换、语域错配、语境不足四类错误。每个习语至少保留一条来源、一个中文功能义、一个不使用理由、一条听者反馈和一处录音修正。', note: '也要学会选择不用。', objective: '能对八个习语完成查义、语境、语域、造句、朗读和错误修正。', practice: '提交八张习语卡、对话、中文对照、两轮录音、三个变式和错误分类。', checkpoint: '检查固定性、整体义、语境、语域、朗读、来源和不适用条件。' },
      { title: '独立迁移与评价｜写四段习语对话', body: '选四个习语写四段短对话，分别标字面义、习语义、说话关系、语域和不使用条件。先做前测预测，再查词典、听音频、朗读录音。24 小时后把一个习语移到正式段落，判断是否合适并改写。评价四项：搭配固定、语境自然、语域准确、录音清楚。最后写一个中文成语逐词直译的反例，说明如何改找功能相近表达。', note: '自然比炫技重要。', objective: '能把习语迁移到新对话，并用搭配、语境、语域、录音和反例评价。', practice: '提交四段对话、中文功能义、来源、两轮录音、24 小时语域变式和反例。', checkpoint: '四项自评：形式固定、语境支持、语域匹配、录音可懂；否则不用或改写。' },
    ],
    quiz: [
      question('习语学习为什么要记录完整短语？', '习语的词序、冠词和介词常受固定限制，随意替换可能不自然', ['因为短语越长越高级', '因为每个词都没有意义', '因为只能在正式写作中使用'], 0, '习语是约定俗成的整体表达。拆成单词或换介词可能失去原义，因此要连同例句和语域一起记录。', '事实与定义'),
      question('判断一个习语是否适合当前场合，最需要看什么？', '说话关系、目的、语境和正式程度', ['单词首字母', '句子长度', '中文是否有四字成语'], 1, '同一习语可能在朋友聊天自然，在正式报告中不合适。语境和语域决定使用效果，不能只看意思是否接近。', '材料与推导'),
      question('哪种写法最可能产生不自然英语？', '把中文成语逐词替换成英语单词，再假定整体义相同', ['先查词典例句', '记录固定搭配', '比较正式和口语语境'], 2, '不同语言的习语历史和文化路径不同，逐词替换常丢失整体义和搭配限制。应找英语中功能相近的现成表达。', '常见误区'),
      question('把习语用于新对话时，哪种验证最完整？', '检查固定形式、关系与语域，朗读录音，并让听者复述整体含义', ['只看中文解释', '一次使用后不问反馈', '把所有习语都塞进作文'], 0, '习语是否成功取决于听者能否在语境中理解。录音和复述反馈能检查语域、语气和整体义，而不只是形式记忆。', '迁移应用'),
    ],
  }),
  'english:时态必背': course({
    prerequisite: '掌握动词原形、过去式、过去分词和基础助动词。',
    plainLanguageGoal: '学完后，你能用时间轴区分一般、进行和完成时态，并解释叙事中每次时态切换的理由。',
    guidedPractice: '把同一事件改写成六种时态，画时间轴、写中文对照并逐句说明参照时间。',
    independentPractice: '写一段八句个人经历，使用至少四种时态，录音并做时态一致性复查。',
    commonErrors: ['只看到时间词就选时态，不看动作体貌。', '把现在完成与一般过去当作同义。', '叙事中无理由切换时态或遗漏助动词。'],
    sourceRefs: TENSE_SOURCES,
    studyPoints: [
      point('必背', '一般时、进行时和完成时表达不同体貌；现在完成连接过去与现在，不是一般过去的替换。', 1),
      point('重点', '画时间轴标说话时间、事件时间和参照点，再选择时态。', 2),
      point('易错', '完成时必须有正确助动词和过去分词；明确结束时间通常用一般过去。', 3),
      point('考点', '每个时态切换都写出理由，并用朗读和上下文复查一致性。', 4),
    ],
    eventDetails: [TENSE_ARCHIVE],
    steps: [
      { title: '情境与诊断｜yesterday 和 since Monday 能选同一时态吗', body: '先做前测：I ___ the book yesterday、I ___ here since Monday、I ___ dinner when you called。要求填时态、助动词、动词形式并画时间轴。听三句音频标时间词和重音，记录是否把现在完成等同过去。变式改 since 为 last year。反例是 I have seen him yesterday。后测写三句并说明参照时间，朗读录音纠正一个助动词弱读。', note: '先画时间，再选结构。', objective: '能用时间轴和音频诊断一般过去、现在完成与进行时选择。', practice: '完成三句前测、时间轴、中文对照、听辨、首轮录音和一个纠错点。', checkpoint: '检查参照时间、体貌、助动词、过去分词、结束时间、中文对照和录音。' },
      { title: '材料与概念｜时间轴、体貌与时态一致', body: '时态选择同时看事件时间和动作体貌。一般时呈现习惯、事实或完整事件，进行时突出某参照时刻的过程，完成时连接两个时间或强调结果、经历和持续。现在完成不能用明确结束的过去时间替代一般过去。叙事先定主时间线，再用背景、先行动作或现在结果解释切换。每个结构检查助动词、主要动词形式和时间表达；朗读录音帮助发现缩写、尾音和重音问题，中文对照用于确认意义。时态一致必须由语境说明，不能只凭时间词。', note: '时态由意义决定，不由一个时间词决定。', objective: '能解释时间轴、体貌、一般时、进行时、完成时和叙事一致。', practice: '为六句写时间轴、时态名称、助动词、中文对照和一个切换理由。', checkpoint: '检查时间关系、体貌、助动词、动词形式、结束时间、一致性和中文对照。' },
      { title: '示范与推导｜一条事件线改成三种时态', body: '示范同一事件：I cook dinner every day. I cooked dinner yesterday. I was cooking when you called. I have already cooked dinner. 四句分别表达习惯、完成过去事件、过去过程与现在结果。画四条时间轴，标事件和参照点，朗读录音后只修正 have cooked 的连读。反例是所有句子都用过去式。变式加入 before/after，检查先行动作与时态是否匹配。', note: '同一动作，不同体貌。', objective: '能比较四种时态体貌并用时间轴解释语义差异。', practice: '完成四句时间轴、中文对照、助动词表、首轮录音和连读修正。', checkpoint: '检查时间参照、体貌、助动词、过去分词、事件顺序、录音和变式。' },
      { title: '引导练习｜八组时态改写', body: '准备八题，覆盖一般现在、一般过去、现在进行、过去进行、现在完成、过去完成和两个叙事混合。每题先做前测画时间轴，再写句子和中文对照，后测录音并解释一次切换。变式改变时间词或主句时态。记录只看时间词、助动词遗漏、过去分词错误、无理由切换四类错误，每类写一个检查问题，并指出下一次应优先核对的时间轴位置。', note: '每个切换都要有理由。', objective: '能对八组句子完成时间轴、时态选择、改写、朗读和一致性修正。', practice: '提交八张时间轴、改写句、中文对照、两轮录音、三个变式和错误分类。', checkpoint: '检查参照时间、体貌、助动词、分词、切换理由、录音和变式。' },
      { title: '独立迁移与评价｜写八句个人经历', body: '写一段八句个人经历，使用至少四种时态。先做前测列事件顺序和参照时间，再写句子、中文对照并朗读录音。24 小时后只保留时间轴，不看原文复述。评价四项：时间关系清楚、结构准确、切换有理由、录音可理解。最后写一个把现在完成与明确过去时间连用的反例，并说明如何改写。完成后逐句标出参照点，确保每个时态切换都能解释。', note: '语音复查也是时态检查。', objective: '能把时态系统迁移到叙事，并用时间轴、结构、一致性和录音评价。', practice: '提交时间轴、八句叙事、中文对照、两轮录音、24 小时复述和反例。', checkpoint: '四项自评：时间轴完整、助动词与分词正确、切换有理由、录音可理解；否则重写。' },
    ],
    quiz: [
      question('I ___ him yesterday. 最合适的形式是什么？', 'saw，因为 yesterday 指向已结束的过去事件', ['have seen，因为现在仍记得', 'see，因为主语是 I', 'was seeing，必须表示过程'], 0, 'yesterday 指向明确结束的过去时间，通常用一般过去 saw。现在完成 have seen 不能直接与 yesterday 连用。', '事实与定义'),
      question('现在完成时最核心的连接是什么？', '过去动作与现在的结果、经历或持续状态', ['只表示遥远的过去', '只表示未来计划', '只表示正在发生'], 1, '现在完成把过去与当前参照点连接起来。它可表达结果、经历或持续，但与明确结束的过去时间通常不搭配。', '材料与推导'),
      question('哪句最需要修正？', 'I have finished the report yesterday.', ['I finished the report yesterday.', 'I have already finished the report.', 'I was finishing the report when he called.'], 2, 'have finished 是现在完成，不能与 yesterday 这种明确结束时间直接连用。应改为一般过去 finished。', '常见误区'),
      question('叙事中切换时态前，哪种检查最合理？', '先标事件时间、参照点和动作体貌，再说明切换要表达的关系', ['随机换时态让文章多样', '只看句子长度', '只按中文“了”逐字对应'], 0, '时态切换必须有时间或体貌意义。时间轴能显示背景、先行动作和现在结果，避免无理由跳变。', '迁移应用'),
    ],
  }),
};
