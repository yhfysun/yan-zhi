import type { LearningV2CuratedCoursePlan } from '../v2-types.js';
import type { CuratedCoursePlanPatchMap } from './types.js';

type ReviewPatch = Partial<LearningV2CuratedCoursePlan>;

const ENGLISH_EVIDENCE_REFS = [
  'Cambridge Dictionary, English Pronunciation；逐词提供英式、美式音标与真人录音。https://dictionary.cambridge.org/pronunciation/english/',
  'British Council LearnEnglish, Listening；分级真实语流与听力练习。https://learnenglish.britishcouncil.org/skills/listening',
] as const;

const JAPANESE_EVIDENCE_REFS = [
  'NHK Easy Japanese；零基础真人发音、慢速会话与听力材料。https://www.nhk.or.jp/lesson/',
  'OJAD, Online Japanese Accent Dictionary；东京大学日语声调与朗读参考。https://www.gavo.t.u-tokyo.ac.jp/ojad/eng/pages/home',
] as const;

const MUSIC_EVIDENCE_REFS = [
  'International Music Score Library Project (IMSLP)；公版乐谱检索与谱面核对入口。https://imslp.org/wiki/Main_Page',
  'Library of Congress, National Jukebox；历史录音检索入口，仅使用公版或明确许可录音。https://www.loc.gov/collections/national-jukebox/about-this-collection/',
] as const;

function withEvidence(
  refs: readonly string[],
  evidence: readonly string[],
): string[] {
  return [...new Set([...refs, ...evidence])];
}

function reviewed(overrides: ReviewPatch = {}): ReviewPatch {
  return {
    ...overrides,
    contentStatus: 'reviewed',
  };
}

function englishReview(...refs: string[]): ReviewPatch {
  return reviewed({
    sourceRefs: withEvidence(refs, ENGLISH_EVIDENCE_REFS),
  });
}

function japaneseReview(...refs: string[]): ReviewPatch {
  return reviewed({
    sourceRefs: withEvidence(refs, JAPANESE_EVIDENCE_REFS),
  });
}

function musicReview(...refs: string[]): ReviewPatch {
  return reviewed({
    sourceRefs: withEvidence(refs, MUSIC_EVIDENCE_REFS),
  });
}

