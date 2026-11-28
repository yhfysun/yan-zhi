import type {
  LearningV2EventDetail,
  LearningV2Practice,
  LearningV2StudyPoint,
} from '../../v2-types.js';
import type { CuratedCoursePlanPatchMap } from '../types.js';

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
  return { prompt, options, answer, explanation, focus };
};

const source = (id: string, title: string, issuer: string, date: string, url: string, usedFor: string) =>
  ({ id, title, issuer, date, url, usedFor });

const SPELLING_SOUND_ARCHIVE = {
  id: 'english-spelling-sound-history',
  kind: 'concept',
  title: '英语拼写为什么不能直接等于发音',
  period: '5世纪至现代英语',
  summary:
    '英语拼写保留古英语、法语借词、印刷标准化和语音变化的多层痕迹。音标记录当代音素，拼写记录历史与词形关系，两者功能不同。',
  background:
    '同一个字母可对应多个音素，同一音素也可由不同字母组合表示。学习发音不能靠中文谐音或只看拼写，也不能把所有历史拼写都当成任意例外。',
  timeline: [
    {
      date: '5—11世纪',
      title: '古英语使用不同拼写与字母习惯',
      body: '古英语有自己的书写传统，部分字母后来消失。现代字母与古英语并不一一对应，读音也经历长期变化，不能把今天拼写直接回推古音。',
      sourceIds: ['ipa', 'cambridge'],
    },
    {
      date: '1066年以后',
      title: '法语借词增加拼写层次',
      body: '诺曼征服后大量法语词进入英语，带来新的词形和发音传统。英语词源变复杂，同音或近音词的拼写差异增大。',
      sourceIds: ['cambridge', 'iowa'],
    },
    {
      date: '15—18世纪',
      title: '元音大变化使拼写与读音分离',
      body: '英语长元音发生系统性变化，但既有拼写并未同步改写。结果今日许多词保留旧拼写痕迹，需要词典和音标确认读音。',
      sourceIds: ['iowa', 'ipa'],
    },
    {
      date: '15—17世纪',
      title: '印刷标准化固定部分词形',
      body: '印刷让某些拼写逐渐稳定，也固定了不同来源的拼法。标准化提高可识别性，却不保证每个字母都对应一个音素。',
      sourceIds: ['cambridge'],
    },
    {
      date: '现代英语',
      title: '借词与词形关系继续留下无声字母',
      body: 'loan、debt 等词形反映词源和词族联系，字母可能不发音却帮助识别相关词。拼读要结合音节、重音和词典证据。',
      sourceIds: ['cambridge', 'iowa'],
    },
    {
      date: '1886年以后',
      title: '国际音标提供跨语言记音工具',
      body: '国际音标用独立符号表示音素，减少字母名称带来的混淆。词典可标注不同口音，学习时要选择一致参照并听音频核对。',
      sourceIds: ['ipa', 'cambridge', 'british-council'],
    },
  ],
  outcome:
    '可观察结果是能区分字母名称与音素，借助音标、重音和音频拆读生词，并用录音回听证据修正发音与拼写。',
  significance:
    '理解拼写与发音的历史关系，能减少“看到一个字母只能发一个音”的错误，同时保留词形和词源线索。',
  sourceCards: [
    source(
      'ipa',
      'The International Phonetic Alphabet',
      'International Phonetic Association',
      '2025 年访问版',
      'https://www.internationalphoneticassociation.org/content/ipa-chart',
      '核对国际音标符号、音素分类和记音原则。',
    ),
    source(
      'iowa',
      'Sounds of Speech',
      'The University of Iowa',
      '2025 年访问版',
      'https://soundsofspeech.uiowa.edu/home',
      '核对英语音素口形、发音动画和听觉样例。',
    ),
    source(
      'cambridge',
      'English Pronunciation',
      'Cambridge Dictionary',
      '2025 年访问版',
      'https://dictionary.cambridge.org/pronunciation/english/',
      '核对英式/美式音标、重音和逐词音频。',
    ),
    source(
      'british-council',
      'Phonemic Chart',
      'British Council LearnEnglish',
      '2025 年访问版',
      'https://learnenglish.britishcouncil.org/english-levels/improve-your-english-level/phonemic-chart',
      '核对英语音素分类与发音练习。',
    ),
  ],
} satisfies LearningV2EventDetail;

