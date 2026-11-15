// T1 经传精读 · 精读课（P0：Z07 乾卦精读、Z10 系辞上精读；其余 Z08、Z09、Z11、Z12 P1 待补）。
// ★ 全部人工预写；原文逐句一律不得改字；每行 annotations≥1、interpretations≥1；
//   interpretations 只收确切记得的注语原文，记不准一律 paraphrase=true 标「大意转述」。
import type { ZhouyiLesson } from './types.js';

export const T1_LESSONS: ZhouyiLesson[] = [
  {
    id: 'zy_z07',
    kind: 'read',
    track: 'T1',
    branch: '经部易类',
    title: '乾卦精读：卦辞、六爻、用九',
    goal: '逐句精读乾卦经文，配合《象传》《文言》分层理解',
    minutes: 18,
    ready: true,
    source: '《周易·乾》：经文卦爻辞 + 《象传》《文言》节选，通行本（十三经注疏本）',
    plainSummary: [
      '乾卦是六十四卦第一卦，六爻全是阳爻，讲一条龙的成长史。',
      '卦辞「元亨利贞」四个字，文言把它讲成四种美德。',
      '从潜龙勿用到亢龙有悔，象传给每一爻都配了一句解释。',
    ],
    lines: [
      {
        id: 'q01',
        text: '乾：元亨利贞。',
        plain: '乾卦卦辞：元亨，利贞——大亨通，利于守正。',
        annotations: [
          { term: '元', gloss: '始、大；卦辞四德之首', type: '释词', note: '旧注以元亨利贞为四德，一说断作「元亨，利贞」两句读' },
          { term: '亨', pinyin: 'hēng', gloss: '通达、亨通', type: '释词' },
          { term: '贞', gloss: '正而固守；一说占问之本义', type: '释词' },
        ],
        interpretations: [
          { kind: '传', school: '《乾·文言》', dynasty: '先秦至汉', text: '元者，善之长也；亨者，嘉之会也；利者，义之和也；贞者，事之干也。', paraphrase: false, plain: '《文言》以四德释四字：元为众善之首，亨为美善之会，利为义之和合，贞为做事的骨干。' },
        ],
        blocks: [
          { kind: 'hexagram', lines: [1, 1, 1, 1, 1, 1], caption: '乾：六爻皆阳' },
        ],
      },
      {
        id: 'q02',
        text: '初九：潜龙勿用。',
        plain: '初九爻：潜伏的龙，不要有所作为。',
        annotations: [
          { term: '初九', gloss: '第一爻为「初」，阳爻称「九」；自下而上第一位', type: '名物' },
          { term: '潜龙', gloss: '潜伏在水下的龙，喻阳气初生而时位未至', type: '比喻' },
          { term: '勿用', gloss: '不可施用、不宜有所行动', type: '释词' },
        ],
        interpretations: [
          { kind: '传', school: '《乾·象传》', dynasty: '先秦至汉', text: '潜龙勿用，阳在下也。', paraphrase: false, plain: '《小象》解释：说潜龙勿用，是因为阳气还处在最下面一爻。' },
        ],
      },
      {
        id: 'q03',
        text: '九二：见龙在田，利见大人。',
        plain: '九二爻：龙出现在田野，有利于拜见大人物。',
        annotations: [
          { term: '见龙', pinyin: 'xiàn lóng', gloss: '「见」通「现」，龙出现', type: '通假' },
          { term: '田', gloss: '地上、田野；喻已出于下而未居高位', type: '释词' },
          { term: '利见大人', pinyin: 'lì jiàn dà rén', gloss: '利于见德位兼备之人；旧说「见」亦读现，见而利', type: '释词' },
        ],
        interpretations: [
          { kind: '传', school: '《乾·象传》', dynasty: '先秦至汉', text: '见龙在田，德施普也。', paraphrase: false, plain: '《小象》解释：龙出现在田野，德泽开始普遍施及于外。' },
        ],
      },
      {
        id: 'q04',
        text: '九三：君子终日乾乾，夕惕若厉，无咎。',
        plain: '九三爻：君子整天勤勉自强，到夜里仍警惕戒惧，虽处危境也无害。',
        annotations: [
          { term: '乾乾', gloss: '健行不息、勤勉自强貌', type: '释词' },
          { term: '惕', pinyin: 'tì', gloss: '警惕、戒惧', type: '释词' },
          { term: '厉', gloss: '危险、危厉', type: '释词' },
          { term: '无咎', pinyin: 'wú jiù', gloss: '没有灾祸过错的断语', type: '名物' },
        ],
        interpretations: [
          { kind: '传', school: '《乾·象传》', dynasty: '先秦至汉', text: '终日乾乾，反复道也。', paraphrase: false, plain: '《小象》解释：整日自强不息，是反复践行此道。' },
        ],
      },
      {
        id: 'q05',
        text: '九四：或跃在渊，无咎。',
        plain: '九四爻：或者跃起、或者在深渊，进退未定，没有祸害。',
        annotations: [
          { term: '或', gloss: '不定之词：或者、或许，喻进退未定', type: '释词' },
          { term: '渊', gloss: '深水，龙之所处；九四居上卦之下，故取渊象', type: '比喻' },
        ],
        interpretations: [
          { kind: '传', school: '《乾·象传》', dynasty: '先秦至汉', text: '或跃在渊，进无咎也。', paraphrase: false, plain: '《小象》解释：或跃在渊，是说此时上前也不会有咎害。' },
        ],
      },
      {
        id: 'q06',
        text: '九五：飞龙在天，利见大人。',
        plain: '九五爻：龙飞在天上，有利于见大人物——全卦最尊之位。',
        annotations: [
          { term: '九五', gloss: '阳爻居第五位，得中得正，旧称「九五之尊」之所本', type: '名物' },
          { term: '飞龙在天', gloss: '喻德位兼备、居高而下泽', type: '比喻' },
        ],
        interpretations: [
          { kind: '传', school: '《乾·象传》', dynasty: '先秦至汉', text: '飞龙在天，大人造也。', paraphrase: false, plain: '《小象》解释：飞龙在天，是说大人物有所兴起作为。' },
        ],
      },
      {
        id: 'q07',
        text: '上九：亢龙有悔。',
        plain: '上九爻：亢进的龙，会有悔恨——升到顶点而不退。',
        annotations: [
          { term: '上九', gloss: '最上一爻；居卦之极', type: '名物' },
          { term: '亢', pinyin: 'kàng', gloss: '极高、过度亢进', type: '释词' },
          { term: '悔', gloss: '悔恨、憾惜；悔吝为易之小凶断语', type: '名物' },
        ],
        interpretations: [
          { kind: '传', school: '《乾·象传》', dynasty: '先秦至汉', text: '亢龙有悔，盈不可久也。', paraphrase: false, plain: '《小象》解释：亢龙有悔，因为满盈的状态不能持久。' },
        ],
      },
      {
        id: 'q08',
        text: '用九：见群龙无首，吉。',
        plain: '用九：出现一群龙而没有谁以首领自居，吉利。',
        annotations: [
          { term: '用九', gloss: '乾卦特有之辞：六爻皆老阳全变时的断语', type: '名物' },
          { term: '无首', gloss: '不以首领自居、不居首出之位', type: '释词' },
        ],
        interpretations: [
          { kind: '传', school: '《乾·象传》', dynasty: '先秦至汉', text: '天德不可为首也。', paraphrase: false, plain: '《小象》解释：天的德性就是不居首位、不自居主宰。' },
        ],
      },
      {
        id: 'q09',
        text: '《象》曰：天行健，君子以自强不息。',
        plain: '大象传：天道运行刚健不止，君子效法它，自强不息。',
        annotations: [
          { term: '天行健', gloss: '天道之运行刚健不息；行，运行', type: '释词' },
          { term: '君子以', gloss: '大象传固定句式：君子借此卦象而如何', type: '句式', note: '六十四卦大象皆用「君子以（或先王以、后以）」句式' },
        ],
        interpretations: [
          { kind: '古注·大意', school: '孔颖达《周易正义》', dynasty: '唐', text: '正义曰：天行健者，谓天体之行昼夜不息，周而复始。', paraphrase: true, plain: '大意：孔颖达疏解说，天行健指天体的运行昼夜不停、周而复始（此句为转述，原文校对后可升级为逐字引文）。' },
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '此句为千古名句，亦是「以德读卦」大象体例的范本：先言天道，后言人事。', paraphrase: true, plain: '大意：先讲天道，再落到君子该怎么做，这是大象传的固定套路。' },
        ],
      },
      {
        id: 'q10',
        text: '元者，善之长也；亨者，嘉之会也；利者，义之和也；贞者，事之干也。',
        plain: '文言释卦辞：元是众善之首，亨是美善之会聚，利是义之和合，贞是做事的主干。',
        annotations: [
          { term: '嘉', gloss: '美好', type: '释词' },
          { term: '干', gloss: '主干、根本，如「干」为草木之茎', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '《文言》以伦理四德释卦辞四字，是将占筮断语道德化的代表段落。', paraphrase: true, plain: '大意：文言把占卜用语讲成了四种品德，这是典型的儒家化解读。' },
        ],
      },
      {
        id: 'q11',
        text: '君子体仁足以长人，嘉会足以合礼，利物足以和义，贞固足以干事。君子行此四德者，故曰：乾：元亨利贞。',
        plain: '君子身体力行仁德足以做人的表率，会聚美善足以合于礼，使物各得其利足以和于义，守正坚固足以成就事功。行了这四种德，所以说乾元亨利贞。',
        annotations: [
          { term: '体仁', gloss: '以仁为体，即亲身践行仁德', type: '释词' },
          { term: '长人', pinyin: 'zhǎng rén', gloss: '为人之长、统领众人', type: '释词' },
          { term: '贞固', gloss: '守正而坚固不移', type: '释词' },
        ],
        interpretations: [
          { kind: '古注·大意', school: '朱熹《周易本义》', dynasty: '宋', text: '朱熹于此申言元亨利贞为天道之四德，而君子法之以修己治人。', paraphrase: true, plain: '大意：朱熹说这四个字先是天的四德，君子效法它来修身做事。' },
        ],
      },
      {
        id: 'q12',
        text: '初九曰「潜龙勿用」，何谓也？子曰：龙德而隐者也。不易乎世，不成乎名，遁世无闷，不见是而无闷。乐则行之，忧则违之，确乎其不可拔，潜龙也。',
        plain: '初九说潜龙勿用，什么意思？孔子说：这是有龙的品德而隐居的人。不随世俗改变，不追求名声，避世而不烦闷，不被肯定也不烦闷。喜欢的就去做，忧患的就避开，坚定而不可动摇，这就是潜龙。',
        annotations: [
          { term: '遁世无闷', pinyin: 'dùn shì wú mèn', gloss: '避世隐居而心中没有烦闷', type: '释词' },
          { term: '不见是', gloss: '不被世人肯定、认可', type: '释词' },
          { term: '确乎其不可拔', gloss: '坚定得不可动摇；拔，移易', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '此为《文言》「子曰」问答体例之首例：先设问，再托孔子作答，将爻辞义理化。', paraphrase: true, plain: '大意：文言喜欢用「孔子说」的问答形式来发挥爻辞的含义。' },
        ],
      },
      {
        id: 'q13',
        text: '亢之为言也，知进而不知退，知存而不知亡，知得而不知丧。其唯圣人乎！知进退存亡而不失其正者，其唯圣人乎！',
        plain: '「亢」的意思是：只知道进而不知道退，只知道存而不知道亡，只知道得而不知道失。只有圣人吧！懂得进退存亡而不偏离正道的，只有圣人吧！',
        annotations: [
          { term: '丧', pinyin: 'sàng', gloss: '丧失、失去', type: '释词' },
          { term: '不失其正', gloss: '不偏离正道；全段之归结', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '文言以「进退存亡」四字收束乾卦：知进亦知退，才是「有悔」一爻的正解。', paraphrase: true, plain: '大意：亢龙有悔的答案就是——知道什么时候该退。' },
        ],
      },
    ],
    structure: [
      { label: '卦辞四德', hint: '元亨利贞，文言四德释之', lineIndex: 0 },
      { label: '六爻历程', hint: '潜、见、惕、跃、飞、亢', lineIndex: 1 },
      { label: '用九与天德', hint: '群龙无首，天德不为首', lineIndex: 7 },
      { label: '大象垂教', hint: '天行健，君子自强不息', lineIndex: 8 },
      { label: '文言义理', hint: '四德、问答、进退存亡', lineIndex: 9 },
    ],
    steps: ['gloss', 'annotate', 'interpret', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '乾卦六爻中居最尊之位（得中得正）的是哪一爻？',
      options: ['九五', '上九', '九三'],
      answer: '九五',
      explanation: '九五居上卦之中又当阳位，飞龙在天，故旧称帝王之位为「九五之尊」。',
    },
    sources: [
      { work: '周易·乾（经文及彖象文言）', author: '王弼、韩康伯注，孔颖达疏', dynasty: '魏晋·唐', edition: '通行十三经注疏本（维基文库、中国哲学书电子化计划有录）', license: '公版' },
    ],
  },
  {
    id: 'zy_z10',
    kind: 'read',
    track: 'T1',
    branch: '经部易类',
    title: '《系辞上》精读：一阴一阳之谓道',
    goal: '精读《系辞上》核心章句，掌握其哲学纲领',
    minutes: 15,
    ready: true,
    source: '《周易·系辞上》节选，通行本（十三经注疏本）',
    plainSummary: [
      '系辞是十翼中最重要的总论，本课读它的五个核心章句。',
      '「一阴一阳之谓道」是全部易学哲学的总纲领。',
      '太极生两仪、大衍之数两段，把宇宙论和筮法接在一起。',
    ],
    lines: [
      {
        id: 'x01',
        text: '天尊地卑，乾坤定矣。卑高以陈，贵贱位矣。',
        plain: '天高在上，地在下，乾坤两卦的地位就这样确定了。低与高陈列出来，贵与贱的位置也就分定了。',
        annotations: [
          { term: '尊', gloss: '高、在上；与「卑」相对', type: '释词' },
          { term: '陈', gloss: '陈列、排布', type: '释词' },
          { term: '位', gloss: '用作动词：各居其位', type: '句式' },
        ],
        interpretations: [
          { kind: '经内互证', school: '《说卦传》', dynasty: '先秦至汉', text: '乾，健也。坤，顺也。', paraphrase: false, plain: '《说卦》给乾坤定性为健与顺，可与「乾坤定矣」互证：乾坤是全经的总纲二卦。' },
          { kind: '古注·大意', school: '朱熹《周易本义》', dynasty: '宋', text: '朱熹谓此章言圣人作易因观天地而立卦位，尊卑贵贱皆取象于自然。', paraphrase: true, plain: '大意：朱熹说这段是在讲圣人观察天地来定卦位，贵贱取法自然。' },
        ],
      },
      {
        id: 'x02',
        text: '一阴一阳之谓道，继之者善也，成之者性也。',
        plain: '一阴一阳交替运转就叫做道，继承它的是善，成就它的是性。',
        annotations: [
          { term: '一阴一阳', gloss: '阴与阳的交替消长，非谓一阴加一阳', type: '释词' },
          { term: '继之者', gloss: '承继此道而行的（在人则善）', type: '释词' },
          { term: '成之者性', gloss: '使此道落实成就的（在物则性）', type: '释词' },
        ],
        interpretations: [
          { kind: '古注·大意', school: '程颐《伊川易传》', dynasty: '宋', text: '程子以「所以阴阳者」为道，谓阴阳是气，所以阴阳交替之理才是道。', paraphrase: true, plain: '大意：程颐说阴阳只是气，让阴阳这样运转的那个道理才叫道。' },
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '此句被公认为《系辞》哲学纲领，历代注家之争多集中于「道在阴阳之上还是在阴阳之中」。', paraphrase: true, plain: '大意：这句是全系辞最重要的一句，争论点是道和阴阳谁包含谁。' },
        ],
      },
      {
        id: 'x03',
        text: '易有太极，是生两仪，两仪生四象，四象生八卦。',
        plain: '易有太极，太极生出两仪（阴阳），两仪生出四象（太阳少阴少阳太阴），四象生出八卦。',
        annotations: [
          { term: '太极', gloss: '至高无上的本原，天地未分之总体现', type: '名物' },
          { term: '两仪', gloss: '阴与阳；一说指天地', type: '释词' },
          { term: '四象', gloss: '太阳、少阴、少阳、太阴四组符号（一说四季）', type: '释词' },
        ],
        interpretations: [
          { kind: '古注·大意', school: '孔颖达《周易正义》', dynasty: '唐', text: '孔疏以太极为天地未分之前的元气浑沦状态，由一而二、由二而四递生。', paraphrase: true, plain: '大意：孔颖达说太极就是天地没分开时那团元气，一层层分下去。' },
          { kind: '经内互证', school: '《系辞下》', dynasty: '先秦至汉', text: '八卦成列，象在其中矣。', paraphrase: false, plain: '《系辞下》「八卦成列」章可与本句互证：八卦由符号递生而成，非凭空立名。' },
        ],
      },
      {
        id: 'x04',
        text: '大衍之数五十，其用四十有九。',
        plain: '大衍之数是五十，实际用来揲蓍的是四十九根。',
        annotations: [
          { term: '大衍', gloss: '大演，即以蓍草大演其数的筮法专名', type: '名物' },
          { term: '四十有九', gloss: '四十九；「有」通「又」', type: '通假' },
          { term: '衍', pinyin: 'yǎn', gloss: '推演、演算', type: '释词' },
        ],
        interpretations: [
          { kind: '古注·大意', school: '朱熹《周易本义》', dynasty: '宋', text: '朱熹以其中一数不用为太极之体，所用四十九为用，体用之说自此立。', paraphrase: true, plain: '大意：朱熹解释那「不用的一根」代表太极，四十九是它的用。' },
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '「五十」何以用「四十九」、虚一何指，历代聚讼千年无定论，本课程只呈现诸说并存。', paraphrase: true, plain: '大意：为什么五十只用四十九，这个问题吵了一千年，没有标准答案。' },
        ],
      },
      {
        id: 'x05',
        text: '穷则变，变则通，通则久。',
        plain: '走到尽头就要变化，变化就能通达，通达就能长久。',
        annotations: [
          { term: '穷', gloss: '极、尽头；非「贫穷」义', type: '释词' },
          { term: '通', gloss: '通达、无碍', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '此九字为「变易」宗旨的最凝练表达：易之为书，以变为常。', paraphrase: true, plain: '大意：这九个字就是「变易」两个字最好的注脚。' },
        ],
      },
    ],
    structure: [
      { label: '乾坤定位', hint: '天尊地卑，卦位取法自然', lineIndex: 0 },
      { label: '道之纲领', hint: '一阴一阳之谓道', lineIndex: 1 },
      { label: '宇宙生成', hint: '太极两仪四象八卦', lineIndex: 2 },
      { label: '筮法之数', hint: '大衍五十，用四十九', lineIndex: 3 },
      { label: '变易宗旨', hint: '穷变通久', lineIndex: 4 },
    ],
    steps: ['gloss', 'annotate', 'interpret', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '「一阴一阳之谓道」中，「一阴一阳」指的是什么？',
      options: ['阴与阳的交替消长', '一半阴一半阳的组合', '先有阴后有阳'],
      answer: '阴与阳的交替消长',
      explanation: '旧注通说：一阴一阳言其交替运转、消长不息，而非静态的各占一半。',
    },
    sources: [
      { work: '周易·系辞上（节选）', author: '王弼、韩康伯注，孔颖达疏', dynasty: '魏晋·唐', edition: '通行十三经注疏本（维基文库、中国哲学书电子化计划有录）', license: '公版' },
    ],
  },
  {
    id: 'zy_z08',
    kind: 'read',
    track: 'T1',
    branch: '经部易类',
    title: '坤卦精读与乾坤《文言》',
    goal: '精读坤卦经文与乾坤二卦文言',
    minutes: 18,
    ready: true,
    source: '《周易·坤》：卦爻辞 + 《象传》《文言》节选，通行本（十三经注疏本）',
    plainSummary: [
      '坤卦六爻皆阴，与乾相对，讲柔顺承载之道。',
      '卦辞以牝马取象：不当争先，随后而行才得其主。',
      '文言总括坤德：至柔而动刚，承天而时行，积善有余庆。',
    ],
    lines: [
      {
        id: 'k08_1',
        text: '元亨，利牝马之贞。君子有攸往，先迷后得主，利西南得朋，东北丧朋。安贞吉。',
        plain: '坤卦卦辞：利于像母马那样守正。君子有所往，抢先会迷失，随后才得其主；往西南得朋友，往东北失朋友。安于守正则吉。',
        annotations: [
          { term: '牝马', pinyin: 'pìn mǎ', gloss: '母马；坤为地为母，牝马柔顺而善行远，取其顺守之象', type: '名物' },
          { term: '先迷后得主', gloss: '抢先居首则迷失，随后而行才得其主', type: '释词' },
          { term: '东北丧朋', gloss: '往东北方则失去朋侣；旧说以卦位阴阳解得朋丧朋', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '坤卦辞全以柔顺立言：牝马性顺而善行远，故取为坤象；「先迷后得主」与乾之「为首」相对，两卦辞首尾互照。', paraphrase: true, plain: '大意：坤卦辞句句讲柔顺，跟乾卦处处对着写。' },
          { kind: '古注·大意', school: '朱熹《周易本义》', dynasty: '宋', text: '朱熹以牝马为地类顺行之象，谓坤之利贞在于柔顺而守正。', paraphrase: true, plain: '大意：朱熹说牝马是柔顺走远路的地类，坤要顺而正才利。' },
        ],
        blocks: [
          { kind: 'hexagram', lines: [0, 0, 0, 0, 0, 0], caption: '坤：六爻皆阴' },
        ],
      },
      {
        id: 'k08_2',
        text: '初六：履霜，坚冰至。六二：直方大，不习无不利。六三：含章可贞。',
        plain: '初六：踩到霜，坚冰就要来了。六二：正直、方正、广大，不刻意练习也无所不利。六三：内含文采而可以守正。',
        annotations: [
          { term: '履霜', gloss: '踩踏霜地；霜为阴气初凝之象', type: '释词' },
          { term: '直方大', gloss: '直则正、方则义、大则容；六二坤德之纯', type: '释词' },
          { term: '含章可贞', gloss: '内含文采章美而能守正不露', type: '释词' },
        ],
        interpretations: [
          { kind: '传', school: '《坤·文言》', dynasty: '先秦至汉', text: '积善之家，必有余庆；积不善之家，必有余殃。', paraphrase: false, plain: '《文言》承「履霜坚冰」而发：善恶之报皆由渐积而至，如霜之与冰——此即坤卦「见微知著」的著名发挥。' },
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '三爻连读可见坤卦的节奏：初六言微兆，六二言全德，六三言敛藏；阴气积渐、才能内蕴，是这三爻共同的口吻。', paraphrase: true, plain: '大意：初爻看苗头，二爻讲全德，三爻讲收敛。' },
        ],
      },
      {
        id: 'k08_3',
        text: '六四：括囊，无咎无誉。六五：黄裳，元吉。上六：龙战于野，其血玄黄。用六：利永贞。',
        plain: '六四：扎紧口袋，没有灾祸也没有赞誉。六五：黄色裙裳，大吉。上六：龙在原野上交战，流出的血青黄相杂。用六：利于永久守正。',
        annotations: [
          { term: '括囊', pinyin: 'kuò náng', gloss: '束紧囊口，喻缄口不言、闭藏不出', type: '比喻' },
          { term: '黄裳', gloss: '黄色下衣；黄为中色，裳为下饰，居中守下故元吉', type: '名物' },
          { term: '玄黄', gloss: '青黑色与黄色相杂；旧说天地交战之血色', type: '释词' },
          { term: '利永贞', gloss: '利于永远守正；用六为六爻皆阴全变之断语', type: '名物' },
        ],
        interpretations: [
          { kind: '古注·大意', school: '《坤·象传》', dynasty: '先秦至汉', text: '小象释上六：龙战于野，是坤阴之道已穷极所致。', paraphrase: true, plain: '大意：小象说，龙战于野是因为坤阴走到了尽头。' },
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '上六坤阴极盛而与阳交战，与乾上九「亢龙有悔」同为卦极之戒：盛极而穷，两卦收尾一唱一和。', paraphrase: true, plain: '大意：坤的上六和乾的上九一样，都是「到顶就危险」的警告。' },
        ],
      },
      {
        id: 'k08_4',
        text: '地势坤，君子以厚德载物。履霜坚冰，阴始凝也。驯致其道，至坚冰也。',
        plain: '大象传：地势柔顺，君子效法它，以深厚的德行承载万物。小象释初六：履霜坚冰，是阴气开始凝结；顺着这个趋势发展下去，就会到坚冰。',
        annotations: [
          { term: '地势坤', gloss: '大地之势柔顺承载，即坤之象', type: '释词' },
          { term: '厚德载物', gloss: '增厚德行、承载万物；与乾「自强不息」相对', type: '典故' },
          { term: '驯致', pinyin: 'xún zhì', gloss: '顺其趋势逐渐而至；驯，顺习', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '「厚德载物」与乾卦「自强不息」一静一动，同为大象垂教的名句；两句连读，乾坤之教即全书之教。', paraphrase: true, plain: '大意：厚德载物跟自强不息配成一对，合起来就是全书的人生观。' },
          { kind: '古注·大意', school: '孔颖达《周易正义》', dynasty: '唐', text: '孔疏谓地势柔顺而能博载，君子法之以增厚其德。', paraphrase: true, plain: '大意：孔颖达说大地柔顺而能普遍承载，君子学它来增厚德行。' },
        ],
      },
      {
        id: 'k08_5',
        text: '坤至柔而动也刚，至静而德方，后得主而有常，含万物而化光。坤道其顺乎，承天而时行。',
        plain: '坤柔顺到极点而运行起来却刚强，宁静到极点而德性方正，随后才得其主而行动有常，包容万物而化育光大。坤道就是这样顺从吧——承奉天道而按时运行。',
        annotations: [
          { term: '至静而德方', gloss: '极为宁静而德性方正；柔静为坤之体，刚方为其用', type: '释词' },
          { term: '含万物而化光', gloss: '含养万物而其化育光大', type: '释词' },
          { term: '承天而时行', gloss: '承奉天道而按时节运行', type: '释词' },
        ],
        interpretations: [
          { kind: '古注·大意', school: '孔颖达《周易正义》', dynasty: '唐', text: '孔疏申言坤德柔顺而禀气至刚，至静之中自有方正之德。', paraphrase: true, plain: '大意：孔颖达说坤外表柔顺，骨子里自有刚强方正的德性。' },
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '「后得主」回应卦辞「先迷后得主」：文言把它升格为坤道总纲——不争先、承天而动，柔顺方能有常。', paraphrase: true, plain: '大意：文言把卦辞那句「后得主」讲成了坤道的总原则：不抢跑。' },
        ],
      },
      {
        id: 'k08_6',
        text: '《乾·文言》已在乾卦精读课逐句读过：乾文言言刚健中正与进退存亡，坤文言言柔顺积渐；两篇对读，方见乾坤并建、刚柔相济的全局。',
        plain: '乾卦的文言在乾卦课里已逐句读过：乾文言讲刚健与进退，坤文言讲柔顺与积渐；两篇对照着读，才看得全乾坤并立的大格局。',
        annotations: [
          { term: '乾·文言', gloss: '《文言传》释乾卦之章节，与坤文言相对成篇', type: '名物' },
          { term: '坤文言', gloss: '《文言传》释坤卦之章节', type: '名物' },
          { term: '刚柔相济', gloss: '刚与柔相互调剂补充', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '文言传只释乾坤两卦，是因为这两卦为六十四卦之门户；其余六十二卦，皆乾坤二德之变化组合。', paraphrase: true, plain: '大意：文言只写乾坤两卦，因为其余卦都是这两卦的变体。' },
        ],
      },
    ],
    structure: [
      { label: '卦辞', hint: '牝马之贞，先迷后得主', lineIndex: 0 },
      { label: '初六至六三', hint: '履霜、直方大、含章', lineIndex: 1 },
      { label: '六四至上六', hint: '括囊、黄裳、龙战', lineIndex: 2 },
      { label: '象传垂教', hint: '厚德载物，驯致坚冰', lineIndex: 3 },
      { label: '文言总义', hint: '至柔而动刚，承天时行', lineIndex: 4 },
    ],
    steps: ['gloss', 'annotate', 'interpret', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '《坤》卦辞以什么动物取象？',
      options: ['牝马', '潜龙', '黄裳'],
      answer: '牝马',
      explanation: '坤卦辞「利牝马之贞」：牝马柔顺而善行远，正合坤德；黄裳是六五爻辞，潜龙属乾卦。',
    },
    sources: [
      { work: '周易·坤（经文及象传、文言）', author: '王弼、韩康伯注，孔颖达疏', dynasty: '魏晋·唐', edition: '通行十三经注疏本（维基文库有录）', license: '公版' },
    ],
  },
  {
    id: 'zy_z09',
    kind: 'read',
    track: 'T1',
    branch: '经部易类',
    title: '卦序与《序卦传》',
    goal: '精读序卦传，理解通行本卦序的逻辑',
    minutes: 12,
    ready: true,
    source: '《周易·序卦传》首章 + 通行易学史口径讲解（十三经注疏本）',
    plainSummary: [
      '序卦传用一条因果链解释六十四卦的先后次序。',
      '孔颖达又发现卦序「二二相耦，非覆即变」的结构规律。',
      '帛书卦序与通行本不同，说明古来卦序不止一种。',
    ],
    lines: [
      {
        id: 'xg09_1',
        text: '有天地，然后万物生焉。盈天地之间者唯万物，故受之以屯。屯者，盈也；屯者，物之始生也。',
        plain: '有了天地，然后万物才产生。充盈天地之间的只有万物，所以接下来是屯卦。屯是充盈；屯，是万物开始生长。',
        annotations: [
          { term: '盈天地之间', gloss: '充盈于天地之间', type: '释词' },
          { term: '受之', gloss: '序卦固定句式：前卦之后接着受以某卦', type: '句式' },
          { term: '屯', pinyin: 'zhūn', gloss: '卦名：万物初生而艰难充盈之象', type: '名物' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '序卦开篇即以「天地—万物—屯」立因果链：它的解释方式不是象数推演，而是字义串联，这一风格贯穿全篇。', paraphrase: true, plain: '大意：序卦的逻辑是字义串字义，一路「所以接着是」下来。' },
          { kind: '古注·大意', school: '孔颖达《周易正义·序卦疏》', dynasty: '唐', text: '孔疏谓乾坤为万物之始，故序卦先言有天地，而后万物生焉。', paraphrase: true, plain: '大意：孔颖达说乾坤是万物起点，所以序卦从天地讲起。' },
        ],
      },
      {
        id: 'xg09_2',
        text: '《序卦传》是十翼中唯一解释「六十四卦为何如此排列」的传文：它不谈爻位与象数，而用一条因果句链，把前后诸卦串成义理相承的次第。',
        plain: '序卦传是十翼里唯一专门解释「卦为什么这么排」的一篇：它不讲爻位象数，而用因果句把前后各卦串成一条线。',
        annotations: [
          { term: '序卦传', gloss: '十翼之一，叙六十四卦先后次序之义', type: '名物' },
          { term: '因果句链', gloss: '以「故受之以某」层层承接的句式', type: '句式' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '序卦的串讲在汉人眼里是圣人手笔，后世已疑其解释力有限；今天多把它当作对卦序的追补性说明，而非排卦的逻辑本身。', paraphrase: true, plain: '大意：古人把序卦当圣人之言，今天多把它看成事后追补的说明。' },
        ],
      },
      {
        id: 'xg09_3',
        text: '唐代孔颖达在《周易正义》中提出，通行本卦序「二二相耦，非覆即变」：六十四卦两两成对，或上下颠倒（覆），或六爻阴阳全反（变）。',
        plain: '孔颖达在周易正义里提出：通行本卦序两两成对，不是上下颠倒（覆），就是六爻全反（变）。',
        annotations: [
          { term: '孔颖达', gloss: '唐代经学家，奉敕撰周易正义', type: '典故' },
          { term: '二二相耦', gloss: '六十四卦两两配对成组', type: '释词' },
          { term: '非覆即变', gloss: '卦对规律：非上下相倒即六爻全反', type: '典故' },
        ],
        interpretations: [
          { kind: '古注·大意', school: '孔颖达《周易正义·序卦疏》', dynasty: '唐', text: '孔疏谓六十四卦二二相耦，非覆即变；覆者如屯蒙相倒，变者如乾坤全反。', paraphrase: true, plain: '大意：孔颖达举例说屯蒙互为颠倒，乾坤互为全反。' },
          { kind: '传', school: '《杂卦传》', dynasty: '先秦至汉', text: '乾刚坤柔，比乐师忧。', paraphrase: false, plain: '《杂卦》以相对之义概括卦性：乾刚与坤柔相对，比乐与师忧相对——这种两两相对的眼光，可与覆变规律参看。' },
        ],
      },
      {
        id: 'xg09_4',
        text: '《序卦》分上下两篇：上篇释上经三十卦，以乾坤开篇而终于坎离；下篇释下经三十四卦，起于咸恒，终于既济未济，以人事门庭喻卦序之转。',
        plain: '序卦分上下两篇：上篇解释上经三十卦，从乾坤到坎离；下篇解释下经三十四卦，从咸恒到既济未济。',
        annotations: [
          { term: '上经', gloss: '通行本前三十一卦的旧称（乾坤至坎离）', type: '名物' },
          { term: '咸恒', gloss: '咸卦与恒卦，下经开首两卦，旧说喻夫妇之道', type: '名物' },
          { term: '既济未济', gloss: '既济与未济，通行本末二卦：已成与未成', type: '名物' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '上经天道、下经人伦是旧说的大分界；而坎离、既未济两两作结，也暗示上下经都以「未完成」收束，余味相承。', paraphrase: true, plain: '大意：上下经一讲天道一讲人事，结尾都停在「没有彻底完成」上。' },
        ],
      },
      {
        id: 'xg09_5',
        text: '出土材料提供了另一坐标：马王堆帛书《周易》卦序以八宫分组，乾、艮、坎、震等各领一组，与通行本全然不同，说明汉初卦序传统不止一种。',
        plain: '马王堆帛书里的周易卦序跟通行本完全不同：它按八宫分组排列，说明汉朝初年卦序不止一种。',
        annotations: [
          { term: '马王堆帛书', gloss: '长沙马王堆汉墓出土的丝织品文献，其中有《周易》抄本', type: '典故' },
          { term: '八宫', gloss: '以八纯卦各领一组七卦的编组方式', type: '名物' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '帛书卦序以八卦分组领卦，与京房八宫思路相通——卦序「怎么排」在古代本有多套方案，通行本只是流传最广的一套。', paraphrase: true, plain: '大意：古代有好几套排卦方案，帛书就是另一套的实物证据。' },
        ],
      },
      {
        id: 'xg09_6',
        text: '读序卦的心法：先把它当一份「汉代人如何理解卦序」的史料来读，再用覆变规律回头核对卦对——两层看法并用，既存古义，也见结构。',
        plain: '读序卦的两个动作：一是当史料读古人怎么理解卦序，二是用覆变规律核对卦与卦的配对——两层都做，才算读全。',
        annotations: [
          { term: '卦对', gloss: '两两成对的一组卦', type: '释词' },
          { term: '覆变', gloss: '覆（上下相倒）与变（六爻全反）两种卦对关系', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '序卦与覆变规律并不互斥：前者是汉人给出的义理叙事，后者是卦画层面的结构事实，两层都记，读卦序才不偏废。', paraphrase: true, plain: '大意：序卦讲道理，覆变讲结构，两个都要记。' },
        ],
      },
    ],
    structure: [
      { label: '序卦开篇', hint: '有天地然后万物生', lineIndex: 0 },
      { label: '传文体例', hint: '因果句链串卦', lineIndex: 1 },
      { label: '覆变规律', hint: '二二相耦非覆即变', lineIndex: 2 },
      { label: '上下经分界', hint: '坎离既未济作结', lineIndex: 3 },
      { label: '帛书旁证', hint: '八宫卦序另成一系', lineIndex: 4 },
    ],
    steps: ['gloss', 'annotate', 'interpret', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '通行本六十四卦的排列规律，孔颖达概括为？',
      options: ['二二相耦，非覆即变', '按上下经平分对半', '依五行方位依次排布'],
      answer: '二二相耦，非覆即变',
      explanation: '孔颖达《序卦》疏语：六十四卦两两成对，非卦画上下颠倒（覆），即六爻阴阳全反（变）。',
    },
    sources: [
      { work: '周易·序卦传', dynasty: '先秦至汉', edition: '通行十三经注疏本', license: '公版' },
      { work: '周易正义·序卦疏', author: '孔颖达等奉敕撰', dynasty: '唐', edition: '通行十三经注疏本', license: '公版' },
    ],
  },
  {
    id: 'zy_z11',
    kind: 'read',
    track: 'T1',
    branch: '经部易类',
    title: '《系辞下》与《说卦》：八卦物象方位',
    goal: '精读系辞下与说卦的物象方位章句',
    minutes: 15,
    ready: true,
    source: '《周易·系辞下》《说卦传》节选，通行本（十三经注疏本）',
    plainSummary: [
      '系辞下讲八卦起源：圣人仰观俯察，从万物中取象。',
      '「穷则变，变则通，通则久」是变易纲领。',
      '说卦给八卦定性并安排后天方位，是取象的两把钥匙。',
    ],
    lines: [
      {
        id: 'xx11_1',
        text: '古者包牺氏之王天下也，仰则观象于天，俯则观法于地，观鸟兽之文与地之宜，近取诸身，远取诸物，于是始作八卦，以通神明之德，以类万物之情。',
        plain: '古时包牺氏统治天下，抬头观察天上的象，低头观察地上的法，又观察鸟兽的纹理与土地适宜之物，近的取自自身，远的取自万物，于是开始创作八卦，用以通达神明的德性，类比万物的情状。',
        annotations: [
          { term: '包牺氏', pinyin: 'bāo xī shì', gloss: '即伏羲，传说中画卦之圣王', type: '名物' },
          { term: '观象于天', gloss: '仰观天象：日月星辰之运行', type: '释词' },
          { term: '鸟兽之文', gloss: '鸟兽足迹皮毛之纹理', type: '释词' },
        ],
        interpretations: [
          { kind: '传', school: '《系辞下》', dynasty: '先秦至汉', text: '作结绳而为网罟，以佃以渔，盖取诸离。', paraphrase: false, plain: '《系辞下》接着说：编绳结成网罟，用来打猎捕鱼，大概取象于离卦——观象之后，圣人依卦制器，此即「制器尚象」说的起头。' },
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '包牺章传说色彩浓厚，但它确立了解释传统：卦来自对世界的观察与概括，而非凭空规定——历代注家论八卦起源，几乎都从这里出发。', paraphrase: true, plain: '大意：这段是传说，但它立下了「卦来自观察」的解释传统。' },
        ],
      },
      {
        id: 'xx11_2',
        text: '这段话是八卦起源的经典叙述：圣人不凭空造卦，而是仰观俯察，从天象地貌、鸟兽纹理与人体物用中提炼符号；「观物取象」从此成为解卦的第一原则。',
        plain: '这段是八卦起源的经典说法：圣人不是凭空造卦，而是观察天地人后提炼出符号；「观物取象」从此成了第一原则。',
        annotations: [
          { term: '仰观俯察', gloss: '上察天象、下察地理，概指观察自然', type: '释词' },
          { term: '观物取象', gloss: '由观察万物而提炼卦象符号', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '「观物取象」四字是本课关键词：以后读彖象遇到说不出处取的象，先回到「观察—提炼」这个源头去想。', paraphrase: true, plain: '大意：遇到讲不通的象，回到「观察提炼」这个源头去想。' },
        ],
      },
      {
        id: 'xx11_3',
        text: '同篇又以「易穷则变，变则通，通则久」总括卦爻的变易纲领：事物到了尽头就要变化，变化才能通达，通达方可长久——变易二字，正是「易」之为名的注脚。',
        plain: '同篇又用「易穷则变，变则通，通则久」总括全书：到头就要变，变了才通，通了才久——「变易」正是书名的注脚。',
        annotations: [
          { term: '易穷则变', gloss: '易之道在于穷极则变', type: '释词' },
          { term: '变易', gloss: '《周易》「易」之三义之首：变动不居', type: '释词' },
        ],
        interpretations: [
          { kind: '传', school: '《系辞下》', dynasty: '先秦至汉', text: '易穷则变，变则通，通则久。', paraphrase: false, plain: '逐字引录：此十二字为变易宗旨最凝练的表达。' },
          { kind: '古注·大意', school: '孔颖达《周易正义》', dynasty: '唐', text: '孔疏以穷则变为自然之势，变通为圣人乘机之用。', paraphrase: true, plain: '大意：孔颖达说穷了要变是自然之势，会变通是圣人的本事。' },
        ],
      },
      {
        id: 'xx11_4',
        text: '乾，健也。坤，顺也。震，动也。巽，入也。坎，陷也。离，丽也。艮，止也。兑，说也。',
        plain: '乾是健，坤是顺，震是动，巽是入，坎是陷，离是丽（附着），艮是止，兑是说（悦）——一句话给八卦各定了性。',
        annotations: [
          { term: '健', gloss: '刚健不息，乾之德', type: '释词' },
          { term: '丽', gloss: '附着、依附，离之德', type: '释词' },
          { term: '说', pinyin: 'yuè', gloss: '通「悦」，喜悦，兑之德', type: '通假' },
        ],
        interpretations: [
          { kind: '古注·大意', school: '朱熹《周易本义》', dynasty: '宋', text: '朱熹于《本义》前附八卦性情图表，即据此八字诀为纲。', paraphrase: true, plain: '大意：朱熹书前那张八卦性情表，就是照这八个字画的。' },
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '此「八卦八字诀」是读一切取象文献的定性依据：T2 八卦课已引全文，此处精读以便记诵。', paraphrase: true, plain: '大意：这八个字是八卦的「身份证」，务必背下来。' },
        ],
      },
      {
        id: 'xx11_5',
        text: '帝出乎震，齐乎巽，相见乎离，致役乎坤，说言乎兑，战乎乾，劳乎坎，成言乎艮。',
        plain: '天帝（生机）从震卦发生，到巽卦整齐，在离卦显现相见，到坤卦致力劳作，在兑卦欣然言说，到乾卦阴阳交战，在坎卦劳苦，到艮卦而成，重新开始。',
        annotations: [
          { term: '帝出乎震', gloss: '生机出于东方震位；此章为后天八卦方位之纲', type: '典故' },
          { term: '成言乎艮', gloss: '一切成功收束于艮位，又暗含重新开始之义', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '此章按四时八节叙八卦方位，宋人据以定为「文王后天八卦」；先天后天两套方位之辨，见 T2 八卦课与 T4 易图课。', paraphrase: true, plain: '大意：这一章就是后天方位的出处，先后天之辨另见后续课程。' },
        ],
        blocks: [
          { kind: 'bagua', scheme: '后天' },
        ],
      },
      {
        id: 'xx11_6',
        text: '卦德八字与后天方位章，是《说卦》留给读者的两把钥匙：前者给八卦定性，后者按方位安卦；两把钥匙配合使用，读彖象取象便有了坐标。',
        plain: '卦德八字和后天方位章是《说卦》的两把钥匙：一个给八卦定性，一个给八卦定位；配合起来，读取象就有了坐标。',
        annotations: [
          { term: '卦德', gloss: '《说卦》以一字概括的八卦性质', type: '名物' },
          { term: '后天方位', gloss: '文王八卦的方位配置', type: '名物' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '读彖象遇到取象不明处，先用卦德问「这一卦什么脾气」，再用方位问「它在图上哪一站」——两问之下，多半有了方向。', paraphrase: true, plain: '大意：查取象先问卦德、再问方位，通常就有答案。' },
        ],
      },
    ],
    structure: [
      { label: '观物取象', hint: '仰观俯察始作八卦', lineIndex: 0 },
      { label: '起源叙述', hint: '观物取象原则', lineIndex: 1 },
      { label: '变易纲领', hint: '穷变通久', lineIndex: 2 },
      { label: '卦德八字', hint: '健顺动入陷丽止说', lineIndex: 3 },
      { label: '后天方位', hint: '帝出乎震章', lineIndex: 4 },
    ],
    steps: ['gloss', 'annotate', 'interpret', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '《说卦传》中「坎」的卦德是？',
      options: ['陷', '入', '动'],
      answer: '陷',
      explanation: '原文「坎，陷也」：坎为水，水就下而陷；入是巽德，动是震德。',
    },
    sources: [
      { work: '周易·系辞下、说卦传', dynasty: '先秦至汉', edition: '通行十三经注疏本（维基文库有录）', license: '公版' },
    ],
  },
  {
    id: 'zy_z12',
    kind: 'read',
    track: 'T1',
    branch: '经部易类',
    title: '《彖》《象》读法与《杂卦》',
    goal: '掌握彖象传的体例与杂卦的短诀',
    minutes: 12,
    ready: true,
    source: '《周易·象传》《杂卦传》节选 + 体例讲解，通行本（十三经注疏本）',
    plainSummary: [
      '彖传断一卦大义，象传分大象小象两层。',
      '大象句式两截：先述卦象，再以君子以垂教。',
      '杂卦以两三字点破卦与卦的相对之性。',
    ],
    lines: [
      {
        id: 'tx12_1',
        text: '《彖传》随卦附于卦辞之下，专断一卦大义：或以卦德说，或以卦象说，或以爻位说；断语简峻，是读每卦「总纲」的第一入口。',
        plain: '彖传附在卦辞后面，专门断定一卦大义：有的从卦德说，有的从卦象说，有的从爻位说；它是读每卦总纲的第一入口。',
        annotations: [
          { term: '彖传', gloss: '释卦辞、断一卦之义的解释文字', type: '名物' },
          { term: '卦德', gloss: '《说卦》所定八卦之性，彖传常据以说卦', type: '名物' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '彖传断语简峻，一句顶一句：读卦先读彖，等于先看提要；彖里出现的爻位语（当位、得中之类），要用 T2 的爻位语言去还原。', paraphrase: true, plain: '大意：读卦先读彖传，彖里的位置语用 T2 那套词去还原。' },
        ],
      },
      {
        id: 'tx12_2',
        text: '地势坤，君子以厚德载物。履霜坚冰，阴始凝也。驯致其道，至坚冰也。',
        plain: '大象传：地势柔顺，君子以厚德承载万物。小象释初六：履霜坚冰，是阴气开始凝结；顺此趋势下去，就会到坚冰。',
        annotations: [
          { term: '君子以', gloss: '大象传固定句式：君子借此卦象而如何', type: '句式' },
          { term: '驯致', pinyin: 'xún zhì', gloss: '顺其趋势逐渐而至', type: '释词' },
        ],
        interpretations: [
          { kind: '传', school: '《杂卦传》', dynasty: '先秦至汉', text: '乾刚坤柔，比乐师忧。', paraphrase: false, plain: '《杂卦》以「坤柔」二字点坤卦之性：大象言其承载之用，杂卦言其资质之性，两处合看，坤卦形象乃全。' },
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '拿坤卦当标本：前半句是大象（垂教），后半两句是小象（释爻）——一段文字里两种体例，正是「分层读法」的练习场。', paraphrase: true, plain: '大意：这一段里大象小象都在，正好练习分清层次。' },
        ],
      },
      {
        id: 'tx12_3',
        text: '大象传句式固定：先述上下两象相重之形（如「地势坤」），再以「君子以」「先王以」引出人事教训；小象传则逐爻释辞，句末多缀「也」字作结。',
        plain: '大象传句式固定：先说上下两象怎么重成此卦，再用「君子以」「先王以」引出教训；小象传逐爻解释，句尾常带「也」字。',
        annotations: [
          { term: '君子以', gloss: '大象句式：君子效此卦象而行', type: '句式' },
          { term: '先王以', gloss: '大象句式变体，用于开国立法之卦', type: '句式' },
          { term: '小象传', gloss: '释各爻爻辞的象传', type: '名物' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '六十四卦大象几乎全部如此两截行文；记住句式，读大象便如按图索骥——先找卦象，再找人事。', paraphrase: true, plain: '大意：大象都是「先卦象、后人事」两截，照着读就行。' },
        ],
      },
      {
        id: 'tx12_4',
        text: '《杂卦》是十翼中最短的一篇：不依卦序，而以两三字点破一卦相对之性，末段又故意错综其说，是记诵卦性的短诀，也是观察卦对关系的别册。',
        plain: '杂卦是十翼里最短的一篇：不按卦序，用两三个字点破一卦相对之性，末段还故意打乱，是记卦性的短口诀。',
        annotations: [
          { term: '杂卦', gloss: '十翼之一，以短语概括诸卦相对之性', type: '名物' },
          { term: '卦序', gloss: '六十四卦的排列次序', type: '释词' },
        ],
        interpretations: [
          { kind: '传', school: '《杂卦传》', dynasty: '先秦至汉', text: '乾刚坤柔，比乐师忧。', paraphrase: false, plain: '逐字引录开篇八字：乾性刚、坤性柔，比卦亲乐、师卦多忧——两两相对，即杂卦的概括方式。' },
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '杂卦末段自「大过」以下次序错综，旧说以为取互体之义，或疑传抄错简；读时知有此段即可，不必强解。', paraphrase: true, plain: '大意：杂卦结尾的顺序有点乱，古人各有解释，知道就行。' },
        ],
      },
      {
        id: 'tx12_5',
        text: '读彖象的口诀：彖看全局，大象看垂教，小象看爻位，杂卦看相对。四者都是传文，读时须与经文分层，不使解释混作原文本义。',
        plain: '口诀：彖看全局，大象看教训，小象看爻位，杂卦看相对。四样都是解释文字，读时别跟经文原文混成一层。',
        annotations: [
          { term: '垂教', gloss: '由卦象引出人事教训', type: '释词' },
          { term: '传文', gloss: '解释经文的十翼文字', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '口诀四句各管一层：彖管断，大象管教，小象管爻，杂卦管对；遇解释打架时，先查是不是把这四层混在一起了。', paraphrase: true, plain: '大意：四句口诀各管一层，解释打架多半是层次混了。' },
        ],
      },
    ],
    structure: [
      { label: '彖传体例', hint: '随卦断大义', lineIndex: 0 },
      { label: '象传例读', hint: '坤象示范', lineIndex: 1 },
      { label: '大象句式', hint: '两截行文', lineIndex: 2 },
      { label: '杂卦短诀', hint: '相对点性', lineIndex: 3 },
      { label: '读法口诀', hint: '四看分层', lineIndex: 4 },
    ],
    steps: ['gloss', 'annotate', 'interpret', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '《杂卦》开篇以哪两个字概括坤卦之性？',
      options: ['坤柔', '坤顺', '载物'],
      answer: '坤柔',
      explanation: '《杂卦》「乾刚坤柔」以柔点坤性；顺是《说卦》所定卦德，载物出自大象传。',
    },
    sources: [
      { work: '周易·象传、杂卦传', dynasty: '先秦至汉', edition: '通行十三经注疏本', license: '公版' },
    ],
  },
];
