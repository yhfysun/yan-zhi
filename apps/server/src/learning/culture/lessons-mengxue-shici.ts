// 蒙学 + 诗词歌赋阶课程 —— 注释（训诂）与注解（历代大家）分层的精读/讲义课。
// ★ 全部人工预写；interpretations 只收确切记得的注语原文，记不准一律 paraphrase=true。
import type { CultureLesson } from './types';

export const MENGXUE_SHICI_LESSONS: CultureLesson[] = [
  {
    id: 'cul_mengxue_shenglv',
    kind: 'read',
    title: '声律启蒙 · 一东（节选）',
    goal: '第一次感受「对仗」：字数一样、词性相对、平仄相反',
    minutes: 8,
    level: '蒙学·对韵',
    source: '《声律启蒙》清·车万育，通行本',
    plainSummary: [
      '这本书是古代小朋友的对对子入门教材。',
      '这一段告诉你：云和雨相对，雪和风相对。',
      '读起来像唱歌，因为平仄是交替的。',
    ],
    lines: [
      {
        id: 'sl_1',
        text: '云对雨，雪对风，晚照对晴空。',
        pingze: '平仄仄仄仄平平仄仄平平',
        plain: '云对雨、雪对风，夕阳对晴空。',
        annotations: [
          { term: '晚照', gloss: '傍晚的日光，即夕阳', type: '释词' },
          { term: '晴空', gloss: '晴朗的天空', type: '释词', note: '与「晚照」相对：一偏时间，一偏空间' },
        ],
        interpretations: [
          { school: '通行蒙学教材口径', dynasty: '清以来', text: '《声律启蒙》为清代车万育所编蒙学对韵教材，与《笠翁对韵》并称。', paraphrase: true, plain: '大意：这本书是清朝人编的对对子课本，与《笠翁对韵》齐名。' },
        ],
      },
      {
        id: 'sl_2',
        text: '来鸿对去燕，宿鸟对鸣虫。',
        pingze: '平平仄仄仄仄仄仄平平',
        plain: '飞来的大雁对离去的燕子，歇宿的鸟对鸣叫的虫。',
        annotations: [
          { term: '鸿', pinyin: 'hóng', gloss: '大雁', type: '释词', note: '「鸿」与「燕」都是候鸟，一来一去正好成对' },
          { term: '宿', pinyin: 'sù', gloss: '歇宿、停留', type: '释词', note: '「宿鸟」歇着，「鸣虫」叫着，一动一静' },
        ],
        interpretations: [],
      },
    ],
    structure: [
      { label: '天文对', hint: '云雨雪风，字字成对', lineIndex: 0 },
      { label: '景物对', hint: '晚照对晴空', lineIndex: 0 },
      { label: '禽虫对', hint: '来去一对，动静一对', lineIndex: 1 },
    ],
    steps: ['recite', 'gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '「云对雨」里，对仗要求两边最起码要一样的是什么？',
      options: ['字数', '笔画', '颜色'],
      answer: '字数',
      explanation: '对仗的底线是字数相等，再进一步才是词性相对、平仄相反。',
    },
  },
  {
    id: 'cul_shici_intro',
    kind: 'lecture',
    title: '诗——古体与近体，格律是什么',
    goal: '分清古体与近体，看懂绝句律诗的格式纪律',
    minutes: 10,
    level: '诗词歌赋',
    source: '体裁通识 · 自撰讲义（术语释义参通行文学史口径）',
    plainSummary: [
      '诗不是一种，先分古体与近体两大类。',
      '近体诗是唐代定型的格律诗：绝句四句、律诗八句，句式齐整、押平声韵。',
      '律诗中间两联必须对仗；平仄是它的骨架。',
    ],
    lines: [
      {
        id: 'sci_a',
        text: '诗分古体与近体：古体句数不限、平仄自由；近体专指唐代定型的格律诗，只有绝句与律诗两类。',
        plain: '诗先分两大类：古体自由，近体守格律。',
        annotations: [
          { term: '近体', gloss: '唐代定型的格律诗（近体诗），只有绝句、律诗两类', type: '名物', note: '与不拘格律的「古体诗」相对' },
        ],
        interpretations: [
          { school: '王力《诗词格律》', dynasty: '今', text: '近体诗指唐代形成的格律诗体，包括律诗与绝句，对字数、平仄、用韵均有严格规定。', paraphrase: true, plain: '大意：王力先生的经典教材就是这么划界的——近体=守格律的唐诗。' },
        ],
      },
      {
        id: 'sci_b',
        text: '近体诗按「篇句字韵」定格式：律诗八句、绝句四句；每句五字或七字；双数句押平声韵，一韵到底。',
        plain: '篇（4/8句）、句（5/7字）、韵（双数句押平韵不换）都定死。',
        annotations: [
          { term: '押平声韵', gloss: '韵脚用平声字且不换韵', type: '句式', note: '与古体、词赋可换韵相区别' },
          { term: '一韵到底', gloss: '全篇只用同一个韵', type: '释词' },
        ],
        interpretations: [],
      },
      {
        id: 'sci_c',
        text: '律诗中间两联必须对仗；绝句可不对仗，但「白日依山尽，黄河入海流」恰好是一副工对——词性逐位相对，平仄逐位相反。',
        plain: '律诗颔联颈联必对仗；绝句不强制，但这句恰是工对。',
        annotations: [
          { term: '对仗', gloss: '两句字字成对，如对联', type: '句式', note: '律诗三四句（颔联）与五六句（颈联）必须对仗' },
          { term: '工对', gloss: '工整的对仗：颜色对颜色、名对名', type: '释词', note: '「白日」对「黄河」即颜色对颜色' },
        ],
        interpretations: [],
      },
      {
        id: 'sci_d',
        text: '平仄把字分作两类：平声舒缓悠长，仄声短促有力；联内两句平仄逐位相反叫「对」，相邻两联相承叫「粘」。',
        plain: '平仄两条搭配规则：对（联内相反）与粘（联间相承）。',
        annotations: [
          { term: '平仄', gloss: '字的声调两大类：平声悠长、仄声短促', type: '释词', note: '以普通话近似一二声为平、三四声为仄；古入声归仄需单独记' },
          { term: '粘', pinyin: 'niān', gloss: '相邻两联开头平仄相同', type: '句式', note: '失对、失粘都是近体诗的毛病' },
        ],
        interpretations: [
          { school: '王力《诗词格律》', dynasty: '今', text: '关于平仄的宽严，历来有「一三五不论，二四六分明」的俗谚，大致可用但七言首字仍有讲究。', paraphrase: true, plain: '大意：节奏点（二四六位）必须分明，非节奏点相对自由——这句口诀人人要会。' },
        ],
      },
    ],
    structure: [
      { label: '古体与近体', hint: '先分大类', lineIndex: 0 },
      { label: '篇句字韵', hint: '四句八句、五言七言、平韵到底', lineIndex: 1 },
      { label: '对仗', hint: '律诗中间两联必须对', lineIndex: 2 },
      { label: '平仄', hint: '对与粘两条规则', lineIndex: 3 },
    ],
    steps: ['gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '律诗八句中，必须对仗的两联是——？',
      options: ['颔联与颈联', '首联与尾联', '每一联'],
      answer: '颔联与颈联',
      explanation: '第三四句（颔联）与第五六句（颈联）必须对仗，首尾两联不强制。',
    },
  },
  {
    id: 'cul_cipai_intro',
    kind: 'lecture',
    title: '词与词牌——曲调怎么定格式',
    goal: '读懂词牌就是格式说明书，逐个认识八个经典词牌',
    minutes: 12,
    level: '诗词歌赋',
    source: '词谱通识 · 自撰讲义（字数句式据《钦定词谱》通行表述）',
    plainSummary: [
      '词的格式不由作者定，由词牌定——选了词牌就领了一张格式说明书。',
      '每个词牌的字数、句式、用韵各有定制，还有叠句、换韵等标志。',
      '读了词牌格式再读词，句句都能对上谱。',
    ],
    lines: [
      {
        id: 'cpi_0',
        text: '词的格式不由作者定，由词牌定：选了词牌，就等于领了一张格式说明书——每句几个字、何处用韵、平仄如何，全按谱填词。',
        plain: '词牌=格式说明书：句数字数用韵全定死，所以写词叫「填词」。',
        annotations: [
          { term: '词牌', gloss: '词所依的曲调名称，也是格式的名字', type: '名物' },
          { term: '按谱填词', gloss: '照词谱逐句填字，故写词古称「填词」', type: '句式' },
        ],
        interpretations: [],
      },
      {
        id: 'cpi_1',
        text: '《水调歌头》：双调九十五字，上片九句四平韵，下片十句四平韵；句式长短交错，最宜问天怀古，「明月几时有」即用此调。',
        plain: '水调歌头：95 字双调，上下片各四平韵。',
        annotations: [
          { term: '双调', pinyin: 'diào · 此处读「凋」', gloss: '词分前后两段（上片/下片，也称上阕/下阕）', type: '名物' },
        ],
        interpretations: [
          { school: '《钦定词谱》', dynasty: '清', text: '《水调歌头》，双调九十五字。', paraphrase: true, plain: '大意：清代官修词谱记录的通行体式为九十五字双调。' },
        ],
      },
      {
        id: 'cpi_2',
        text: '《念奴娇》：双调一百字，故又名「百字令」，押仄韵，音节高亢，宜写豪放感慨，「大江东去」即用此调。',
        plain: '念奴娇：100 字双调仄韵，别名「百字令」。',
        annotations: [
          { term: '百字令', gloss: '《念奴娇》因全篇一百字得的别名', type: '名物', note: '另有「酹江月」等别名' },
          { term: '仄韵', pinyin: 'zè', gloss: '韵脚用仄声字，声情顿挫', type: '句式' },
        ],
        interpretations: [],
      },
      {
        id: 'cpi_3',
        text: '《虞美人》：双调五十六字，上下片各四句，两仄韵转两平韵；「春花秋月何时了」即用此调。',
        plain: '虞美人：56 字双调，每片两仄韵转两平韵。',
        annotations: [
          { term: '转', gloss: '换韵：先押两仄韵再转押两平韵', type: '句式', note: '换韵让声情起伏，是《虞美人》的标志' },
        ],
        interpretations: [],
      },
      {
        id: 'cpi_4',
        text: '《如梦令》：单调三十三字，七句五仄韵一叠韵；「知否，知否」两句叠句，是这个词牌的标志。',
        plain: '如梦令：33 字单调，有标志性的叠句「知否，知否」。',
        annotations: [
          { term: '单调', gloss: '不分片的词（小令多单调）', type: '名物' },
          { term: '叠句', gloss: '相连两句完全相同', type: '句式', note: '《如梦令》必有一处叠句' },
        ],
        interpretations: [],
      },
      {
        id: 'cpi_5',
        text: '《浣溪沙》：双调四十二字，上片三句三平韵，下片头两句多用对仗，是最工整的小令之一。',
        plain: '浣溪沙：42 字双调平韵，过片两句多对仗。',
        annotations: [
          { term: '小令', gloss: '五十八字以内的短词', type: '名物', note: '与「中调」「长调」相对' },
        ],
        interpretations: [],
      },
      {
        id: 'cpi_6',
        text: '《蝶恋花》：双调六十字，上下片各五句四仄韵，声情缠绵，宜写情致。',
        plain: '蝶恋花：60 字双调仄韵。',
        annotations: [],
        interpretations: [],
      },
      {
        id: 'cpi_7',
        text: '《卜算子》：双调四十四字，上下片各四句两仄韵，「缺月挂疏桐」即用此调。',
        plain: '卜算子：44 字双调仄韵。',
        annotations: [],
        interpretations: [],
      },
      {
        id: 'cpi_8',
        text: '《清平乐》：双调四十六字，上片四句四仄韵，下片换押三平韵，是「换韵」的典型。',
        plain: '清平乐：46 字双调，上仄韵下平韵。',
        annotations: [],
        interpretations: [],
      },
      {
        id: 'cpi_9',
        text: '以《如梦令》逐句对谱：昨夜雨疏风骤（六字）、浓睡不消残酒（六字）、试问卷帘人（五字）、却道海棠依旧（六字）、知否（二字）、知否（叠）、应是绿肥红瘦（六字）——句句合谱，这就是「按谱填词」。',
        plain: '拿李清照这首逐句数一数字数：六六五六二二六，句句合谱。',
        annotations: [
          { term: '合谱', gloss: '每个字的安排都对上了词谱', type: '释词', note: '拿词对词牌逐句核对是读词的基本功' },
        ],
        interpretations: [],
      },
    ],
    structure: [
      { label: '词牌即曲谱', hint: '格式说明书', lineIndex: 0 },
      { label: '字数与用韵', hint: '双调/单调、平韵/仄韵', lineIndex: 1 },
      { label: '叠句与换韵', hint: '各词牌的标志', lineIndex: 4 },
      { label: '逐句对谱', hint: '拿《如梦令》核对一遍', lineIndex: 9 },
    ],
    steps: ['gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '《如梦令》里「知否，知否」两句连用，这种写法叫——？',
      options: ['叠句', '对仗', '排比'],
      answer: '叠句',
      explanation: '相连两句完全相同称叠句，《如梦令》必有一处，是该词牌的定式。',
    },
  },
  {
    id: 'cul_ge_fu_intro',
    kind: 'lecture',
    title: '歌与赋——能唱的诗与铺陈的文',
    goal: '分清乐府、歌行与赋，知道赋的「铺陈」是什么',
    minutes: 9,
    level: '诗词歌赋',
    source: '体裁通识 · 自撰讲义（术语释义参通行文学史口径）',
    plainSummary: [
      '歌是能唱的诗：乐府与歌行都属此类，句式自由。',
      '赋的骨架是铺陈——不急着叙事，先把声色说尽。',
      '读赋先看「对」与「偶」，三字短句连发就是它的声势。',
    ],
    lines: [
      {
        id: 'gfa',
        text: '乐府本是汉代采诗配乐的官署，后来变成诗体：可唱、句式自由，《江南》《上邪》皆是乐府。',
        plain: '乐府：从音乐官署名变成诗体名。',
        annotations: [
          { term: '乐府', pinyin: 'yuè fǔ', gloss: '汉代音乐官署，后成诗体名', type: '名物' },
        ],
        interpretations: [],
      },
      {
        id: 'gfb',
        text: '歌行是唐人的长篇可歌之诗：换韵自由、句式奔放，《将进酒》《长恨歌》都是歌行体。',
        plain: '歌行：唐朝的长篇可歌之诗，换韵自由。',
        annotations: [
          { term: '歌行', gloss: '句式自由、可歌可诵的古体诗', type: '名物', note: '常频繁换韵以配乐律动' },
        ],
        interpretations: [],
      },
      {
        id: 'gfc',
        text: '赋的骨架是铺陈：不急着叙事，先把景物声色层层排比说尽；汉大赋铺张，骈赋讲对偶，到唐宋变成散文化的文赋。',
        plain: '赋的流变：汉大赋 → 骈赋 → 文赋，骨子里都是铺陈。',
        annotations: [
          { term: '铺陈', gloss: '铺开陈述、层层排比', type: '释词' },
          { term: '骈赋', gloss: '讲对偶声律的赋，盛行于六朝', type: '名物', note: '「骈」即两马并驾，喻成双' },
          { term: '文赋', gloss: '散文化的赋，唐宋古文家改造', type: '名物', note: '《阿房宫赋》是文赋名篇' },
        ],
        interpretations: [
          { school: '刘勰《文心雕龙·诠赋》', dynasty: '南朝梁', text: '赋者，铺也，铺采摛文，体物写志也。', paraphrase: false, plain: '刘勰给「赋」下的经典定义：铺陈辞采、描摹事物、寄托情志——「铺陈」二字由此定死。' },
        ],
      },
      {
        id: 'gfd',
        text: '读赋先看「对」与「偶」：《阿房宫赋》开篇「六王毕，四海一；蜀山兀，阿房出」，三字短句连发，这就是赋的声势。',
        plain: '三字短句连发，就是赋的声势。',
        annotations: [
          { term: '六王毕', gloss: '六国灭亡；毕、一、兀、出四字急促收束', type: '释词', note: '四句写尽灭国与兴建' },
        ],
        interpretations: [
          { school: '通行古文评点口径', dynasty: '清以来', text: '《阿房宫赋》开篇四句三字急促，历来评为「以声势夺人」的赋家笔法。', paraphrase: true, plain: '大意：评家公认这十二个字靠节奏取胜，是赋体声势的教科书。' },
        ],
      },
    ],
    structure: [
      { label: '乐府', hint: '汉代的歌', lineIndex: 0 },
      { label: '歌行', hint: '唐人的长篇歌', lineIndex: 1 },
      { label: '赋的铺陈', hint: '骈赋→文赋', lineIndex: 2 },
      { label: '赋的声势', hint: '短句连发', lineIndex: 3 },
    ],
    steps: ['gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '「六王毕，四海一；蜀山兀，阿房出」这种三字短句连发，体现赋的什么特点？',
      options: ['铺陈声势', '含蓄婉约', '格律严整'],
      answer: '铺陈声势',
      explanation: '赋以铺陈为骨干，短句连发制造声势，正是「半诗半文」的写法。',
    },
  },
  {
    id: 'cul_shici_jingyesi',
    kind: 'read',
    title: '静夜思',
    goal: '读会第一首唐诗，体会「看月亮想家」',
    minutes: 10,
    level: '诗词歌赋',
    source: '《静夜思》唐·李白，通行本（宋刊本文字从众）',
    plainSummary: [
      '夜里睡不着，看见床前一片月光。',
      '恍惚间以为地上结了霜，抬头一看原来是月亮。',
      '低下头，想起远方的家。',
    ],
    lines: [
      {
        id: 'jys_1',
        text: '床前明月光，疑是地上霜。',
        pingze: '平平平仄平平仄仄仄平',
        plain: '床前一片月光，恍惚间以为是地上结了霜。',
        annotations: [
          { term: '疑', pinyin: 'yí', gloss: '怀疑、恍惚间当成', type: '释词', note: '月光清冷像霜，是秋夜共同感受' },
          { term: '霜', pinyin: 'shuāng', gloss: '秋霜', type: '释词', note: '霜是秋夜变冷的标志，暗点季节' },
        ],
        interpretations: [
          { school: '通行评点口径', dynasty: '今', text: '「疑是」二字写恍惚，是全诗最传神处。', paraphrase: true, plain: '大意：历代评家都认为「疑是」的恍惚感是此诗的诗眼。' },
        ],
      },
      {
        id: 'jys_2',
        text: '举头望明月，低头思故乡。',
        pingze: '仄平仄平仄平平平仄平',
        plain: '抬头望月亮，低头想故乡。',
        annotations: [
          { term: '举', gloss: '抬起', type: '释词', note: '举头与低头一对动作，写出从望月到思乡' },
        ],
        interpretations: [],
      },
    ],
    structure: [
      { label: '所见', hint: '床前的月光', lineIndex: 0 },
      { label: '所疑', hint: '以为是霜', lineIndex: 0 },
      { label: '所思', hint: '低头想家', lineIndex: 1 },
    ],
    steps: ['recite', 'gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '「疑是地上霜」的「疑」是什么意思？',
      options: ['怀疑、以为', '疑惑不解', '疑问句'],
      answer: '怀疑、以为',
      explanation: '这里是「恍惚间把月光当成了霜」，不是提出疑问。',
    },
  },
  {
    id: 'cul_shici_dengguanque',
    kind: 'read',
    title: '登鹳雀楼',
    goal: '认识诗里的「对仗」，看两句怎么互相成对',
    minutes: 10,
    level: '诗词歌赋',
    source: '《登鹳雀楼》唐·王之涣，通行本',
    plainSummary: [
      '夕阳贴着山落下，黄河朝海奔流。',
      '想看得更远，就要再上一层楼。',
      '前两句一写山一写水，正好是对仗的样板。',
    ],
    lines: [
      {
        id: 'dgl_1',
        text: '白日依山尽，黄河入海流。',
        pingze: '仄仄平平仄平平仄仄平',
        plain: '夕阳贴着山慢慢落下，黄河朝着大海奔流。',
        annotations: [
          { term: '依', gloss: '靠着、贴着，写出日落的速度很缓', type: '释词' },
          { term: '尽', pinyin: 'jìn', gloss: '落尽、到头', type: '释词', note: '「尽」与「流」都是收尾动作，一句山一句海' },
        ],
        interpretations: [],
      },
      {
        id: 'dgl_2',
        text: '欲穷千里目，更上一层楼。',
        pingze: '仄平平仄仄仄仄仄平平',
        plain: '想看尽千里风光，就要再上一层楼。',
        annotations: [
          { term: '穷', pinyin: 'qióng', gloss: '穷尽、看尽', type: '释词', note: '「穷」由「尽头」引申为「看尽」，是全诗的诗眼' },
          { term: '更', gloss: '再、又', type: '释词', note: '与「欲」呼应：先有愿望，再给办法' },
        ],
        interpretations: [
          { school: '历代评点口径', dynasty: '清以来', text: '有评者推此诗为五言绝句压卷之作。', paraphrase: true, plain: '大意：清以来不少评家把它推为五绝压卷，理由正是后二句翻出新意。' },
        ],
      },
    ],
    structure: [
      { label: '写景', hint: '一山一海，两句成对', lineIndex: 0 },
      { label: '说理', hint: '想看得远，就再上楼', lineIndex: 1 },
    ],
    steps: ['recite', 'gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '「白日依山尽」对「黄河入海流」，两句平仄正好——？',
      options: ['相反', '相同', '没有关系'],
      answer: '相反',
      explanation: '仄仄平平仄 对 平平仄仄平，逐位相反，这就是近体诗的对仗。',
    },
  },
  {
    id: 'cul_shici_yijiangnan',
    kind: 'read',
    title: '忆江南',
    goal: '第一次读词：词有词牌，句子长短不齐',
    minutes: 10,
    level: '诗词歌赋',
    source: '《忆江南》唐·白居易，通行本',
    plainSummary: [
      '词牌「忆江南」规定了这首词的句子长短。',
      '白居易回忆江南：日出时江边的花比火还红。',
      '结尾反问一句：怎么能不想江南？',
    ],
    lines: [
      {
        id: 'yjn_1',
        text: '江南好，风景旧曾谙。',
        plain: '江南好，那里的风景我从前就很熟悉。',
        annotations: [
          { term: '谙', pinyin: 'ān · 此处读「安」', gloss: '熟悉', type: '释词', note: '白居易做过杭州刺史，江南于他不是初见' },
        ],
        interpretations: [
          { school: '白居易原注', dynasty: '唐', text: '白居易原词题下自注：此曲亦名《谢秋娘》。', paraphrase: true, plain: '大意：作者自己注明「忆江南」这个曲调又叫《谢秋娘》，是现成的曲子。' },
        ],
      },
      {
        id: 'yjn_2',
        text: '日出江花红胜火，春来江水绿如蓝。',
        plain: '日出时江边的花比火还红，春天江水绿得像蓝草。',
        annotations: [
          { term: '胜', pinyin: 'shèng', gloss: '超过', type: '释词', note: '「胜火」「如蓝」两个比喻把颜色写活' },
          { term: '蓝', pinyin: 'lán', gloss: '蓝草，可制青色染料', type: '名物', note: '古汉语「蓝」本义是草，不是颜色' },
        ],
        interpretations: [],
      },
      {
        id: 'yjn_3',
        text: '能不忆江南？',
        plain: '怎么能不想江南呢？',
        annotations: [],
        interpretations: [],
      },
    ],
    structure: [
      { label: '总起', hint: '一句「江南好」', lineIndex: 0 },
      { label: '铺陈', hint: '花与水，红与绿', lineIndex: 1 },
      { label: '收束', hint: '反问收尾', lineIndex: 2 },
    ],
    steps: ['recite', 'gloss', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '「春来江水绿如蓝」的「蓝」指什么？',
      options: ['蓝草（植物）', '蓝色', '蓝天'],
      answer: '蓝草（植物）',
      explanation: '古汉语「蓝」本义是可提炼青色染料的草，此处比喻江水的绿。',
    },
  },
];
