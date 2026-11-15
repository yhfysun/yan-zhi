// 四书教程 —— 一书一讲义 + 一精读（用户拍板「一本书一个教程」）。
// ★ 硬约束：注释（训诂）与注解（历代大家）全部人工预写；interpretations 只收确切记得的
//   注语原文（paraphrase=false），记不准的一律 paraphrase=true 标「大意转述」，绝不编造注文。
import type { CultureLesson } from './types';

export const SISHU_LESSONS: CultureLesson[] = [
  {
    id: 'cul_daxue_intro',
    kind: 'lecture',
    title: '《大学》· 讲义：三纲领八条目',
    goal: '认识《大学》这本书，背下三纲领与八条目的路线图',
    minutes: 10,
    level: '四书',
    source: '四书通识讲义（据朱熹《四书章句集注》通行口径）',
    plainSummary: [
      '《大学》原是《礼记》里的一篇，朱熹把它抽出来排在四书第一。',
      '全文讲一套功夫路线：三纲领是目标，八条目是步骤。',
      '前五条修自己，后三条治天下，由内而外一以贯之。',
    ],
    lines: [
      {
        id: 'dx_1',
        text: '《大学》原是《礼记》第四十二篇，北宋起单独成篇，南宋朱熹编入四书并列为首。',
        annotations: [
          { term: '大学', pinyin: 'dà xué', gloss: '「大人之学」，相对于小孩子的「小学」：讲立身治国的大学问', type: '名物' },
        ],
        interpretations: [
          { school: '朱熹《四书章句集注》', dynasty: '宋', text: '大学者，大人之学也。', paraphrase: false, plain: '朱熹开篇解题：《大学》教的是成年人立身治国的学问。' },
          { school: '通行文学史口径', dynasty: '今', text: '《大学》本为《礼记》一篇，经朱熹表彰后跻身四书之首。', paraphrase: true, plain: '提醒：它是从《礼记》里抽出来的，不是独立古书。' },
        ],
        plain: '《大学》的来历：出自《礼记》，被朱熹提拔为四书第一本。',
      },
      {
        id: 'dx_2',
        text: '三纲领：明明德、亲民、止于至善——先擦亮自己的德行，再推己及人，最后停在最好的位置上。',
        annotations: [
          { term: '明明德', gloss: '前一个「明」是动词，彰明；「明德」是本有的光明德性', type: '句式', note: '同字异用：形+名，读时前「明」重读' },
          { term: '亲民', gloss: '亲近民众、使之自新', type: '释词' },
        ],
        interpretations: [
          { school: '朱熹《四书章句集注》', dynasty: '宋', text: '程子曰：亲，当作新。', paraphrase: false, plain: '朱熹引程颐的话：「亲民」应读作「新民」——让民众除旧布新。' },
        ],
        plain: '三条总目标：彰明德行、革新民众、止于至善。',
      },
      {
        id: 'dx_3',
        text: '八条目：格物、致知、诚意、正心、修身、齐家、治国、平天下——前五条修自己，后三条治天下。',
        annotations: [
          { term: '格物', gloss: '推究事物的道理', type: '释词', note: '「格」训「至/穷究」，历代聚讼最多的两个字' },
          { term: '条目', gloss: '逐条的目次，与「纲领」相对', type: '释词' },
        ],
        interpretations: [],
        plain: '八步功夫：从格物到平天下，一步扣一步。',
      },
    ],
    structure: [
      { label: '来历', hint: '《礼记》一篇 → 四书之首', lineIndex: 0 },
      { label: '三纲领', hint: '明德 · 亲民 · 至善', lineIndex: 1 },
      { label: '八条目', hint: '格物 → 平天下', lineIndex: 2 },
    ],
    steps: ['gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '「三纲领」指的是哪三条？',
      options: ['明明德、亲民、止于至善', '格物、致知、诚意', '修身、齐家、治国'],
      answer: '明明德、亲民、止于至善',
      explanation: '三纲领是目标；格物致知等八项是「条目」，即步骤。',
    },
  },
  {
    id: 'cul_daxue_read',
    kind: 'read',
    title: '《大学》· 原文精读：首章',
    goal: '逐字读《大学》开篇，配朱熹集注理解「纲领」',
    minutes: 12,
    level: '四书',
    source: '《礼记·大学》通行本 · 首章，参朱熹《四书章句集注》',
    plainSummary: [
      '开篇三句话立起三纲领，一句纲领一句解释。',
      '「知止而后有定」讲学习的次第与定力。',
      '「物有本末」收束：抓住本末先后，就接近了大学之道。',
    ],
    lines: [
      {
        id: 'dxr_1',
        text: '大学之道，在明明德，在亲民，在止于至善。',
        annotations: [
          { term: '道', gloss: '宗旨、根本方法', type: '释词' },
          { term: '止于至善', gloss: '停留在最好的境界上不再动摇', type: '释词' },
        ],
        interpretations: [
          { school: '朱熹《四书章句集注》', dynasty: '宋', text: '程子曰：亲，当作新。', paraphrase: false, plain: '朱熹按程颐的意见把「亲民」改读为「新民」：使民众自新。' },
        ],
        plain: '大学的宗旨：彰明光明德性，革新民众，止于至善。',
      },
      {
        id: 'dxr_2',
        text: '知止而后有定，定而后能静，静而后能安，安而后能虑，虑而后能得。',
        annotations: [
          { term: '知止', gloss: '知道所当达到的境地', type: '释词', note: '「止」承上「止于至善」' },
        ],
        interpretations: [
          { school: '朱熹《四书章句集注》', dynasty: '宋', text: '止者，所当止之地，即至善之所在也。', paraphrase: false, plain: '朱熹指出「止」字回应「止于至善」：知道目标才谈得上定静。' },
        ],
        plain: '知道目标才能志有定向，定了才能静、能安、能思虑、能有所得。',
      },
      {
        id: 'dxr_3',
        text: '物有本末，事有终始，知所先后，则近道矣。',
        annotations: [
          { term: '本末', gloss: '根本与枝节', type: '释词' },
        ],
        interpretations: [],
        plain: '凡事有本末先后，认清了次序，就接近大学之道了。',
      },
    ],
    structure: [
      { label: '三纲领', hint: '一句一句立起来', lineIndex: 0 },
      { label: '定静安虑得', hint: '功夫的次第', lineIndex: 1 },
      { label: '本末先后', hint: '收束', lineIndex: 2 },
    ],
    steps: ['recite', 'gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '朱熹引程子把「在亲民」读作——？',
      options: ['「在新民」', '「在爱民」', '「在亲亲」'],
      answer: '「在新民」',
      explanation: '程子曰「亲，当作新」：使民众自新，这是四书史上著名的改读。',
    },
  },
  {
    id: 'cul_zhongyong_intro',
    kind: 'lecture',
    title: '《中庸》· 讲义：不偏之谓中',
    goal: '认识《中庸》这本书，弄清「中」「庸」两个字的分量',
    minutes: 9,
    level: '四书',
    source: '四书通识讲义（据朱熹《中庸章句》通行口径）',
    plainSummary: [
      '《中庸》原也是《礼记》里的一篇，四书中最深。',
      '「中」是不偏不倚，「庸」是平常可行——不是平庸。',
      '它讲的是把道理落成日用常行的功夫。',
    ],
    lines: [
      {
        id: 'zy_1',
        text: '《中庸》原为《礼记》第三十一篇，朱熹把它与《大学》一同抽出，与《论语》《孟子》合成四书。',
        annotations: [],
        interpretations: [
          { school: '朱熹《中庸章句》', dynasty: '宋', text: '中者，不偏不倚、无过不及之名；庸，平常也。', paraphrase: false, plain: '朱熹给书名下定义：「中」是恰到好处，「庸」是平常可行——不是平庸。' },
        ],
        plain: '《中庸》来历与书名释义：中=不偏不倚，庸=平常。',
      },
      {
        id: 'zy_2',
        text: '全书以「诚」为枢纽：从「天命之谓性」讲起，落到「博学之，审问之，慎思之，明辨之，笃行之」的学习功夫。',
        annotations: [
          { term: '笃行', pinyin: 'dǔ xíng', gloss: '踏踏实实地践行', type: '释词' },
        ],
        interpretations: [],
        plain: '《中庸》的枢纽是「诚」，学习法是学、问、思、辨、行五步。',
      },
    ],
    structure: [
      { label: '来历', hint: '《礼记》第三十一篇', lineIndex: 0 },
      { label: '书名释义', hint: '中=不偏，庸=平常', lineIndex: 0 },
      { label: '诚与五步', hint: '博学审问慎思明辨笃行', lineIndex: 1 },
    ],
    steps: ['gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '朱熹解「庸」字是什么意思？',
      options: ['平常', '平庸', '功用'],
      answer: '平常',
      explanation: '「庸，平常也」——中庸是恰好的平常道，与「平庸」无关。',
    },
  },
  {
    id: 'cul_zhongyong_read',
    kind: 'read',
    title: '《中庸》· 原文精读：首章',
    goal: '逐字读「天命之谓性」一章，配朱熹章句理解',
    minutes: 12,
    level: '四书',
    source: '《礼记·中庸》通行本 · 首章，参朱熹《中庸章句》',
    plainSummary: [
      '首章三句话搭起全书的框架：性、道、教。',
      '「戒慎恐惧」讲独处时的谨慎，即「慎独」。',
      '「致中和」是落点：中和到位，天地万物各安其位。',
    ],
    lines: [
      {
        id: 'zyr_1',
        text: '天命之谓性，率性之谓道，修道之谓教。',
        annotations: [
          { term: '率性', pinyin: 'shuài xìng', gloss: '顺着本性行事', type: '释词', note: '「率」训「循、顺着」，不是「轻率」' },
        ],
        interpretations: [
          { school: '朱熹《中庸章句》', dynasty: '宋', text: '命，犹令也；性，即理也。', paraphrase: false, plain: '朱熹解：「天命」就是天所赋予的；「性」就是理——这是理学的大命题。' },
        ],
        plain: '天所赋予的叫性，顺着性走的叫道，把道修明出来的叫教。',
      },
      {
        id: 'zyr_2',
        text: '是故君子戒慎乎其所不睹，恐惧乎其所不闻。',
        annotations: [
          { term: '戒慎', gloss: '警惕谨慎', type: '释词' },
        ],
        interpretations: [
          { school: '通行注疏口径', dynasty: '宋以后', text: '此句与下句为「慎独」张本：人所不见之处尤须谨慎。', paraphrase: true, plain: '大意：没人看见的地方也要谨慎，这就是后来「慎独」的出处。' },
        ],
        plain: '所以君子在别人看不见、听不到的地方也警惕谨慎。',
      },
    ],
    structure: [
      { label: '性道教', hint: '框架三句', lineIndex: 0 },
      { label: '慎独', hint: '不睹不闻处用功', lineIndex: 1 },
    ],
    steps: ['recite', 'gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '「率性之谓道」的「率」是——？',
      options: ['循、顺着', '轻率', '率先'],
      answer: '循、顺着',
      explanation: '「率」训循：顺着本性走出来的路才叫道。',
    },
  },
  {
    id: 'cul_lunyu_intro',
    kind: 'lecture',
    title: '《论语》· 讲义：一部语录体',
    goal: '认识《论语》的成书与体裁，知道怎么读语录',
    minutes: 8,
    level: '四书',
    source: '四书通识讲义（据通行文学史口径）',
    plainSummary: [
      '《论语》是孔子及弟子言行的语录汇编，由弟子及再传弟子编成。',
      '语录体：一条一条，短小独立，没有长篇论述。',
      '读《论语》要「因言见人」——从一句话里看见一个人的态度。',
    ],
    lines: [
      {
        id: 'lyi_1',
        text: '《论语》共二十篇，成书于战国前期，由孔子的弟子及再传弟子编纂，是语录体之祖。',
        annotations: [
          { term: '语录体', gloss: '记录人物言论的短章体裁，一条一条互不连属', type: '名物' },
        ],
        interpretations: [
          { school: '通行文学史口径', dynasty: '今', text: '「论」为编纂之义，「语」即孔子之语。', paraphrase: true, plain: '大意：书名的意思就是「把孔子的话编起来」。' },
        ],
        plain: '《论语》的成书：弟子编老师的语录，二十篇。',
      },
      {
        id: 'lyi_2',
        text: '读语录的窍门是「因言见人」：一句「逝者如斯夫」，能看见孔子站在川上时的感慨与紧迫。',
        annotations: [
          { term: '逝者如斯夫', gloss: '时光像河水一样流走（出自《论语·子罕》）', type: '典故', note: '「斯」指河水' },
        ],
        interpretations: [],
        plain: '读语录要看话背后的人：一句感叹也是性格。',
      },
    ],
    structure: [
      { label: '成书', hint: '弟子编纂 · 二十篇', lineIndex: 0 },
      { label: '体裁', hint: '语录体之祖', lineIndex: 0 },
      { label: '读法', hint: '因言见人', lineIndex: 1 },
    ],
    steps: ['gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '《论语》是什么体裁的开山之作？',
      options: ['语录体', '编年体', '纪传体'],
      answer: '语录体',
      explanation: '《论语》一条条记孔子的话，是语录体的源头；编年/纪传是史书体裁。',
    },
  },
  {
    id: 'cul_lunyu_read',
    kind: 'read',
    title: '《论语》· 原文精读：修学四章',
    goal: '读四条最常引用的语录，配朱熹集注理解',
    minutes: 14,
    level: '四书',
    source: '《论语》通行本（学而 / 为政 / 述而 / 泰伯），参朱熹《论语集注》',
    plainSummary: [
      '学与思要配合，偏废一样都会出问题。',
      '温故而知新、随处择善，是每天都能做的功夫。',
      '曾子说士人肩上有重担、路还长，靠弘大与坚毅。',
    ],
    lines: [
      {
        id: 'lyr_1',
        text: '子曰：「学而时习之，不亦说乎？」',
        annotations: [
          { term: '习', gloss: '反复温习、演练', type: '释词' },
          { term: '说', pinyin: 'yuè · 此处读「悦」', gloss: '同「悦」，高兴', type: '通假', note: '古无「悦」字，借「说」表喜悦' },
        ],
        interpretations: [
          { school: '朱熹《论语集注》', dynasty: '宋', text: '习，鸟数飞也。学之不已，如鸟数飞也。', paraphrase: false, plain: '朱熹用小鸟反复试飞解「习」：学了要像鸟练飞一样反复实践。' },
        ],
        plain: '孔子说：学了并时常温习实践，不也很喜悦吗？',
      },
      {
        id: 'lyr_2',
        text: '子曰：「学而不思则罔，思而不学则殆。」',
        annotations: [
          { term: '罔', pinyin: 'wǎng', gloss: '迷惑而无所得', type: '释词' },
          { term: '殆', pinyin: 'dài', gloss: '疲怠而危疑', type: '释词' },
        ],
        interpretations: [
          { school: '朱熹《论语集注》', dynasty: '宋', text: '不求诸心，故昏而无得；不习其事，故危而不安。', paraphrase: false, plain: '朱熹把两句病根说破：不思考就昏昧无所得，不实践就危而不安。' },
        ],
        plain: '孔子说：学而不思考就迷糊，思考不学习就危险。',
      },
      {
        id: 'lyr_3',
        text: '子曰：「温故而知新，可以为师矣。」',
        annotations: [],
        interpretations: [
          { school: '朱熹《论语集注》', dynasty: '宋', text: '温，寻也。', paraphrase: false, plain: '朱熹训「温」为「寻」：温故是把旧所学重新寻绎一遍，从中长出新知。' },
        ],
        plain: '孔子说：温习旧知而能悟出新意，就可以做老师了。',
      },
      {
        id: 'lyr_4',
        text: '曾子曰：「士不可以不弘毅，任重而道远。」',
        annotations: [
          { term: '弘毅', gloss: '宽宏而坚毅', type: '释词' },
        ],
        interpretations: [
          { school: '朱熹《论语集注》', dynasty: '宋', text: '弘，宽广也；毅，强忍也。非弘不能胜其重，非毅无以致其远。', paraphrase: false, plain: '朱熹拆开讲：不宽广扛不起重担，不坚毅走不到远处。' },
        ],
        plain: '曾子说：读书人心胸要宽、意志要坚，因为担子重、路途远。',
      },
    ],
    structure: [
      { label: '学思并进', hint: '罔与殆', lineIndex: 1 },
      { label: '温故知新', hint: '旧里出新', lineIndex: 2 },
      { label: '弘毅任重', hint: '士人的担子', lineIndex: 3 },
    ],
    steps: ['recite', 'gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '朱熹以「鸟数飞也」解释的是哪一句里的哪个字？',
      options: ['「学而时习之」的「习」', '「温故知新」的「温」', '「弘毅」的「毅」'],
      answer: '「学而时习之」的「习」',
      explanation: '「习，鸟数飞也」——像小鸟反复练飞一样，学了要反复实践。',
    },
  },
  {
    id: 'cul_mengzi_intro',
    kind: 'lecture',
    title: '《孟子》· 讲义：雄辩与性善',
    goal: '认识《孟子》的成书、体例与「性善论」',
    minutes: 9,
    level: '四书',
    source: '四书通识讲义（据通行文学史口径）',
    plainSummary: [
      '《孟子》七篇，多记孟子与诸侯、弟子的对话，长于雄辩。',
      '核心主张：性善、仁政、养浩然之气。',
      '孟子的辩论术：先设喻、再类推，逼你承认结论。',
    ],
    lines: [
      {
        id: 'mzi_1',
        text: '《孟子》七篇，由孟子与弟子万章、公孙丑等共同编定，是四书中篇幅最大、最像文章的一部。',
        annotations: [
          { term: '万章', gloss: '孟子高弟，《孟子》书中问答最多的弟子之一', type: '名物' },
        ],
        interpretations: [
          { school: '赵岐《孟子章句》', dynasty: '东汉', text: '现存最早的《孟子》全注本是东汉赵岐的《孟子章句》，七篇之分即出于此。', paraphrase: true, plain: '大意：今天「七篇」的分法就是东汉赵岐定下的，他的注本也是最早的。' },
        ],
        plain: '《孟子》七篇的作者与篇幅：孟子和弟子一起写的。',
      },
      {
        id: 'mzi_2',
        text: '孟子善用比喻说理：以「鱼与熊掌」设取舍，以「揠苗助长」讽助长，先让你点头，再让你认账。',
        annotations: [
          { term: '揠苗助长', pinyin: 'yà miáo', gloss: '出自《孟子·公孙丑上》：拔苗助长反而害苗', type: '典故', note: '喻违背规律强求速成' },
        ],
        interpretations: [],
        plain: '孟子的辩论术：比喻先行，类推收网。',
      },
    ],
    structure: [
      { label: '成书', hint: '七篇 · 与弟子共编', lineIndex: 0 },
      { label: '雄辩术', hint: '设喻→类推', lineIndex: 1 },
    ],
    steps: ['gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '「揠苗助长」这个寓言出自——？',
      options: ['《孟子》', '《论语》', '《庄子》'],
      answer: '《孟子》',
      explanation: '出自《孟子·公孙丑上》，用来批评违背规律助长「浩然之气」的做法。',
    },
  },
  {
    id: 'cul_mengzi_read',
    kind: 'read',
    title: '《孟子》· 原文精读：舍生取义（节选）',
    goal: '读鱼与熊掌的取舍，配朱熹集注理解「义」',
    minutes: 12,
    level: '四书',
    source: '《孟子》通行本 · 告子上，参朱熹《孟子集注》',
    plainSummary: [
      '用鱼与熊掌设喻：两样都想要，只能挑一样。',
      '生命与道义也一样，不可兼得时舍生取义。',
      '这是孟子「性善」最响亮的一张名片。',
    ],
    lines: [
      {
        id: 'mzr_1',
        text: '鱼，我所欲也；熊掌，亦我所欲也。二者不可得兼，舍鱼而取熊掌者也。',
        annotations: [
          { term: '得兼', gloss: '同时得到', type: '释词' },
        ],
        interpretations: [
          { school: '朱熹《孟子集注》', dynasty: '宋', text: '言舍生取义之意，与舍鱼取熊掌同。', paraphrase: true, plain: '大意：朱熹指出这个比喻是「以轻换重」——舍掉轻的，换取更重的。' },
        ],
        plain: '鱼和熊掌都想要，不能兼得时，舍鱼取熊掌。',
      },
      {
        id: 'mzr_2',
        text: '生，亦我所欲也；义，亦我所欲也。二者不可得兼，舍生而取义者也。',
        annotations: [
          { term: '义', pinyin: 'yì', gloss: '道义、应当', type: '释词' },
        ],
        interpretations: [
          { school: '通行注疏口径', dynasty: '宋以后', text: '孟子以「羞恶之心」为义之端，此章即其极致之论。', paraphrase: true, plain: '大意：孟子认为「羞恶之心」是义的萌芽，本章把它推到极致。' },
        ],
        plain: '生命与道义都想要，不可兼得时，舍生取义。',
      },
    ],
    structure: [
      { label: '设喻', hint: '鱼与熊掌', lineIndex: 0 },
      { label: '正题', hint: '生与义', lineIndex: 1 },
    ],
    steps: ['recite', 'gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '「舍生而取义」背后，孟子主张人性本——？',
      options: ['善', '恶', '无善无恶'],
      answer: '善',
      explanation: '孟子认为义是人心的固有权重（羞恶之心），危急时自会取义，即性善论。',
    },
  },
];