export const LANGUAGE_REVIEW_QUALITY_PATCHES = {
  'english:字母与音标': englishReview(
    'Cambridge Dictionary；提供英式、美式音标和发音音频。https://dictionary.cambridge.org/',
    'International Phonetic Association, IPA Chart；国际音标官方图表。https://www.internationalphoneticassociation.org/IPA_chart_(C)2018.pdf',
    '课程音素对照为原创教学设计。',
  ),
  'english:动词全本': englishReview(
    'Cambridge Dictionary Grammar 中的 verb forms and tenses 参考入口。https://dictionary.cambridge.org/grammar/british-grammar/verbs',
    'Project Gutenberg Aesop’s Fables 公版文本检索入口，用于真实短句观察。https://www.gutenberg.org/ebooks/search/?query=Aesop%27s+Fables',
    '课程例句与时间线练习为原创。',
  ),
  'english:名词分类': englishReview(
    'Cambridge Dictionary Grammar, Nouns。https://dictionary.cambridge.org/grammar/british-grammar/nouns',
    'Project Gutenberg Aesop’s Fables 公版文本检索入口，用于真实短句观察。https://www.gutenberg.org/ebooks/search/?query=Aesop%27s+Fables',
    '课程例句与分类练习为原创。',
  ),
  'english:动植物分类': englishReview(
    'Cambridge Dictionary, English Definitions and Pronunciation。https://dictionary.cambridge.org/',
    'British Council LearnEnglish, Vocabulary。https://learnenglish.britishcouncil.org/vocabulary',
  ),
  'english:生活物品': englishReview(
    'Cambridge Dictionary, English Definitions and Pronunciation。https://dictionary.cambridge.org/',
    'British Council LearnEnglish, Prepositions of Place。https://learnenglish.britishcouncil.org/grammar/english-grammar-reference/prepositions-of-place',
  ),
  'english:食物与饮品': englishReview(
    'Cambridge Dictionary Grammar, Countable and uncountable nouns。https://dictionary.cambridge.org/grammar/british-grammar/countable-and-uncountable-nouns',
    'Project Gutenberg 公版食谱与儿童读物检索入口，用于真实短语观察。https://www.gutenberg.org/',
    '课程词表与购物任务为原创。',
  ),
  'english:身体与健康': englishReview(
    'Cambridge Dictionary Grammar 与 Health vocabulary 参考入口。https://dictionary.cambridge.org/',
    'World Health Organization 公开健康信息入口。https://www.who.int/',
    '课程对话为语言练习，不构成医疗建议。',
  ),
  'english:口语高频句': englishReview(
    'Council of Europe, CEFR Companion Volume；交际任务与能力描述。https://www.coe.int/en/web/common-european-framework-reference-languages',
    'British Council LearnEnglish, Speaking。https://learnenglish.britishcouncil.org/skills/speaking',
  ),
  'english:英语习语': englishReview(
    'Cambridge Dictionary, Idioms；释义、例句与用法说明。https://dictionary.cambridge.org/',
    'Merriam-Webster, Idioms and Phrases；用法与词源参考。https://www.merriam-webster.com/',
    '课程对话与错句为原创教学设计。',
  ),
  'english:时态必背': englishReview(
    'British Council LearnEnglish, English Grammar Reference: Verbs。https://learnenglish.britishcouncil.org/grammar/english-grammar-reference',
    'Cambridge Grammar, English Grammar Today。https://dictionary.cambridge.org/grammar/british-grammar/',
  ),
  'english:初一': englishReview(
    'Cambridge English, Pre A1 Starters and A1 Movers Resources。https://www.cambridgeenglish.org/exams-and-tests/starters/',
    'British Council LearnEnglish, Beginner to Elementary。https://learnenglish.britishcouncil.org/english-levels',
  ),
  'english:初二': englishReview(
    'British Council LearnEnglish, Elementary Grammar。https://learnenglish.britishcouncil.org/grammar',
    'Cambridge Dictionary, Grammar。https://dictionary.cambridge.org/grammar/british-grammar/',
  ),
  'english:初三': englishReview(
    'Cambridge English, A2 Key and B1 Preliminary Resources。https://www.cambridgeenglish.org/exams-and-tests/',
    'British Council LearnEnglish, Reading and Grammar。https://learnenglish.britishcouncil.org/',
  ),
  'english:高一': englishReview(
    'British Council LearnEnglish, Upper Intermediate。https://learnenglish.britishcouncil.org/english-levels/upper-intermediate-b2',
    'Purdue Online Writing Lab, Sentence Structure。https://owl.purdue.edu/owl/general_writing/mechanics/sentence_structure.html',
  ),
  'english:高二': englishReview(
    'British Council LearnEnglish, B2 Upper Intermediate Grammar。https://learnenglish.britishcouncil.org/grammar',
    'Purdue Online Writing Lab, Argumentative Essays。https://owl.purdue.edu/owl/general_writing/academic_writing/essay_writing/argumentative_essays.html',
  ),
  'english:高三 · 高考冲刺': englishReview(
    '教育部教育考试院，普通高等学校招生全国统一考试英语科考试说明；以当年官方发布为准。https://www.neea.edu.cn/',
    'British Council LearnEnglish, Exam Strategies。https://learnenglish.britishcouncil.org/',
  ),
  'english:大学英语四级': englishReview(
    '中国教育考试网，全国大学英语四、六级考试。https://cet.neea.edu.cn/',
    'Purdue Online Writing Lab, Academic Writing。https://owl.purdue.edu/owl/purdue_owl.html',
  ),
  'english:大学英语六级': englishReview(
    '中国教育考试网，全国大学英语四、六级考试。https://cet.neea.edu.cn/',
    'Purdue Online Writing Lab, Writing Arguments。https://owl.purdue.edu/owl/general_writing/academic_writing/essay_writing/argumentative_essays.html',
  ),
  'english:雅思': englishReview(
    'IELTS, Test Format and Scoring。https://ielts.org/take-a-test/test-types/ielts-academic-test',
    'British Council, IELTS Preparation Resources。https://takeielts.britishcouncil.org/take-ielts/prepare',
  ),
  'english:托福': englishReview(
    'ETS, TOEFL iBT Test Content。https://www.ets.org/toefl/test-takers/ibt/about/content.html',
    'ETS, TOEFL iBT Test Prep Planner。https://www.ets.org/toefl/test-takers/ibt/prepare.html',
  ),

  'japanese:日语文字系统': japaneseReview(
    'Tofugu, Learn Japanese: Hiragana and Katakana 入门说明（作为英语学习资源链接，不复制原文）。https://www.tofugu.com/japanese/learn-hiragana/',
    '青空文库公开日文作品，用于后续真实文本阅读与汉字、假名混排观察。https://www.aozora.gr.jp/',
    '课程例句与讲解为原创。',
  ),
  'japanese:五十音：清音平假名': japaneseReview(
    'NHK Easy Japanese, Hiragana；假名音频与书写入门。https://www.nhk.or.jp/lesson/',
    'Tofugu, Learn Hiragana；字形记忆与练习方法。https://www.tofugu.com/japanese/learn-hiragana/',
    '课程随机卡片为原创设计。',
  ),
  'japanese:五十音：片假名与外来语': japaneseReview(
    'Tofugu, Learn Katakana 入门资源（仅链接参考，不复制原文）。https://www.tofugu.com/japanese/learn-katakana/',
    '青空文库公开文本，用于观察片假名在实际日文中的出现方式。https://www.aozora.gr.jp/',
    '课程词例为日文常见词的原创教学整理。',
  ),
  'japanese:浊音、半浊音与拗音': japaneseReview(
    'Tofugu, Learn Hiragana and Katakana 入门资源。https://www.tofugu.com/japanese/learn-hiragana/',
    '青空文库公开日文作品，用于观察浊音、拗音与片假名混排。https://www.aozora.gr.jp/',
    '课程词例与音拍练习为原创教学整理。',
  ),
  'japanese:长音、促音与声调': japaneseReview(
    'NHK Easy Japanese；零基础发音与音拍说明。https://www.nhk.or.jp/lesson/',
    'Tofugu, Japanese Pronunciation；长音、促音与音拍练习。https://www.tofugu.com/japanese/japanese-pronunciation/',
    '课程拍手练习与词对为原创教学设计。',
  ),
  'japanese:名词句：A 是 B': japaneseReview(
    'Tofugu, Japanese Grammar: Noun Sentences 入门资源。https://www.tofugu.com/japanese/',
    '青空文库公开日文作品，用于观察「は」「です」「ではありません」等基础结构。https://www.aozora.gr.jp/',
    '课程例句为原创。',
  ),
  'japanese:动词分类与ます形': japaneseReview(
    'Tofugu, Japanese Verb Conjugation 入门资源。https://www.tofugu.com/japanese/',
    '青空文库公开日文作品，用于观察ます形和动词使用。https://www.aozora.gr.jp/',
    '课程动词表为原创教学整理。',
  ),
  'japanese:形容词与比较': japaneseReview(
    'NHK Easy Japanese，基础形容词与比较表达课程入口。https://www.nhk.or.jp/lesson/',
    'Tofugu，な形容词：修饰名词与否定变化说明。https://www.tofugu.com/japanese-grammar/na-adjective/',
    'Tofugu，より比较句：比较基准与句型说明。https://www.tofugu.com/japanese-grammar/particle-yori-than/',
  ),
  'japanese:助词は、が、を、に': japaneseReview(
    'NHK Easy Japanese，基础句型与助词练习入口。https://www.nhk.or.jp/lesson/',
    'Tofugu，Japanese Particles Cheatsheet：基础助词速查与例句。https://www.tofugu.com/japanese/japanese-particles-cheatsheet/',
    'Tofugu，主题助词は：主题和句子焦点说明。https://www.tofugu.com/japanese-grammar/particle-wa/',
  ),
  'japanese:て形与日常连接': japaneseReview(
    'NHK Easy Japanese，动词与日常句型课程入口。https://www.nhk.or.jp/lesson/',
    'Tofugu，ます形：动词礼貌形与词干变化参考。https://www.tofugu.com/japanese-grammar/masu/',
    'Tofugu，ている形：动作进行与持续状态说明。https://www.tofugu.com/japanese-grammar/verb-continuous-form-teiru/',
  ),
  'japanese:自我介绍与问候': japaneseReview(
    'NHK Easy Japanese，自我介绍与日常问候课程入口。https://www.nhk.or.jp/lesson/',
    '日本国际交流基金会，日语教育资源：问候、自我介绍与基础会话。https://www.jpf.go.jp/e/project/japanese/education/resource/',
    'Tofugu，Japanese Pronunciation：礼貌表达的节奏、长音与跟读方法。https://www.tofugu.com/japanese/japanese-pronunciation/',
  ),
  'japanese:购物、点餐与交通': japaneseReview(
    'NHK Easy Japanese，购物、餐饮和交通场景课程入口。https://www.nhk.or.jp/lesson/',
    'Tofugu，Numbers and Counters：价格、数量与量词表达。https://www.tofugu.com/japanese-grammar/numbers-and-counters/',
    'Tofugu，助词に：目的地、时间和存在位置说明。https://www.tofugu.com/japanese-grammar/particle-ni/',
  ),
  'japanese:时间、日期与预约': japaneseReview(
    'NHK Easy Japanese，数字、日期与时间表达课程入口。https://www.nhk.or.jp/lesson/',
    'Tofugu，Date and Time：日期、时刻与时间表达说明。https://www.tofugu.com/japanese-grammar/date-and-time/',
    'Tofugu，Numbers and Counters：数字、日期和数量读法参考。https://www.tofugu.com/japanese-grammar/numbers-and-counters/',
  ),
  'japanese:常用敬语与礼貌表达': japaneseReview(
    'NHK Easy Japanese，礼貌表达与商务日语课程入口。https://www.nhk.or.jp/lesson/',
    'Tofugu，Japanese Keigo：尊敬语、谦让语和丁宁语说明。https://www.tofugu.com/japanese/keigo/',
    '日本国际交流基金会，日语教育资源：正式场合交流与商务表达参考。https://www.jpf.go.jp/e/project/japanese/education/resource/',
  ),
  'japanese:短文阅读：从句子到语境': japaneseReview(
    'NHK Easy Japanese，短篇阅读与基础课文入口。https://www.nhk.or.jp/lesson/',
    '青空文库，可用于分级阅读的公版日文作品。https://www.aozora.gr.jp/',
    'Tofugu，Japanese Reading Practice for Beginners：入门阅读方法与材料建议。https://www.tofugu.com/japanese/japanese-reading-practice-for-beginners/',
  ),
  'japanese:汉字音读与训读': japaneseReview(
    'NHK Easy Japanese，汉字与词汇学习入口。https://www.nhk.or.jp/lesson/',
    'Tofugu，How to Learn Kanji：音读、训读与按词语学习的方法。https://www.tofugu.com/japanese/how-to-learn-kanji/',
    'Tofugu，Kanji Study Methods：汉字复习与间隔练习建议。https://www.tofugu.com/japanese/kanji-study-methods/',
  ),
  'japanese:听力：数字、时间与关键词': japaneseReview(
    'NHK Easy Japanese，慢速听力与基础会话入口。https://www.nhk.or.jp/lesson/',
    'Tofugu，Aizuchi and Japanese Listening：会话反应与听力练习方法。https://www.tofugu.com/japanese/aizuchi-japanese-listening/',
    'Tofugu，Numbers and Counters：数字与量词听辨参考。https://www.tofugu.com/japanese-grammar/numbers-and-counters/',
  ),
  'japanese:JLPT N5 综合': japaneseReview(
    '日本国际交流基金会，JLPT官方网站。https://www.jlpt.jp/',
    'JLPT，N5级别说明与能力目标。https://www.jlpt.jp/e/about/levelsummary.html',
    'NHK Easy Japanese，N5基础词汇、句型与听力练习入口。https://www.nhk.or.jp/lesson/',
  ),
  'japanese:JLPT N4 入门': japaneseReview(
    '日本国际交流基金会，JLPT官方网站。https://www.jlpt.jp/',
    'JLPT，N4级别说明与能力目标。https://www.jlpt.jp/e/about/levelsummary.html',
    'Tofugu，条件形なら：条件表达与接续说明。https://www.tofugu.com/japanese-grammar/conditional-form-nara/',
    'NHK Easy Japanese，N4过渡会话与阅读材料入口。https://www.nhk.or.jp/lesson/',
  ),

  'culture:蒙学 · 对韵起步': reviewed(),
  'culture:诗词歌赋入门': reviewed(),
  'culture:四书章句': reviewed(),
  'culture:五经选读': reviewed(),

  'music:现代通用乐理': musicReview(
    'Open Music Theory, Open Textbook；现代乐理开放教材。https://viva.pressbooks.pub/openmusictheory/',
    '课程谱例与四小节练习为原创。',
    '现代通用乐理与中国传统音乐分域学习；本课不把五声调式术语混入大小调分析。',
  ),
  'music:中国传统音乐': musicReview(
    '中国非物质文化遗产网；传统音乐项目与传承信息。https://www.ihchina.cn/',
    'UNESCO, Traditional Chinese music-related heritage；用于核对公开非遗说明。https://ich.unesco.org/',
    '课程只使用公版或明确许可音频，并记录演奏者与版本。',
  ),

  'zhouyi:易学导论': reviewed(),
  'zhouyi:三易与成书': reviewed(),
  'zhouyi:经传结构': reviewed(),
  'zhouyi:底本与版本': reviewed(),
  'zhouyi:五层阅读法': reviewed(),
  'zhouyi:易学术语总表': reviewed(),
  'zhouyi:谦卦精读示范：五层阅读法入门': reviewed(),
  'zhouyi:乾卦精读': reviewed(),
  'zhouyi:坤卦与文言': reviewed(),
  'zhouyi:卦序与序卦': reviewed(),
  'zhouyi:系辞上精读': reviewed(),
  'zhouyi:系辞下与说卦': reviewed(),
  'zhouyi:彖象读法': reviewed(),
  'zhouyi:阴阳爻位': reviewed(),
  'zhouyi:八卦基础': reviewed(),
  'zhouyi:六十四卦': reviewed(),
  'zhouyi:五行': reviewed(),
  'zhouyi:干支甲子': reviewed(),
  'zhouyi:大衍筮法': reviewed(),
  'zhouyi:《说卦传》第一至三章精读：立卦生爻': reviewed(),
  'zhouyi:两派六宗': reviewed(),
  'zhouyi:汉易': reviewed(),
  'zhouyi:王弼与玄学易': reviewed(),
  'zhouyi:唐代注疏': reviewed(),
  'zhouyi:宋易': reviewed(),
  'zhouyi:清与近现代易学': reviewed(),
  'zhouyi:河图洛书': reviewed(),
  'zhouyi:太极图说': reviewed(),
  'zhouyi:先后天图': reviewed(),
  'zhouyi:卦气纳甲消息': reviewed(),
  'zhouyi:易图辨伪': reviewed(),
  'zhouyi:历代易图': reviewed(),
  'zhouyi:《太极图说》精读：无极而太极': reviewed(),
  'zhouyi:梅花易数源流': reviewed(),
  'zhouyi:梅花起卦': reviewed(),
  'zhouyi:梅花体用': reviewed(),
  'zhouyi:六爻纳甲': reviewed(),
  'zhouyi:三式': reviewed(),
  'zhouyi:杂占': reviewed(),
  'zhouyi:风水总论': reviewed(),
  'zhouyi:形势派': reviewed(),
  'zhouyi:理气派（上）': reviewed(),
  'zhouyi:八宅与玄空': reviewed(),
  'zhouyi:阳宅营造': reviewed(),
  'zhouyi:命理相法择日': reviewed(),
  'zhouyi:《葬书》内篇节选精读：乘生气与风水之名': reviewed(),
  'zhouyi:易与中医': reviewed(),
  'zhouyi:易与丹道历法': reviewed(),
  'zhouyi:易与数学': reviewed(),
  'zhouyi:易与文艺传播': reviewed(),
  'zhouyi:出土易文献': reviewed(),
  'zhouyi:研究方法与引用': reviewed(),
  'zhouyi:《周易参同契》节选精读：乾坤门户与丹道': reviewed(),

  'divination:世界占卜文化导论': reviewed(),
  'divination:象征、隐喻与解释': reviewed(),
  'divination:概率、心理与确认偏误': reviewed(),
  'divination:占卜记录与复盘': reviewed(),
  'divination:文化伦理与使用边界': reviewed(),
  'divination:天文基础：星空、行星与季节': reviewed({
    plainLanguageGoal:
      '学完后，你能区分恒星、行星、黄道、地球自转与公转，并解释季节变化的基本天文原因；同时能把可复核的天文事实与占卜象征分栏，不把星象当作现实预测。',
    independentPractice:
      '连续一周在相同地点和时刻记录月亮位置与可见行星，说明观测时间、方向、天气和光污染影响；最后注明哪些内容可由观测和天文年历复核，哪些只是占卜文化解释，不作为医疗、法律、金融或安全决策依据。',
    commonErrors: [
      '把星座连线当成恒星真实空间距离。',
      '认为季节由地球离太阳远近直接决定。',
      '把行星逆行理解成行星真的倒着绕太阳。',
      '把可核验的天文位置直接推成命运、健康或财务预测，跳过象征解释与专业决策的边界。',
    ],
    sourceRefs: [
      'NASA, Solar System Exploration；太阳系与行星资料。https://science.nasa.gov/solar-system/',
      'Stellarium Web；在线星图与观测模拟。https://stellarium-web.org/',
      '课程固定边界：天文事实用于文化观察与科学理解，占卜象征不构成医疗、法律、金融、安全或现实预测建议。',
    ],
  }),
  'divination:星座的文化史': reviewed(),
  'divination:黄道十二宫：历法与象征': reviewed(),
  'divination:行星、宫位与相位': reviewed(),
  'divination:星盘实践：从符号到叙事': reviewed(),
  'divination:塔罗图像史与公版牌组': reviewed(),
  'divination:大阿卡纳：22 张象征': reviewed(),
  'divination:小阿卡纳：四组牌': reviewed(),
  'divination:塔罗牌：三张牌阵如何形成叙事': reviewed(),
  'divination:塔罗解读与复盘': reviewed(),
  'divination:水晶球凝视与注意力': reviewed(),
  'divination:骰子、签筒与随机': reviewed(),
  'divination:数字占卜与历法': reviewed(),
  'divination:地理方位与地方占俗': reviewed(),
  'divination:中外占卜传统比较': reviewed(),
} satisfies CuratedCoursePlanPatchMap;
