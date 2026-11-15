// T0 入门与读法 · 讲义课（Z01-Z06，P0 全部 ready）。
// ★ 全部人工预写；interpretations 只收确切记得的注语原文，记不准一律 paraphrase=true 标「大意转述」。
import type { ZhouyiLesson } from './types.js';

export const T0_LESSONS: ZhouyiLesson[] = [
  {
    id: 'zy_z01',
    kind: 'lecture',
    track: 'T0',
    branch: '经部易类',
    title: '易学是什么：经、传、易学与术数的边界',
    goal: '分清经、传两层，以及「易学」与「术数」两个层面的边界',
    minutes: 8,
    ready: true,
    source: '自撰讲义（术语口径参《四库全书总目·经部易类小序》通行说法）',
    plainSummary: [
      '《周易》这本书分「经」和「传」两层，经是占筮系辞，传是解释经文。',
      '研究经传的学问叫易学，拿易的符号去做占测的技术叫术数，两者不是一回事。',
      '本课程把两者都当文献来读：学的是知识框架，不提供任何现实预测服务。',
    ],
    lines: [
      {
        id: 'z01_1',
        text: '《周易》原是占筮之书，经战国至汉代学者层层解释，最终被尊为「群经之首」，位列十三经之中。',
        plain: '《周易》本来是占卜用的书，后来被一代代人解释、抬高，成了经典中的经典。',
        annotations: [
          { term: '占筮', pinyin: 'zhān shì', gloss: '用蓍草等起卦预占吉凶的方法', type: '释词' },
          { term: '群经之首', gloss: '汉代以来对《周易》的尊称，谓其为群经义理之源', type: '典故' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '《周易》的经文部分确实源自占筮实践，传文部分则完成了从占筮记录到哲理文本的转变。', paraphrase: true, plain: '大意：经文出自占卜，传文把它讲成了哲学，这个转变是理解全书的钥匙。' },
        ],
      },
      {
        id: 'z01_2',
        text: '「经」指六十四卦的卦辞与三百八十四条爻辞（加乾用九、坤用六），相传「卦出于筮」，是长期占筮记录的凝定。',
        plain: '经文部分就是卦辞和爻辞，一共六十四卦、每卦六爻。',
        annotations: [
          { term: '卦辞', gloss: '说明一卦整体吉凶断语的文辞，每卦一条', type: '名物' },
          { term: '爻辞', pinyin: 'yáo cí', gloss: '说明一爻吉凶断语的文辞，每爻一条', type: '名物' },
          { term: '用九', gloss: '仅乾卦有「用九」，是六爻皆阳皆变时的特殊断语', type: '名物' },
          { term: '用六', gloss: '仅坤卦有「用六」，是六爻皆阴皆变时的特殊断语', type: '名物' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '经文的形成层次，学界一般定在西周至春秋之间，旧说「人更三圣，世历三古」是汉人的追溯而非信史。', paraphrase: true, plain: '大意：经文大概是西周到春秋定型的，「伏羲画卦、文王作辞」那套旧说是后人追认的。' },
        ],
      },
      {
        id: 'z01_3',
        text: '「传」指解释经文的七种十篇：《彖》上下、《象》上下、《系辞》上下与《文言》《说卦》《序卦》《杂卦》，合称《十翼》。',
        plain: '传文一共十篇，古人叫《十翼》，意思是给经文插上翅膀。',
        annotations: [
          { term: '十翼', pinyin: 'shí yì', gloss: '《易传》七种十篇的合称，取「羽翼经文」之义', type: '名物' },
          { term: '彖', pinyin: 'tuàn', gloss: '断定一卦大义的解释文字，随卦分附', type: '名物' },
          { term: '系辞', gloss: '总论《周易》义例与哲理的长篇传文，分上下两篇', type: '名物' },
        ],
        interpretations: [
          { kind: '古注·大意', school: '朱熹《周易本义》', dynasty: '宋', text: '朱熹以《十翼》为圣人羽翼经文之作，读经当先明传文所释之义例。', paraphrase: true, plain: '大意：朱熹认为传是给经文作解释的翼，读经要先懂传文立的规矩。' },
        ],
      },
      {
        id: 'z01_4',
        text: '「易学」是对经传的学术研究，两汉以来形成象数与义理两大路向；「术数」则是把易的符号用于占测实践的技术系统，自成一个谱系。',
        plain: '学问层面叫易学，技术层面叫术数，一雅一用，要分开看。',
        annotations: [
          { term: '象数', gloss: '以卦爻之象与筮数解《易》的路向', type: '释词' },
          { term: '义理', gloss: '以儒家人文道理阐发《易》义的路向', type: '释词' },
        ],
        interpretations: [
          { kind: '古注·大意', school: '《四库全书总目·经部易类小序》', dynasty: '清', text: '四库馆臣概括为「两派六宗，已互相攻驳」，谓汉儒言象数、王弼说以老庄、程子阐明儒理、李光杨万里参证史事。', paraphrase: true, plain: '大意：四库提要把历代易学分成两大派六个宗，互相争论了两千年。' },
        ],
      },
      {
        id: 'z01_5',
        text: '本课程的边界即在于此：经传精读与易学史属文献研究，术数诸课按古籍规则做教学演示，均不构成任何现实预测或决策建议。',
        plain: '这里讲的是文献和规则，不是算命服务。',
        annotations: [
          { term: '教学演示', gloss: '按古籍原文规则做推演展示，供理解文献之用', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '把「文献研究」与「实践服务」分开，是本课程全部术数课的统一口径。', paraphrase: true, plain: '大意：所有术数课都只讲古书里的规则，不做真的测算。' },
        ],
      },
    ],
    structure: [
      { label: '经文是什么', hint: '卦辞爻辞，占筮系辞', lineIndex: 1 },
      { label: '传文是什么', hint: '十翼，解释经文', lineIndex: 2 },
      { label: '易学与术数', hint: '学术研究 vs 技术系统', lineIndex: 3 },
      { label: '课程边界', hint: '只做文献与演示', lineIndex: 4 },
    ],
    steps: ['gloss', 'annotate', 'interpret', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '《十翼》指的是什么？',
      options: ['解释经文的七种十篇传文', '六十四卦的卦画符号', '汉代谶纬类的占书'],
      answer: '解释经文的七种十篇传文',
      explanation: '《十翼》即《易传》：彖、象、系辞各分上下，加文言、说卦、序卦、杂卦，共十篇。',
    },
    sources: [
      { work: '周易（王弼、韩康伯注本）', author: '王弼、韩康伯注', dynasty: '魏晋', edition: '通行十三经注疏本（中国哲学书电子化计划有录）', license: '公版' },
      { work: '四库全书总目·经部易类小序', author: '永瑢等奉敕撰', dynasty: '清', license: '公版' },
    ],
  },
  {
    id: 'zy_z02',
    kind: 'lecture',
    track: 'T0',
    branch: '经部易类',
    title: '三易与成书：连山、归藏、周易',
    goal: '知道「三易」旧说与《周易》成书的大致层次',
    minutes: 8,
    ready: true,
    source: '自撰讲义（《周礼·春官》三易说与王家台秦简通行报道口径）',
    plainSummary: [
      '古书说夏商周三代各有易书：连山、归藏、周易，合称三易。',
      '前两部早就散佚了，今天能读到的只有《周易》。',
      '出土的秦简残简证明归藏系统确实流传过，但今本连山归藏都是后人辑的。',
    ],
    lines: [
      {
        id: 'z02_1',
        text: '《周礼·春官》记载太卜掌「三易」之法：一曰《连山》，二曰《归藏》，三曰《周易》，其经卦皆八，其别皆六十有四。',
        plain: '周代的占卜官管三种易书，八卦都是八，六十四卦也一样。',
        annotations: [
          { term: '太卜', gloss: '周代掌管卜筮的官职', type: '名物' },
          { term: '经卦', gloss: '即八卦；「别卦」指由八卦相重而成的六十四卦', type: '名物' },
        ],
        interpretations: [
          { kind: '古注·大意', school: '郑玄《周礼注》', dynasty: '汉', text: '郑玄谓夏曰连山、商曰归藏、周曰周易，三易卦首不同而筮法相类。', paraphrase: true, plain: '大意：郑玄给三易配了三个朝代：夏连山、商归藏、周周易。' },
        ],
      },
      {
        id: 'z02_2',
        text: '旧说《连山》以艮为首卦，象山之出云连绵不绝；《归藏》以坤为首卦，先阴而后阳；二者汉以后散佚，仅有后人辑本流传。',
        plain: '连山第一卦是艮，归藏第一卦是坤，两本书都丢了，只剩辑本。',
        annotations: [
          { term: '艮', pinyin: 'gèn', gloss: '八卦之一，卦象为山，一阳爻在上二阴爻在下', type: '名物' },
          { term: '辑本', gloss: '从类书、注疏中搜辑佚文重新编成的本子', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '今传《连山》《归藏》辑本真伪杂糅，只能当作汉唐人转述的碎片看，不能径当夏商古本。', paraphrase: true, plain: '大意：市面上那两本「复原」的连山归藏不可信，只是零碎转述拼起来的。' },
        ],
      },
      {
        id: 'z02_3',
        text: '《周易》以乾为首卦，通行本卦序「二二相耦，非覆即变」：两两成对，或卦画上下颠倒（覆），或六爻阴阳全反（变）。',
        plain: '周易第一卦是乾，六十四卦两两配对，要么倒着看，要么全反过来。',
        annotations: [
          { term: '乾', pinyin: 'qián', gloss: '八卦与六十四卦之首，纯阳之卦', type: '名物' },
          { term: '非覆即变', gloss: '唐代孔颖达概括通行本卦序规律的名句', type: '典故' },
        ],
        interpretations: [
          { kind: '古注·大意', school: '孔颖达《周易正义》', dynasty: '唐', text: '孔颖达提出六十四卦「二二相耦，非覆即变」的卦序规律，为后世分析序卦之基础。', paraphrase: true, plain: '大意：孔颖达发现卦序两两成对的规律，一直用到今天。' },
        ],
      },
      {
        id: 'z02_4',
        text: '出土文献为成书问题提供了实物坐标：王家台秦简有《归藏》类残简，上博简、阜阳汉简与马王堆帛书各有不同系统的《周易》抄本。',
        plain: '挖出来的竹简证明：古代确实存在好几种不同版本的周易和归藏。',
        annotations: [
          { term: '王家台秦简', gloss: '1993 年湖北江陵王家台 15 号秦墓出土的竹简，含《归藏》类文献', type: '典故' },
          { term: '帛书', pinyin: 'bó shū', gloss: '写在丝织品上的文献，马王堆帛书《周易》卦序与通行本不同', type: '名物' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '简帛《周易》诸本卦序互不相同，说明「六十四卦怎么排」在战国秦汉间本来就不止一种答案。', paraphrase: true, plain: '大意：出土的几种古本卦序都不一样，通行本的排法只是其中之一。' },
        ],
      },
    ],
    structure: [
      { label: '三易总说', hint: '周礼太卜掌三易', lineIndex: 0 },
      { label: '连山归藏', hint: '首卦不同，皆已散佚', lineIndex: 1 },
      { label: '周易卦序', hint: '非覆即变，二二相耦', lineIndex: 2 },
      { label: '出土坐标', hint: '秦简帛书证成书层次', lineIndex: 3 },
    ],
    steps: ['gloss', 'annotate', 'interpret', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '据旧说，《归藏》以哪一卦为首？',
      options: ['坤', '乾', '艮'],
      answer: '坤',
      explanation: '旧说连山以艮为首、归藏以坤为首、周易以乾为首；坤先阳后，故归藏又称「坤乾」。',
    },
    sources: [
      { work: '周礼·春官', dynasty: '汉（郑玄注本）', edition: '通行十三经注疏本', license: '公版' },
    ],
  },
  {
    id: 'zy_z03',
    kind: 'lecture',
    track: 'T0',
    branch: '经部易类',
    title: '经传结构与通行本的形成',
    goal: '看懂通行本《周易》「经传合编」体例的来龙去脉',
    minutes: 8,
    ready: true,
    source: '自撰讲义（据王弼本编排与简帛出土本通行说法）',
    plainSummary: [
      '今天书店里买到的《周易》，是把彖象拆开附在卦爻辞后面的「合编本」。',
      '这个编排是魏晋王弼定下来的，汉代古本其实经和传是分开的。',
      '出土竹简让我们看到了古本的样子，读的时候先分清哪句是经、哪句是传。',
    ],
    lines: [
      {
        id: 'z03_1',
        text: '通行本《周易》的编排是「经传合编」：《彖》《象》拆开分附各卦卦爻辞之后，《系辞》《文言》《说卦》《序卦》《杂卦》别行于全书之后。',
        plain: '现在的通行本把解释文字拆开插进经文里，剩下的传文统一放在书后。',
        annotations: [
          { term: '经传合编', gloss: '经文与传文按卦穿插编排的体例', type: '释词' },
          { term: '别行', gloss: '单独成篇、不附于经文之下', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '经传合编便于随卦对读，但掩盖了传文的独立结构，读《系辞》一类的总论时需注意它本不在卦下。', paraphrase: true, plain: '大意：合编读起来方便，但别忘了系辞文言本来是独立的文章。' },
        ],
      },
      {
        id: 'z03_2',
        text: '这种编排定型于魏晋王弼：他把《彖》《象》拆附各卦，只留《系辞》以下别行；此例为后来刻本沿用，遂成今日通行本的面貌。',
        plain: '把传文拆开插进各卦的，是魏晋的王弼，后来的刻书都跟着他这么做。',
        annotations: [
          { term: '王弼', pinyin: 'wáng bì', gloss: '三国魏玄学家（226-249），著《周易注》，扫落汉儒象数旧说', type: '典故' },
          { term: '刻本', gloss: '雕版印刷的书籍版本', type: '释词' },
        ],
        interpretations: [
          { kind: '古注·大意', school: '《四库全书总目·经部易类小序》', dynasty: '清', text: '四库馆臣称王弼「尽黜象数，说以老庄」，其注本更定经传编排，影响后世刻本最深。', paraphrase: true, plain: '大意：四库提要说他把汉代那套象数全扔了，他的本子成了后世的标准版。' },
        ],
      },
      {
        id: 'z03_3',
        text: '汉代古本「经传别行」的面貌，可由熹平石经残石、阜阳汉简与上博简《周易》等出土材料大致推知：传文自成卷帙，不附卦下。',
        plain: '汉代的古本里，经是经、传是传，各编各的，出土竹简石碑能证明这一点。',
        annotations: [
          { term: '熹平石经', gloss: '东汉熹平年间立于太学的官方儒家经典石刻，有《周易》残石传世', type: '典故' },
          { term: '上博简', gloss: '上海博物馆藏战国楚竹书，其中《周易》为最早的易经抄本之一', type: '典故' },
          { term: '卷帙', pinyin: 'juàn zhì', gloss: '书籍的卷册，引申指成篇的文献', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '简帛诸本虽有卦序、用字之异，但均未见传文随卦分附，是「经传别行」最直接的证据。', paraphrase: true, plain: '大意：出土的几种古本都没有把传文插进卦里，证明分编才是旧貌。' },
        ],
      },
      {
        id: 'z03_4',
        text: '读《周易》的第一步分清层次：经是占筮系辞，传是解释文字，后人按语又是一层；三者性质不同，混在一起读则轻重失据。',
        plain: '先分清哪句是经、哪句是传、哪句是后人说的，别把三层读成一层。',
        annotations: [
          { term: '按语', gloss: '编者或注家插入的说明性文字', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '本课程精读课的原文一律标注层次（经文/传文/文献原文），注释与注解再各分层，即为此故。', paraphrase: true, plain: '大意：本课程的精读就是按这个分层法做的。' },
        ],
      },
    ],
    structure: [
      { label: '合编体例', hint: '彖象分附，余传别行', lineIndex: 0 },
      { label: '王弼定型', hint: '魏晋更定编排', lineIndex: 1 },
      { label: '古本面貌', hint: '出土所见经传别行', lineIndex: 2 },
      { label: '分层读法', hint: '经、传、按语三层', lineIndex: 3 },
    ],
    steps: ['gloss', 'annotate', 'interpret', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '把《彖》《象》拆开分附各卦之下的是谁？',
      options: ['王弼', '郑玄', '孔颖达'],
      answer: '王弼',
      explanation: '王弼《周易注》改定经传合编体例，后世刻本沿用至今；孔颖达是为其作疏的唐代学者。',
    },
    sources: [
      { work: '周易（王弼、韩康伯注本）', author: '王弼、韩康伯注', dynasty: '魏晋', edition: '通行十三经注疏本', license: '公版' },
    ],
  },
  {
    id: 'zy_z04',
    kind: 'lecture',
    track: 'T0',
    branch: '研究方法',
    title: '底本与版本：读哪一本书',
    goal: '为后续精读选好底本，认识几部关键参考书',
    minutes: 10,
    ready: true,
    source: '自撰讲义（版本叙录参《四库全书总目》易类提要通行口径）',
    plainSummary: [
      '读古书先选本子：《周易》的通行本源出王弼注加孔颖达疏。',
      '汉魏古注看《周易集解》，宋人义理看程传与本义。',
      '本课程原文以通行本为底本，引注一律标书名朝代，转述与原文分清。',
    ],
    lines: [
      {
        id: 'z04_1',
        text: '今天通行的《周易》整理本，源头是《十三经注疏》中的《周易注疏》：魏王弼、晋韩康伯作注，唐孔颖达等作疏，宋人合刻为一。',
        plain: '标准参考本就是十三经注疏里的周易：魏晋人注，唐朝人疏。',
        annotations: [
          { term: '十三经注疏', gloss: '儒家十三部经典的汉唐注疏汇刻，清阮元校刻本最通行', type: '名物' },
          { term: '注疏', gloss: '注（解释正文）与疏（解释注）的合称', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '韩康伯续注系辞以下各传，故「王弼注」实为王注经、韩注传的合称，书目著录时当分清。', paraphrase: true, plain: '大意：市面上写「王弼注周易」的书，后半其实可能是韩康伯注的。' },
        ],
      },
      {
        id: 'z04_2',
        text: '读汉魏象数旧说，首推唐李鼎祚《周易集解》：该书辑录汉魏以降三十余家旧注，是汉代易学佚说最重要的汇存。',
        plain: '想看汉代人怎么解易，就读唐朝人李鼎祚编的周易集解，他把旧注都抄进去了。',
        annotations: [
          { term: '周易集解', gloss: '唐代李鼎祚辑汉魏魏晋易注之总集', type: '名物' },
          { term: '佚说', pinyin: 'yì shuō', gloss: '原书已亡而赖他书征引存留的学说', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '《集解》所存虞翻、荀爽诸家注多已不见原书，读之即是在读汉代象数易的第一手转引。', paraphrase: true, plain: '大意：集解里那些汉朝注家，原书都丢了，全靠它才留下来。' },
        ],
      },
      {
        id: 'z04_3',
        text: '宋人义理两部代表作对照读最有收获：程颐《伊川易传》以儒理说易，朱熹《周易本义》则欲兼存占筮本旨，立场判然有别。',
        plain: '程颐的书讲道理，朱熹的书想恢复占卜本意，两本对读最见分歧。',
        annotations: [
          { term: '伊川易传', gloss: '程颐居伊川所撰易注，又称《程氏易传》', type: '名物' },
          { term: '周易本义', gloss: '朱熹易注，以「易本卜筮之书」为立场', type: '名物' },
        ],
        interpretations: [
          { kind: '古注·大意', school: '朱熹《周易本义》', dynasty: '宋', text: '朱熹主张读易当先复原其为卜筮之书的本来面目，再言义理，不可悬空说理。', paraphrase: true, plain: '大意：朱熹说易经首先是本占卜书，讲道理得先承认这一点。' },
        ],
      },
      {
        id: 'z04_4',
        text: '本课程的原文以通行本为底本，句读参考上述整理本；引用古注一律标注书名与朝代，逐字引文与大意转述分开标记，不使相混。',
        plain: '我们的原文用通行本，引古人话时标清楚是谁说的，是不是原话。',
        annotations: [
          { term: '句读', pinyin: 'jù dòu', gloss: '古书断句与标点，旧读读断处曰「读」', type: '释词' },
          { term: '底本', gloss: '校勘整理时所依据的原始文本', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '「逐字引文」与「大意转述」以 paraphrase 字段区分，是本内容包防编造的硬规则。', paraphrase: true, plain: '大意：是不是古人原话，课程数据里都有标记，不掺假。' },
        ],
      },
    ],
    structure: [
      { label: '通行底本', hint: '王韩注 + 孔疏', lineIndex: 0 },
      { label: '汉魏旧注', hint: '周易集解辑存', lineIndex: 1 },
      { label: '宋人义理', hint: '程传与本义对读', lineIndex: 2 },
      { label: '引用规范', hint: '标书名朝代，分引述转述', lineIndex: 3 },
    ],
    steps: ['gloss', 'annotate', 'interpret', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '汇集汉魏象数旧注的唐代著作是？',
      options: ['周易集解', '周易正义', '周易本义'],
      answer: '周易集解',
      explanation: '李鼎祚《周易集解》辑汉魏旧注三十余家；正义是官修疏解本义是朱熹著作。',
    },
    sources: [
      { work: '周易正义', author: '孔颖达等奉敕撰', dynasty: '唐', edition: '通行十三经注疏本', license: '公版' },
      { work: '周易集解', author: '李鼎祚辑', dynasty: '唐', license: '公版' },
    ],
  },
  {
    id: 'zy_z05',
    kind: 'lecture',
    track: 'T0',
    branch: '研究方法',
    title: '怎样读一层原文：五层阅读法',
    goal: '掌握本课程精读课「五层阅读法」的用法',
    minutes: 10,
    ready: true,
    source: '自撰讲义（方法说明，术语与 culture 精读层口径一致）',
    plainSummary: [
      '本课程的精读课分五层：注释、白话、注解、脉络、自检。',
      '注释管字词，白话管通读，注解看历代各家怎么说。',
      '每层出问题都能回到对应入口补课，最后用小题自检。',
    ],
    lines: [
      {
        id: 'z05_1',
        text: '本课程的精读分五层：字词训诂（注释）、白话翻译（plain）、历代注解（interpretations）、章句脉络（structure）、自检（quickCheck），层层递进而可单层回看。',
        plain: '精读五步走：先懂字词，再通白话，然后看古人注解，理结构，最后自测。',
        annotations: [
          { term: '训诂', pinyin: 'xùn gǔ', gloss: '解释古书字词意义的传统学问', type: '释词' },
          { term: '章句', gloss: '分章断句、串讲文义的读经方法', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '五层各管一事，互不替代：注释只做客观训诂，注解呈现各家立场，白话只求达意。', paraphrase: true, plain: '大意：五层是五种工具，别指望一层解决所有问题。' },
        ],
      },
      {
        id: 'z05_2',
        text: '第一层先解决字词：注释给出注音、释义与类型（释词、注音、通假、典故、名物等），只作客观训诂，不掺入义理发挥。',
        plain: '第一步查注释：认字、明义，但注释只管字面，不管道理。',
        annotations: [
          { term: '通假', gloss: '古书用字借代现象，如「说」通「悦」', type: '释词' },
          { term: '名物', gloss: '器物、制度、职官等专名的考释类别', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '注释与注解分属两栏，正是为了让「字词客观义」与「义理阐发」各归其位，免于循环论证。', paraphrase: true, plain: '大意：查字义和看阐发是两件事，别用道理反推字义。' },
        ],
      },
      {
        id: 'z05_3',
        text: '第三层看历代注解时留意标记：凡标「大意转述」者皆为编者转述，非注家原文；逐字引文则字字有据，此为防以意改古的硬规则。',
        plain: '注解里写了「大意转述」的，是老师转述的；没写的才是古书原话。',
        annotations: [
          { term: '转述', gloss: '用自己的话复述他人观点，非原文照录', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '本内容包的原则：记不准原文的一律转述并标明，绝不冒充逐字古注。', paraphrase: true, plain: '大意：拿不准原话就明说「是大意」，不装作引文。' },
        ],
      },
      {
        id: 'z05_4',
        text: '第四层看章句脉络：把每一句放回篇章结构里，明白它在讲什么位置上的什么问题；第五层用两道小题自检，答错即回看对应层。',
        plain: '第四步理结构，第五步做题检查，错了回到出错的层补看。',
        annotations: [
          { term: '脉络', gloss: '文义的承接与结构关系', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '自检题一律出自课文本身，不设超纲题，判卷标准为选项全等。', paraphrase: true, plain: '大意：小题只考课文里讲过的东西。' },
        ],
      },
      {
        id: 'z05_5',
        text: '读原文时永远先问一句：这句是经文、是传文、还是后人按语？层次分清，再谈理解；这也是 T0 全部六课的共同练习。',
        plain: '开口理解之前，先问这句是谁说的、属于哪一层。',
        annotations: [
          { term: '经文', gloss: '卦辞爻辞等原典文本', type: '释词' },
          { term: '传文', gloss: '解释经文的彖象系辞等文字', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '「先分层再理解」是读一切经部文献通用的第一习惯。', paraphrase: true, plain: '大意：分层是读古书的第一反应，练成条件反射。' },
        ],
      },
    ],
    structure: [
      { label: '五层总览', hint: '注释白话注解脉络自检', lineIndex: 0 },
      { label: '字词层', hint: '客观训诂不掺义理', lineIndex: 1 },
      { label: '注解层', hint: '引文与转述分开', lineIndex: 2 },
      { label: '脉络与自检', hint: '放回结构，做题回看', lineIndex: 3 },
    ],
    steps: ['gloss', 'annotate', 'interpret', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '注解中标了「大意转述」的文字意味着什么？',
      options: ['编者转述，非注家原文', '注家逐字原话', '编者虚构的内容'],
      answer: '编者转述，非注家原文',
      explanation: '标记 paraphrase=true 表示大意复述；逐字引文不标此记，二者严格区分。',
    },
    sources: [
      { work: '周易（王弼、韩康伯注本）', author: '王弼、韩康伯注', dynasty: '魏晋', edition: '通行十三经注疏本', license: '公版' },
    ],
  },
  {
    id: 'zy_z06',
    kind: 'lecture',
    track: 'T0',
    branch: '经部易类',
    title: '术语总表：象数理占',
    goal: '用象、数、理、占四要素统摄本课程全部术语',
    minutes: 8,
    ready: true,
    source: '自撰讲义（四要素框架为易学通史通行概括口径）',
    plainSummary: [
      '易学概念千头万绪，可用象、数、理、占四字收拢。',
      '象是符号取象，数是筮数卦数，理是义理阐发，占是占筮应用。',
      '课程术语表按此归类，精读课注释与术语表互通互查。',
    ],
    lines: [
      {
        id: 'z06_1',
        text: '易学四要素可概括为象、数、理、占：象是卦爻符号及其取象，数是筮数与卦爻之数，理是义理阐释，占是占筮应用。',
        plain: '四个字记住：象（符号）、数（数字）、理（道理）、占（应用）。',
        annotations: [
          { term: '取象', gloss: '以卦爻符号比拟天地万物，如乾为天、坤为地', type: '释词' },
          { term: '筮数', pinyin: 'shì shù', gloss: '揲蓍产生的数字（老阳九、少阴八等）', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '象数理占四分法是对易学功能的通行概括，《系辞》「易有圣人之道四焉」即其先声。', paraphrase: true, plain: '大意：这个四分法源头在系辞「圣人之道四」那句话。' },
        ],
      },
      {
        id: 'z06_2',
        text: '象数与义理两派之争贯穿易学史：汉儒重象数，王弼扫象而重义理，宋儒于义理外又分出图书一系，专研河洛先天诸图。',
        plain: '汉朝人玩符号，王弼讲道理，宋朝人又冒出一派专画图。',
        annotations: [
          { term: '图书', gloss: '宋代以河图洛书、先天诸图说易的一系', type: '名物' },
          { term: '河洛', gloss: '河图与洛书，宋代易图学两大核心图式', type: '名物' },
        ],
        interpretations: [
          { kind: '古注·大意', school: '《四库全书总目·经部易类小序》', dynasty: '清', text: '馆臣谓汉儒言象数、王弼尽黜象数、程子阐明儒理、陈邵务穷造化，遂成两派互攻之局。', paraphrase: true, plain: '大意：四库提要把这条路线图画得最清楚，T3 课会逐句精读它。' },
        ],
      },
      {
        id: 'z06_3',
        text: '占筮一系自有术语群：大衍筮法与卦变、体用属易占本门；纳甲、世应、六亲、用神则是六爻纳甲系统的衍生概念，各有谱系与师承。',
        plain: '占卜那边的词另成一套：梅花讲体用，六爻讲世应六亲，别混着用。',
        annotations: [
          { term: '纳甲', gloss: '以十天干配八卦爻位的术数方法', type: '名物' },
          { term: '体用', gloss: '梅花易数术语：体卦为主体，用卦为克应对象', type: '名物' },
          { term: '六亲', gloss: '六爻法中以五行生克定出的父母兄弟子孙妻财官鬼', type: '名物' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '术数术语不进经注传统，读时先辨它出自哪部书、哪套系统，再谈含义。', paraphrase: true, plain: '大意：术数的词要先问「出自哪本书」，不然容易张冠李戴。' },
        ],
      },
      {
        id: 'z06_4',
        text: '课程「术语」页收录全部术语条目：每条给定义、类别与参见条目，精读课注释中的术语与此表互通，可随点随查。',
        plain: '所有术语都收在术语表里，上课查注释时可以一键跳过去。',
        annotations: [
          { term: '参见', gloss: '词条间互引的交叉检索标记', type: '释词' },
        ],
        interpretations: [
          { kind: '今按', school: '本教程编者按', dynasty: '今', text: '术语表全部人工预写，与精读注释同一硬约束，禁止自动生成填充。', paraphrase: true, plain: '大意：术语表和注释一样都是人工写的，不靠机器凑数。' },
        ],
      },
    ],
    structure: [
      { label: '四要素', hint: '象数理占各管一段', lineIndex: 0 },
      { label: '两派之争', hint: '象数与义理路线', lineIndex: 1 },
      { label: '术数术语群', hint: '梅花六爻各成体系', lineIndex: 2 },
      { label: '术语表用法', hint: '随点随查，注释互通', lineIndex: 3 },
    ],
    steps: ['gloss', 'annotate', 'interpret', 'plain', 'structure', 'check'],
    quickCheck: {
      question: '「象数理占」中的「理」指什么？',
      options: ['义理阐释', '卦画符号', '筮数计算'],
      answer: '义理阐释',
      explanation: '理指对经传的义理阐发；符号是「象」，数字是「数」，占筮是「占」。',
    },
    sources: [
      { work: '周易·系辞上', dynasty: '先秦至汉', edition: '通行十三经注疏本', license: '公版' },
    ],
  },
];
