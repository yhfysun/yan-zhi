import { GRAMMAR_POINTS, READING_PASSAGES, type ReadingPassage } from './curriculum.js';

export type EnglishPathStepKind = 'phonics' | 'roots' | 'grammar' | 'fable' | 'story' | 'long-story' | 'speaking' | 'translate';

/** 回译条目：先自己翻，再对照参考译文与预写差异提示。 */
export type EnglishTranslateItem = {
  /** 中文源句（用户看到的输入）。 */
  zh: string;
  /** 参考译文（点「对照」后才展示）。 */
  en: string;
  /** 预写差异提示：词序 / 时态 / 冠词等中英差异点。 */
  note: string;
};

/** 教学方法标签（每课渲染成 chip；数据驱动，不在前端硬编码）。 */
export type EnglishMethod = '听辨' | '口型' | '拼读' | '音标分组' | '速通' | '词根' | '对照' | '精读' | '回译' | '操练';

export type EnglishQuickCheck = {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
};

export type EnglishPathSound = {
  letter: string;
  ipa: string;
  word: string;
  gloss: string;
  /** 口型/发音要领（服务端预写，零基础层用它替代 IPA 符号展示）。 */
  mouth?: string;
};

/** 结构化拼读演示：音素逐个放本音，再连成整词（取代前端按辅音字母猜音）。 */
export type EnglishBlendGroup = {
  parts: Array<{ text: string; ipa: string }>;
  word: string;
};

export type EnglishPathStep = {
  id: string;
  kind: EnglishPathStepKind;
  title: string;
  goal: string;
  minutes: number;
  explanation: string;
  pattern?: string;
  patternAudio?: string;
  sounds?: EnglishPathSound[];
  /** 零基础层不显示 IPA 符号（音频仍按 ipa 播放），改显示 mouth 口型提示。 */
  ipaHidden?: boolean;
  /** 结构化拼读数据；有值时前端不再解析 pattern 猜辅音音素。 */
  blend?: EnglishBlendGroup[];
  /** 教学方法标签；getEnglishPath 输出保证非空（未写时按 kind 兜底）。 */
  method?: EnglishMethod;
  tip: string;
  examples: Array<{ en: string; zh: string }>;
  wordFamily?: Array<{ word: string; gloss: string; note?: string }>;
  /** 回译课内容；kind='translate' 时必有。 */
  translate?: EnglishTranslateItem[];
  /** 关联阅读 Tab 的范文 id；有值时故事课显示「对照细读」入口。 */
  readingPassageId?: string;
  task: string;
  quickCheck?: EnglishQuickCheck;
};

export type EnglishPathStage = {
  id: string;
  title: string;
  subtitle: string;
  level: string;
  steps: EnglishPathStep[];
};

type StepSeed = Omit<EnglishPathStep, 'id' | 'kind' | 'quickCheck'> & { check: EnglishQuickCheck };

function makeStep(kind: EnglishPathStepKind, id: string, seed: StepSeed): EnglishPathStep {
  const { check, ...rest } = seed;
  return { id, kind, ...rest, quickCheck: check };
}

/** kind → 默认教法标签；个别课在数据里显式覆盖（如听辨、速通）。 */
const KIND_METHOD: Record<EnglishPathStepKind, EnglishMethod> = {
  phonics: '拼读',
  roots: '词根',
  grammar: '对照',
  fable: '精读',
  story: '精读',
  'long-story': '精读',
  speaking: '操练',
  translate: '回译',
};

const PHONICS_EXTRA: Array<{ id: string; title: string; goal: string; pattern: string; sounds?: EnglishPathSound[]; words: string; zh: string; sentence: string; sentenceZh: string; task: string; check: EnglishQuickCheck }> = [
  {
    id: 'sound_magic_e_a', title: 'Magic E：a_e 的长音', goal: '理解词尾 e 不发音，却让前面的 a 发长音',
    pattern: 'cap → cape；mat → mate；plan → plane',
    sounds: [
      { letter: 'a', ipa: '/æ/', word: 'cap', gloss: '帽子' },
      { letter: 'a_e', ipa: '/eɪ/', word: 'cape', gloss: '披风' },
    ],
    words: 'cap · cape · mat · mate', zh: '帽子 · 披风 · 垫子 · 配对/伙伴',
    sentence: 'She put on a cape and left the mat by the door.', sentenceZh: '她披上披风，把垫子留在门边。',
    task: '把 cap、mat、plan 各加一个 e，读出变化后的长音。',
    check: { question: 'Which pair shows the Magic E change?', options: ['cap → cape', 'cat → cut', 'sit → sat', 'bed → bad'], answer: 0, explanation: '词尾 e 让 a 从短音 /æ/ 变成字母音 /eɪ/。' },
  },
  {
    id: 'sound_magic_e_io', title: 'Magic E：i_e / o_e', goal: '识别 bike、home 这类“辅音 + 元音 + 辅音 + e”结构',
    pattern: 'kit → kite；not → note；hop → hope',
    sounds: [
      { letter: 'i', ipa: '/ɪ/', word: 'kit', gloss: '工具包' },
      { letter: 'i_e', ipa: '/aɪ/', word: 'kite', gloss: '风筝' },
      { letter: 'o', ipa: '/ɑ/', word: 'not', gloss: '不' },
      { letter: 'o_e', ipa: '/oʊ/', word: 'note', gloss: '便条' },
    ],
    words: 'kit · kite · not · note', zh: '工具包 · 风筝 · 不 · 笔记',
    sentence: 'The note on the kite says “Do not let go.”', sentenceZh: '风筝上的便条写着“别松手”。',
    task: '拆读 kit/kite、not/note、hop/hope，每组说出元音变化。',
    check: { question: 'Which word has the long /aɪ/ sound?', options: ['kit', 'kite', 'sit', 'hit'], answer: 1, explanation: 'kite 里的 i_e 发字母音 /aɪ/。' },
  },
  {
    id: 'sound_ee_ea', title: 'ee / ea 的常见长音', goal: '把 ee、ea 先当作常见 /iː/ 词块',
    pattern: 'ee /iː/ · ea /iː/；see, green, eat, team',
    sounds: [
      { letter: 'ee', ipa: '/iː/', word: 'green', gloss: '绿色' },
      { letter: 'ea', ipa: '/iː/', word: 'team', gloss: '团队' },
    ],
    words: 'see · green · eat · team', zh: '看见 · 绿色 · 吃 · 团队',
    sentence: 'The green team meets to eat before the game.', sentenceZh: '绿队比赛前集合吃饭。',
    task: '从今天遇到的词里找 5 个含 ee 或 ea 的词，按声音归类。',
    check: { question: 'Which word most likely contains /iː/?', options: ['bed', 'team', 'hot', 'cup'], answer: 1, explanation: 'ea 在 team 中通常发 /iː/。' },
  },
  {
    id: 'sound_ai_ay', title: 'ai / ay 的 /eɪ/', goal: '在词中 ai、词尾 ay 中快速识别长音 a',
    pattern: 'rain, train, wait；day, play, stay',
    sounds: [
      { letter: 'ai', ipa: '/eɪ/', word: 'rain', gloss: '雨' },
      { letter: 'ay', ipa: '/eɪ/', word: 'play', gloss: '玩' },
    ],
    words: 'rain · train · play · stay', zh: '雨 · 火车 · 玩 · 停留',
    sentence: 'They wait for the train on a rainy day.', sentenceZh: '下雨天他们等火车。',
    task: '用 rain、play、wait 各造一个短句。',
    check: { question: 'Which spelling usually appears at the end of a word for /eɪ/?', options: ['ai', 'ay', 'ee', 'oo'], answer: 1, explanation: 'ay 常见于词尾，如 day、play、stay。' },
  },
  {
    id: 'sound_oa_ow', title: 'oa / ow 的 /oʊ/', goal: '认识 road、boat、slow、window 里的长音 o',
    pattern: 'oa 在词中；ow 可在词中或词尾',
    sounds: [
      { letter: 'oa', ipa: '/oʊ/', word: 'boat', gloss: '船' },
      { letter: 'ow', ipa: '/oʊ/', word: 'slow', gloss: '慢的' },
    ],
    words: 'road · boat · slow · window', zh: '道路 · 船 · 慢的 · 窗户',
    sentence: 'The boat moves slowly down the road? No—on the water.', sentenceZh: '船在水上慢慢前进，不在路上。',
    task: '把 road、boat、slow、window 读三遍，并圈出 oa/ow。',
    check: { question: 'Which word contains /oʊ/?', options: ['shop', 'boat', 'book', 'cat'], answer: 1, explanation: 'oa 在 boat 中通常发 /oʊ/。' },
  },
  {
    id: 'sound_r_vowels', title: 'ar / or 的卷舌与长音', goal: '区分 car、park 与 for、short 的常见元音组合',
    pattern: 'ar /ɑr/ · or /ɔr/（按通用美式标音）',
    sounds: [
      { letter: 'ar', ipa: '/ɑr/', word: 'car', gloss: '汽车' },
      { letter: 'or', ipa: '/ɔr/', word: 'for', gloss: '为了' },
    ],
    words: 'car · park · for · short', zh: '汽车 · 公园 · 为了 · 短的',
    sentence: 'The car stops at the park for a short break.', sentenceZh: '汽车在公园停下短暂休息。',
    task: '读 car/park、for/short，注意 r 对前面元音的影响。',
    check: { question: 'Which word contains ar?', options: ['fork', 'park', 'book', 'team'], answer: 1, explanation: 'park 的 ar 是一个固定词块。' },
  },
  {
    id: 'sound_er_ir_ur', title: 'er / ir / ur 的卷舌元音', goal: '区分非重读 teacher 的 /ɚ/ 与重读 bird、turn 的 /ɝ/',
    pattern: 'teacher /ˈtiːtʃɚ/ · bird /bɝd/ · turn /tɝn/ · first /fɝst/',
    sounds: [
      { letter: 'er', ipa: '/ɚ/', word: 'teacher', gloss: '老师' },
      { letter: 'ir', ipa: '/ɝ/', word: 'bird', gloss: '鸟' },
      { letter: 'ur', ipa: '/ɝ/', word: 'turn', gloss: '转动' },
    ],
    words: 'teacher · bird · turn · first', zh: '老师 · 鸟 · 转动 · 第一',
    sentence: 'The teacher asked the first bird to turn around.', sentenceZh: '老师让第一只鸟转身。',
    task: '把 teacher、bird、turn、first 按 er/ir/ur 分组朗读。',
    check: { question: 'Which word uses ir?', options: ['teacher', 'bird', 'turn', 'short'], answer: 1, explanation: 'bird 中间的 ir 发中央元音。' },
  },
  {
    id: 'sound_blends', title: '常见辅音连缀', goal: '把 bl、cr、st、tr 当作一个起音块，不逐字母拖读',
    pattern: 'black · cream · stop · train',
    sounds: [
      { letter: 'bl', ipa: '/bl/', word: 'black', gloss: '黑色' },
      { letter: 'cr', ipa: '/kr/', word: 'cream', gloss: '奶油' },
      { letter: 'st', ipa: '/st/', word: 'stop', gloss: '停止' },
      { letter: 'tr', ipa: '/tr/', word: 'train', gloss: '火车' },
    ],
    words: 'black · cream · stop · train', zh: '黑色 · 奶油 · 停止 · 火车',
    sentence: 'The black train stops near the cream shop.', sentenceZh: '黑色火车停在奶油店附近。',
    task: '选 5 个含辅音连缀的词，先读起音块，再读完整词。',
    check: { question: 'Which word starts with a consonant blend?', options: ['cat', 'stop', 'bed', 'sun'], answer: 1, explanation: 'st 是两个辅音连续出现，要连成一个起音块。' },
  },
  {
    id: 'sound_syllables', title: '长词切音节与重音', goal: '遇到长词先切块，再找最重的一拍',
    pattern: 'com-put-er · beau-ti-ful · un-be-liev-able', words: 'computer · beautiful · unbelievable', zh: '电脑 · 美丽的 · 难以置信的',
    sentence: 'The beautiful computer is almost unbelievable.', sentenceZh: '这台漂亮的电脑几乎让人难以置信。',
    task: '把 computer、beautiful、unbelievable 按音节划开，再朗读。',
    check: { question: 'What is the best first move for a long word?', options: ['Read every letter fast.', 'Split it into familiar sound chunks.', 'Skip it.', 'Guess from the first letter only.'], answer: 1, explanation: '长词先切词块，能在不查词典时读出大部分结构。' },
  },
];

