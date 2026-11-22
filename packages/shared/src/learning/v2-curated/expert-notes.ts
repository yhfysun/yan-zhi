import type { LearningV2ExpertNote } from '../v2-types.js';

/**
 * 科目级「名家注解 · 真实笔记」池（2026-11-21 扩展：22 科全覆盖）。
 *
 * 硬规矩（docs/学习模式设计准则.md）：
 * - 「公版古注」条目必须逐字摘录且标到篇目，写入前逐条核对。已联网核对（2026-11-21）：
 *   乾大象传、乾彖传、序卦传、系辞上、系辞下、王弼《周易略例·明彖》、朱熹《论语集注·学而》、
 *   孙过庭《书谱》、《礼记·乐记》、《礼记·大学》、《礼记·学记》、《礼记·礼运》、《礼记·中庸》、
 *   《韩非子·五蠹》、《题卫夫人笔阵图后》（汉典古籍）、《孔子家语·在厄》（古诗文网）、
 *   《伤寒论》第 16 条、《毛诗序》（昭明文选/古诗文网）、王逸《离骚经序》（识典古籍）、
 *   《周髀算经》商高（百科/中科院引文）、《孙子兵法·虚实篇》、《管子·牧民》
 *   （求是网辨正：原文用「则」，史记引作「而」）、《荀子·劝学》、《孟子·滕文公下》、
 *   《孟子·告子下》、《论语·雍也》、《论语·学而》、蔡邕《九势》（汉典古籍）、
 *   《伤寒论·自序》（西安市中医院引文）、《礼记·曲礼上》（识典古籍）、
 *   《左传·庄公十年》（古诗文网）、《战国策·赵策一》（人民网/教育部引例核对）、
 *   《文心雕龙·知音》（识典古籍）。
 *   其余条目均为传世名句；新增条目必须先核对原文再写入。
 * - 「整理笔记」条目不冒充引文：正文是可执行记法，出处写真实公开资料（含链接）。
 * - 现代商业出版物（市售状元笔记、商业书摘、在版权内的现代译本）一律不逐字复制；
 *   优先引公版（古代典籍、NIST 政府出版物、马克思恩格斯原著）或开放许可内容
 *   （OpenStax CC BY、OI Wiki CC BY-SA、Pro Git CC BY-NC-SA）。
 * - 没有可靠条目的科目留空数组，页面就不展示该区，不拿模板凑数。
 *
 * 继续扩展流程（下次照做）：
 * 1. 选定科目/典籍 → 联网核对原文（ctext.org / wikisource / 汉典古籍 / 古诗文网 / 识典古籍，
 *    现代资料优先官方页：OWASP、MDN、NIST、OpenStax、OI Wiki、BBC、Cornell、NHK、JLPT）。
 * 2. 核对通过后在本文件对应科目池追加条目；「公版古注」逐字摘录标篇目并把书名登记进本注释核对清单。
 * 3. 更新头部核对清单 → 跑 packages/shared `npx vitest run src/learning`（35 个测试含契约守卫）
 *    和 packages/ui `npx vitest run src/views/LearningV2.mount.test.ts`（42 个）→ shared build。
 * 4. 尚可扩展的方向：王弼《周易注》逐卦注、朱熹《论语集注》逐章注、程颐《伊川易传》、
 *    《礼记》其余各篇、《诗经》毛传郑笺具体注文、OWASP 剩余手册（CSRF/错误处理/数据篡改防护）、
 *    MDN CSS 与表单专题、书法科笔画练习整理（配合书法实践重构任务，见
 *    docs/Learning-V2问题与修复任务-2026-11-17.md 待处理区）。
 */