const ENGLISH_FOUNDATION_SOURCES = [
  'International Phonetic Association, The International Phonetic Alphabet。https://www.internationalphoneticassociation.org/content/ipa-chart',
  'The University of Iowa, Sounds of Speech。https://soundsofspeech.uiowa.edu/home',
  'Cambridge Dictionary, English Pronunciation。https://dictionary.cambridge.org/pronunciation/english/',
  'British Council LearnEnglish, Phonemic Chart。https://learnenglish.britishcouncil.org/english-levels/improve-your-english-level/phonemic-chart',
];

export const ENGLISH_FOUNDATIONS_REWRITE: CuratedCoursePlanPatchMap = {
  'english:字母与音标': {
    contentStatus: 'reviewed',
    prerequisite: '认识英文字母，能使用耳机或扬声器播放短音频，并愿意录音回听。',
    plainLanguageGoal:
      '学完后，你能区分字母名称与音素，用音标、重音和音频拆读生词，并通过录音回听修正一个具体发音。',
    guidedPractice:
      '完成三组最小对立词听辨、音标标注、重音拍打和慢速拼读，记录首轮与修正后的录音。',
    independentPractice:
      '选择十个未见单词，先预测音节和重音，再查音标、听音频、朗读录音并对照纠错。',
    commonErrors: [
      '用字母名称代替单词中的音素，例如把 b 的名称读成 /b/。',
      '用中文谐音替代英语音素，忽略辅音结尾、长短元音和重音。',
      '只背音标符号，不听音频、不录音，也不检查重音和连读。',
    ],
    sourceRefs: ENGLISH_FOUNDATION_SOURCES,
    studyPoints: [
      point('必背', '字母名称不是音素；音标记录实际发音，英语单词还要同时看音节、重音和词典音频。', 1),
      point('重点', '最小对立词只改变一个音素，通过听辨和朗读检查长短、清浊、口形和尾音。', 2),
      point('易错', '中文谐音只能临时提示，不能替代口腔动作、音素对照和录音回听。', 3),
      point('考点', '查生词时先分音节与重音，再读音标、听音频、朗读并修正，不凭拼写直接猜。', 4),
    ],
    eventDetails: [SPELLING_SOUND_ARCHIVE],
    steps: [
      {
        title: '情境与诊断｜字母 b 等于 /b/ 吗',
        body:
          '先做前测：读出字母 b 的名称，再读单词 big 的首音，两者是否相同？要求用音标区分字母名称和音素，并听辨 big/pig、ship/sheep、bit/beat 三组最小对立。记录是否用中文谐音代替口形、是否遗漏词尾辅音、是否只看拼写。变式改为 live/leave。反例是把字母名称直接搬进单词。后测录音朗读并回听，标出一个可观察的发音修正点。',
        note: '字母名与音素分开。',
        objective: '能用字母名称/音素对比和最小对立词诊断英语发音起点。',
        practice: '完成名称与首音前测，听辨三组最小对立，标记口形、长短、清浊和尾音。',
        checkpoint: '检查是否区分名称与音素、是否能指出具体音差、是否保留音频与首轮录音证据。',
      },
      {
        title: '材料与概念｜音素、音标、重音与拼写',
        body:
          '字母是书写单位，音素是能区别意义的语音单位，音标用独立符号记录发音。英语拼写受历史、借词和语音变化影响，同一字母可有多种读音。单词还需看音节、主重音和语流中的弱读、连读。中文近似音可帮助起步，但不能替代口形、清浊、长短和尾音检查。词典的英式/美式音标可能不同，选择一个参照后，用音频确认重音位置和实际语流。',
        note: '拼写、音标、重音三层检查。',
        objective: '能解释字母、音素、音标、重音、连读和中文迁移的关系。',
        practice: '为 three 个单词分别写拼写、音节、音标、重音和一个中文迁移风险。',
        checkpoint: '检查字母/音素区分、音标来源、音节切分、重音位置、中文迁移和语音变体。',
      },
      {
        title: '示范与推导｜从拼写到可听发音',
        body:
          '示范 present：先看词形和音节，查词典发现名词重音在前、动词重音在后，再听音频确认。把重音拍手、弱读音节和词尾辅音分开练，录第一遍后回放，只改重音一个变量，再录第二遍。反例是只读拼写、把两个音节等重读。变式换 record 或 increase，检查词性、重音和意义是否相连。结论要引用词典音标并用录音前后差异验证。',
        note: '先查重音，再练整词。',
        objective: '能由词典音标、重音和录音回听完成一个可验证发音修正。',
        practice: '完成音节切分、词典核对、重音拍打、首轮录音、单点修正和第二轮录音。',
        checkpoint: '检查音标出处、重音位置、弱读、尾音、修正变量单一和前后录音差异。',
      },
      {
        title: '引导练习｜三组听辨与十个拼写词',
        body:
          '准备三组最小对立词、五个规则拼写词和五个拼写—发音不一致词。先做前测标音节和重音，再查音标、听音频、朗读录音，后测交换词序重新听辨。变式改变语速或加入短句，观察连读和弱读。记录字母名混入、中文谐音、漏尾音、重音错位四类错误，并给每个错误写一个可观察修正动作。所有音频使用可暂停、可回放的词典或教学样例。',
        note: '每次只修一个发音变量。',
        objective: '能对听辨、拼读和拼写任务完成音标核对、重音练习和录音修正。',
        practice: '提交三组听辨表、十个词的音节与音标、两轮录音、错误分类和修正动作。',
        checkpoint: '检查音标准确、音节与重音、中文迁移、尾音、回听证据和变式表现。',
      },
      {
        title: '独立迁移与评价｜做一份生词发音诊断',
        body:
          '选择十个未见英语词，先做前测预测音节、重音和可能难音，再查两条词典音频或一个音标资源，完成朗读录音。24 小时后打乱词序复测，并把一个词放进短句检查连读、弱读和重音。评价四项：音标来源清楚、重音正确、录音可比较、纠错动作具体。最后写一个“中文谐音读得像就算掌握”的反例，说明还需听辨、口形和复测证据。',
        note: '可理解、可复测才算会读。',
        objective: '能把音标与重音策略迁移到生词，并用录音、复测和具体纠错评价。',
        practice: '提交十词预测、音标与音频来源、两轮录音、24 小时复测、短句变式和反例。',
        checkpoint: '四项自评：音标可查、重音有证据、录音能比较、错误已定位；否则重新录制。',
      },
    ],
    quiz: [
      question(
        '字母名称与音素的关系是什么？',
        '字母名称用于称呼书写符号，音素是单词中区别意义的语音单位',
        ['二者完全相同', '音素只在书写中出现', '字母名称决定所有发音'],
        0,
        '字母 b 的名称与单词 big 开头的 /b/ 不是同一层概念。学习发音要看音素、口形和音频，不能把字母名称直接搬进单词。',
        '事实与定义',
      ),
      question(
        'ship 与 sheep 最适合用来练什么？',
        '通过最小对立听辨短元音 /ɪ/ 与长元音 /iː/',
        ['练习字母名称顺序', '区分重音与拼写数量', '证明英语没有元音'],
        1,
        '两个词只改变一个元音音素，适合检查长短、口形和听辨。中文近似音可能压平差异，因此要配音频和录音回听。',
        '材料与推导',
      ),
      question(
        '哪种发音练习最不可靠？',
        '只看中文谐音读一遍，不查音标、不听音频、不录音回听',
        ['查词典重音', '比较最小对立词', '用录音做前后对照'],
        2,
        '中文谐音无法完整表示英语音素、重音和尾音。缺少音标与回听，就很难发现自己的具体偏差，也难以证明是否改善。',
        '常见误区',
      ),
      question(
        '遇到一个未见单词时，哪种流程最完整？',
        '先分音节与预测重音，再查音标和音频、录音回听后修正并复测',
        ['直接按字母名称逐字读', '只背一个中文近似音', '跳过重音只看拼写'],
        0,
        '生词发音需要拼写到语音的多层核对。音节、重音、音标和音频共同提供证据，录音复测则验证学习者是否真的改正。',
        '迁移应用',
      ),
    ],
  },
};