const ROOTS_EXTRA: Array<{ id: string; root: string; meaning: string; words: string[]; zh: string[]; sentence: string; sentenceZh: string; task: string; check: EnglishQuickCheck }> = [
  { id: 'roots_dict', root: 'dict', meaning: '说', words: ['dictate', 'predict', 'dictionary', 'contradiction', 'verdict', 'dictator', 'diction', 'edict'], zh: ['口述/命令', '预测', '词典', '矛盾', '裁决', '独裁者', '措辞', '法令'], sentence: 'A dictionary records how people say words.', sentenceZh: '词典记录人们如何说词。', task: '用 predict 说一句你对明天的预测。', check: { question: 'Which meaning fits dict?', options: ['write', 'say', 'carry', 'see'], answer: 1, explanation: 'dict = say；predict 是提前说出判断。' } },
  { id: 'roots_script', root: 'scrib / script', meaning: '写', words: ['describe', 'prescribe', 'manuscript', 'subscribe', 'inscription', 'transcript', 'script', 'scribble'], zh: ['描述', '开处方', '手稿', '订阅', '铭文', '文字稿', '脚本', '草草写'], sentence: 'She described the scene in a handwritten manuscript.', sentenceZh: '她在一份手稿里描述了那个场景。', task: '拆开 describe，并说出 scrib 在其中的作用。', check: { question: 'Which word contains “write”?', options: ['manuscript', 'spectator', 'portable', 'audio'], answer: 0, explanation: 'script 表示写，manuscript 是手写稿。' } },
  { id: 'roots_tract', root: 'tract', meaning: '拉、吸引', words: ['attract', 'extract', 'contract', 'distract', 'subtract', 'tractor', 'traction', 'abstract'], zh: ['吸引', '提取', '合同/收缩', '分散注意', '减去', '拖拉机', '牵引力', '抽象的'], sentence: 'The exhibit attracted visitors from across the city.', sentenceZh: '展览吸引了全城游客。', task: '用 attract 和 extract 各说一句。', check: { question: 'What does tract mean?', options: ['pull/draw', 'look', 'write', 'life'], answer: 0, explanation: 'tract = pull/draw；attract 是拉到身边。' } },
  { id: 'roots_vis_vid', root: 'vis / vid', meaning: '看', words: ['visible', 'vision', 'video', 'evidence', 'provide', 'supervise', 'visual', 'invisible'], zh: ['可见的', '视野/愿景', '视频', '证据', '提供/预见需要', '监督', '视觉的', '不可见的'], sentence: 'The sign was visible from the road.', sentenceZh: '从路上就能看见那块牌子。', task: '用一个 vis/vid 词描述你眼前能看到的东西。', check: { question: 'Which root means see?', options: ['vid', 'port', 'dict', 'aud'], answer: 0, explanation: 'vid/vis 表示看，如 video、visible。' } },
  { id: 'roots_aud', root: 'aud', meaning: '听', words: ['audio', 'audience', 'audible', 'audit', 'auditorium', 'audition', 'inaudible', 'audiobook'], zh: ['音频', '观众/听众', '听得见的', '审计/旁听', '礼堂', '试音/试镜', '听不见的', '有声书'], sentence: 'The audio was barely audible in the crowded room.', sentenceZh: '在拥挤的房间里，音频几乎听不见。', task: '用 audience 和 audible 各造一句。', check: { question: 'Which word relates to hearing?', options: ['audible', 'visible', 'portable', 'predictable'], answer: 0, explanation: 'aud = hear；audible 是听得见的。' } },
  { id: 'roots_bio', root: 'bio', meaning: '生命', words: ['biology', 'biography', 'biodiversity', 'biosphere', 'biometric', 'biochemistry', 'autobiography', 'antibiotic'], zh: ['生物学', '传记', '生物多样性', '生物圈', '生物识别', '生物化学', '自传', '抗生素'], sentence: 'The biography tells the story of a scientist’s life.', sentenceZh: '这本传记讲述一位科学家的一生。', task: '解释 biology 和 biography 为什么都含 bio。', check: { question: 'What does bio mean?', options: ['earth', 'life', 'sound', 'far'], answer: 1, explanation: 'bio = life。' } },
  { id: 'roots_geo', root: 'geo', meaning: '地球、土地', words: ['geography', 'geology', 'geothermal', 'geometry', 'geologist', 'geopolitical', 'geocentric', 'geoscience'], zh: ['地理', '地质学', '地热的', '几何', '地质学家', '地缘政治的', '地心的', '地球科学'], sentence: 'Geography explains how people and places connect.', sentenceZh: '地理学研究人与地点如何连接。', task: '用 geography 说一句你学地理的用途。', check: { question: 'Which word contains “earth/land”?', options: ['geology', 'biology', 'audio', 'television'], answer: 0, explanation: 'geo = earth；geology 研究地球。' } },
  { id: 'roots_graph', root: 'graph', meaning: '写、画、记录', words: ['photograph', 'paragraph', 'graphic', 'biography', 'geography', 'autograph', 'calligraphy', 'graphite'], zh: ['照片', '段落', '图形的', '传记', '地理', '亲笔签名', '书法', '石墨'], sentence: 'Each paragraph paints one small picture in the reader’s mind.', sentenceZh: '每个段落都在读者脑中画出一幅小画面。', task: '用 photograph 和 paragraph 各说一句。', check: { question: 'What does graph mean?', options: ['write/draw', 'listen', 'carry', 'turn'], answer: 0, explanation: 'graph = write/draw/record。' } },
  { id: 'roots_phone', root: 'phone', meaning: '声音', words: ['telephone', 'microphone', 'phonetic', 'headphone', 'homophone', 'megaphone', 'phonetics', 'symphony'], zh: ['电话', '麦克风', '语音的', '耳机', '同音词', '扩音器', '语音学', '交响乐'], sentence: 'The microphone made every sound louder.', sentenceZh: '麦克风让每个声音都更响。', task: '说出 telephone 和 microphone 各自怎样和“声音”有关。', check: { question: 'Which root relates to sound?', options: ['phone', 'port', 'tract', 'bio'], answer: 0, explanation: 'phone = sound。' } },
  { id: 'roots_tele', root: 'tele', meaning: '远', words: ['telephone', 'television', 'telescope', 'telegram', 'telemetry', 'teleport', 'telework', 'telecommunications'], zh: ['电话', '电视', '望远镜', '电报', '遥测', '瞬间传送', '远程工作', '电信'], sentence: 'A telescope lets us see things far away.', sentenceZh: '望远镜让我们看见远处的东西。', task: '用三个 tele 词说出一句共同规律。', check: { question: 'What does tele mean?', options: ['near', 'far', 'small', 'life'], answer: 1, explanation: 'tele = far，如 telescope 是看远处。' } },
  { id: 'roots_auto', root: 'auto', meaning: '自己', words: ['automatic', 'autobiography', 'autopilot', 'autonomous', 'automobile', 'automation', 'autograph', 'autofocus'], zh: ['自动的', '自传', '自动驾驶', '自治的', '汽车', '自动化', '亲笔签名', '自动对焦'], sentence: 'The automatic door opened by itself.', sentenceZh: '自动门自己打开了。', task: '用 automatic 描述一个你身边的设备。', check: { question: 'Which word contains “self”?', options: ['autobiography', 'geography', 'photograph', 'microphone'], answer: 0, explanation: 'auto = self；autobiography 是自传。' } },
  { id: 'roots_bene', root: 'bene', meaning: '好、善', words: ['benefit', 'beneficial', 'benevolent', 'benefactor', 'beneficence', 'benediction', 'benign', 'beneficiary'], zh: ['益处', '有益的', '仁慈的', '捐助者', '善行', '祝福', '良性的/温和的', '受益人'], sentence: 'Daily reading has a beneficial effect on language.', sentenceZh: '每日阅读对语言能力有益。', task: '用 benefit 或 beneficial 说一句学习习惯。', check: { question: 'What does bene mean?', options: ['bad', 'good', 'far', 'write'], answer: 1, explanation: 'bene = good/well。' } },
  { id: 'roots_mal', root: 'mal', meaning: '坏、恶', words: ['malfunction', 'malnutrition', 'malicious', 'malware', 'malformed', 'malpractice', 'malignant', 'malice'], zh: ['故障', '营养不良', '恶意的', '恶意软件', '畸形的', '渎职/医疗事故', '恶性的', '恶意'], sentence: 'The machine stopped after a serious malfunction.', sentenceZh: '机器在严重故障后停止工作。', task: '用 malfunction 描述一台设备出问题的情景。', check: { question: 'What does mal mean?', options: ['good', 'bad', 'self', 'sound'], answer: 1, explanation: 'mal = bad/ill，如 malfunction 是运转不良。' } },
];

const SPEAKING_EXTRA: Array<{ id: string; title: string; goal: string; pattern: string; task: string; example: string; zh: string; check: EnglishQuickCheck }> = [
  { id: 'speak_directions', title: '问路与确认方向', goal: '能清楚问路，并复述对方的指示', pattern: 'How do I get to...? / Go straight and turn left at...', task: '选一个真实地点，设计“问路 → 复述 → 确认”的三轮对话。', example: 'Excuse me, how do I get to the train station? Should I turn left at the bank?', zh: '打扰一下，去火车站怎么走？我应该在银行左转吗？', check: { question: 'Which sentence confirms a direction?', options: ['So I turn left at the bank, right?', 'I like trains.', 'The bank is a building.', 'Where is my bag?'], answer: 0, explanation: '复述自己的理解并加 right? 是自然的确认方式。' } },
  { id: 'speak_restaurant', title: '餐厅点单与特殊要求', goal: '完成点单、询问推荐和说明忌口', pattern: 'Could I have...? / Does this contain...? / I’m allergic to...', task: '用三个句型完成一次餐厅点单。', example: 'Could I have the chicken without sauce? I’m allergic to nuts. Does this dish contain any?', zh: '鸡肉可以不加酱吗？我对坚果过敏，这道菜含坚果吗？', check: { question: 'Which phrase states a dietary restriction?', options: ['I’m allergic to nuts.', 'I want the bill.', 'It tastes good.', 'See you tomorrow.'], answer: 0, explanation: 'I’m allergic to... 用于说明过敏。' } },
  { id: 'speak_shopping', title: '购物比较与退换', goal: '询问尺寸、比较价格、说明退换原因', pattern: 'Do you have this in...? / It’s cheaper, but... / I’d like to return...', task: '扮演顾客，完成一次比较和退换的开场。', example: 'Do you have this in a smaller size? This one is cheaper, but the color is different.', zh: '这件有小一号吗？这件更便宜，但颜色不同。', check: { question: 'Which question asks about size?', options: ['Do you have this in a smaller size?', 'Where is the station?', 'Can I pay tomorrow?', 'Who made this?'], answer: 0, explanation: 'in a smaller size 是询问尺寸的常用表达。' } },
  { id: 'speak_appointment', title: '预约、改期与取消', goal: '用礼貌表达完成预约调整', pattern: 'I’d like to book... / Could we move it to...? / I need to cancel...', task: '把一个已有预约改到新时间，并说明原因。', example: 'I’d like to move my appointment from Tuesday to Friday afternoon if possible.', zh: '如果可以，我想把预约从周二改到周五下午。', check: { question: 'Which phrase asks to reschedule?', options: ['Could we move it to Friday?', 'Could I have a coffee?', 'Where are you from?', 'What is your name?'], answer: 0, explanation: 'move it to... 用于改期。' } },
  { id: 'speak_phone', title: '电话沟通与信息确认', goal: '在听不清时请求重复，并确认关键信息', pattern: 'Could you repeat that? / Let me confirm... / You said..., correct?', task: '模拟电话确认时间、地点、联系人三项信息。', example: 'Let me confirm: the meeting is at 3 p.m. on Friday, correct? Could you repeat the room number?', zh: '我确认一下：会议是周五下午三点，对吗？房间号能再说一遍吗？', check: { question: 'Which phrase asks someone to repeat?', options: ['Could you repeat that?', 'I agree with you.', 'That sounds fun.', 'I will call later.'], answer: 0, explanation: 'Could you repeat that? 用于请求重复。' } },
  { id: 'speak_opinion', title: '表达观点与让步', goal: '不只说 I think，还能承认对方观点', pattern: 'I’d argue that... / I see your point, but... / It depends on...', task: '就“电子设备是否让人更没耐心”表达观点并让步一次。', example: 'I see your point, but it depends on how we use the device.', zh: '我理解你的观点，但这取决于我们如何使用设备。', check: { question: 'Which phrase acknowledges the other side?', options: ['I see your point, but...', 'You are completely wrong.', 'I don’t care.', 'Let’s ignore it.'], answer: 0, explanation: 'I see your point 先承认对方，再补充自己的观点。' } },
  { id: 'speak_compare', title: '比较与选择', goal: '用更自然的方式比较两个选项并给出理由', pattern: 'A is more... than B because... / While A..., B...', task: '比较两种学习方式，做一次 30 秒选择陈述。', example: 'Reading a story is more enjoyable than memorizing a list because context helps me remember.', zh: '读故事比背清单更有趣，因为语境帮助我记忆。', check: { question: 'Which sentence gives a reason?', options: ['A is better because it saves time.', 'A is better.', 'I choose A.', 'B is different.'], answer: 0, explanation: 'because 后面给出选择理由。' } },
  { id: 'speak_update', title: '工作进展同步', goal: '用“已完成、进行中、风险、下一步”同步进展', pattern: 'I’ve finished... / I’m working on... / The main risk is... / Next, I’ll...', task: '用四项结构汇报一个真实任务。', example: 'I’ve finished the draft. I’m checking the data, and the main risk is a missing source. Next, I’ll confirm it with the owner.', zh: '草稿完成了。我在核对数据，主要风险是缺少来源。下一步我会向负责人确认。', check: { question: 'Which phrase flags a risk?', options: ['The main risk is...', 'I like this task.', 'Good morning.', 'The office is open.'], answer: 0, explanation: 'The main risk is... 明确标记风险。' } },
  { id: 'speak_storyteller', title: '即兴讲一个故事', goal: '用场景、冲突、转折、结局维持故事线', pattern: 'Last week... At first... Then... In the end...', task: '讲一个“一个小失误最后变成好事”的故事。', example: 'Last week I missed my bus. At first I was upset, but then I met an old friend at the station.', zh: '上周我错过公交。起初很烦，但后来在车站遇到老朋友。', check: { question: 'Which connector introduces a turn?', options: ['But then...', 'First of all...', 'Because...', 'For example...'], answer: 0, explanation: 'but then 常用来说明情节发生转折。' } },
];

/**
 * 语法课 = 机器翻译对照法（教学理念：机器翻译帮助语法理解）。
 *
 * 每课自带 2 条中英对照翻译：中文源句 → 用户先自己翻 → 对照参考译文，差异处
 * 就是「中文没有、英文必须变形」的语法点（时态/单复数/冠词/语序）。参考译文
 * 与差异提示全部由预写的 GRAMMAR_POINTS 数据派生，不走 LLM。
 */
function grammarStep(index: number): EnglishPathStep {
  const point = GRAMMAR_POINTS[index];
  const example = point.examples[0];
  const pair = point.pairs[0];
  const distractor = GRAMMAR_POINTS[(index + 1) % GRAMMAR_POINTS.length];
  return {
    id: `path_${point.id}`,
    kind: 'grammar',
    title: point.title,
    goal: `在真实句子里稳定使用「${point.title}」`,
    minutes: 9,
    explanation: `${point.rule} 学法是翻译对照：先把中文翻成英语，再对照参考译文——差异的地方，就是中文里没有、英文必须变形的地方。`,
    pattern: point.rule,
    tip: '对照时只问一句：中文说得出来，英语为什么必须这样变形？把原因归到时间、主语或句子结构上。',
    examples: point.examples,
    translate: point.examples.map((item) => ({
      zh: item.zh,
      en: item.en,
      note: `本课考的是「${point.title}」：${point.rule} 常见错误：${pair.wrong} → ${pair.right}（${pair.why}）`,
    })),
    task: `先翻上面 ${point.examples.length} 句中文并逐句对照，再用「${point.title}」写两句与你生活有关的句子，朗读一遍。`,
    quickCheck: {
      question: `哪一句正确使用了「${point.title}」？`,
      options: [pair.right, pair.wrong, distractor.examples[0]?.en || example.en],
      answer: 0,
      explanation: `${pair.why} 先判断句子结构，再选择对应形式。`,
    },
  };
}