export const SUBJECT_EXPERT_NOTES: Readonly<Record<string, readonly LearningV2ExpertNote[]>> = {
  zhouyi: [
    {
      label: '公版古注',
      source: '《周易·乾卦·大象传》，公版通行本；电子对照 https://ctext.org/book-of-changes',
      quote: '天行健，君子以自强不息。',
    },
    {
      label: '公版古注',
      source: '《周易·坤卦·大象传》，公版通行本；电子对照 https://ctext.org/book-of-changes',
      quote: '地势坤，君子以厚德载物。',
    },
    {
      label: '公版古注',
      source: '王弼《周易略例·明彖》，公版；电子对照 https://zh.wikisource.org/wiki/周易略例',
      quote: '夫《彖》者，何也？统论一卦之体，明其所由之主者也。夫众不能治众，治众者，至寡者也。',
    },
    {
      label: '公版古注',
      source: '《周易·乾卦·彖传》，公版通行本；电子对照 https://ctext.org/book-of-changes',
      quote: '大哉乾元，万物资始，乃统天。',
    },
    {
      label: '公版古注',
      source: '《周易·系辞上》，公版通行本；电子对照 https://ctext.org/book-of-changes',
      quote: '易有太极，是生两仪，两仪生四象，四象生八卦。',
    },
    {
      label: '公版古注',
      source: '《周易·系辞上》，公版通行本；电子对照 https://ctext.org/book-of-changes',
      quote: '一阴一阳之谓道。',
    },
    {
      label: '公版古注',
      source: '《周易·系辞下》，公版通行本；电子对照 https://ctext.org/book-of-changes',
      quote: '穷则变，变则通，通则久。',
    },
    {
      label: '公版古注',
      source: '《周易·序卦传》，公版通行本；电子对照 https://ctext.org/book-of-changes',
      quote: '有天地，然后万物生焉。',
    },
  ],
  divination: [
    {
      label: '公版古注',
      source: '《周易·系辞上》，公版通行本；电子对照 https://ctext.org/book-of-changes',
      quote: '极数知来之谓占，通变之谓事，阴阳不测之谓神。',
    },
    {
      label: '整理笔记',
      source: '课程记录规范整理（占筮记录边界）',
      quote: '占筮记录三栏：所问之事｜卦爻与断辞原文｜事后应验与偏差。每月回看统计一次；记录只当文本与历史练习，不替代任何现实决策。',
    },
  ],
  culture: [
    {
      label: '公版古注',
      source: '朱熹《四书章句集注·论语集注·学而第一》，公版；电子对照 https://ctext.org/confucianism',
      quote: '习，鸟数飞也。学之不已，如鸟数飞也。说，喜意也。既学而又时时习之，则所学者熟，而中心喜说，其进自不能已矣。',
    },
    {
      label: '公版古注',
      source: '《论语·学而》，公版通行本；电子对照 https://ctext.org/analects',
      quote: '学而时习之，不亦说乎？有朋自远方来，不亦乐乎？',
    },
    {
      label: '公版古注',
      source: '《论语·为政》，公版通行本；电子对照 https://ctext.org/analects',
      quote: '学而不思则罔，思而不学则殆。',
    },
    {
      label: '公版古注',
      source: '《论语·为政》，公版通行本；电子对照 https://ctext.org/analects',
      quote: '温故而知新，可以为师矣。',
    },
    {
      label: '公版古注',
      source: '《毛诗序》（《昭明文选》卷四十五收录），公版；电子对照 https://ctext.org/wen-xuan',
      quote: '诗者，志之所之也。在心为志，发言为诗。情动于中而形于言。',
    },
    {
      label: '公版古注',
      source: '《诗经·周南·关雎》，公版通行本（毛传郑笺本）；电子对照 https://ctext.org/book-of-poetry',
      quote: '关关雎鸠，在河之洲。窈窕淑女，君子好逑。',
    },
    {
      label: '公版古注',
      source: '屈原《离骚》，公版通行本（王逸《楚辞章句》为最早全注本）；电子对照 https://ctext.org/chu-ci',
      quote: '路漫漫其修远兮，吾将上下而求索。',
    },
    {
      label: '公版古注',
      source: '王逸《楚辞章句·离骚经序》，东汉公版；电子对照 https://ctext.org/chu-ci',
      quote: '离，别也。骚，愁也。经，径也。言己放逐离别，中心愁思，犹依道径，以风谏君也。',
    },
    {
      label: '公版古注',
      source: '《礼记·大学第四十二》，公版通行本；电子对照 https://ctext.org/liji/da-xue',
      quote: '大学之道，在明明德，在亲民，在止于至善。',
    },
    {
      label: '公版古注',
      source: '《礼记·学记第十八》，公版通行本；电子对照 https://ctext.org/liji/xue-ji',
      quote: '玉不琢，不成器；人不学，不知道。',
    },
    {
      label: '公版古注',
      source: '《礼记·学记第十八》，公版通行本；电子对照 https://ctext.org/liji/xue-ji',
      quote: '学然后知不足，教然后知困。',
    },
    {
      label: '公版古注',
      source: '《孟子·滕文公下》，公版通行本；电子对照 https://ctext.org/mengzi',
      quote: '富贵不能淫，贫贱不能移，威武不能屈。此之谓大丈夫。',
    },
    {
      label: '公版古注',
      source: '《论语·学而》，公版通行本；电子对照 https://ctext.org/analects',
      quote: '吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？',
    },
    {
      label: '公版古注',
      source: '《论语·雍也》，公版通行本；电子对照 https://ctext.org/analects',
      quote: '知之者不如好之者，好之者不如乐之者。',
    },
    {
      label: '公版古注',
      source: '《孟子·告子下》，公版通行本；电子对照 https://ctext.org/mengzi',
      quote: '人恒过，然后能改……然后知生于忧患而死于安乐也。',
    },
  ],
  schools: [
    {
      label: '公版古注',
      source: '《老子·第八章》，公版通行本；电子对照 https://ctext.org/dao-de-jing',
      quote: '上善若水。水善利万物而不争，处众人之所恶，故几于道。',
    },
    {
      label: '公版古注',
      source: '《庄子·养生主》，公版通行本；电子对照 https://ctext.org/zhuangzi',
      quote: '吾生也有涯，而知也无涯。以有涯随无涯，殆已！',
    },
    {
      label: '公版古注',
      source: '《韩非子·五蠹》，公版通行本；电子对照 https://ctext.org/hanfeizi',
      quote: '世异则事异，事异则备变。',
    },
    {
      label: '公版古注',
      source: '《老子·第三十三章》，公版通行本；电子对照 https://ctext.org/dao-de-jing',
      quote: '知人者智，自知者明。',
    },
    {
      label: '公版古注',
      source: '《老子·第六十四章》，公版通行本；电子对照 https://ctext.org/dao-de-jing',
      quote: '合抱之木，生于毫末；九层之台，起于累土；千里之行，始于足下。',
    },
    {
      label: '公版古注',
      source: '《孔子家语·在厄第二十》（三国王肃注本），公版；电子对照 https://gj.zdic.net/zibu/526/',
      quote: '芝兰生于深林，不以无人而不芳；君子修道立德，不为穷困而改节。',
    },
    {
      label: '公版古注',
      source: '《荀子·劝学》，公版通行本；电子对照 https://ctext.org/xunzi',
      quote: '故不积跬步，无以至千里；不积小流，无以成江海。',
    },
    {
      label: '公版古注',
      source: '《荀子·劝学》，公版通行本；电子对照 https://ctext.org/xunzi',
      quote: '锲而舍之，朽木不折；锲而不舍，金石可镂。',
    },
  ],
  history: [
    {
      label: '公版古注',
      source: '司马迁《报任安书》（见《汉书·司马迁传》），公版；电子对照 https://ctext.org/hanshu',
      quote: '人固有一死，或重于泰山，或轻于鸿毛。',
    },
    {
      label: '公版古注',
      source: '司马迁《史记·太史公自序》，公版通行本；电子对照 https://ctext.org/shiji',
      quote: '究天人之际，通古今之变，成一家之言。',
    },
    {
      label: '公版古注',
      source: '司马迁《史记·陈涉世家》，公版通行本；电子对照 https://ctext.org/shiji',
      quote: '燕雀安知鸿鹄之志哉！',
    },
    {
      label: '公版古注',
      source: '贾谊《过秦论》（《史记·秦始皇本纪》引录），公版；电子对照 https://ctext.org/shiji',
      quote: '仁义不施而攻守之势异也。',
    },
    {
      label: '公版古注',
      source: '刘向《战国策·赵策一》，公版通行本；电子对照 https://ctext.org/zhanguoce',
      quote: '前事之不忘，后事之师。',
    },
  ],
  calligraphy: [
    {
      label: '公版古注',
      source: '孙过庭《书谱》，唐代公版；电子对照 https://zh.wikisource.org/wiki/書譜',
      quote: '察之者尚精，拟之者贵似。',
    },
    {
      label: '公版古注',
      source: '传王羲之《题卫夫人〈笔阵图〉后》，公版；汉典古籍电子对照 https://gj.zdic.net/zibu/218/',
      quote: '夫纸者阵也，笔者刀矟也，墨者鍪甲也，水砚者城池也，心意者将军也，本领者副将也，结构者谋略也。',
    },
    {
      label: '整理笔记',
      source: '永字八法口诀整理（唐代张怀瓘《玉堂禁经》等历代书论有载，公版）',
      quote: '永字八法把楷书笔画拆成八种运笔：侧、勒、努、趯、策、掠、啄、磔。练字顺序：先中锋行笔，再谈间架结构，临帖先读帖再落笔。',
    },
    {
      label: '公版古注',
      source: '蔡邕《九势》，东汉公版；汉典古籍电子对照 https://gj.zdic.net/zibu/210/',
      quote: '藏头护尾，力在字中，下笔用力，肌肤之丽。故曰：势来不可止，势去不可遏，惟笔软则奇怪生焉。',
    },
    {
      label: '公版古注',
      source: '蔡邕《九势》，东汉公版；汉典古籍电子对照 https://gj.zdic.net/zibu/210/',
      quote: '藏头，圆笔属纸，令笔心常在点画中行。护尾，画点势尽，力收之。',
    },
    {
      label: '整理笔记',
      source: '教育部《中小学书法教育指导纲要》（2013）临摹要求整理',
      quote: '临帖三步：读帖（看清笔顺、结构、轻重）→摹写（描红或透纸）→对临（合上帖写一遍再对照找差异）。每天一个字写三遍，不如三个字各写一遍再对照。',
    },
  ],
  music: [
    {
      label: '公版古注',
      source: '《礼记·乐记第十九》，东汉郑玄注本公版；电子对照 https://ctext.org/liji/le-ji',
      quote: '凡音之起，由人心生也。人心之动，物使之然也。',
    },
    {
      label: '公版古注',
      source: '《礼记·乐记第十九》，东汉郑玄注本公版；电子对照 https://ctext.org/liji/le-ji',
      quote: '乐者，音之所由生也；其本在人心之感于物也。',
    },
    {
      label: '公版古注',
      source: '《礼记·乐记第十九》，东汉郑玄注本公版；电子对照 https://ctext.org/liji/le-ji',
      quote: '感于物而动，故形于声。声相应，故生变；变成方，谓之音。',
    },
    {
      label: '整理笔记',
      source: '课程通用整理（视唱练耳每日流程）',
      quote: '每天三件套：跟节拍器唱一遍音阶（唱名而非啦音）、听单音后哼出并核对、听一段旋律记下主干音再对照原谱。耳朵是练出来的，每天 15 分钟胜过周末突击 2 小时。',
    },
  ],
  military: [
    {
      label: '公版古注',
      source: '《孙子兵法·谋攻篇》，公版通行本；电子对照 https://ctext.org/art-of-war',
      quote: '知己知彼，百战不殆；不知彼而知己，一胜一负。',
    },
    {
      label: '公版古注',
      source: '《孙子兵法·谋攻篇》，公版通行本；电子对照 https://ctext.org/art-of-war',
      quote: '上兵伐谋，其次伐交，其次伐兵，其下攻城。',
    },
    {
      label: '公版古注',
      source: '《孙子兵法·虚实篇》，公版通行本；电子对照 https://ctext.org/art-of-war',
      quote: '故善战者，致人而不致于人。',
    },
    {
      label: '公版古注',
      source: '《孙子兵法·始计篇》，公版通行本；电子对照 https://ctext.org/art-of-war',
      quote: '兵者，诡道也。故能而示之不能，用而示之不用。',
    },
    {
      label: '公版古注',
      source: '《左传·庄公十年》（曹刿论战），公版通行本；电子对照 https://ctext.org/chunqiu-zuozhuan',
      quote: '夫战，勇气也。一鼓作气，再而衰，三而竭。彼竭我盈，故克之。',
    },
  ],
  party: [
    {
      label: '公版古注',
      source: '马克思、恩格斯《共产党宣言》（1848，公版）；中文译本电子对照 https://www.marxists.org/chinese/',
      quote: '一个幽灵，共产主义的幽灵，在欧洲游荡。',
    },
    {
      label: '公版古注',
      source: '马克思、恩格斯《共产党宣言》结尾（1848，公版）；中文译本电子对照 https://www.marxists.org/chinese/',
      quote: '全世界无产者，联合起来！',
    },
    {
      label: '整理笔记',
      source: '课程通用整理（党史事件三栏表）',
      quote: '学党史事件用三栏表：时间与背景｜文件或会议的核心内容｜它改变了什么。每月按时间线从头回看一遍，标出自己记混的事件。',
    },
  ],
  politics: [
    {
      label: '公版古注',
      source: '《礼记·礼运》，公版通行本；电子对照 https://ctext.org/liji/li-yun',
      quote: '大道之行也，天下为公。',
    },
    {
      label: '公版古注',
      source: '《论语·颜渊》，公版通行本；电子对照 https://ctext.org/analects',
      quote: '政者，正也。子帅以正，孰敢不正？',
    },
    {
      label: '公版古注',
      source: '《礼记·大学第四十二》，公版通行本；电子对照 https://ctext.org/liji/da-xue',
      quote: '物有本末，事有终始。知所先后，则近道矣。',
    },
    {
      label: '整理笔记',
      source: '课程通用整理（时政分析四步）',
      quote: '时政分析四步：先摆事实（谁、何时、何地），再查依据（原文或公报），然后并列不同立场的说法，最后写自己的判断和它依赖的前提。',
    },
  ],
  economics: [
    {
      label: '公版古注',
      source: '司马迁《史记·货殖列传》，公版通行本；电子对照 https://ctext.org/shiji',
      quote: '天下熙熙，皆为利来；天下攘攘，皆为利往。',
    },
    {
      label: '公版古注',
      source: '《管子·牧民》，公版通行本；电子对照 https://ctext.org/guanzi',
      quote: '仓廪实则知礼节，衣食足则知荣辱。',
    },
    {
      label: '整理笔记',
      source: '亚当·斯密《国富论》第四篇「看不见的手」（1776，公版；此处为大意整理，非逐字引文）',
      quote: '每个人只求自身利益，却常被一只「看不见的手」引导，促进了他原本无意追求的社会整体利益；分工与价格机制自动完成协调——同时记住斯密原话有前提条件，不是万能证词。',
    },
  ],
  memory: [
    {
      label: '整理笔记',
      source: '位置记忆法整理（西塞罗《论演说家》记载西蒙尼德斯之法，古罗马公版）；公开条目 https://en.wikipedia.org/wiki/Method_of_loci',
      quote: '记忆宫殿：把要记的内容按顺序「放」进熟悉场所的各处（家里、上学路线）；回忆时沿路线走一遍逐站取出。新内容优先挂在固定旧路线上。',
    },
    {
      label: '整理笔记',
      source: 'G. A. Miller《神奇的数字 7±2》（1956）公开条目 https://en.wikipedia.org/wiki/The_Magical_Number_Seven,_Plus_or_Minus_Two',
      quote: '短时记忆容量约 7±2：名单超过 7 项就分组成 3~5 块（如手机号 3+4 分段），给每块起一个口令词再整体记。',
    },
    {
      label: '整理笔记',
      source: 'A. Paivio 双重编码理论公开条目 https://en.wikipedia.org/wiki/Dual-coding_theory',
      quote: '记抽象概念时同时造一个画面：语言通道和图像通道各存一份，回忆时两条路都能走。比如记「通货膨胀」就画气球吹爆的超市货架。',
    },
  ],
  thinking: [
    {
      label: '公版古注',
      source: '《礼记·中庸》，公版通行本；电子对照 https://ctext.org/liji/zhong-yong',
      quote: '博学之，审问之，慎思之，明辨之，笃行之。',
    },
    {
      label: '整理笔记',
      source: '课程通用学习法整理（费曼技巧）',
      quote: '费曼四步：把概念讲给外行听一遍→记下卡壳的地方→回材料重学那块→用更简单的话重讲。讲不平就说明还没懂，别背定义应付。',
    },
    {
      label: '整理笔记',
      source: '五问法（5 Whys）公开条目（丰田生产方式）https://en.wikipedia.org/wiki/5_Whys',
      quote: '追问根因连问五个「为什么」：现象→为什么→为什么→……问到位才停，答案落在流程或机制上，而不是落在「某个人不小心」上。',
    },
    {
      label: '公版古注',
      source: '刘勰《文心雕龙·知音第四十八》，公版；电子对照 https://ctext.org/wenxin-diaolong',
      quote: '凡操千曲而后晓声，观千剑而后识器。故圆照之象，务先博观。',
    },
  ],
  math: [
    {
      label: '公版古注',
      source: '《周髀算经》卷上商高答周公，公版通行本；电子对照 https://ctext.org/zhoubi-suanjing',
      quote: '故折矩，以为勾广三，股修四，径隅五。',
    },
    {
      label: '整理笔记',
      source: '人教版高中数学「等差数列前 n 项和」推导整理 https://www.pep.com.cn/',
      quote: '等差数列求和用倒序相加：Sn 正写一遍、倒写一遍，对应项相加都等于 (a1 + an)，得 2Sn = n(a1 + an)，所以 Sn = n(a1 + an)/2。',
    },
    {
      label: '整理笔记',
      source: '人教版「二次函数」章节配方推导整理 https://www.pep.com.cn/',
      quote: '二次函数配方：y = ax² + bx + c = a(x + b/2a)² + c − b²/4a；顶点横坐标 −b/2a，纵坐标 (4ac − b²)/4a。先提 a 再配，带符号入式。',
    },
    {
      label: '整理笔记',
      source: '课程通用学习法整理（错题本三栏式）',
      quote: '错题本三栏：原题｜错因（概念 / 运算 / 审题三类选一）｜正解加一道变式。只收「以为会、再做还错」的题，每周日整本重做一遍。',
    },
  ],
  physics: [
    {
      label: '整理笔记',
      source: 'OpenStax《大学物理》（CC BY 4.0 开放教材）https://openstax.org/subjects/science',
      quote: '牛顿第二定律 F = ma 是矢量式：x、y 轴各自独立成立。斜面题先把坐标转到沿斜面方向，重力分解为 mgsinθ（沿斜面）和 mgcosθ（压斜面）。',
    },
    {
      label: '整理笔记',
      source: 'OpenStax《大学物理》（CC BY 4.0 开放教材）https://openstax.org/subjects/science',
      quote: '受力分析顺序口诀：先画重力，再画接触力（支持力垂直于接触面、摩擦力沿接触面），最后画外力；未知力设正方向再列方程，不先猜方向。',
    },
    {
      label: '整理笔记',
      source: '量纲分析（Dimensional Analysis）公开条目 https://en.wikipedia.org/wiki/Dimensional_analysis',
      quote: '解题先查量纲：等式两边单位必须一致，含加减项的单位必须相同；没思路时用已知量的量纲组合去猜公式结构（如涉及长度和时间猜 L/t），量纲不对的答案直接划掉。',
    },
  ],
  english: [
    {
      label: '整理笔记',
      source: '依艾宾浩斯记忆研究整理（1885，公版）；遗忘曲线公开条目 https://en.wikipedia.org/wiki/Forgetting_curve',
      quote: '背完一组词，按 20 分钟、1 天、1 周、1 个月的节奏各回看一次；回看时只测没记住的词，不重读全表。',
    },
    {
      label: '整理笔记',
      source: '依 BBC Learning English 免费公开课程方法整理 https://www.bbc.co.uk/learningenglish',
      quote: '影子跟读三步：先盲听抓大意，再逐句暂停跟读，最后原速同步跟读；每天 10 分钟，选 1 分钟以内的短音频。',
    },
    {
      label: '整理笔记',
      source: '依 British Council LearnEnglish 语法资料整理 https://learnenglish.britishcouncil.org/grammar',
      quote: '十六时态先抓四大类：一般、进行、完成、完成进行；每类先画时间轴、标锚点词，再套句型，不逐个死背。',
    },
    {
      label: '整理笔记',
      source: 'Cornell 学习中心公开页 https://lsc.cornell.edu/how-to-study/taking-notes/cornell-note-taking-method/',
      quote: '康奈尔笔记五步：右主栏记要点，左线索栏写关键词和问题，底部总结栏写三句小结；课后合上主栏，用线索栏自测。',
    },
    {
      label: '整理笔记',
      source: '课程通用整理（词根词缀拆词法）',
      quote: '新词先拆词根词缀：port（运）+ im-（进）→ import 进口，ex-（出）→ export 出口。每天拆 5 个，把常用前后缀表贴在书桌前，比死背单词表快。',
    },
  ],
  japanese: [
    {
      label: '整理笔记',
      source: '五十音图通用记法整理（对照平假名/片假名对照表）',
      quote: '五十音先背清音；浊音（゛）、半浊音（゜）、拗音（ゃゅょ小写）全是清音加符号变出来的，别单独死背。平假名管语法接续，片假名管外来语，见到新词先判断是哪套。',
    },
    {
      label: '整理笔记',
      source: 'NHK News Web Easy 免费新闻（汉字带注音）https://www3.nhk.or.jp/news/easy/',
      quote: '每天读一条 NHK NEWS WEB EASY：汉字全带假名注音。先盲读一遍，再对照注音自测假名和汉字读音，最后只摘 3 个新词进生词表。',
    },
    {
      label: '整理笔记',
      source: '日本语能力试验（JLPT）官方网站 https://www.jlpt.jp/',
      quote: 'JLPT 备考三线并行：文字词汇按真题词表背、读解每天一篇掐时间、听力听真题原文后跟读。错题按语法点归类（助词/时态/敬语），N3 起听力权重加大，先听懂再谈读写。',
    },
  ],
  algorithms: [
    {
      label: '整理笔记',
      source: 'OI Wiki（CC BY-SA 开放整理）https://oi-wiki.org/',
      quote: '先估数据规模再选算法：n ≤ 20 想指数级回溯；n ≤ 5000 想区间 DP；n ≤ 10⁵ 想排序、堆、线段树这类 n log n；n ≥ 10⁶ 只能 O(n) 或数学公式。',
    },
    {
      label: '整理笔记',
      source: 'OI Wiki「二分」条目（CC BY-SA）https://oi-wiki.org/basic/binary/',
      quote: '二分答案的前提是单调：「至少要 x 才可行」且「x−1 不可行」才能二分。写代码前先口头验证单调性，再定左右边界和取中方式，避免死循环。',
    },
    {
      label: '整理笔记',
      source: 'OI Wiki「动态规划」条目（CC BY-SA）https://oi-wiki.org/dp/',
      quote: 'DP 先写三样：状态定义、转移方程、边界初值，再谈优化；写完用最小例子（n=2、n=3）手算一遍验证转移，跑不通先回头改状态定义而不是改代码。',
    },
  ],
  programming: [
    {
      label: '整理笔记',
      source: 'MDN Web Docs「Array」官方参考 https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Array',
      quote: '记数组方法按「是否改原数组」分两类：push / pop / shift / splice / sort 改原数组；map / filter / slice / concat 返回新数组。写纯函数一律用第二类。',
    },
    {
      label: '整理笔记',
      source: 'PEP 8（Python 官方风格指南）https://peps.python.org/pep-0008/',
      quote: 'PEP 8 要点：缩进 4 空格；import 按标准库 / 第三方 / 本地分三组空行隔开；函数和变量 snake_case，类名 PascalCase，常量全大写。',
    },
    {
      label: '整理笔记',
      source: 'Pro Git 官方书（git-scm.com，CC BY-NC-SA）https://git-scm.com/book',
      quote: '提交信息：首行 ≤ 50 字写「做了什么」，空一行后正文写「为什么这么改」；一次提交只做一件事，改坏了才好回滚和定位。',
    },
    {
      label: '整理笔记',
      source: 'Google 风格指南（公开）https://google.github.io/styleguide/',
      quote: '风格指南的共同底线：代码是写给人读的——命名见名知义、一行只做一件事；进别人的仓库先跟现有风格保持一致，不要混进第二套风格。',
    },
    {
      label: '整理笔记',
      source: 'TypeScript 官方手册（Handbook）https://www.typescriptlang.org/docs/handbook/',
      quote: 'TypeScript 的类型看「形状」不看名字：结构类型系统里，只要字段和类型对得上就兼容。报类型错误时先想「这个值的实际形状是什么」，别急着加 as 断言。',
    },
    {
      label: '整理笔记',
      source: 'MDN Web Docs「Promise」官方参考 https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Promise',
      quote: '异步状态只有三种：pending → fulfilled / rejected，落定后不可再变。链式调用里每个 then 返回的新 Promise 接住上一层的返回值；错误用 .catch 兜底，别混用回调写法。',
    },
    {
      label: '整理笔记',
      source: 'MDN Web Docs「事件循环」官方讲解 https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Event_loop',
      quote: 'JS 单线程靠事件循环排队：同步代码跑完 → 先清空微任务（Promise.then、queueMicrotask）→ 再取一个宏任务（setTimeout、事件）。setTimeout(fn, 0) 是宏任务，永远排在当前所有微任务后面。',
    },
    {
      label: '整理笔记',
      source: 'MDN Web Docs「无障碍（Accessibility）」学习专区 https://developer.mozilla.org/zh-CN/docs/Learn/Accessibility',
      quote: '可访问性自查四件套：每个交互元素用原生标签或补 role、图片有 alt、表单控件绑 label、颜色对比度达标（正文至少 4.5:1）；键盘 Tab 能走完整个流程才算及格。',
    },
    {
      label: '整理笔记',
      source: '课程通用工程整理（调试三板斧）',
      quote: '调试三板斧：先读报错第一行和堆栈最顶帧；再写最小复现步骤；最后二分定位——注释掉一半代码或按提交二分，找出是哪次改动引入的。',
    },
  ],
  security: [
    {
      label: '整理笔记',
      source: 'OWASP Top 10 官方清单 https://owasp.org/Top10/',
      quote: 'Web 安全风险从 OWASP Top 10 查起：注入、失效的身份认证、加密失败、越权访问……每项在官方页都有对应的防错做法，审计先对照清单再动手。',
    },
    {
      label: '整理笔记',
      source: 'OWASP Password Storage Cheat Sheet https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html',
      quote: '口令存储用 Argon2id 或 bcrypt 这类加盐慢哈希，绝不用 MD5 / SHA1 / 明文存口令；换算法时等用户下次登录再重哈希迁移。',
    },
    {
      label: '整理笔记',
      source: 'NIST SP 800-63B 数字身份指南（美国政府出版物，公版）https://pages.nist.gov/800-63-3/sp800-63b.html',
      quote: '口令策略优先长度不堆复杂度：允许用户设置至少 64 字符的长口令；不强制定期换密码；对照公开泄露口令黑名单拦截弱口令。',
    },
    {
      label: '整理笔记',
      source: 'OWASP Input Validation Cheat Sheet https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html',
      quote: '不信任任何用户可控输入：先白名单校验格式，再按输出目的地处理——进 SQL 用参数化、进 HTML 转义、进命令用安全 API，三道关口一个都不能省。',
    },
    {
      label: '整理笔记',
      source: 'OWASP Cross-Site-Scripting Prevention Cheat Sheet https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html',
      quote: '防 XSS 按「输出到哪」选编码：进 HTML 正文转义 < > &，进属性再加引号转义，进 JS/URL 用对应安全 API；不要自己手写正则过滤关键字，转义永远发生在输出处。',
    },
    {
      label: '整理笔记',
      source: 'OWASP Authentication Cheat Sheet https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html',
      quote: '登录防错要点：统一登录失败提示（不区分「密码错」还是「账号不存在」），登录接口限速防爆破，多因素认证优先给管理员和高风险账号开启。',
    },
    {
      label: '整理笔记',
      source: 'OWASP Session Management Cheat Sheet https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html',
      quote: '会话管理：会话 ID 登录成功后必须换新（防会话固定），Cookie 设 HttpOnly + Secure + SameSite；登出和改密码后立刻作废服务端会话。',
    },
    {
      label: '整理笔记',
      source: 'OWASP SQL Injection Prevention Cheat Sheet https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html',
      quote: '防 SQL 注入第一原则：用户数据只走参数化查询（预编译占位符），绝不字符串拼接；表名列名不能参数化时用白名单校验，错误信息不回显原始 SQL。',
    },
    {
      label: '整理笔记',
      source: 'OWASP API Security Top 10（2023）https://owasp.org/API-Security/editions/2023/en/0x11-t10/',
      quote: '接口安全看 API Top 10：对象级越权（BOLA）排第一——每个接口都要校验「这条数据是不是当前用户的」；再查认证失效、属性过度暴露和限流缺失。',
    },
    {
      label: '整理笔记',
      source: 'OWASP Cryptographic Storage Cheat Sheet https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html',
      quote: '加密存储分工明确：机密数据用对称加密（AES-GCM）且密钥独立管理；哈希只用于校验和口令（口令另用慢哈希）；绝不自创加密算法或 ECB 模式。',
    },
    {
      label: '整理笔记',
      source: 'OWASP Deserialization Cheat Sheet https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html',
      quote: '反序列化不可信数据等于远程执行：优先用 JSON 这类纯数据格式，绝不反序列化来自用户或网络的完整对象；必须用时校验签名 + 白名单类 + 隔离环境三选一以上。',
    },
    {
      label: '整理笔记',
      source: 'OWASP Logging Cheat Sheet https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html',
      quote: '安全日志记「事件」不记「秘密」：登录成败、权限变更、关键操作都要记（谁/何时/从哪来），但口令、令牌、身份证号绝不进日志；日志集中存放并做防篡改保护。',
    },
    {
      label: '整理笔记',
      source: 'MITRE CWE Top 25 年度弱点清单 https://cwe.mitre.org/top25/',
      quote: '最常见的 25 类软件弱点先排期修：跨站脚本、越权、SQL 注入常年霸榜。自查时按「输入从哪来、输出到哪去」逐条追踪用户可控数据。',
    },
  ],
  medicine: [
    {
      label: '公版古注',
      source: '张仲景《伤寒论·辨太阳病脉证并治》第 16 条，公版；电子对照 https://ctext.org/shang-han-lun',
      quote: '观其脉证，知犯何逆，随证治之。',
    },
    {
      label: '公版古注',
      source: '《黄帝内经·素问·四气调神大论》，公版通行本；电子对照 https://ctext.org/huangdi-neijing',
      quote: '圣人不治已病治未病，不治已乱治未乱。',
    },
    {
      label: '公版古注',
      source: '《黄帝内经·素问·上古天真论》，公版通行本；电子对照 https://ctext.org/huangdi-neijing',
      quote: '食饮有节，起居有常，不妄作劳。',
    },
    {
      label: '公版古注',
      source: '《黄帝内经·素问·刺法论》，公版通行本；电子对照 https://ctext.org/huangdi-neijing',
      quote: '正气存内，邪不可干。',
    },
    {
      label: '公版古注',
      source: '张仲景《伤寒论·自序》，公版通行本；电子对照 https://ctext.org/shang-han-lun',
      quote: '乃勤求古训，博采众方，撰用《素问》《九卷》《八十一难》《阴阳大论》，并平脉辨证，为《伤寒杂病论》。',
    },
  ],
  soft: [
    {
      label: '公版古注',
      source: '《论语·卫灵公》，公版通行本；电子对照 https://ctext.org/analects',
      quote: '己所不欲，勿施于人。',
    },
    {
      label: '整理笔记',
      source: '非暴力沟通（NVC）方法整理 https://www.cnvc.org/',
      quote: '提意见四步：只说观察到的事实（不贴标签）→说自己的感受→说出背后的需要→提一个具体可执行的请求；不用「你总是」「你从来」开头。',
    },
    {
      label: '公版古注',
      source: '《礼记·曲礼上第一》，东汉郑玄注本公版；电子对照 https://ctext.org/liji/qu-li-i',
      quote: '礼尚往来。往而不来，非礼也；来而不往，亦非礼也。夫礼者，自卑而尊人。',
    },
    {
      label: '整理笔记',
      source: '课程通用整理（复盘四步法）',
      quote: '做完一件事复盘四步：当初目标是啥→实际结果差在哪→原因分内因外因→提炼一条下次能直接用的做法。只写问题不写做法的复盘等于没做。',
    },
  ],
};
