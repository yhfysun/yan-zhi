// 五经教程 —— 一经一讲义 + 一精读（用户拍板「一本书一个教程」）。
// ★ 注解（历代大家）只收确切记得的注语原文；记不准一律 paraphrase=true 标「大意转述」。
import type { CultureLesson } from './types';

export const WUJING_LESSONS: CultureLesson[] = [
  {
    id: 'cul_shijing_intro',
    kind: 'lecture',
    title: '《诗经》· 讲义：风雅颂与赋比兴',
    goal: '认识《诗经》的三大构成与三种表现手法',
    minutes: 10,
    level: '五经',
    source: '诗经通识讲义（据朱熹《诗集传》通行口径）',
    plainSummary: [
      '《诗经》三百零五篇，分风、雅、颂；表现手法是赋、比、兴。',
      '风是各地歌谣，雅是朝廷正声，颂是祭祀乐歌。',
      '朱熹给赋比兴下过最通行的定义：敷陈、比喻、起兴。',
    ],
    lines: [
      {
        id: 'sjj_1',
        text: '《诗经》分风、雅、颂：风是十五国的民间歌谣，雅是朝廷正声，颂是宗庙祭祀的乐歌。',
        annotations: [
          { term: '风', gloss: '十五国风：周南、召南、邶、鄘、卫、王、郑、齐、魏、唐、秦、陈、桧、曹、豳', type: '名物' },
        ],
        interpretations: [],
        plain: '《诗经》的三大构成：风（民歌）、雅（宫廷）、颂（祭祀）。',
      },
      {
        id: 'sjj_2',
        text: '三种表现手法叫赋、比、兴：赋是直说，比是打比方，兴是先言他物以引起所咏之词。',
        annotations: [
          { term: '兴', pinyin: 'xīng', gloss: '先写别的事物，引出真正要说的主题', type: '释词', note: '「关关雎鸠」由鸟及人即兴' },
        ],
        interpretations: [
          { school: '朱熹《诗集传》', dynasty: '宋', text: '赋者，敷陈其事而直言之者也；比者，以彼物比此物也；兴者，先言他物以引起所咏之词也。', paraphrase: false, plain: '朱熹三句定义：赋=直说，比=打比方，兴=借物起头。' },
        ],
        plain: '赋比兴：直说、比喻、起兴——读诗经先认这三种手法。',
      },
    ],
    structure: [
      { label: '风雅颂', hint: '三类构成', lineIndex: 0 },
      { label: '赋比兴', hint: '三种手法', lineIndex: 1 },
    ],
    steps: ['gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '「关关雎鸠」由水鸟引出淑女，这种手法叫——？',
      options: ['兴', '赋', '比'],
      answer: '兴',
      explanation: '先言他物（雎鸠）以引起所咏之词（淑女），正是「兴」。',
    },
  },
  {
    id: 'cul_shijing_read',
    kind: 'read',
    title: '《诗经》· 原文精读：关雎、蒹葭、硕鼠',
    goal: '三首名篇对读：兴、怀人、讽刺各看一样',
    minutes: 15,
    level: '五经',
    source: '《诗经》通行本（周南·关雎 / 秦风·蒹葭 / 魏风·硕鼠），参毛传、朱熹《诗集传》',
    plainSummary: [
      '《关雎》以雎鸠起兴，写君子好逑。',
      '《蒹葭》写水畔怀人，《硕鼠》托鼠讽政。',
      '三首正好是兴、怀人、讽刺三种面孔。',
    ],
    lines: [
      {
        id: 'sjr_1',
        text: '关关雎鸠，在河之洲。窈窕淑女，君子好逑。',
        annotations: [
          { term: '雎鸠', pinyin: 'jū jiū', gloss: '一种水鸟', type: '名物' },
          { term: '好逑', pinyin: 'hǎo qiú', gloss: '好的配偶', type: '释词', note: '「逑」与「仇」古义相通' },
        ],
        interpretations: [
          { school: '毛传', dynasty: '汉', text: '雎鸠，王雎也，鸟挚而有别。', paraphrase: false, plain: '毛亨注：雎鸠是一种叫「王雎」的鸟，雌雄情意专一而有分别。' },
          { school: '朱熹《诗集传》', dynasty: '宋', text: '雎鸠为水鸟，雌雄情意专一。', paraphrase: true, plain: '大意：朱熹沿用毛传，强调此鸟情意专一，以喻夫妇之德。' },
        ],
        plain: '雎鸠在河洲上和鸣，文静美好的姑娘是君子的好配偶。',
      },
      {
        id: 'sjr_2',
        text: '蒹葭苍苍，白露为霜。所谓伊人，在水一方。',
        annotations: [
          { term: '蒹葭', pinyin: 'jiān jiā', gloss: '芦苇', type: '名物' },
          { term: '伊人', gloss: '那个人，不点明身份', type: '释词' },
        ],
        interpretations: [
          { school: '朱熹《诗集传》', dynasty: '宋', text: '言秋风蒹葭，望其所求之人而不可得。', paraphrase: true, plain: '大意：朱熹解为秋日怀人之作，所求在水一方、可望难即。' },
        ],
        plain: '芦苇苍苍、白露成霜，我念的那个人在河的另一边。',
      },
      {
        id: 'sjr_3',
        text: '硕鼠硕鼠，无食我黍！三岁贯女，莫我肯顾。',
        annotations: [
          { term: '硕鼠', pinyin: 'shuǒ shǔ', gloss: '大老鼠，喻重敛的统治者', type: '比喻' },
          { term: '贯女', pinyin: 'nǚ · 女通「汝」', gloss: '供养你', type: '通假', note: '「莫我肯顾」为宾语前置，即「不肯顾我」' },
        ],
        interpretations: [
          { school: '毛诗序', dynasty: '汉', text: '《硕鼠》，刺重敛也。', paraphrase: false, plain: '毛诗小序明说：这首诗是讽刺横征暴敛的。' },
        ],
        plain: '大老鼠啊别吃我的黍子！养你多年你却不顾念我。',
      },
    ],
    structure: [
      { label: '关雎 · 兴', hint: '由鸟及人', lineIndex: 0 },
      { label: '蒹葭 · 怀人', hint: '可望难即', lineIndex: 1 },
      { label: '硕鼠 · 讽刺', hint: '托物讽政', lineIndex: 2 },
    ],
    steps: ['recite', 'gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '毛传解「雎鸠」是哪种鸟？',
      options: ['王雎，鸟挚而有别', '斑鸠', '鹧鸪'],
      answer: '王雎，鸟挚而有别',
      explanation: '毛传原文「雎鸠，王雎也，鸟挚而有别」——情意专一而雌雄有别。',
    },
  },
  {
    id: 'cul_shangshu_intro',
    kind: 'lecture',
    title: '《尚书》· 讲义：上古政事文告',
    goal: '认识《尚书》的体例、「最难读」的原因与真伪公案',
    minutes: 9,
    level: '五经',
    source: '尚书通识讲义（据通行经学史口径）',
    plainSummary: [
      '《尚书》记上古政事文告，以记言为主，分虞、夏、商、周四书。',
      '文体有典、谟、训、诰、誓、命六类。',
      '它有著名的真伪公案：今文尚书与古文尚书。',
    ],
    lines: [
      {
        id: 'ssj_1',
        text: '《尚书》分虞书、夏书、商书、周书四部分；文体有典、谟、训、诰、誓、命六类，各有用途。',
        annotations: [
          { term: '诰', pinyin: 'gào', gloss: '告谕之文，多为官方训诫', type: '名物' },
          { term: '誓', gloss: '出征或誓师时的宣言', type: '名物' },
        ],
        interpretations: [],
        plain: '《尚书》的分部与六种文体。',
      },
      {
        id: 'ssj_2',
        text: '尚书有两部：伏生所传今文尚书二十八篇为真；东晋梅赜所献古文尚书，后被阎若璩考订为伪作。',
        annotations: [
          { term: '今文尚书', gloss: '汉初伏生口授、用汉代隶书写定的《尚书》', type: '名物' },
        ],
        interpretations: [
          { school: '阎若璩《尚书古文疏证》', dynasty: '清', text: '古文尚书二十五篇为伪，历举证据百二十八条。', paraphrase: true, plain: '大意：清代阎若璩用一百多条证据证明东晋献上的「古文尚书」是伪造，成为定案。' },
        ],
        plain: '《尚书》的真伪公案：今文真、古文伪，清代考据定案。',
      },
    ],
    structure: [
      { label: '四部六体', hint: '虞夏商周 · 典谟训诰誓命', lineIndex: 0 },
      { label: '真伪公案', hint: '今文真 · 古文伪', lineIndex: 1 },
    ],
    steps: ['gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '考订东晋古文尚书为伪作的清代学者是——？',
      options: ['阎若璩', '朱熹', '郑玄'],
      answer: '阎若璩',
      explanation: '阎若璩《尚书古文疏证》百余条证据定案，是清初考据学的标志性成果。',
    },
  },
  {
    id: 'cul_shangshu_read',
    kind: 'read',
    title: '《尚书》· 原文精读：尧典（节选）',
    goal: '读尧的治世纲领，体会「记言记事」的尚书面貌',
    minutes: 10,
    level: '五经',
    source: '《尚书》通行本 · 尧典（节选）',
    plainSummary: [
      '尧的治世纲领：能发扬大德，从家族推到万邦。',
      '四句话四个层次：身—族—姓—邦，由近及远。',
      '这正是《大学》「修齐治平」的史前版本。',
    ],
    lines: [
      {
        id: 'ssr_1',
        text: '克明俊德，以亲九族。',
        annotations: [
          { term: '克明俊德', gloss: '能发扬大德', type: '释词', note: '「克」=能够；「俊德」=大德' },
          { term: '九族', gloss: '同宗亲族（说法不一，通行指高祖至玄孙九代）', type: '名物' },
        ],
        interpretations: [
          { school: '蔡沈《书集传》', dynasty: '宋', text: '朱熹命蔡沈作《书集传》，此句解为「能明其大德，以睦九族」，由身及族。', paraphrase: true, plain: '大意：宋代通行注本把这四句读成由己及族的治世次序。' },
        ],
        plain: '尧能发扬大德，使家族和睦。',
      },
      {
        id: 'ssr_2',
        text: '九族既睦，平章百姓。百姓昭明，协和万邦。',
        annotations: [
          { term: '平章', pinyin: 'pián zhāng', gloss: '辨明彰显', type: '释词' },
          { term: '百姓', gloss: '此处指百官族姓，非后世之平民', type: '名物', note: '上古「百姓」义为百官族姓' },
        ],
        interpretations: [],
        plain: '家族和睦进而辨明百官族姓，百官明德则万邦协调。',
      },
    ],
    structure: [
      { label: '身与族', hint: '克明俊德', lineIndex: 0 },
      { label: '族与邦', hint: '协和万邦', lineIndex: 1 },
    ],
    steps: ['recite', 'gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '「百姓昭明」的「百姓」在上古指什么？',
      options: ['百官族姓', '全体平民', '一百个姓氏'],
      answer: '百官族姓',
      explanation: '上古「百姓」指百官族姓；指平民是后来的引申义。',
    },
  },
  {
    id: 'cul_liji_intro',
    kind: 'lecture',
    title: '《礼记》· 讲义：礼的说明书',
    goal: '认识《礼记》的构成，弄清它与四书的关系',
    minutes: 8,
    level: '五经',
    source: '礼记通识讲义（据通行经学史口径）',
    plainSummary: [
      '《礼记》是儒家论礼文章的汇编，成于汉代，四十九篇。',
      '《大学》《中庸》原是其中两篇，被朱熹抽出编入四书。',
      '名篇还有《礼运》（大同）、《学记》（教学）、《乐记》（音乐）。',
    ],
    lines: [
      {
        id: 'ljj_1',
        text: '《礼记》四十九篇，非一人一时之作，是汉代学者辑录先秦至汉儒家论礼文献而成。',
        annotations: [
          { term: '辑录', gloss: '搜集编排（非一人撰写）', type: '释词' },
        ],
        interpretations: [
          { school: '郑玄《礼记注》', dynasty: '东汉', text: '郑玄遍注三礼（周礼、仪礼、礼记），后世读礼记以郑注为根基。', paraphrase: true, plain: '大意：东汉郑玄给《礼记》作注，是读《礼记》绕不开的注本。' },
        ],
        plain: '《礼记》的性质：汇编而成，四十九篇。',
      },
      {
        id: 'ljj_2',
        text: '「三礼」是《周礼》《仪礼》《礼记》三部书：周礼讲官制，仪礼讲仪程，礼记讲义理。',
        annotations: [
          { term: '三礼', gloss: '礼学三部书的合称', type: '名物' },
        ],
        interpretations: [],
        plain: '三礼分工：官制、仪程、义理各管一头。',
      },
    ],
    structure: [
      { label: '构成', hint: '汉代辑录 49 篇', lineIndex: 0 },
      { label: '三礼', hint: '周礼/仪礼/礼记', lineIndex: 1 },
    ],
    steps: ['gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '《大学》《中庸》原本出自哪部书？',
      options: ['《礼记》', '《仪礼》', '《周礼》'],
      answer: '《礼记》',
      explanation: '两篇是《礼记》中的文章，朱熹抽出编入四书。',
    },
  },
  {
    id: 'cul_liji_read',
    kind: 'read',
    title: '《礼记》· 原文精读：大道之行也（节选）',
    goal: '读「天下为公」的大同理想，配郑玄注理解',
    minutes: 10,
    level: '五经',
    source: '《礼记》通行本 · 礼运（节选），参郑玄注',
    plainSummary: [
      '这一段勾画儒家理想社会「大同」。',
      '权力公天下：选贤与能、讲信修睦。',
      '每个人都被安放：老有所终，壮有所用，幼有所长。',
    ],
    lines: [
      {
        id: 'ljr_1',
        text: '大道之行也，天下为公。选贤与能，讲信修睦。',
        annotations: [
          { term: '选贤与能', pinyin: 'yǔ · 与通「举」', gloss: '选拔推举贤者与能者', type: '通假', note: '「与」通「举」' },
          { term: '修睦', gloss: '培养和睦气氛', type: '释词' },
        ],
        interpretations: [
          { school: '郑玄《礼记注》', dynasty: '东汉', text: '「天下为公」，天子位传贤不传子。', paraphrase: true, plain: '大意：郑玄指出关键在「传贤不传子」——这是大同与家天下的分界。' },
        ],
        plain: '大道施行的时代：天下归公，选贤举能，人人讲信修睦。',
      },
      {
        id: 'ljr_2',
        text: '故人不独亲其亲，不独子其子，使老有所终，壮有所用，幼有所长。',
        annotations: [
          { term: '不独亲其亲', gloss: '不只把自己的父母当父母（前「亲」为动词）', type: '句式', note: '同字异用：动+名' },
        ],
        interpretations: [],
        plain: '人们不只敬爱自己的父母、疼爱自己的儿女，老壮幼各有着落。',
      },
    ],
    structure: [
      { label: '总纲', hint: '天下为公', lineIndex: 0 },
      { label: '各得其所', hint: '老壮幼', lineIndex: 1 },
    ],
    steps: ['recite', 'gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '郑玄注「天下为公」的关键点是什么？',
      options: ['天子位传贤不传子', '人人平等', '废除私有'],
      answer: '天子位传贤不传子',
      explanation: '郑注点出分界：传贤即大同，传子即家天下。',
    },
  },
  {
    id: 'cul_yijing_intro',
    kind: 'lecture',
    title: '《周易》· 讲义：卦爻与六十四卦',
    goal: '认识《周易》的构成：卦、爻、经与传',
    minutes: 10,
    level: '五经',
    source: '周易通识讲义（据通行经学史口径）',
    plainSummary: [
      '《周易》由六十四卦组成，每卦六爻，卦爻辞是「经」。',
      '解释经的「十翼」（易传）相传与孔子一派有关。',
      '「天行健，君子以自强不息」出自《象传》。',
    ],
    lines: [
      {
        id: 'yjj_1',
        text: '《周易》的「周」指周代，「易」是变化：六十四卦由八卦两两相叠而成，每卦六爻自下而上数。',
        annotations: [
          { term: '爻', pinyin: 'yáo', gloss: '组成卦的每一横，阳爻（—）阴爻（--）', type: '名物' },
          { term: '八卦', gloss: '乾坤震巽坎离艮兑八种基本卦', type: '名物' },
        ],
        interpretations: [],
        plain: '《周易》的基本构件：八卦叠成六十四卦，每卦六爻。',
      },
      {
        id: 'yjj_2',
        text: '解释卦爻的《易传》共十篇，称「十翼」，传统认为与孔子一派有关；「天行健，君子以自强不息」即出自其中的《象传》。',
        annotations: [
          { term: '十翼', gloss: '彖上下、象上下、系辞上下、文言、说卦、序卦、杂卦十篇', type: '名物' },
        ],
        interpretations: [
          { school: '朱熹《周易本义》', dynasty: '宋', text: '读易当分经与传：卦爻辞为经，十翼为传，两者不可混为一读。', paraphrase: true, plain: '大意：朱熹主张把「经」（卦爻辞）与「传」（十翼）分开读。' },
        ],
        plain: '十翼是解释经的十篇辅助读物，经典名句多出自《象传》。',
      },
    ],
    structure: [
      { label: '卦爻体系', hint: '八卦 → 64 卦 → 384 爻', lineIndex: 0 },
      { label: '经与传', hint: '卦爻辞为经，十翼为传', lineIndex: 1 },
    ],
    steps: ['gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '「天行健，君子以自强不息」出自《周易》的哪一部分？',
      options: ['《象传》', '乾卦卦辞', '《系辞》'],
      answer: '《象传》',
      explanation: '它是《象传》解释乾卦的话，属「传」而非卦爻辞之「经」。',
    },
  },
  {
    id: 'cul_yijing_read',
    kind: 'read',
    title: '《周易》· 原文精读：乾卦（节选）',
    goal: '读乾卦卦辞爻辞，知道「九五之尊」的出处',
    minutes: 12,
    level: '五经',
    source: '《周易》通行本（乾卦 / 象传），参王弼注、朱熹《周易本义》',
    plainSummary: [
      '乾卦六爻用一条龙写人生进退：潜、见、惕、跃、飞、亢。',
      '卦辞「元亨利贞」四字是大纲。',
      '「九五之尊」正来自第五爻「飞龙在天」。',
    ],
    lines: [
      {
        id: 'yjr_1',
        text: '乾：元，亨，利，贞。',
        annotations: [
          { term: '元', gloss: '卦辞四字「元，亨，利，贞」：始生、通达、和谐、正固', type: '释词' },
        ],
        interpretations: [
          { school: '朱熹《周易本义》', dynasty: '宋', text: '六爻概括为潜、见、惕、跃、飞、亢六龙之象。', paraphrase: true, plain: '大意：朱熹把乾卦六爻读成一条龙的六个阶段——先藏、再露、慎行、待跃、高飞、知退。' },
        ],
        plain: '乾卦卦辞：元、亨、利、贞四德。',
      },
      {
        id: 'yjr_2',
        text: '初九：潜龙勿用。',
        annotations: [
          { term: '初九', gloss: '最低一爻；阳爻称「九」，阴爻称「六」', type: '名物' },
        ],
        interpretations: [
          { school: '王弼《周易注》', dynasty: '魏', text: '潜龙勿用，阳在下也；此时宜养德待时，不宜施用。', paraphrase: true, plain: '大意：王弼把「潜龙」读成「阳气尚在地下」——时机未到，先养德待时。' },
        ],
        plain: '最低一爻：龙还潜着，不要轻举妄动。',
      },
      {
        id: 'yjr_3',
        text: '九五：飞龙在天，利见大人。',
        annotations: [
          { term: '九五', gloss: '第五爻，居上卦之中而得正', type: '名物' },
          { term: '利见大人', pinyin: 'jiàn · 此处读「现」', gloss: '利于出现大人物（一说「利于拜见大人物」）', type: '释词' },
        ],
        interpretations: [
          { school: '通行注疏口径', dynasty: '历代', text: '九五居中得正，故后世尊位称「九五之尊」。', paraphrase: true, plain: '大意：第五爻位置最好，「九五之尊」由此成为帝位的代称。' },
        ],
        plain: '第五爻：飞龙在天，正是大展宏图之时。',
      },
    ],
    structure: [
      { label: '卦辞四德', hint: '元亨利贞', lineIndex: 0 },
      { label: '潜龙', hint: '养德待时', lineIndex: 1 },
      { label: '飞龙', hint: '九五之尊', lineIndex: 2 },
    ],
    steps: ['recite', 'gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '「九五之尊」这个说法来自哪里？',
      options: ['乾卦第五爻「飞龙在天」', '《春秋》的纪年', '周朝的官制'],
      answer: '乾卦第五爻「飞龙在天」',
      explanation: '第五爻居上卦中位而得正，故称九五之尊。',
    },
  },
  {
    id: 'cul_chunqiu_intro',
    kind: 'lecture',
    title: '《春秋》· 讲义：一字寓褒贬',
    goal: '认识《春秋》的编年体例与「春秋笔法」',
    minutes: 9,
    level: '五经',
    source: '春秋通识讲义（据通行经学史口径）',
    plainSummary: [
      '《春秋》是鲁国编年史，记二百四十二年事，极简。',
      '一字寓褒贬：换个字就是换态度，称「春秋笔法」。',
      '经文太简，读《春秋》必须配「三传」：左传、公羊、谷梁。',
    ],
    lines: [
      {
        id: 'cqj_1',
        text: '《春秋》记鲁隐公元年至哀公十四年共二百四十二年事，一年一事一记，最短的一条仅一个字。',
        annotations: [
          { term: '一年一事一记', gloss: '编年体：按年份逐条记事的史书体例', type: '名物' },
        ],
        interpretations: [
          { school: '杜预《春秋左传集解》', dynasty: '晋', text: '杜预首次将《春秋》经文与《左传》按年合并编次，今本面目即由此而来。', paraphrase: true, plain: '大意：把经和传对齐编排的通行本，是晋代杜豫（杜预）做的——读春秋笔法都得从这条对读开始。' },
        ],
        plain: '《春秋》的体例：编年、极简。',
      },
      {
        id: 'cqj_2',
        text: '经文须配「三传」读：《左传》详事，《公羊》《谷梁》明义；读故事用左传，读微言大义用公谷。',
        annotations: [
          { term: '三传', gloss: '解释《春秋》经的三部传：左传、公羊传、谷梁传', type: '名物' },
        ],
        interpretations: [],
        plain: '读《春秋》的打开方式：三传互补，左传看事，公谷看义。',
      },
    ],
    structure: [
      { label: '编年极简', hint: '242 年', lineIndex: 0 },
      { label: '三传', hint: '左传详事 · 公谷明义', lineIndex: 1 },
    ],
    steps: ['gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '想了解《春秋》记载的历史事件细节，应主要读哪部传？',
      options: ['《左传》', '《公羊传》', '《谷梁传》'],
      answer: '《左传》',
      explanation: '左传以史料详赡见长，叙事细节全在左传。',
    },
  },
  {
    id: 'cul_chunqiu_read',
    kind: 'read',
    title: '《春秋》· 原文精读：郑伯克段于鄢',
    goal: '经传对读一句，亲眼看「春秋笔法」怎么用字',
    minutes: 12,
    level: '五经',
    source: '《春秋》隐公元年经文与《左传》传文通行本',
    plainSummary: [
      '经文只有一句「夏五月，郑伯克段于鄢」，六个字全是用心的。',
      '《左传》逐字解释：为什么不说「弟」、为什么用「克」、为什么称「伯」。',
      '这一条是「春秋笔法」最著名的标本。',
    ],
    lines: [
      {
        id: 'cqr_1',
        text: '夏五月，郑伯克段于鄢。',
        annotations: [
          { term: '郑伯', gloss: '郑庄公（伯爵，故称伯）', type: '名物' },
          { term: '段', gloss: '庄公之弟共叔段', type: '名物' },
          { term: '鄢', pinyin: 'yān', gloss: '地名', type: '名物' },
        ],
        interpretations: [],
        plain: '经文：夏天五月，郑庄公在鄢地打败了段。',
      },
      {
        id: 'cqr_2',
        text: '段不弟，故不言弟；如二君，故曰克；称郑伯，讥失教也。',
        annotations: [
          { term: '不弟', pinyin: 'dì', gloss: '不像弟弟（不合弟道）', type: '通假', note: '「弟」通「悌」，敬爱兄长' },
          { term: '讥失教也', gloss: '讥讽庄公没有尽到教导弟弟的责任', type: '句式' },
        ],
        interpretations: [
          { school: '《左传》', dynasty: '春秋末', text: '段不弟，故不言弟；如二君，故曰克；称郑伯，讥失教也。', paraphrase: false, plain: '左传原原本本解释每个字的用意：不称弟、用「克」字、称「伯」，三处全是态度。' },
        ],
        plain: '段不合弟道所以不称弟；两君相战才用「克」；称郑伯是讥讽哥哥失教。',
      },
    ],
    structure: [
      { label: '经文六字', hint: '一句记事', lineIndex: 0 },
      { label: '传解笔法', hint: '逐字读出态度', lineIndex: 1 },
    ],
    steps: ['recite', 'gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '《左传》说经文不称「弟」而直书其名，是因为——？',
      options: ['段不合弟道', '史官笔误', '段不是郑国人'],
      answer: '段不合弟道',
      explanation: '「段不弟，故不言弟」——用称谓的降格暗含贬义，这正是春秋笔法。',
    },
  },
];