function passageStep(passage: ReadingPassage, kind: 'fable' | 'story', index: number): EnglishPathStep {
  const allTitles = READING_PASSAGES.filter((item) => item.id !== passage.id).map((item) => item.title);
  const distractors = [allTitles[index % allTitles.length], allTitles[(index + 3) % allTitles.length], 'A Vocabulary List Without Context']
    .filter((title) => !!title && title !== passage.title)
    .slice(0, 3);
  const isFable = kind === 'fable';
  return {
    id: `path_${passage.id}`,
    kind,
    readingPassageId: passage.id,
    title: passage.title,
    goal: isFable ? '读出角色对比、结果和寓言道理' : '抓住人物、冲突、转折与结局',
    minutes: passage.paras.length >= 4 ? 24 : 16,
    explanation: isFable
      ? '寓言先写角色行为，再通过结果给出道理。阅读时把“发生了什么”和“说明什么”分开。'
      : '短篇先找人物和目标，再找阻碍与转折。遇到生词先跳过，先看事件怎么推进。',
    pattern: isFable ? 'character → action → result → moral' : 'character → problem → turn → ending',
    tip: isFable ? '先复述行为，再说寓意，避免只背一句结论。' : '每读完一段，用一句话概括这一段发生了什么。',
    examples: passage.paras,
    task: isFable
      ? `用三句英文复述《${passage.title}》，最后补一句你认同或不认同的道理。`
      : `用四句英文复述《${passage.title}》：人物、问题、转折、结局。`,
    quickCheck: {
      question: 'Which title best matches this passage?',
      options: [passage.title, ...distractors],
      answer: 0,
      explanation: `文章围绕「${passage.title}」展开；先利用标题建立阅读预期。`,
    },
  };
}

/**
 * 零基础第 0 课：先分清「字母名称」和「字母声音」。
 *
 * 零基础学员早就会背 ABC——那是字母名。读词用的是字母音，两套声音必须先分开，
 * 否则拼读时会用「诶/衣/西」去套（国内拼读教学最常见的头号误区）。
 * 有意不设 sounds 字段：这一课做对比认知，不进入逐音教学。
 */
const LETTER_NAME_LESSON: EnglishPathStep = {
  id: 'letter_name_vs_sound',
  kind: 'phonics',
  method: '听辨',
  title: '字母名 ≠ 字母音',
  goal: '分清「字母怎么念它的名字」和「字母在单词里怎么发音」',
  minutes: 8,
  explanation: '你早就会背 A B C——那是字母的名称。但读单词用的是字母的"声音"：a 在 tap 里不发「诶」，发短促的"啊"。先把两套声音分开，后面拼读才不会乱。',
  pattern: '名称：A「诶」 E「衣」 I「爱」 O「欧」 U「由」 → 声音：a 短"啊" e 短"诶" i 短"衣" o 短"奥" u 短"阿"',
  tip: '快问快答练法：别人说一个已学词（tap、sit），你只说中间元音的"声音"，不许说字母名。',
  examples: [
    { en: 'name: a e i o u — sound: tap bed sit hot cup', zh: '名称是字母的自报家门；声音才是读词用的那套。' },
  ],
  task: '把 26 个字母的名称快速念一遍，然后读 tap、bed、sit、hot、cup，注意元音的"声音"和名称不同。',
  quickCheck: {
    question: '读 tap 时，a 发的是字母名称「诶」吗？',
    options: ['是，a 就读「诶」', '不是，a 在里面发短促的"啊"', '是，但读轻一点', '看心情'],
    answer: 1,
    explanation: '字母名和字母音是两套系统。tap 里 a 发短"啊"；「诶」是 a 单独报名字时的读音。',
  },
};

/**
 * 零基础发音段的系统拼读分组课（SSP 顺序：Jolly Phonics / Letters and Sounds 公开教学顺序）。
 *
 * ★ 教学硬约束（english-path.test.ts 有前置知识闭合校验，改课必须同步满足）：
 *  1. 一课只教 ≤6 个音，音的顺序 = SSP 分组，不按字母表；
 *  2. 每课例词只能由「本课 + 之前已教」的字母拼出（sat/pin/tap 只用第 1 组六个字母）；
 *  3. 零基础层不展示 IPA 符号（ipaHidden），改展示 mouth 口型提示；
 *  4. IPA 符号、闭音节等术语下沉到初中及以上轨道。
 */
const SSP_GROUP1: EnglishPathStep = {
  id: 'ssp_group1',
  kind: 'phonics',
  title: '第一组音：s a t i p n',
  goal: '把这 6 个音发准：它们能拼出最多的简单词',
  minutes: 10,
  ipaHidden: true,
  explanation: '学发音不按字母表，按"能马上拼出词"的顺序来。这 6 个音学会了，就能读 sat、pin、tap 这样的词。每个音跟读三遍，再点例词听整词。从这一课起，记单词靠拼读：会读的词就能拼写出来，不用死背字母。',
  pattern: 's /s/ → sip · a /æ/ → tap · t /t/ → tin · i /ɪ/ → sit · p /p/ → pan · n /n/ → nap',
  sounds: [
    { letter: 's', ipa: '/s/', word: 'sip', gloss: '小口喝', mouth: '嘴角拉平，牙齿轻合，让气流从齿缝里"嘶——"出来' },
    { letter: 'a', ipa: '/æ/', word: 'tap', gloss: '轻拍', mouth: '嘴张大能放进两指，短促地"啊"，不要拖长' },
    { letter: 't', ipa: '/t/', word: 'tin', gloss: '罐头', mouth: '舌尖抵住上齿龈，短促弹开，像轻敲桌面' },
    { letter: 'i', ipa: '/ɪ/', word: 'sit', gloss: '坐', mouth: '下巴放松半开，短促的"衣"，比中文"衣"更松' },
    { letter: 'p', ipa: '/p/', word: 'pan', gloss: '平底锅', mouth: '双唇先闭紧，再突然张开吐气，像吹灭蜡烛' },
    { letter: 'n', ipa: '/n/', word: 'nap', gloss: '小睡', mouth: '舌尖抵上齿龈，气流从鼻腔出来，喉咙不振动发声前先闭嘴哼一下' },
  ],
  tip: '每学一个音就伸手比划一次动作（s 像蛇、t 像看手表），音和动作绑在一起记。',
  examples: [
    { en: 'sit · pin · tap · tin · nap · pan', zh: '坐 · 别针 · 轻拍 · 罐头 · 小睡 · 平底锅' },
    { en: 'Tap it. Pat it.', zh: '敲敲它，拍拍它。' },
  ],
  task: '把 6 个音各读三遍，再用 sit、pin、tap 三个词说出中文意思。',
  quickCheck: {
    question: '下面哪个词只用刚学的 6 个音就能拼出来？',
    options: ['tin', 'dog', 'red'],
    answer: 0,
    explanation: 'tin = t + i + n，三个音都学过；dog 里的 o 和 red 里的 r、d 要到后面几组才学。',
  },
};

const SSP_GROUP2: EnglishPathStep = {
  id: 'ssp_group2',
  kind: 'phonics',
  title: '第二组音：c e h r m d',
  goal: '加上这 6 个音，能拼的词立刻翻倍',
  minutes: 10,
  ipaHidden: true,
  explanation: 'c 和 k 发同一个音（cat、kid 开头一样）。把这组 6 个音和第一组混在一起练，能拼的词一下多起来：cat、bed、hat、red……',
  pattern: 'c /k/ → cat · e /ɛ/ → pen · h /h/ → hat · r /r/ → red · m /m/ → map · d /d/ → dad',
  sounds: [
    { letter: 'c', ipa: '/k/', word: 'cat', gloss: '猫', mouth: '舌根抬起来抵住软腭，突然放开吐气，像轻轻咳一下' },
    { letter: 'e', ipa: '/ɛ/', word: 'pen', gloss: '钢笔', mouth: '嘴半开，上下齿之间留一根食指宽，短促的"哎"' },
    { letter: 'h', ipa: '/h/', word: 'hat', gloss: '帽子', mouth: '像往镜子上哈气，只有气流，喉咙不用力' },
    { letter: 'r', ipa: '/r/', word: 'red', gloss: '红色', mouth: '舌尖卷起但不碰上腭，嘴唇略向前拢' },
    { letter: 'm', ipa: '/m/', word: 'map', gloss: '地图', mouth: '闭着嘴哼，气流从鼻子出来，嘴唇能感到麻' },
    { letter: 'd', ipa: '/d/', word: 'dad', gloss: '爸爸', mouth: '和 t 舌位一样，但喉咙要振动，手放喉咙能感觉到' },
  ],
  tip: 'c 和 k 同音，先只记 c；r 是这一组最容易丢的音，多读 red、rat 几遍。',
  examples: [
    { en: 'cat · pen · hat · red · map · dad', zh: '猫 · 钢笔 · 帽子 · 红色 · 地图 · 爸爸' },
    { en: 'The cat is mad.', zh: '这只猫生气了。' },
  ],
  task: '把 6 个音各读三遍，再拼读 cat、pen、hat：先一个音一个音读，再连成整词。',
  quickCheck: {
    question: '下面哪个词用前两组的音就能拼出来？',
    options: ['dad', 'sun', 'moon'],
    answer: 0,
    explanation: 'dad = d + a + d，两组都学过；sun 里的 u、moon 里的 oo 还没教。',
  },
};

const SSP_GROUP3: EnglishPathStep = {
  id: 'ssp_group3',
  kind: 'phonics',
  title: '第三组音：g o u l f b',
  goal: '补齐最后 6 个常用音，21 个单字母音全齐',
  minutes: 10,
  ipaHidden: true,
  explanation: '这一组学完，21 个辅音加 a/e/i/o/u 五个元音的短音就全部见过。五个元音字母的短音下一课会放在一起对比。',
  pattern: 'g /g/ → bag · o /ɑ/ → dog · u /ʌ/ → cup · l /l/ → leg · f /f/ → fan · b /b/ → bug',
  sounds: [
    { letter: 'g', ipa: '/g/', word: 'bag', gloss: '包', mouth: '和 k 舌位一样，但喉咙振动，像刚喝完水的"咕"声' },
    { letter: 'o', ipa: '/ɑ/', word: 'dog', gloss: '狗', mouth: '嘴自然张大，圆一点，短促的"啊"（美式读法）' },
    { letter: 'u', ipa: '/ʌ/', word: 'cup', gloss: '杯子', mouth: '嘴自然半开，舌身放平，像被轻轻吓一跳的短"啊"' },
    { letter: 'l', ipa: '/l/', word: 'leg', gloss: '腿', mouth: '舌尖抵上齿龈，气流从舌头两边出来' },
    { letter: 'f', ipa: '/f/', word: 'fan', gloss: '风扇', mouth: '上齿轻咬下唇，吐气，像漏气的"呋"' },
    { letter: 'b', ipa: '/b/', word: 'bug', gloss: '虫子', mouth: '和 p 舌位一样，但喉咙振动；手放喉咙能感觉到' },
  ],
  tip: 'p/b、t/d、k/g 都是"清浊成对"：口型一样，只差喉咙振不振。手放喉咙试一试。',
  examples: [
    { en: 'dog · bag · cup · leg · fan · bug', zh: '狗 · 包 · 杯子 · 腿 · 风扇 · 虫子' },
    { en: 'The dog is on the log.', zh: '狗趴在木头上。' },
  ],
  task: '拼读 dog、bag、cup 各三遍；再用手指着 The dog is on the log. 一个词一个词读。',
  quickCheck: {
    question: '下面哪个词用前三组的音就能拼出来？',
    options: ['leg', 'zip', 'thin'],
    answer: 0,
    explanation: 'leg = l + e + g，三组都学过；zip 里的 z、thin 里的 th 后面才学。',
  },
};

const SSP_MORE_CONSONANTS: EnglishPathStep = {
  id: 'ssp_more_consonants',
  kind: 'phonics',
  title: '剩下的辅音：j v w x y z',
  goal: '补齐 26 个字母的字母音，拼读不再卡壳',
  minutes: 10,
  ipaHidden: true,
  explanation: '这 6 个辅音学完，26 个字母的字母音就全齐了（q 总和 u 连在一起，读作"kw"，后面遇到再练）。注意 y 在 yes 开头是辅音。',
  pattern: 'j /dʒ/ → jam · v /v/ → van · w /w/ → web · x /ks/ → box · y /j/ → yes · z /z/ → zip',
  sounds: [
    { letter: 'j', ipa: '/dʒ/', word: 'jam', gloss: '果酱', mouth: '舌尖抵上齿龈再松开，像"知"的气音加"j"合在一起' },
    { letter: 'v', ipa: '/v/', word: 'van', gloss: '货车', mouth: '上齿轻咬下唇，但喉咙振动；和 f 只差振不振' },
    { letter: 'w', ipa: '/w/', word: 'web', gloss: '网', mouth: '嘴唇收圆再快速打开，像吹圆泡泡' },
    { letter: 'x', ipa: '/ks/', word: 'box', gloss: '盒子', mouth: 'x 在词里读 k 和 s 两个音连起来，跟着整词读' },
    { letter: 'y', ipa: '/j/', word: 'yes', gloss: '是', mouth: '舌面抬高靠近上腭，快速滑向后面的音' },
    { letter: 'z', ipa: '/z/', word: 'zip', gloss: '拉链', mouth: '和 s 舌位一样，但喉咙振动，像蜜蜂"嗡"' },
  ],
  tip: 'v 和 f、z 和 s 都是清浊成对：口型一样，手放喉咙分真假——振动的是 v 和 z。',
  examples: [
    { en: 'jam · van · web · box · yes · zip', zh: '果酱 · 货车 · 网 · 盒子 · 是 · 拉链' },
    { en: 'Yes, the fox is in the box.', zh: '是的，狐狸在盒子里。' },
  ],
  task: '把 6 个音各读三遍，再拼读 box、zip、jam：先拆音再连读。',
  quickCheck: {
    question: '下面哪个词的读音里没有刚学的 6 个辅音？',
    options: ['thin', 'zip', 'van'],
    answer: 0,
    explanation: 'thin 开头是 th 组合，不属于这 6 个辅音；zip 有 z，van 有 v。',
  },
};

/** 分轨入口课：初中 / 高中 / 成人各自的第一课（零基础轨不出现）。 */
const JUNIOR_IPA_MAP: EnglishPathStep = {
  id: 'junior_ipa_map',
  kind: 'phonics',
  method: '音标分组',
  title: '音标地图：先元音，后辅音',
  goal: '知道 48 个音标怎么分组，读准三对最易混的短元音',
  minutes: 12,
  explanation: '初中过音标按三批走：先 12 个单元音（它们是词的"骨架"），再 8 个双元音，最后 28 个辅音清浊成对记。这一课先立地图，只精练三对最容易混的短元音，后面的课再逐组练。',
  pattern: 'sheep /iː/ ↔ ship /ɪ/ · bed /ɛ/ ↔ bad /æ/ · cup /ʌ/ ↔ car /ɑr/',
  sounds: [
    { letter: 'iː', ipa: '/iː/', word: 'sheep', gloss: '羊', mouth: '嘴角向耳根咧开，舌面紧贴上腭，音拖两拍' },
    { letter: 'ɪ', ipa: '/ɪ/', word: 'ship', gloss: '船', mouth: '下巴松半格，短促放松，像被轻吓一跳的"衣"' },
    { letter: 'ɛ', ipa: '/ɛ/', word: 'bed', gloss: '床', mouth: '上下齿之间留一根食指宽' },
    { letter: 'æ', ipa: '/æ/', word: 'bad', gloss: '坏的', mouth: '嘴角横向拉开，下巴再落一指，嘴张到能塞两指' },
    { letter: 'ʌ', ipa: '/ʌ/', word: 'cup', gloss: '杯子', mouth: '嘴自然半开，舌身放平，短促放松' },
    { letter: 'ɑr', ipa: '/ɑr/', word: 'car', gloss: '汽车', mouth: '先发长"啊"再卷舌收 r，美式 r 要圆唇' },
  ],
  tip: '把这三对词各读十遍，读到能自动切换；分不清就回头看口型提示，不要凭感觉猜。',
  examples: [
    { en: 'sheep · ship · bed · bad · cup · car', zh: '羊 · 船 · 床 · 坏的 · 杯子 · 汽车' },
    { en: 'The sheep is in the ship.', zh: '羊在船上。' },
  ],
  task: '对着镜子把三对易混音各读五遍，录音回放和标准音对比一次。',
  quickCheck: {
    question: '老师读 ship 的时候，你听到的是哪个音？',
    options: ['短促放松的 /ɪ/', '拖长的 /iː/', '圆唇的 /ʊ/'],
    answer: 0,
    explanation: 'ship 是短促的 /ɪ/；sheep 才是拖长的 /iː/。分不清就回口型提示再看一遍。',
  },
};

const SENIOR_SOUND_FIX: EnglishPathStep = {
  id: 'senior_sound_fix',
  kind: 'phonics',
  method: '听辨',
  title: '易错音辨析：最小对立对',
  goal: '用成对词把长短线、松紧和 th 咬舌一次分清',
  minutes: 12,
  explanation: '高中的发音问题集中在几对音上：长短不分（ship/sheep）、松紧不分（bad/bed）、圆唇不分（full/fool）、咬舌音发成 s。这节课只做听辨和跟读，不做规则讲解。',
  pattern: 'ship /ɪ/ ↔ sheep /iː/ · bad /æ/ ↔ bed /ɛ/ · full /ʊ/ ↔ fool /uː/ · think /θ/ ↔ sink /s/',
  sounds: [
    { letter: 'ɪ', ipa: '/ɪ/', word: 'ship', gloss: '船', mouth: '短促放松，下巴松半格' },
    { letter: 'iː', ipa: '/iː/', word: 'sheep', gloss: '羊', mouth: '嘴角咧开，舌面紧贴上腭，拖两拍' },
    { letter: 'æ', ipa: '/æ/', word: 'bad', gloss: '坏的', mouth: '嘴张到最大，嘴角横向拉开' },
    { letter: 'ɛ', ipa: '/ɛ/', word: 'bed', gloss: '床', mouth: '比 æ 小一号，齿间留一指宽' },
    { letter: 'ʊ', ipa: '/ʊ/', word: 'full', gloss: '满的', mouth: '嘴唇收小圆孔，短促' },
    { letter: 'θ', ipa: '/θ/', word: 'think', gloss: '想', mouth: '舌尖伸到上下齿之间，吐气不振动' },
  ],
  tip: '每次只练一对：听原音 → 自己读 → 回放对比，一对过关再换下一对。',
  examples: [
    { en: 'ship · sheep · bad · bed · full · fool · think · sink', zh: '船 · 羊 · 坏的 · 床 · 满的 · 傻瓜 · 想 · 下沉' },
    { en: 'I think this full bus is not bad.', zh: '我觉得这辆满员的公交还不错。' },
  ],
  task: '四对易错音各录一遍自己的读音，回放和原音对比，标出最不稳的一对。',
  quickCheck: {
    question: 'Which pair contrasts only vowel length and tenseness?',
    options: ['sheep – ship', 'think – sink', 'bad – bed'],
    answer: 0,
    explanation: 'sheep–ship 差在 /iː/ 长而紧、/ɪ/ 短而松；think–sink 差在辅音 θ 和 s；bad–bed 差在开口度。',
  },
};

const ADULT_IPA_CRASH: EnglishPathStep = {
  id: 'adult_ipa_crash',
  kind: 'phonics',
  method: '速通',
  title: '音标速通：先元音，后辅音',
  goal: '一周把 48 个音标的地图立起来，见到生词敢查敢读',
  minutes: 12,
  explanation: '成人不用从儿歌学起，但要按顺序：第一批 12 个单元音（定调子），第二批 8 个双元音（滑动要做出来），第三批 28 个辅音清浊成对记（p/b、t/d、k/g、f/v、s/z……）。每个音配 3 个高频词，对着口型读。',
  pattern: '元音定调：/iː/ /ɪ/ /ɛ/ /æ/ /ɑ/ /ʌ/ /ʊ/ /uː/ /ɔ/ /ə/ /ɜr/ /ɔr/ → 辅音成对：p↔b · t↔d · k↔g · f↔v · s↔z',
  sounds: [
    { letter: 'iː', ipa: '/iː/', word: 'see', gloss: '看见', mouth: '嘴角咧开，舌面贴上腭，拖两拍' },
    { letter: 'æ', ipa: '/æ/', word: 'cat', gloss: '猫', mouth: '嘴张到能塞两指，短促' },
    { letter: 'ʌ', ipa: '/ʌ/', word: 'cup', gloss: '杯子', mouth: '嘴自然半开，舌身放平' },
    { letter: 'θ', ipa: '/θ/', word: 'think', gloss: '想', mouth: '咬舌吐气，喉咙不振动' },
    { letter: 'ð', ipa: '/ð/', word: 'this', gloss: '这个', mouth: '咬舌吐气，喉咙振动；和 θ 只差振动' },
    { letter: 'ʃ', ipa: '/ʃ/', word: 'she', gloss: '她', mouth: '嘴唇略前拢，像安静手势"嘘"' },
  ],
  tip: '别贪快：一天两批音标，每个音挑 3 个高频词，一周过完全表；中文里没有的音（θ ð v）重点练。',
  examples: [
    { en: 'see · cat · cup · think · this · she', zh: '看见 · 猫 · 杯子 · 想 · 这个 · 她' },
    { en: 'I think this is her cup.', zh: '我觉得这是她的杯子。' },
  ],
  task: '今天先过元音批：每个单元音配 3 个高频词，明天再过辅音批。',
  quickCheck: {
    question: '音标里清浊成对的辅音，"浊"是什么意思？',
    options: ['喉咙振动', '声音更大', '拖得更长'],
    answer: 0,
    explanation: '浊 = 发音时喉咙振动。手放喉咙对比 p 和 b 一试就知道。',
  },
};

/**
 * 回译课（kind='translate'）：先自己把中文翻成英语，再点「对照」逐句看参考译文和预写差异提示。
 *
 * ★ 教学约束（english-path.test.ts 校验）：
 *  1. 只出现在 junior / senior / adult 轨，零基础轨输出为 0 节（认知负荷）；
 *  2. 每课 3~5 句，源句 zh、参考译文 en、差异提示 note 三者全预写，不走 LLM；
 *  3. note 必须点出具体的中英差异（词序/时态/冠词/单复数…），不是"多练习"式空话。
 */
const TRANSLATE_ROOTS: EnglishPathStep = {
  id: 'translate_roots',
  kind: 'translate',
  method: '回译',
  title: '回译：用词根把中文翻成英语',
  goal: '先自己翻，再对照参考译文，检查词根词是不是真的会用',
  minutes: 12,
  explanation: '回译是主动输出：先遮住参考译文，把中文翻成英语，再逐句对照。词根课学的 port、spect 只有在翻译里用出来，才算真的掌握。',
  tip: '对照时只抓两类差异：选词（是不是用了同根词）和形式（第三人称 -s、-able 词性）。不要逐词对照。',
  translate: [
    { zh: '这家公司出口机器，进口咖啡。', en: 'This company exports machines and imports coffee.', note: 'port=搬运：ex- 向外 → exports，im- 向内 → imports；主语第三人称单数，动词加 -s。' },
    { zh: '那位观众很尊重检查员的工作。', en: 'The spectator respects the inspector’s work.', note: 'spect=看：spectator 是观看的人，inspector 是往里看（检查）的人；respect 是"带着敬意看"。' },
    { zh: '这份报告便于携带，也方便运输。', en: 'The report is portable and easy to transport.', note: '-able 表示"能被……的"；transport = trans（跨越）+ port。' },
    { zh: '支持者们把作品集搬进了展览。', en: 'The supporters carried the portfolio into the exhibition.', note: 'support = sup（从下方）+ port；portfolio 是"携带纸张"→ 作品集。这里用一般动词 carried，不必硬凑同根词。' },
  ],
  examples: [],
  task: '先自己翻完 4 句再点对照。把和你译文不一样的句子抄一遍，只改错的地方。',
  quickCheck: {
    question: '回译对照时，最应该优先检查什么？',
    options: ['每个词是不是高级词', '选词对不对、动词形式对不对', '句子长不长', '标点符号'],
    answer: 1,
    explanation: '回译的目标是暴露真实输出和标准表达的差距：先看选词，再看 -s、-able 这类形式差异。',
  },
};

const TRANSLATE_SKELETON: EnglishPathStep = {
  id: 'translate_skeleton',
  kind: 'translate',
  method: '回译',
  title: '回译：先搭骨架再填细节',
  goal: '用"谁做什么"的骨架翻句子，对照时检查语序',
  minutes: 12,
  explanation: '中文习惯把时间、地点放句首，英语常先说"谁做什么"，再补时间地点。回译时最容易暴露的就是这个语序差。',
  tip: '先在纸上写骨架（谁 + 做什么 + 对什么），再填时间地点；对照时看参考译文把时间放到了哪。',
  translate: [
    { zh: '我妹妹每周五在图书馆学英语。', en: 'My sister studies English in the library every Friday.', note: '英语先给"谁做什么"（sister studies English），地点和时间放句尾；中文的"每周五在图书馆"被拆开放。' },
    { zh: '桌上有两杯水和一壶茶。', en: 'There are two glasses of water and a pot of tea on the table.', note: '"某地有某物"用 there be，不用 have；动词跟最近的名词（glasses → are）。' },
    { zh: '他昨天在会上什么都没说。', en: 'He said nothing at the meeting yesterday.', note: '英语用 nothing 直接否定；时间状语 yesterday 放句尾，不抢句子开头。' },
    { zh: '这本词典是我爸爸的。', en: 'This dictionary is my father’s.', note: '英语用 -’s 所有格；中文"我爸爸的"后面省掉的名词，英文可以省，但 ’s 不能丢。' },
  ],
  examples: [],
  task: '翻完再对照。挑一句，把语序差异用箭头画出来（中文语序 → 英语语序）。',
  quickCheck: {
    question: '「昨天我在家看了一本书」，英语最自然的语序是？',
    options: ['Yesterday I at home read a book.', 'I read a book at home yesterday.', 'I yesterday read at home a book.', 'At home yesterday I read a book.'],
    answer: 1,
    explanation: '骨架 I read a book 放最前，地点 at home、时间 yesterday 依次放句尾。',
  },
};

const TRANSLATE_TENSE: EnglishPathStep = {
  id: 'translate_tense',
  kind: 'translate',
  method: '回译',
  title: '回译：时态和否定疑问',
  goal: '对照时专查时态形式：中文不变形，英文必须变',
  minutes: 12,
  explanation: '中文动词不随时间变形（"昨天去/明天去"都是"去"），英语必须变（went / will go）。回译时把每个动词圈出来，先问"什么时间"，再定形式。',
  tip: '对照时只盯动词：它的时态形式对吗？否定借 did/have 了吗？疑问句把助动词提前了吗？',
  translate: [
    { zh: '她上周没来开会。', en: 'She did not come to the meeting last week.', note: '中文"没来"不变动词；英语否定借 did，come 回原形——不能再写 didn’t came。' },
    { zh: '你做过这个测试吗？', en: 'Have you done this test before?', note: '"做过（经验/影响现在）"用现在完成时 have done；疑问句把 have 提到主语前。' },
    { zh: '他们明天几点出发？', en: 'What time do they leave tomorrow?', note: '时刻表类安排常用一般现在时表将来；疑问句借 do 提前，leave 用原形。' },
    { zh: '我正要出门，电话响了。', en: 'I was about to leave when the phone rang.', note: '"正要……这时"用 be about to + when；背景动作 was about to leave，插入动作 rang 用过去式。' },
    { zh: '这本书我已经读了三天了。', en: 'I have been reading this book for three days.', note: '"一直读到现在"用现在完成进行时 have been doing；for + 时间段是它的信号。' },
  ],
  examples: [],
  task: '翻完对照后，把 5 句里的动词按"时间 → 形式"列成一张小表。',
  quickCheck: {
    question: '「我昨天没去」，为什么不能说 I didn’t went？',
    options: ['went 拼错了', 'did 已经承担了过去，动词回原形 go', '昨天不用过去时', 'go 比 went 更高级'],
    answer: 1,
    explanation: '一个句子里过去时只标记一次：did 承担了，后面的动词用原形 go。',
  },
};

const TRANSLATE_FABLE: EnglishPathStep = {
  id: 'translate_fable',
  kind: 'translate',
  method: '回译',
  title: '回译：把寓言道理翻出来',
  goal: '翻叙事句和道理句，对照时检查连接词和冠词',
  minutes: 12,
  explanation: '寓言复述 = 叙事（过去时）+ 总结（一般现在时）。中文一句话的事，英语常要用连接词分成主从两句。',
  tip: '对照时注意 because / so / but 有没有用出来；单数可数名词前面有没有 a/the。',
  translate: [
    { zh: '兔子跑得快，但是它在半路睡着了。', en: 'The hare ran fast, but it fell asleep halfway.', note: '叙事用过去式 ran / fell；中文"半路"= halfway，but 连接转折。' },
    { zh: '乌龟虽然慢，却从来没有停。', en: 'Although the tortoise was slow, it never stopped.', note: '"虽然……却"= although（不与 but 连用）；never 已经是否定，不再加 not。' },
    { zh: '慢而稳的人赢得比赛。', en: 'Slow and steady wins the race.', note: '道理句用一般现在时；形容词短语作主语按单数处理，动词加 -s；race 前有 the。' },
    { zh: '吃不到葡萄就说葡萄酸，这不对。', en: 'It is wrong to say the grapes are sour just because you cannot reach them.', note: '英语用 it 作形式主语；"just because…"把原因挂到句尾，中文没有这种挂尾结构。' },
  ],
  examples: [],
  task: '翻完对照，再挑一句把你自己的版本和参考译文各读三遍，感受差异在哪。',
  quickCheck: {
    question: '「虽然慢，但没停」英语为什么用 Although..., it never stopped 而不加 but？',
    options: ['but 太口语', 'although 和 but 不能在同一个句子里连用', 'never 后面必须加 but', ' stopped 是过去式的原因'],
    answer: 1,
    explanation: 'although 和 but 都标记转折，一个句子里只能出现一个——这是中译英高频错误。',
  },
};

const TRANSLATE_STORY: EnglishPathStep = {
  id: 'translate_story',
  kind: 'translate',
  method: '回译',
  title: '回译：用连接词串故事',
  goal: '翻情节句，对照时检查时间连接词和代词',
  minutes: 12,
  explanation: '中文靠语序表达先后，英语靠 First / Then / After that / Finally 把时间线说破。回译时先把连接词写好，再填句子。',
  tip: '对照时看两点：连接词位置（句首 + 逗号）和"他/她"有没有一直用 he/she，还是换成了名字。',
  translate: [
    { zh: '她错过了末班车，所以只能走路回家。', en: 'She missed the last bus, so she had to walk home.', note: '因果用 so；have to 的过去式是 had to。' },
    { zh: '起初很冷，后来太阳出来了。', en: 'At first it was cold, but later the sun came out.', note: 'At first 放句首 + 逗号；"太阳出来"是固定说法 the sun came out。' },
    { zh: '就在那时，有人敲了敲门。', en: 'Just then, someone knocked on the door.', note: 'Just then 是"就在那时"的地道说法；knock on the door 用 on。' },
    { zh: '最后，大家都笑了，紧张气氛消失了。', en: 'In the end, everyone laughed and the tension was gone.', note: 'In the end 收尾；"气氛消失"英语常说 be gone，不直译 disappear。' },
  ],
  examples: [],
  task: '翻完对照后，用 At first / Then / Just then / In the end 四个连接词复述你自己的一天。',
  quickCheck: {
    question: '连接词在英语句子里通常放在哪？',
    options: ['句子最中间', '句首，后面加逗号', '句尾', '主语后面动词前面'],
    answer: 1,
    explanation: 'At first, / Just then, / In the end, 都是"句首 + 逗号"，提示读者时间线拐弯了。',
  },
};

const TRANSLATE_SPEAKING: EnglishPathStep = {
  id: 'translate_speaking',
  kind: 'translate',
  method: '回译',
  title: '回译：把口语句翻地道',
  goal: '翻日常口语句，对照时看英语的地道搭配',
  minutes: 10,
  explanation: '口语句最忌逐字直译。中文"我请客"翻成 I invite you 吃不地道，英语有自己的说法。回译对照就是积累这些搭配。',
  tip: '对照时把参考译文里"整块"的表达划出来（如 My treat），整块记，不要拆成单词背。',
  translate: [
    { zh: '今天我请客。', en: 'It’s my treat. / My treat.', note: '"请客"是整块表达 my treat，不是 I invite you to eat。' },
    { zh: '这边结账。', en: 'Could we have the bill, please?', note: '英语没有"结账"的直译；餐厅买单用要账单的说法，加 could 礼貌。' },
    { zh: '你决定就行，我都行。', en: 'It’s up to you. I’m easy.', note: '"都行"口语说 I’m easy；up to you 表示由对方决定。' },
    { zh: '我马上到，再等我五分钟。', en: 'I’m almost there. Give me five more minutes.', note: '"马上到"对还在路上的人说 almost there，不用 I will arrive soon。' },
  ],
  examples: [],
  task: '翻完对照后，把 4 个整块表达各大声读五遍，明天口语课直接用。',
  quickCheck: {
    question: '朋友问吃什么，你说"都行，你决定"，最地道的是？',
    options: ['I am all decided by you.', 'It’s up to you. I’m easy.', 'You decide for me please.', 'Anything is decided.'],
    answer: 1,
    explanation: 'It’s up to you + I’m easy 是英语里"你定，我都行"的固定说法。',
  },
};

/** 学习人群轨道：不同起点从不同的第一课进入（用户拍板：零基础 / 初中 / 高中 / 成人）。 */
export type EnglishTrackId = 'zero' | 'junior' | 'senior' | 'adult';

export type EnglishTrack = {
  id: EnglishTrackId;
  name: string;
  audience: string;
  entryStepId: string;
};

export const ENGLISH_TRACKS: EnglishTrack[] = [
  { id: 'zero', name: '零基础', audience: '从字母音开始，一课一小组音', entryStepId: SSP_GROUP1.id },
  { id: 'junior', name: '初中', audience: '认识字母，补音标分组和拼读', entryStepId: JUNIOR_IPA_MAP.id },
  { id: 'senior', name: '高中', audience: '拼读已过关，主攻易错音辨析', entryStepId: SENIOR_SOUND_FIX.id },
  { id: 'adult', name: '成人', audience: '速通音标，直奔高频词句', entryStepId: ADULT_IPA_CRASH.id },
];

export function normalizeEnglishTrack(value: unknown): EnglishTrackId {
  return ENGLISH_TRACKS.some((track) => track.id === value) ? (value as EnglishTrackId) : 'zero';
}

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
      LETTER_NAME_LESSON,
      SSP_GROUP1,
      SSP_GROUP2,
      SSP_GROUP3,
      {
        id: 'sound_short_vowels',
        kind: 'phonics',
        method: '听辨',
        title: 'a/e/i/o/u 的短音（归纳）',
        goal: '把五个元音字母的短音和已学单词对上，听到短音能指对元音字母',
        minutes: 8,
        ipaHidden: true,
        explanation: '前三组里，五个元音字母已经在 cat、bed、sit、dog、cup 这些词里出现过。这一课把它们放在一起对比听，把每个字母的短音听熟。英语还有别的元音音（比如 book 里的 u），后面的课会遇到。',
        pattern: 'a /æ/ → cat · e /ɛ/ → bed · i /ɪ/ → sit · o /ɑ/ → hot · u /ʌ/ → cup',
        patternAudio: 'a, as in cat. e, as in bed. i, as in sit. o, as in hot. u, as in cup.',
        sounds: [
          { letter: 'a', ipa: '/æ/', word: 'cat', gloss: '猫', mouth: '嘴张到能塞两指，短促"啊"' },
          { letter: 'e', ipa: '/ɛ/', word: 'bed', gloss: '床', mouth: '嘴半开，齿间留一指宽' },
          { letter: 'i', ipa: '/ɪ/', word: 'sit', gloss: '坐', mouth: '下巴放松半开，短促"衣"' },
          { letter: 'o', ipa: '/ɑ/', word: 'hot', gloss: '热的', mouth: '嘴自然张大，圆一点' },
          { letter: 'u', ipa: '/ʌ/', word: 'cup', gloss: '杯子', mouth: '嘴自然半开，舌身放平' },
        ],
        tip: '快问快答：听到一个词，立刻指出中间的元音字母。短音和字母名称不一样，不要用"欸""伊"去套。',
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
        goal: '把 c-a-t 三个音连成 cat，建立"看词就能读"的反射',
        minutes: 10,
        explanation: '自然拼读的关键是"合音"：先读第一个音，再接元音，最后接尾音，中间不停顿。连续做几次后，大脑会直接把词形和声音连起来。这就是用拼读记单词：会读就会拼，看到新词先试着读出来，比死背字母顺序牢得多。',
        pattern: 'c + a + t → cat',
        blend: [
          { parts: [{ text: 'c', ipa: '/k/' }, { text: 'a', ipa: '/æ/' }, { text: 't', ipa: '/t/' }], word: 'cat' },
        ],
        tip: '遇到长词先切块：sun-set、bed-room、note-book。',
        examples: [
          { en: 'sunset · bedroom · notebook', zh: '日落 · 卧室 · 笔记本' },
          { en: 'Sun + set makes sunset.', zh: 'sun 和 set 合起来就是 sunset。' },
        ],
        task: '把 sunset、bedroom、notebook 各拆成两个词，再连续读五遍；然后合上页面，用拼读把 cat、sun 各默写出来。',
      },
      SSP_MORE_CONSONANTS,
      {
        id: 'sound_common_pairs',
        kind: 'phonics',
        title: '高频字母组合',
        goal: '先掌握 sh/ch/th/ee/oo 这些最常见组合',
        minutes: 10,
        explanation: '字母组合要当成一个声音块记。先记最常见的一组，在单词里反复见，不要孤立背符号。',
        pattern: 'sh /ʃ/ · ch /tʃ/ · th /θ/ · ee /iː/ · oo /uː/',
        sounds: [
          { letter: 'sh', ipa: '/ʃ/', word: 'ship', gloss: '船' },
          { letter: 'ch', ipa: '/tʃ/', word: 'chair', gloss: '椅子' },
          { letter: 'th', ipa: '/θ/', word: 'think', gloss: '想' },
          { letter: 'ee', ipa: '/iː/', word: 'green', gloss: '绿色' },
          { letter: 'oo', ipa: '/uː/', word: 'moon', gloss: '月亮' },
        ],
        tip: '先用“听—指—读”三步：听到声音，指向词块，再完整读词。',
        examples: [
          { en: 'ship · chair · think · green · moon', zh: '船 · 椅子 · 想 · 绿色 · 月亮' },
          { en: 'The green ship is near the moon.', zh: '那艘绿色的船在月亮附近。' },
        ],
        task: '从今天遇到的单词里找 5 个含 sh、ch、th、ee 或 oo 的词。',
      },
      ...PHONICS_EXTRA.map((item) => makeStep('phonics', item.id, {
        title: item.title,
        goal: item.goal,
        minutes: 10,
        explanation: '自然拼读不是背音标表，而是把常见字母组合当成声音块。先拆块，再把声音连起来。',
        pattern: item.pattern,
        sounds: item.sounds,
        tip: '先读词块，再读整词；遇到新词先找熟悉的声音，不要逐字母拖读。',
        examples: [
          { en: item.words, zh: item.zh },
          { en: item.sentence, zh: item.sentenceZh },
        ],
        task: item.task,
        check: item.check,
      })),
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
        explanation: 'port 表示“带、运”。先记这个词根，再看前缀方向和后缀词性，比逐个死背四个词更稳。词根记单词的原理：记住一个 port，等于记住一整串词——遇到没见过的词也能猜出方向。',
        pattern: 'im-(向内) + port = import；ex-(向外) + port = export',
        tip: '词根负责核心意思，前缀常常改变方向，后缀常决定词性。',
        examples: [
          { en: 'import · export · transport · portable · report · support · porter · portfolio · deport · teleport · transportation', zh: '进口 · 出口 · 运输 · 便携的 · 报告 · 支持 · 搬运工 · 作品集 · 驱逐 · 瞬间传送 · 运输系统' },
          { en: 'We import coffee and export machines.', zh: '我们进口咖啡，出口机器。' },
        ],
        wordFamily: [
          { word: 'import', gloss: '进口', note: 'im- 向内 + port' },
          { word: 'export', gloss: '出口', note: 'ex- 向外 + port' },
          { word: 'transport', gloss: '运输', note: 'trans- 跨越 + port' },
          { word: 'portable', gloss: '便携的', note: 'port + -able 可被……的' },
          { word: 'report', gloss: '报告', note: 're- 回 + port，把消息带回来' },
          { word: 'support', gloss: '支持', note: 'sup- 从下方 + port，从下面托住' },
          { word: 'porter', gloss: '搬运工', note: 'port + -er 做这件事的人' },
          { word: 'portfolio', gloss: '作品集', note: 'port + folio，携带纸张' },
          { word: 'deport', gloss: '驱逐', note: 'de- 离开 + port，把人带走' },
          { word: 'teleport', gloss: '瞬间传送', note: 'tele- 远 + port' },
          { word: 'transportation', gloss: '运输系统', note: 'transport + -ation 名词化' },
        ],
        task: '用 import、export、transport 各说一句和物流有关的话。',
      },
      {
        id: 'roots_spect',
        kind: 'roots',
        title: '词根 spect：看',
        goal: '理解 inspect/respect/spectator 的共同画面',
        minutes: 10,
        explanation: 'spect 表示“看”。inspect 是往里看、检查；respect 是带着敬意看；spectator 是观看的人。用词根记单词：把 spect 想成一幅“正在看”的画面，整串词就有了共同锚点。',
        pattern: 'spect = look / see',
        tip: '把词根想成一幅画：有人正在“看”，再叠前后缀改变视角。',
        examples: [
          { en: 'inspect · respect · spectator · spectacle · suspect · aspect · perspective · prospect · spectacular · introspect', zh: '检查 · 尊重 · 观众 · 奇观 · 怀疑 · 方面 · 视角 · 前景 · 壮观的 · 内省' },
          { en: 'The inspector looked closely at the machine.', zh: '检查员仔细查看机器。' },
        ],
        wordFamily: [
          { word: 'inspect', gloss: '检查', note: 'in- 向内 + spect 看' },
          { word: 'respect', gloss: '尊重', note: 're- 回 + spect，带着敬意回看' },
          { word: 'spectator', gloss: '观众', note: 'spect + -ator 观看的人' },
          { word: 'spectacle', gloss: '奇观', note: 'spect + -acle 被看的事物' },
          { word: 'suspect', gloss: '怀疑', note: 'sus- 在下 + spect，从下往上审视' },
          { word: 'aspect', gloss: '方面', note: 'a- 朝向 + spect，看过去的角度' },
          { word: 'perspective', gloss: '视角', note: 'per- 贯穿 + spect' },
          { word: 'prospect', gloss: '前景', note: 'pro- 向前 + spect，向前看' },
          { word: 'spectacular', gloss: '壮观的', note: 'spect + -acular 值得观看的' },
          { word: 'introspect', gloss: '内省', note: 'intro- 向内 + spect' },
        ],
        task: '看 spect 这个画面，分别解释 inspect 和 respect 为什么是这个意思。',
      },
      {
        id: 'affixes_direction',
        kind: 'roots',
        title: '前后缀的方向感',
        goal: '用 re-/pre-/un-/-able 快速猜新词',
        minutes: 10,
        explanation: '前缀常给方向和态度，后缀常给词性。猜词不是乱猜，而是先拆出熟悉的部分——拼读管“怎么读”，词根管“什么意思”，两条路合起来就是记单词的完整方法。',
        pattern: 're- 再/回；pre- 之前；un- 否定；-able 能被……的',
        tip: '看到 rebuild：re + build = 重新建；看到 readable：read + able = 可读的。',
        examples: [
          { en: 'rebuild · preview · unlock · readable · impossible · dislike · interaction · irregular · reusable · overwork', zh: '重建 · 预览 · 解锁 · 可读的 · 不可能 · 不喜欢 · 互动 · 不规则的 · 可重复使用的 · 过度工作' },
          { en: 'Preview the file before you export it.', zh: '导出前先预览文件。' },
        ],
        wordFamily: [
          { word: 'rebuild', gloss: '重建', note: 're- 再 + build' },
          { word: 'preview', gloss: '预览', note: 'pre- 之前 + view 看' },
          { word: 'unlock', gloss: '解锁', note: 'un- 否定/相反 + lock' },
          { word: 'readable', gloss: '可读的', note: 'read + -able 能被……的' },
          { word: 'impossible', gloss: '不可能的', note: 'im- 否定 + possible' },
          { word: 'dislike', gloss: '不喜欢', note: 'dis- 相反 + like' },
          { word: 'interaction', gloss: '互动', note: 'inter- 之间 + action' },
          { word: 'irregular', gloss: '不规则的', note: 'ir- 否定 + regular' },
          { word: 'reusable', gloss: '可重复使用的', note: 're- 再 + use + -able' },
          { word: 'overwork', gloss: '过度工作', note: 'over- 过度 + work' },
        ],
        task: '拆开 rebuild、preview、unlock、readable，并说出每部分的作用。',
      },
      ...ROOTS_EXTRA.map((item) => makeStep('roots', item.id, {
        title: `词根 ${item.root}：${item.meaning}`,
        goal: `通过 ${item.root} 串起 ${item.words.length} 个常用词`,
        minutes: 10,
        explanation: `词根 ${item.root} 表示“${item.meaning}”。先记核心画面，再看前缀改变方向、后缀改变词性。用词根记单词：一个词根串起一串词，比逐个死背省力得多。`,
        pattern: `${item.root} = ${item.meaning}`,
        tip: '不要孤立背单词表；把同根词放在一起，用一个画面串起来。',
        examples: [
          { en: item.words.join(' · '), zh: item.zh.join(' · ') },
          { en: item.sentence, zh: item.sentenceZh },
        ],
        wordFamily: item.words.map((word, index) => ({ word, gloss: item.zh[index] || '' })).filter((entry) => !!entry.gloss),
        task: item.task,
        check: item.check,
      })),
      TRANSLATE_ROOTS,
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
        explanation: '英语句子先搭主谓宾骨架。中文习惯把很多信息塞在前面，英语更常先给核心动作，再补时间地点。用翻译对照练：先把中文翻出去，再对照参考译文看语序差在哪。',
        pattern: '主语 + 动作 + 对象 + 时间/地点',
        tip: '对照时只看一件事：参考译文把时间、地点放到了哪。中文在前，英语常在句尾。',
        examples: [
          { en: 'I read English stories before bed.', zh: '我睡前读英语故事。' },
          { en: 'She sends the report every Friday.', zh: '她每周五发送报告。' },
        ],
        translate: [
          { zh: '我睡前读英语故事。', en: 'I read English stories before bed.', note: '骨架 I read English stories 先放稳；中文的“睡前”在英语里放到句尾 before bed。' },
          { zh: '她每周五发送报告。', en: 'She sends the report every Friday.', note: '先“谁做什么”（she sends the report），时间 every Friday 放句尾；第三人称单数 sends 加 -s。' },
        ],
        task: '先翻上面两句并对照语序，再用“我 + 动作 + 对象 + 时间”造三句与你今天生活有关的句子。',
      },
      {
        id: 'grammar_timeline',
        kind: 'grammar',
        title: '时态是一条时间线',
        goal: '用时间线理解 do/did/will do/have done',
        minutes: 12,
        explanation: '不要孤立背时态名称。先在脑子里画时间线：现在常态、过去某点、将来、过去影响现在，各自有不同形式。中文动词不变形（“昨天去/明天去”都是“去”），英语必须变——翻译对照最容易暴露这一点。',
        pattern: 'do/does 现在；did 过去；will do 将来；have/has done 影响现在',
        tip: '对照时把每个动词圈出来：中文一个“去”，英语为什么是 went / will go？先问时间，再定形式。',
        examples: [
          { en: 'I study every day. / I studied yesterday. / I will study tomorrow.', zh: '每天学；昨天学了；明天会学。' },
          { en: 'I have finished today’s lesson.', zh: '我已经完成今天的课程了。' },
        ],
        translate: [
          { zh: '每天学；昨天学了；明天会学。', en: 'I study every day. I studied yesterday. I will study tomorrow.', note: '同一个“学”，英语按时间线变三形：study / studied / will study——中文的“了/会”就是时间信号。' },
          { zh: '我已经完成今天的课程了。', en: 'I have finished today’s lesson.', note: '“已经……了”影响现在，用现在完成时 have finished；不是 I finished today’s lesson 的对错问题，而是强调对现在的影响。' },
        ],
        task: '先翻上面两句并对照动词形式，再用 study 分别造出现在、过去、将来、完成时四句话。',
      },
      {
        id: 'grammar_questions',
        kind: 'grammar',
        title: '疑问句的移动规则',
        goal: '把陈述句稳定地变成问句',
        minutes: 10,
        explanation: '有 be 或情态动词就把它提到前面；没有就把 do/does/did 放前面，后面的动词回到原形。中文靠“吗/呢”和语调，英语靠移动助动词——对照着翻一次就看清了。',
        pattern: '疑问词 + 助动词 + 主语 + 动词原形？',
        tip: '对照时看疑问词后面的第一个词：英语必须是助动词（do/does/did/be），中文没有这个位置。',
        examples: [
          { en: 'She works here. → Where does she work?', zh: '她在这里工作。→ 她在哪里工作？' },
          { en: 'They are ready. → Are they ready?', zh: '他们准备好了。→ 他们准备好了吗？' },
        ],
        translate: [
          { zh: '她在哪里工作？', en: 'Where does she work?', note: '中文“在哪里”直接放动词前；英语 Where 后必须先提助动词 does，work 回原形——不能写 Where she works。' },
          { zh: '他们准备好了吗？', en: 'Are they ready?', note: '中文靠句尾“吗”；英语把 be 动词 are 移到主语前，再加问号和升调。' },
        ],
        task: '先翻上面两句并对照疑问词后的第一个词，再把三句陈述句改成问句，圈出你移动或借来的助动词。',
      },
      ...GRAMMAR_POINTS.map((_, index) => grammarStep(index)),
      TRANSLATE_SKELETON,
      TRANSLATE_TENSE,
    ],
  },
  {
    id: 'fable-reading',
    title: '寓言精读',
    subtitle: '短故事里练推断，也把道理说清楚',
    level: 'A2-B1',
    steps: [
      {
        id: 'fable_tortoise',
        kind: 'fable',
        title: '寓言：The Tortoise and the Hare',
        goal: '读懂对比关系，并解释“慢而稳”为什么能赢',
        minutes: 14,
        explanation: '寓言通常用两个角色形成对比。阅读时先圈出“谁快、谁慢、谁骄傲、谁坚持”，再看结尾如何把行为变成道理。',
        pattern: 'slow and steady wins the race',
        tip: '不要只背寓意。先说角色做了什么，再说结果，最后才总结道理。',
        examples: [
          { en: 'A hare laughed at a tortoise for walking so slowly. “I can cross the forest before you even reach the first tree,” he said.', zh: '一只野兔嘲笑乌龟走得太慢：“我能在你走到第一棵树之前穿过整片森林。”' },
          { en: 'The race began. The hare ran far ahead, then stopped for a nap. The tortoise kept walking, one slow step after another.', zh: '比赛开始了。野兔远远跑在前面，然后停下来睡午觉。乌龟一直走，一步一步，慢但不停。' },
          { en: 'When the hare woke up, the tortoise was already at the finish line. The hare was faster, but the tortoise never stopped.', zh: '野兔醒来时，乌龟已经到了终点。野兔更快，但乌龟从未停下。' },
        ],
        task: '用三句话复述：野兔做了什么、乌龟做了什么、结局是什么。然后补一句：这个故事适合提醒哪种学习习惯？',
        quickCheck: {
          question: 'Why did the tortoise win?',
          options: ['He ran faster than the hare.', 'He kept moving without stopping.', 'He took a shorter road.', 'He woke up earlier.'],
          answer: 1,
          explanation: '寓言的重点不是速度，而是持续行动。乌龟没有停，所以先到终点。',
        },
      },
      {
        id: 'fable_north_wind',
        kind: 'fable',
        title: '寓言：The North Wind and the Sun',
        goal: '理解“gentle”和“force”的对比，学会用 because 说明原因',
        minutes: 14,
        explanation: '这篇寓言用天气角色比喻两种说服方式。注意每个人的动作和结果，再判断作者更赞成哪一种方式。',
        pattern: 'A did X, but B did Y. In the end, ...',
        tip: '寓言里的自然现象常代表人的性格或方法，不必按字面理解。',
        examples: [
          { en: 'The North Wind and the Sun argued about who was stronger. They saw a traveler in a warm coat and agreed to test their power on him.', zh: '北风和太阳争论谁更强。他们看见一位穿暖外套的旅人，决定在他身上比试力量。' },
          { en: 'The North Wind blew hard, but the traveler pulled his coat tighter. The Sun shone gently, and soon the traveler took the coat off.', zh: '北风使劲吹，旅人却把外套裹得更紧。太阳温和地照，不久旅人就把外套脱了下来。' },
          { en: 'The Sun did not need to shout. Warmth persuaded the traveler when force could not.', zh: '太阳不需要大声喊。力量做不到时，温暖说服了旅人。' },
        ],
        task: '把北风和太阳的做法各写一句英文，再用 because 写一句你更愿意采用的方式。',
        quickCheck: {
          question: 'What made the traveler take off his coat?',
          options: ['The strong wind.', 'The Sun’s gentle warmth.', 'A sudden rainstorm.', 'The North Wind’s promise.'],
          answer: 1,
          explanation: '文中说太阳温和地照，旅人很快脱下了外套。这里 gentle warmth 才是关键。',
        },
      },
      {
        id: 'fable_fox_grapes',
        kind: 'fable',
        title: '寓言：The Fox and the Grapes',
        goal: '识别角色在失败后的自我安慰，学习 could not 和 said to himself',
        minutes: 12,
        explanation: '角色说的话不一定代表事实。读寓言时，把“他做了什么”和“他说了什么”分开看，就能发现讽刺。',
        pattern: 'He could not reach the grapes, so he said they were sour.',
        tip: 'The grapes were probably sweet. The fox said they were sour because he failed. 这就是“酸葡萄”。',
        examples: [
          { en: 'A hungry fox saw some grapes hanging high above him. They looked ripe and sweet.', zh: '一只饥饿的狐狸看见高处挂着一些葡萄，看起来又熟又甜。' },
          { en: 'He jumped again and again, but he could not reach them. At last, he turned away and said, “They are probably sour anyway.”', zh: '他跳了一次又一次，却够不到。最后他转身走开，说：“反正它们大概是酸的。”' },
          { en: 'The grapes did not change. Only the fox’s explanation changed after he failed.', zh: '葡萄没有变，改变的是狐狸失败后的解释。' },
        ],
        task: '用英文写两句：狐狸真正想要什么？他最后为什么说葡萄酸？',
        quickCheck: {
          question: 'What does “sour grapes” describe?',
          options: ['A useful way to pick fruit.', 'Pretending something is bad because you cannot have it.', 'A sweet dessert.', 'A fox that likes grapes.'],
          answer: 1,
          explanation: '狐狸够不到葡萄，就说葡萄酸。这个表达指因为得不到而贬低目标。',
        },
      },
      {
        id: 'fable_cry_wolf',
        kind: 'fable',
        title: '寓言：The Boy Who Cried Wolf',
        goal: '理解重复撒谎的后果，练习过去时 narrative',
        minutes: 14,
        explanation: '故事里会重复动作，第二次常和第一次形成递进。注意 cried、ran、came、laughed 这些过去式，它们推动情节。',
        pattern: 'At first..., but when..., nobody...',
        tip: '复述时用 At first、again、when、in the end 串起事件，句子会更有方向感。',
        examples: [
          { en: 'A shepherd boy watched sheep near a village. One afternoon, he shouted, “Wolf! Wolf!” The villagers ran to help, but there was no wolf.', zh: '一个牧羊男孩在村庄附近看羊。一天下午，他喊：“狼来了！狼来了！”村民们跑来帮忙，却没有狼。' },
          { en: 'He laughed and did it again the next day. The villagers were angry, but they still came. Again, they found nothing.', zh: '他大笑，第二天又这样做。村民们很生气，但还是来了。他们又一次什么也没找到。' },
          { en: 'Then a real wolf appeared. The boy shouted for help, but this time nobody believed him. The sheep were scattered, and the boy learned that trust is hard to rebuild.', zh: '后来真的狼出现了。男孩大声求救，但这次没人相信他。羊群四散，男孩明白了信任很难重建。' },
        ],
        task: '按“第一次撒谎 → 村民反应 → 真狼出现 → 后果”用四句英文复述。',
        quickCheck: {
          question: 'Why did nobody come when the wolf was real?',
          options: ['They were too far away.', 'They could not hear the boy.', 'The boy had lied twice before.', 'There were too many wolves.'],
          answer: 2,
          explanation: '前两次都是假警报，所以第三次村民不再相信他。故事讲的是信任被谎言消耗。',
        },
      },
      ...READING_PASSAGES
        .filter((passage) => passage.topic === '寓言' && !['The Tortoise and the Hare', 'The North Wind and the Sun', 'The Fox and the Grapes'].includes(passage.title))
        .map((passage, index) => passageStep(passage, 'fable', index)),
      TRANSLATE_FABLE,
    ],
  },
  {
    id: 'story-input',
    title: '短篇故事',
    subtitle: '用完整情节练习预测、抓重点和复述',
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
      ...READING_PASSAGES
        .filter((passage) => passage.topic !== '寓言' && passage.topic !== '长篇连载' && !['A Quiet Morning', 'The Little Café', 'The Lost Umbrella'].includes(passage.title))
        .map((passage, index) => passageStep(passage, 'story', index)),
      TRANSLATE_STORY,
    ],
  },
  {
    id: 'long-story',
    title: '长篇连载',
    subtitle: '追一条完整故事线，练持续阅读和人物推断',
    level: 'B1',
    steps: [
      {
        id: 'long_lantern_1',
        kind: 'long-story',
        title: 'The Lantern Keeper · Chapter 1',
        goal: '建立人物、地点和悬念，不被生词拖住',
        minutes: 20,
        explanation: '长篇阅读先记住“谁想要什么、什么阻止了他”。第一章通常只负责建立世界和悬念，不需要一次读懂每个形容词。',
        pattern: 'Mara wanted..., but...',
        tip: '每读完一段，用中文写五个字以内的旁注：人物、目标、障碍、线索。',
        examples: [
          { en: 'Every evening, Mara lit the old lantern at the top of the harbor tower. Ships used its light to find the narrow entrance between the rocks. Her father had done the same job for thirty years, and now the tower belonged to her.', zh: '每天晚上，玛拉都会点亮港口塔顶的旧灯笼。船只靠这盏灯找到礁石之间狭窄的入口。她的父亲做这份工作做了三十年，如今灯塔归她照料。' },
          { en: 'The village had changed. New electric beacons stood along the coast, bright and automatic. People said the old tower would close before winter. Mara still climbed the stairs each night, because the fishing boats from the north refused to trust the new machines.', zh: '村庄变了。海岸沿线立起了新的电子灯塔，明亮又自动。人们说旧塔会在冬天前关闭。玛拉仍然每晚爬楼梯，因为北方来的渔船不肯信任新机器。' },
          { en: 'On the first cold night of October, Mara found a brass key under the lantern room floor. It was warm in her hand, though the room was freezing. A small paper label was tied to it: “Do not light the red lamp.”', zh: '十月的第一个寒夜，玛拉在灯笼房地板下发现一把黄铜钥匙。房间冰冷，钥匙在她手里却是温的。钥匙上系着一个小纸签：“不要点亮红灯。”' },
        ],
        task: '用英文列一张故事档案：Mara、tower、lantern、key、warning。每项后面写一句你目前知道的信息。',
        quickCheck: {
          question: 'What mystery does Chapter 1 introduce?',
          options: ['Who built the fishing boats.', 'Why the new machines are expensive.', 'What the brass key opens and why the red lamp is forbidden.', 'Where Mara’s father moved.'],
          answer: 2,
          explanation: '第一章的核心悬念是黄铜钥匙和“不许点红灯”的警告。',
        },
      },
      {
        id: 'long_lantern_2',
        kind: 'long-story',
        title: 'The Lantern Keeper · Chapter 2',
        goal: '根据细节推断人物动机，练习转折句 but / instead',
        minutes: 22,
        explanation: '第二章会补充线索，也常让人物做出选择。不要把新信息当答案，先问它改变了人物什么决定。',
        pattern: 'At first she thought..., but after..., she decided to...',
        tip: '留意反复出现的物件。钥匙、地图、旧照片通常不是装饰，而是后续行动的入口。',
        examples: [
          { en: 'The key opened a narrow drawer beneath the old chart table. Inside, Mara found a hand-drawn map of the harbor and a notebook in her father’s handwriting. The notebook described a storm that had sunk three boats forty years earlier. Beside the date, her father had written one word: “Lantern.”', zh: '钥匙打开了旧海图桌下的一个窄抽屉。玛拉在里面找到一张手绘港口地图和一本父亲手写的笔记本。笔记本记录四十年前一场吞没三艘船的风暴。日期旁边，父亲写了一个词：“灯笼”。' },
          { en: 'The map showed a hidden channel through the rocks, marked with a red circle. Mara had never heard of it. The official charts showed only dangerous water there. She wanted to ask the oldest fishermen, but they avoided her questions and changed the subject.', zh: '地图标出一条穿过礁石的隐蔽水道，并画了一个红圈。玛拉从没听说过。官方海图显示那里只有危险水域。她想问最年长的渔民，但他们回避问题，转移了话题。' },
          { en: 'That night, a northern boat arrived late. Its captain spoke to Mara through the rain. “Your father knew the red lamp was not a warning,” he said. “It was a signal. Some nights, the rocks move.” Then he left before she could ask what he meant.', zh: '那天夜里，一艘北方渔船很晚才到。船长隔着雨对玛拉说：“你父亲知道红灯不是警告，而是信号。有些夜晚，礁石会移动。”她还没来得及追问，他就离开了。' },
        ],
        task: '写三句推断：钥匙证明什么？地图隐藏什么？船长为什么知道红灯？每句用 I think... because...',
        quickCheck: {
          question: 'What does the captain suggest about the red lamp?',
          options: ['It is broken.', 'It is a signal, not simply a warning.', 'It belongs to the north boats.', 'It was never used before.'],
          answer: 1,
          explanation: '船长明确说红灯“不是警告，而是信号”。这反转了第一章纸签给人的第一印象。',
        },
      },
      {
        id: 'long_lantern_3',
        kind: 'long-story',
        title: 'The Lantern Keeper · Chapter 3',
        goal: '理解人物选择，完成从情节到主题的总结',
        minutes: 24,
        explanation: '故事高潮不是“发生了一件大事”，而是人物在代价面前做出选择。读完后要能回答：她失去了什么，又守住了什么？',
        pattern: 'She could have..., but she chose to... because...',
        tip: '主题常藏在人物“本可以怎么做”和“实际怎么做”的差别里。',
        examples: [
          { en: 'A week later, a storm struck without warning. The electric beacons went dark one by one. From the tower, Mara saw a northern boat turning toward the hidden channel where the map showed only rocks.', zh: '一周后，一场风暴毫无预警地袭来。电子灯塔一个接一个熄灭。玛拉从塔上看见一艘北方渔船正转向那条地图上只有礁石的隐蔽水道。' },
          { en: 'The village rule was clear: never light the red lamp without permission. Mara held the switch and thought of her father’s notebook. If the red light was a signal, using it could save the boat. If the old stories were wrong, every ship in the harbor might follow it into danger.', zh: '村里的规定很明确：未经许可绝不能点红灯。玛拉握着开关，想起父亲的笔记本。如果红灯真是信号，点亮它可能救下那艘船；如果旧故事错了，港里的每艘船都可能跟着它驶入危险。' },
          { en: 'She waited until the northern captain flashed his lamp three times. Then she lit the red signal. The boat changed course, slipped past the moving rocks, and reached calm water. In the morning, officials ordered the old tower closed. Mara packed the notebook and the brass key, but she kept the lantern burning until the last boat left.', zh: '她等到北方船长闪了三次灯，才点亮红色信号。那艘船改变航向，绕过移动的礁石，到达平静水域。第二天早晨，官员下令关闭旧塔。玛拉收好笔记本和黄铜钥匙，但她一直让灯笼亮到最后一条船离开。' },
        ],
        task: '完成一段 5 句英文总结：Mara 面对什么选择、她为什么选择、结果如何、她失去什么、故事想说明什么。',
        quickCheck: {
          question: 'What does Mara’s final choice show?',
          options: ['She prefers following every rule without question.', 'She values safety and responsibility more than keeping her job.', 'She wants to become the northern captain.', 'She believes the electric beacons are always correct.'],
          answer: 1,
          explanation: '她明知旧塔会被关闭，仍用红灯救了船。这说明她把人的安全和守灯人的责任放在职位之前。',
        },
      },
      {
        id: 'long_lantern_4',
        kind: 'long-story',
        title: 'The Lantern Keeper · Chapter 4',
        goal: '追踪人物关系，区分事实、猜测和传闻',
        minutes: 22,
        explanation: '进入中段后，新人物会带来互相矛盾的信息。阅读时给每条信息标记：亲眼所见、别人转述、还是人物猜测。',
        pattern: 'Mara learned that..., but she was not sure whether...',
        tip: '把事实和推测分开记录，悬念就不会把人物关系读乱。',
        examples: [
          { en: 'The tower was officially closed the next afternoon. A young inspector named Ivo placed a metal seal across the stairway. He told Mara that the old records had disappeared from the village office. “No records means no proof that the red signal was ever approved,” he said.', zh: '第二天下午，旧塔正式关闭。一位名叫伊沃的年轻检查员在楼梯口贴上金属封条。他告诉玛拉，村里的旧档案从办公室消失了。“没有档案就无法证明红色信号曾被批准过。”' },
          { en: 'Mara did not tell him about the notebook. Instead, she asked who had access to the records. Ivo hesitated. His uncle had managed the office for years, and the northern fishermen often paid him for copies of old maps.', zh: '玛拉没有提笔记本，而是问谁有权接触档案。伊沃犹豫了。他的叔叔多年管理办公室，北方渔民常付钱让他复印旧海图。' },
          { en: 'That night, a small stone struck Mara’s window. Outside stood a girl in a yellow raincoat. “My father is the northern captain,” she whispered. “He says the second light must be found before the next storm.” Then she ran before Mara could ask where the first light had gone.', zh: '那天夜里，一颗小石子打在玛拉窗上。外面站着一个穿黄色雨衣的女孩。“我父亲是北方船长，”她低声说，“他说下一场风暴前必须找到第二盏灯。”玛拉还没问第一盏灯去了哪里，女孩就跑了。' },
        ],
        task: '列三条信息并标记类型：事实、转述、猜测。再写一句你当前最怀疑的人。',
        quickCheck: {
          question: 'What new mystery appears in Chapter 4?',
          options: ['The tower has moved.', 'The records have disappeared and a “second light” must be found.', 'Mara has forgotten how to sail.', 'Ivo owns the northern boats.'],
          answer: 1,
          explanation: '档案消失和“第二盏灯”共同推进了新的悬念。',
        },
      },
      {
        id: 'long_lantern_5',
        kind: 'long-story',
        title: 'The Lantern Keeper · Chapter 5',
        goal: '根据物件线索推断隐藏空间，练习方位和条件句',
        minutes: 23,
        explanation: '线索章节常把地图、钥匙和建筑细节连在一起。读到方位词时，在脑中画图，比只记句子更有效。',
        pattern: 'If the map is correct, the second light should be...',
        tip: '把 under、behind、beneath、across from 等方位词逐个落到图上。',
        examples: [
          { en: 'Mara unfolded the hand-drawn map on her kitchen table. The red circle marked the hidden channel, but a tiny blue dot sat on land, behind the old customs house. Her father had drawn a line from the dot to a word she had missed: “cellar.”', zh: '玛拉在厨房桌上展开手绘地图。红圈标出隐蔽水道，但一个小蓝点位于陆地，在旧海关楼后面。父亲从蓝点画了一条线，连到一个她之前漏看的词：“地窖”。' },
          { en: 'The customs house had been empty for years. Its door was chained, but the cellar window was loose. Inside, Mara found rows of dusty shelves and a second brass key hanging from a nail. Unlike the first key, this one was cold.', zh: '海关楼已经空了很多年。门被铁链锁着，但地窖窗户松了。玛拉在里面找到一排排积灰的架子，还有一把挂在钉子上的第二把黄铜钥匙。与第一把不同，这把是冷的。' },
          { en: 'Under the lowest shelf was a wooden box marked with a wave symbol. It contained letters from villagers warning her father that the northern company wanted to buy the harbor. One letter ended with a sentence that made Mara’s hands shake: “They will close the tower and let the rocks take the boats.”', zh: '最底层架子下有一个刻着波浪符号的木箱。里面是村民写给父亲的信，警告他北方公司想买下港口。一封信的结尾让玛拉双手发抖：“他们会关闭灯塔，让礁石吞掉那些船。”' },
        ],
        task: '根据地图画一个简单方位图，并用 If the map is correct, ... 写出两条推断。',
        quickCheck: {
          question: 'What does the wooden box suggest?',
          options: ['The harbor was always peaceful.', 'Someone may have wanted the tower closed for profit.', 'Mara’s father lost every letter.', 'The customs house was newly built.'],
          answer: 1,
          explanation: '信件暗示北方公司想买港口，并可能故意让旧塔失效。',
        },
      },
      {
        id: 'long_lantern_6',
        kind: 'long-story',
        title: 'The Lantern Keeper · Chapter 6',
        goal: '理解多方冲突，练习用 although / because / so 连接因果',
        minutes: 24,
        explanation: '当人物目标冲突时，先分别写出每个人想要什么。不要急着判断谁“坏”，动机常常混合了恐惧、利益和责任。',
        pattern: 'Although Ivo wanted..., he still... because...',
        tip: '给每个人物写“目标 + 担心 + 行动”，人物的选择会更清楚。',
        examples: [
          { en: 'Ivo found Mara outside the customs house. He was angry that she had broken the seal, but he listened when she showed him the letters. “My uncle signed one of these,” he said quietly. “If I report him, my family loses everything.”', zh: '伊沃在海关楼外找到玛拉。他因她破坏封条而生气，但看到信件后还是听了下去。“其中一封信上有我叔叔的签名，”他低声说，“如果我举报他，我家会失去一切。”' },
          { en: 'Before Mara could answer, the storm bell rang across the harbor. The electronic warning system had failed. Two fishing boats were still outside the rocks, and the old tower was sealed.', zh: '玛拉还没回答，风暴钟就响彻港口。电子警报系统失灵了。两艘渔船还在礁石外，而旧塔被封着。' },
          { en: 'Ivo looked at the tower, then at the seal in his hand. “I can open the door, but the records will still say we acted without permission.” Mara picked up the lantern. “Then we document every step,” she said. “Saving people first; explaining later.”', zh: '伊沃看看塔，又看看手里的封条。“我可以开门，但档案仍会写着我们未经许可行动。”玛拉拿起灯笼。“那我们记录每一步，”她说，“先救人，再解释。”' },
        ],
        task: '分别写出 Mara、Ivo、Ivo 叔叔的目标和担心，再用 although 连接一次人物选择。',
        quickCheck: {
          question: 'Why do Mara and Ivo decide to act?',
          options: ['They want to sell the tower.', 'Two boats are in danger and the electronic warning failed.', 'They are looking for a new job.', 'The northern captain ordered them to.'],
          answer: 1,
          explanation: '电子警报失败、两艘船仍在礁石外，是两人立刻行动的直接原因。',
        },
      },
      {
        id: 'long_lantern_7',
        kind: 'long-story',
        title: 'The Lantern Keeper · Chapter 7',
        goal: '跟随高潮行动，理解叙事中的节奏和代价',
        minutes: 25,
        explanation: '高潮段动作密集，但关键仍是人物在压力下的选择。把每个动作和它的风险对应起来，就能读懂代价。',
        pattern: 'No sooner had... than... / She had to choose between... and...',
        tip: '高潮阅读先抓动词，再问每一步可能失去什么。',
        examples: [
          { en: 'The second light was hidden beneath the customs house cellar. Mara and Ivo carried it through the rain while the storm pushed waves over the pier. The lantern was heavier than it looked, and its glass was cracked along one side.', zh: '第二盏灯藏在海关楼地窖下面。玛拉和伊沃顶着雨搬运，风暴把浪推过码头。灯笼比看起来更重，一侧玻璃已经裂了。' },
          { en: 'At the tower, the red lamp refused to light. Mara realized the second lantern had to be placed in the window facing the hidden channel. Ivo climbed the outside ladder while Mara held the light steady. Halfway up, the seal broke loose and struck the ladder.', zh: '到了塔里，红灯怎么也点不亮。玛拉意识到第二盏灯必须放在朝向隐蔽水道的窗口。伊沃爬外墙梯，玛拉稳住灯光。爬到一半，封条松脱，砸在梯子上。' },
          { en: 'Ivo caught the railing with one hand. Below him, the first boat entered the channel. Mara aimed the second light across the water, and a narrow path of red appeared between the rocks. The boat followed it. The second boat followed the first. Neither captain knew how close they had come to the end.', zh: '伊沃一只手抓住栏杆。下方第一艘船已进入水道。玛拉把第二盏灯照向水面，一条狭窄的红光出现在礁石之间。第一艘船跟着它，第二艘跟着第一艘。两位船长都不知道自己离终点有多近。' },
        ],
        task: '用四句英文列出高潮中的四个关键动作，并在每句后补一个 risk。',
        quickCheck: {
          question: 'What is the most dangerous moment in Chapter 7?',
          options: ['Mara finds a notebook.', 'Ivo nearly falls when the seal strikes the ladder.', 'The villagers buy coffee.', 'The inspector writes a report.'],
          answer: 1,
          explanation: '伊沃在梯子上被断裂封条击中，是高潮中最直接的生命风险。',
        },
      },
      {
        id: 'long_lantern_8',
        kind: 'long-story',
        title: 'The Lantern Keeper · Chapter 8',
        goal: '判断结局是否完成主题，写出人物变化和证据',
        minutes: 26,
        explanation: '结局不仅回答“后来怎样”，还要回答人物变成了谁。找三个证据：她做了什么、她放弃了什么、她保留了什么。',
        pattern: 'By the end, Mara had changed from... to... because...',
        tip: '主题要用人物行动证明，不要只写一句抽象大道理。',
        examples: [
          { en: 'By morning, both boats were safe. Ivo wrote a full report and attached the letters, the maps, and the broken seal. His uncle was suspended while the investigation began. Some villagers called Mara a hero; others blamed her for exposing old secrets.', zh: '到早晨，两艘船都安全了。伊沃写了完整报告，附上信件、地图和断裂的封条。调查开始时，他叔叔被停职。有人称玛拉是英雄，也有人怪她揭开了旧秘密。' },
          { en: 'The council voted to keep the old tower as a backup signal. Mara was offered her father’s job again, but she refused to work alone. She proposed a volunteer watch: fishermen, inspectors, and villagers would learn the signals together. “One keeper can be pressured,” she said. “A community is harder to silence.”', zh: '委员会投票决定保留旧塔作为备用信号。玛拉被再次邀请接父亲的职位，但她拒绝独自值守。她提议建立志愿守望队，让渔民、检查员和村民一起学习信号。“一个守灯人可能被施压，”她说，“一个社区更难被噤声。”' },
          { en: 'On the first clear night of winter, Mara lit both lamps without hiding. The second light was no longer a secret. It was a promise that the harbor would remember what its people had chosen to protect.', zh: '冬天第一个晴朗夜晚，玛拉公开点亮了两盏灯。第二盏灯不再是秘密，而是一个承诺：港口会记住人们选择保护什么。' },
        ],
        task: '写一段 6 句英文总结：Mara 的变化、Ivo 的选择、社区的方案、故事的代价与主题。',
        quickCheck: {
          question: 'How does Mara’s idea change the meaning of “keeper”?',
          options: ['A keeper must work alone forever.', 'Keeping the harbor safe becomes a shared community responsibility.', 'A keeper should hide every signal.', 'Only officials can understand the lights.'],
          answer: 1,
          explanation: '玛拉拒绝独自值守，建立志愿守望队，让“ keeper”从个人秘密变成社区责任。',
        },
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
      ...SPEAKING_EXTRA.map((item) => makeStep('speaking', item.id, {
        title: item.title,
        goal: item.goal,
        minutes: 12,
        explanation: '口语任务先固定一个可复用句型，再替换真实信息。熟练后再增加细节，不要一开始追求复杂。',
        pattern: item.pattern,
        tip: '每一轮只完成一个交际目标：问清楚、说明白或确认信息。',
        examples: [{ en: item.example, zh: item.zh }],
        task: item.task,
        check: item.check,
      })),
      TRANSLATE_SPEAKING,
    ],
  },
];

const PATH_QUICK_CHECKS: Record<string, EnglishQuickCheck> = {
  sound_short_vowels: {
    question: 'Which set contains five short-vowel words?',
    options: [
      'cat · bed · sit · hot · cup',
      'cake · see · bike · home · moon',
      'car · bird · short · food · team',
      'city · open · tiger · paper · music',
    ],
    answer: 0,
    explanation: 'cat、bed、sit、hot、cup 分别是 a/e/i/o/u 的短元音例词；其余各组至少包含长元音或非重读元音。',
  },
  sound_blending: {
    question: 'Which split helps you read “sunset” most naturally?',
    options: ['s-u-n-s-e-t', 'sun + set', 'su + nset', 'suns + et'],
    answer: 1,
    explanation: '自然拼读先找熟悉的词块。sun 和 set 都能独立读出来，再合起来最省力。',
  },
  sound_common_pairs: {
    question: 'Which word begins with the /ʃ/ sound?',
    options: ['chair', 'ship', 'think', 'green'],
    answer: 1,
    explanation: 'sh 通常发 /ʃ/；chair 是 /tʃ/，think 是 /θ/。',
  },
  roots_port: {
    question: 'What does the root “port” mean?',
    options: ['look', 'carry', 'write', 'build'],
    answer: 1,
    explanation: 'port = carry。transport 是搬运，export 是把货物运出去。',
  },
  roots_spect: {
    question: 'Which word contains the idea “look”?',
    options: ['spectator', 'portable', 'rebuild', 'import'],
    answer: 0,
    explanation: 'spectator 是观看的人，spect 表示看。',
  },
  affixes_direction: {
    question: 'What does “preview” most likely mean?',
    options: ['look after', 'look before', 'look away', 'look again'],
    answer: 1,
    explanation: 'pre- 表示 before，view 是看，所以 preview 是提前看、预览。',
  },
  grammar_skeleton: {
    question: 'Which sentence has the clearest subject + action + object?',
    options: ['Before bed English stories I read.', 'I read English stories before bed.', 'Before bed reads stories.', 'English before bed I stories.'],
    answer: 1,
    explanation: '先把核心骨架 I read English stories 放稳，再补时间 before bed。',
  },
  grammar_timeline: {
    question: 'Which sentence matches “yesterday”?',
    options: ['I study every day.', 'I studied yesterday.', 'I will study tomorrow.', 'I have study yesterday.'],
    answer: 1,
    explanation: 'yesterday 是明确过去时间，用一般过去时 studied。',
  },
  grammar_questions: {
    question: 'Which question is correct?',
    options: ['Where she works?', 'Where does she work?', 'Where does she works?', 'Where she does work?'],
    answer: 1,
    explanation: '特殊疑问句把 does 放到主语前，后面的动词回到原形 work。',
  },
  story_cafe: {
    question: 'How did Mia thank the stranger?',
    options: ['She called him.', 'She gave him money.', 'She left a thank-you note at the station.', 'She wrote a news story.'],
    answer: 2,
    explanation: '原文说她不知道对方名字，于是写了感谢信留在车站。',
  },
  story_morning: {
    question: 'Which sentence correctly describes a daily habit?',
    options: ['Leo open the window every morning.', 'Leo opens the window every morning.', 'Leo opened the window every morning tomorrow.', 'Leo is open the window every morning.'],
    answer: 1,
    explanation: 'every morning 表示习惯；Leo 是第三人称单数，open 要加 -s。',
  },
  story_retell: {
    question: 'Which sequence makes a clear retelling?',
    options: ['feeling → name → random detail', 'character → problem → solution → feeling', 'solution → character → problem', 'only adjectives'],
    answer: 1,
    explanation: '复述先建立人物和问题，再讲解决过程，最后给感受或结果。',
  },
  speak_self: {
    question: 'Which opening is natural for a short self-introduction?',
    options: ['I am name Lin.', 'My name is Lin and I am from Chengdu.', 'Me from Chengdu name Lin.', 'I have name.'],
    answer: 1,
    explanation: 'My name is... and I am from... 是最稳定的自我介绍骨架。',
  },
  speak_story: {
    question: 'Which connector best starts the result of a story?',
    options: ['In the end', 'For example', 'However many', 'Because of'],
    answer: 0,
    explanation: 'In the end 用来收束故事结果；Then 和 Suddenly 负责推进情节。',
  },
  speak_free: {
    question: 'What is the best way to keep a free conversation going?',
    options: ['Memorize every sentence first.', 'Stop at every unknown word.', 'Ask one clear follow-up question.', 'Speak without listening.'],
    answer: 2,
    explanation: '自由对话靠真实交流推进。一次问一个清楚的问题，能让对话持续下去。',
  },
};

for (const stage of ENGLISH_PATH) {
  for (const step of stage.steps) {
    step.quickCheck ??= PATH_QUICK_CHECKS[step.id];
  }
}

function cloneStep(step: EnglishPathStep): EnglishPathStep {
  return {
    ...step,
    method: step.method ?? KIND_METHOD[step.kind],
    examples: step.examples.map((example) => ({ ...example })),
    ...(step.sounds ? { sounds: step.sounds.map((sound) => ({ ...sound })) } : {}),
    ...(step.blend ? { blend: step.blend.map((group) => ({ word: group.word, parts: group.parts.map((part) => ({ ...part })) })) } : {}),
    ...(step.translate ? { translate: step.translate.map((item) => ({ ...item })) } : {}),
    ...(step.quickCheck ? { quickCheck: { ...step.quickCheck, options: [...step.quickCheck.options] } } : {}),
  };
}

/**
 * 按人群轨道返回主线（用户拍板：零基础 / 初中 / 高中 / 成人）。
 *
 * - zero：从字母名/字母音之辨 + 第一组字母音开始，完整走发音段；回译课不进入（认知负荷）；
 * - junior：已认识字母，跳过三组字母音启蒙，从「音标地图」进入；
 * - senior / adult：发音段只保留各自的入口课，直接进词汇与语法阶段。
 * 同一步骤在不同轨道间共享完成进度（id 一致），切轨不丢进度。
 */
export function getEnglishPath(track: EnglishTrackId = 'zero'): EnglishPathStage[] {
  const stages = ENGLISH_PATH.map((stage) => ({
    ...stage,
    steps: stage.steps
      .map(cloneStep)
      .filter((step) => track !== 'zero' || step.kind !== 'translate'),
  }));
  if (track === 'zero') return stages;
  const soundsStage = stages.find((stage) => stage.id === 'sounds');
  if (!soundsStage) return stages;
  if (track === 'junior') {
    soundsStage.steps = [
      cloneStep(JUNIOR_IPA_MAP),
      ...soundsStage.steps.filter((step) => !['ssp_group1', 'ssp_group2', 'ssp_group3'].includes(step.id)),
    ];
  } else if (track === 'senior') {
    soundsStage.steps = [cloneStep(SENIOR_SOUND_FIX)];
  } else {
    soundsStage.steps = [cloneStep(ADULT_IPA_CRASH)];
  }
  return stages;
}
