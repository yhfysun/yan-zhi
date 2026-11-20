import type {
  LearningV2CuratedCoursePlan,
  LearningV2Subject,
} from './v2-types.js';

export type MedicineBranch = 'tcm' | 'western';

export type MedicineTrack = {
  readonly id: string;
  readonly branch: MedicineBranch;
  readonly title: string;
  readonly note: string;
  readonly story: string;
  readonly goal: string;
  readonly topics: readonly string[];
  readonly sources: readonly string[];
};

export type MedicineLesson = {
  readonly id: string;
  readonly trackId: string;
  readonly trackTitle: string;
  readonly title: string;
  readonly courseName: string;
  readonly minutes: number;
};

export const MEDICINE_TRACKS: readonly MedicineTrack[] = [
  {
    id: 'tcm-0',
    branch: 'tcm',
    title: '中医 · 入门与经典',
    note: '先从安全边界、阅读方法和四部经典入手',
    story: '你拿到一只旧药箱，里面既有《黄帝内经》的摘抄，也有后世方书和一张没有署名的偏方。第一步不是照着抓药，而是分清哪些是原文、哪些是注解、哪些必须交给专业医生判断。',
    goal: '建立中医经典阅读框架，知道经典、证候、方药和现代诊疗之间不能直接画等号。',
    topics: [
      '医学通识与安全边界',
      '《黄帝内经》先读什么',
      '《伤寒论》的六经观察框架',
      '《金匮要略》怎样读杂病',
      '《神农本草经》与后世本草',
    ],
    sources: [
      '《黄帝内经》公版文本，中国哲学书电子化计划。https://ctext.org/huangdi-neijing',
      '《伤寒论》公版文本，中国哲学书电子化计划。https://ctext.org/shang-han-lun',
      '《金匮要略》公版文本，中国哲学书电子化计划。https://ctext.org/jinkui-yaolue',
      '《神农本草经》公版文本入口。https://ctext.org/shen-nong-ben-cao-jing',
      '国家中医药管理局公开政策、标准与科普信息。https://www.satcm.gov.cn/',
    ],
  },
  {
    id: 'tcm-1',
    branch: 'tcm',
    title: '中医 · 四诊与辨证',
    note: '把望闻问切、八纲、脏腑与经络拆成可记录的信息',
    story: '一位来访者说自己“湿气重”。你没有立刻附和，而是把这句话拆回睡眠、饮食、二便、舌象、脉象和情绪等可观察信息，再区分这些描述来自本人、旧病历还是网络文章。',
    goal: '能用结构化语言记录观察，分清症状、证候、体质和西医病名，不把标签当诊断。',
    topics: [
      '四诊：望闻问切的记录方式',
      '八纲：表里寒热虚实',
      '脏腑与气血津液的功能网络',
      '经络与穴位：地图不是诊断',
      '体质、证候与病名不要混用',
    ],
    sources: [
      '《黄帝内经》公版文本。https://ctext.org/huangdi-neijing',
      '《难经》公版文本入口。https://ctext.org/nan-jing',
      '国家中医药管理局公开标准与科普信息。https://www.satcm.gov.cn/',
      'WHO Traditional, Complementary and Integrative Medicine 专题。https://www.who.int/health-topics/traditional-complementary-and-integrative-medicine',
    ],
  },
  {
    id: 'tcm-2',
    branch: 'tcm',
    title: '中医 · 本草、方剂与针灸',
    note: '理解方药结构、性味功效、证据与安全风险',
    story: '一张方子写了十二味药，旁边还有“祖传加量”四个字。你要先辨认君臣佐使和剂量依据，再查特殊人群、相互作用与不良反应；没有处方权，就不能把课堂笔记变成给真人抓药的指令。',
    goal: '能从结构、适应证、剂量、禁忌和证据五方面阅读本草、方剂与针灸材料。',
    topics: [
      '君臣佐使：方剂的结构',
      '常见本草：性味、功效与风险',
      '针灸入门：刺激、证据与安全',
      '中药相互作用与特殊人群',
      '中医养生：原则、证据与禁区',
    ],
    sources: [
      '《神农本草经》公版文本入口。https://ctext.org/shen-nong-ben-cao-jing',
      '国家中医药管理局公开标准与科普信息。https://www.satcm.gov.cn/',
      'WHO Traditional, Complementary and Integrative Medicine 专题。https://www.who.int/health-topics/traditional-complementary-and-integrative-medicine',
      'PubMed 现代研究检索入口。https://pubmed.ncbi.nlm.nih.gov/',
    ],
  },
  {
    id: 'tcm-3',
    branch: 'tcm',
    title: '中医 · 医案与经典互证',
    note: '读主诉、病程、辨证、处方与转归，不读成成功学故事',
    story: '同一份医案里，初诊记录、复诊变化和多年后的追述混在一起。你先把它们按时间拆开，再核对谁记录了舌脉、谁调整了方药，以及哪些转归无法只归功于一张处方。',
    goal: '能读医案中的证据链，比较同病异治与异病同治，并识别需要现代医学转诊的边界。',
    topics: [
      '病案怎么读：主诉、病程与转归',
      '同病异治与异病同治',
      '倪海厦公开教学中的经典互证方法',
      '中西诊断语言如何对照',
      '医案复盘与转诊判断',
    ],
    sources: [
      '《伤寒论》公版文本。https://ctext.org/shang-han-lun',
      '《金匮要略》公版文本。https://ctext.org/jinkui-yaolue',
      '国家中医药管理局公开标准与科普信息。https://www.satcm.gov.cn/',
      '倪海厦公开教学资料仅用于观察其“经典与临床相互引证”的学习路径；不复制讲义，也不作为诊疗指南。',
      '现代医学证据检索入口。https://pubmed.ncbi.nlm.nih.gov/',
    ],
  },
  {
    id: 'tcm-4',
    branch: 'tcm',
    title: '中医 · 生活与协作',
    note: '把饮食、睡眠、情志和慢病沟通放回现实边界',
    story: '家人转发来三条“调理”建议：一条让你停掉降压药，一条让你每天喝一种草药茶，一条只讲早睡和适量运动。你要学会分别判断风险、证据和可讨论程度，并把问题带给真正负责治疗的医生。',
    goal: '能在生活方式、中医养生和现代慢病管理之间建立安全、可沟通的边界。',
    topics: [
      '饮食、睡眠与身体节律',
      '情志与身体：可验证的边界',
      '常见不适的中医学习路径',
      '慢性病管理中的协作沟通',
      '中医学习者的证据与伦理',
    ],
    sources: [
      '《黄帝内经》公版文本。https://ctext.org/huangdi-neijing',
      '国家中医药管理局公开标准与科普信息。https://www.satcm.gov.cn/',
      'WHO 健康主题与公共卫生资料。https://www.who.int/health-topics',
      'Cochrane Library 系统综述检索入口。https://www.cochranelibrary.com/',
    ],
  },
  {
    id: 'western-0',
    branch: 'western',
    title: '西医 · 人体与稳态',
    note: '从细胞、器官、系统到反馈与代偿',
    story: '体检单上只有一个箭头偏高，但身体没有明显不舒服。你先把指标放回器官系统、测量条件、基线变化和代偿机制，再判断它是一次孤立波动，还是需要继续核对的线索。',
    goal: '建立人体系统与稳态模型，能区分结构、功能、代偿和风险的层次。',
    topics: [
      '人体系统总图',
      '稳态、反馈与代偿',
      '细胞、组织与器官',
      '免疫、炎症与感染',
      '遗传、环境与疾病风险',
    ],
    sources: [
      'OpenStax Anatomy and Physiology 2e. https://openstax.org/details/books/anatomy-and-physiology-2e',
      'MedlinePlus Health Information. https://medlineplus.gov/',
      'WHO Health Topics. https://www.who.int/health-topics',
      'NCBI Bookshelf. https://www.ncbi.nlm.nih.gov/books/',
    ],
  },
  {
    id: 'western-1',
    branch: 'western',
    title: '西医 · 问诊、体检与症状',
    note: '从主诉和时间轴走向结构化检查',
    story: '夜间咳嗽持续了三周。有人凭经验说是过敏，有人担心肺部疾病。你先把起病时间、诱因、伴随症状、既往史和危险信号排成时间轴，再讨论检查和鉴别需要解决什么问题。',
    goal: '能用病史、时间轴、危险信号和体格检查建立问题清单，而不是把症状直接换成病名。',
    topics: [
      '症状不是诊断',
      '病史：时间轴与危险信号',
      '体格检查与生命体征',
      '常见检验指标怎么读',
      '影像检查：看见什么与看不见什么',
    ],
    sources: [
      'OpenStax Anatomy and Physiology 2e. https://openstax.org/details/books/anatomy-and-physiology-2e',
      'MedlinePlus Medical Tests. https://medlineplus.gov/lab-tests/',
      'WHO Health Topics. https://www.who.int/health-topics',
      '国家卫生健康委员会公开信息。https://www.nhc.gov.cn/',
    ],
  },
  {
    id: 'western-2',
    branch: 'western',
    title: '西医 · 检验、影像与诊断',
    note: '用概率、鉴别和证据把检查结果串起来',
    story: '同一项检查在低风险人群和高风险人群里，意义并不一样。你要同时看检查前可能性、敏感性、特异性、假阳性和后续确认路径，不能见到一个箭头就宣布结论。',
    goal: '理解从鉴别诊断到检查验证的基本逻辑，并能说明检查结果为何需要放在概率与人群中解释。',
    topics: [
      '鉴别诊断：先列可能性',
      '概率、敏感性与特异度',
      '感染与抗菌药',
      '心血管与代谢疾病',
      '肿瘤筛查与病理',
    ],
    sources: [
      'Cochrane Library. https://www.cochranelibrary.com/',
      'PubMed. https://pubmed.ncbi.nlm.nih.gov/',
      'MedlinePlus Medical Tests. https://medlineplus.gov/lab-tests/',
      'WHO Health Topics. https://www.who.int/health-topics',
    ],
  },
  {
    id: 'western-3',
    branch: 'western',
    title: '西医 · 药物、治疗与循证',
    note: '从药代动力到指南、随机试验与康复',
    story: '一位长期用药者看到网络文章说“副作用太大，可以停药”，却没有看到停药风险、剂量递减和替代方案。你要把药物作用、相互作用、证据等级和临床监测放在同一张表里。',
    goal: '能解释药物、治疗、指南和证据之间的关系，知道个体化治疗不等于自行加减药。',
    topics: [
      '药物如何起效与代谢',
      '抗生素与耐药',
      '手术、介入与康复',
      '随机对照试验与临床指南',
      '副作用、相互作用与依从性',
    ],
    sources: [
      'Cochrane Library. https://www.cochranelibrary.com/',
      'PubMed. https://pubmed.ncbi.nlm.nih.gov/',
      'MedlinePlus Drugs and Supplements. https://medlineplus.gov/druginformation.html',
      'WHO Essential Medicines List. https://www.who.int/groups/expert-committee-on-selection-and-use-of-essential-medicines/essential-medicines-lists',
    ],
  },
  {
    id: 'western-4',
    branch: 'western',
    title: '西医 · 急救、公卫与协作',
    note: '认识急救链、疫苗、随访和医疗沟通',
    story: '家里突然有人倒地，群聊里立刻出现十种“急救经验”。真正需要的是先呼叫急救、判断环境安全和呼吸循环，再由专业人员接管；事后复习知识可以帮助理解，却不能替代现场处置。',
    goal: '掌握急救与公共卫生的学习边界，能把症状、时间轴和用药清单准确地交给专业人员。',
    topics: [
      '急救基础：呼叫、呼吸与循环',
      '公共卫生与疫苗',
      '慢病随访与健康记录',
      '医疗沟通：把症状说清楚',
      '医学信息核验与 AI 边界',
    ],
    sources: [
      'WHO Health Topics. https://www.who.int/health-topics',
      '国家卫生健康委员会公开信息。https://www.nhc.gov.cn/',
      'MedlinePlus. https://medlineplus.gov/',
      'Cochrane Library. https://www.cochranelibrary.com/',
    ],
  },
] as const;

export const MEDICINE_LESSONS: readonly MedicineLesson[] = MEDICINE_TRACKS.flatMap(
  (track) => track.topics.map((title, index) => ({
    id: `med-${track.id}-${String(index + 1).padStart(2, '0')}`,
    trackId: track.id,
    trackTitle: track.title,
    title,
    courseName: `${track.branch === 'tcm' ? '中医' : '西医'} · ${title}`,
    minutes: 24 + index * 2,
  })),
);

function medicinePlan(track: MedicineTrack, lesson: MedicineLesson): LearningV2CuratedCoursePlan {
  const topic = lesson.title;
  const isTcm = track.branch === 'tcm';
  const branchName = isTcm ? '中医' : '西医';
  const sourceText = track.sources.join('；');
  const evidenceLine = isTcm
    ? '同时区分经典原文、后世注解、现代研究和个人经验，不能把四类材料压成一句结论'
    : '同时查看研究对象、样本量、对照方式、终点指标和适用人群，不能把一条新闻当成临床指南';

  return {
    prerequisite: track.id === 'tcm-0' || track.id === 'western-0'
      ? '无需医学或古文基础；准备一份可记录时间、来源和不确定性的学习笔记。'
      : `先完成“${track.title}”的前一主题，保留观察记录、问题清单和来源标签。`,
    plainLanguageGoal: `学完“${topic}”后，能区分事实、解释、检查和行动边界，用${branchName}的一套术语说明问题，同时知道哪些情况必须交给医生或急救系统处理。`,
    guidedPractice: `围绕一个完全虚构的教学病例完成“观察—问题清单—${isTcm ? '证候与经典依据' : '鉴别与检查依据'}—安全边界”四栏记录，至少写一条反证和一个仍需核对的信息。`,
    independentPractice: `换一个不同年龄或不同病史的合成病例，重做“${topic}”的分析卡；不得填写真人姓名、联系方式、影像或可识别病历。`,
    commonErrors: isTcm
      ? [
        `把“${topic}”中的经典条文直接当作现代诊断或处方。`,
        '忽略同一术语在不同时代、注家和流派中的含义差异。',
        '只讲成功医案，不核对原始记录、转归、现代研究与急症转诊边界。',
      ]
      : [
        `把“${topic}”中的单个症状、指标或影像发现直接当作最终诊断。`,
        '忽略检查前概率、适用人群、敏感性与特异度，看到异常就直接下结论。',
        '把课程讨论当成对真人的用药、停药或急救指令。',
      ],
    sourceRefs: [
      ...track.sources,
      '医学课程只做通识、经典阅读和就医沟通训练；不提供个体诊断、处方、剂量或急救替代。',
    ],
    steps: [
      {
        title: '先看场景与安全边界',
        body: `“${topic}”从一个合成场景开始：${track.story} 这一步只允许记录人物为教学虚构、时间、主诉和已经发生的事实。任何真实胸痛、呼吸困难、意识改变、大出血或自伤风险，都应优先联系当地急救或专业医疗人员，课程页面不判断真人的紧急程度。`,
        note: '事实、场景和安全边界先分开',
        objective: `能说清“${topic}”要解决的学习问题，并识别至少一条必须停止课程讨论、转向专业帮助的红线。`,
        practice: '写一张三栏卡：已知事实、仍缺信息、不能自行处理的高风险情况；三栏都不得补造病例内容。',
        checkpoint: '如果有人在对话中描述正在发生的严重不适，你会停止哪种推理、建议联系谁，以及不会给出什么？',
      },
      {
        title: '建立时间轴与观察表',
        body: `围绕“${topic}”先按“何时开始、怎样变化、伴随什么、既往如何处理”建立时间轴。${isTcm ? '中医记录要区分望闻问切所得、本人自述和旧资料转述，舌象与脉象只能作为记录项，不能脱离场景单独下证候。' : '西医记录要区分症状、生命体征、检查结果和诊断假设，单项异常先回到测量条件、基线与重复验证。'}`,
        note: isTcm ? '四诊信息要有来源和时点' : '症状、体征、检查分层记录',
        objective: '能把混杂描述拆成按时间排列的事实，并标出缺失、矛盾与来源不明的信息。',
        practice: '为合成病例补一条时间轴和四项必要观察；每项都写明来源、时间与目前的不确定性。',
        checkpoint: '时间轴中最容易被忽略的转折点在哪里？如果删掉这条信息，结论会怎样改变？',
      },
      {
        title: isTcm ? '回到经典与注疏' : '回到人体机制与证据',
        body: isTcm
          ? `学习“${topic}”要回到可核对的公版经典，再并排看后世注家如何解释。先抄原文、再写字词和语境，最后标出哪一句是原注、哪一句是白话转述。倪海厦公开教学可用来观察“经典—临床—复盘”的提问顺序，但讲座不是统一教材，更不能替代执业诊疗。`
          : `学习“${topic}”要回到人体结构、功能、反馈与代偿，再查看指南和研究如何验证这些机制。${evidenceLine}。课程中的机制图用于解释问题，不用于给真人贴病名。`,
        note: isTcm ? '原文、注解与现代解释分层' : '机制、证据与适用人群分层',
        objective: `能引用一条可追溯材料解释“${topic}”，并指出它的时代、方法或证据限制。`,
        practice: `从本课来源中选两条材料，分别填写“作者/机构、年代、材料类型、能支持什么、不能支持什么”，再写一条${isTcm ? '原注与转述' : '机制与临床结论'}的区别。`,
        checkpoint: `你引用的材料能直接支持“${topic}”的哪一个结论？换一个年龄段、病程或严重程度，它是否仍适用？`,
      },
      {
        title: '列出解释并主动找反证',
        body: `围绕“${topic}”至少列出两种竞争性解释。${isTcm ? '中医路径重点检查证候是否由足够信息支持、同病异治的差异来自哪里；现代医学路径则检查病名、危险分层和检查结果是否一致。' : '西医路径重点检查鉴别诊断、检查前概率与假阳性；同时保留中医证候或患者体验作为沟通信息，但不让两套术语互相冒充。'} 每条解释都要写支持证据、反对证据和下一步需要核对什么。`,
        note: '先保留竞争解释，再决定下一步',
        objective: '能区分观察、解释和结论，并说出一个足以修正当前判断的反证。',
        practice: '做一张“解释 A / 解释 B / 支持 / 反对 / 下一步”对照表，至少给每个解释补一条反证。',
        checkpoint: '哪一种信息出现时，你会放弃当前最强的解释？这条信息是可观察的、可复核的，还是事后讲故事？',
      },
      {
        title: '把学习结论变成安全行动',
        body: `“${topic}”的学习结论只能用于理解问题、准备就医沟通或识别需要专业帮助的情况。${isTcm ? '不得据课程给出中药、针灸、放血、艾灸或其他治疗的个体方案；已有处方、慢病用药和特殊人群问题必须由执业医师或药师核对。' : '不得据课程自行开始、停用或更换处方药，也不得用网络结论替代体检、检验或急诊评估。'} 遇到急症、药物过量、严重过敏、意识改变或持续恶化，优先联系当地急救系统。`,
        note: '学习建议不能越权成医疗指令',
        objective: '能把分析整理成一份不含处方和诊断指令的就医沟通摘要。',
        practice: '写四行摘要：症状时间轴、既往病史与用药、希望医生解释的问题、当前最担心的风险；不写自行用药方案。',
        checkpoint: '这份摘要中哪一句可能被误解成诊断或处方？请改写为“我观察到什么、我担心什么、请专业人员核对什么”。',
      },
      {
        title: '复盘证据、伦理与迁移',
        body: `最后复盘“${topic}”：哪些结论来自原文或指南，哪些只是本课解释，哪些仍没有证据；是否保护了病例隐私，是否把中医证候和西医诊断的适用范围说清。来源包括：${sourceText}。下一次换病种或人物时，保留“先记录、再解释、后核验”的顺序，不保留未经证明的固定答案。`,
        note: '来源、隐私、边界与迁移一起复盘',
        objective: '能向另一名学习者复述本课的结论、证据、限制和停止条件。',
        practice: '提交一页复盘：两条来源、一个反证、一个安全边界、一个仍需查证的问题，以及一条对真人绝不执行的越权操作。',
        checkpoint: '如果把病例换成一个儿童、孕妇或长期多药使用者，哪些推理必须重做？你还需要哪些专业信息才能继续讨论？',
      },
    ],
  };
}

export const MEDICINE_CURATED_PLANS: Readonly<Record<string, LearningV2CuratedCoursePlan>> =
  Object.fromEntries(MEDICINE_LESSONS.map((lesson) => {
    const track = MEDICINE_TRACKS.find((item) => item.id === lesson.trackId)!;
    return [`medicine:${lesson.courseName}`, medicinePlan(track, lesson)];
  }));

const firstCourse = MEDICINE_LESSONS[0];
const firstPlan = MEDICINE_CURATED_PLANS[`medicine:${firstCourse.courseName}`];

export const MEDICINE_SUBJECT: LearningV2Subject = {
  key: 'medicine',
  name: '医学',
  short: '医学',
  accent: '#1f6f5c',
  tint: '#edf7f2',
  line: '中医与西医两条路径并列学习：先看安全边界，再读经典与人体机制，最后练习证据判断和就医沟通。',
  current: {
    stage: '中医 · 入门与经典',
    course: firstCourse.courseName,
    step: '边界',
    progress: 0,
    minutes: firstCourse.minutes,
  },
  stats: [
    ['2', '医学分支'],
    [String(MEDICINE_LESSONS.length), '系统课程'],
    ['10', '学习阶段'],
  ],
  tracks: MEDICINE_TRACKS.map((track) => ({
    name: track.title,
    note: track.note,
    courses: MEDICINE_LESSONS
      .filter((lesson) => lesson.trackId === track.id)
      .map((lesson) => ({
        name: lesson.courseName,
        meta: `${lesson.minutes} 分钟`,
      })),
  })),
  lesson: {
    labels: ['场景', '观察', '依据', '鉴别', '边界', '复盘'],
    eyebrow: '医学通识 · 中医与西医双路径 · 合成病例',
    title: firstCourse.courseName,
    goal: firstPlan.plainLanguageGoal,
    minutes: firstCourse.minutes,
    steps: firstPlan.steps,
  },
  practice: {
    prompt: '学习一个“胸痛伴冷汗”的合成病例时，第一步最合适的是？',
    options: [
      '记录时间轴、伴随症状和危险信号，并明确这是教学病例',
      '先按体质给一个中药方',
      '只按病名背一个确定诊断',
    ],
    answer: 0,
    explanation: '医学学习先处理事实、时间轴与安全边界；合成病例也不能被当作对真人的诊断或处方依据。',
    focus: '安全边界与时间轴',
  },
  review: {
    due: 8,
    mastery: 0,
    items: [
      '急症与就医边界',
      '中医四诊记录',
      '西医病史时间轴',
      '鉴别诊断与检查概率',
      '药物相互作用',
      '证据来源核验',
    ],
  },
  coach: {
    opening: '先告诉我你遇到的是哪类学习材料：经典原文、人体机制、检查指标，还是一个合成病例。我不会替真人诊断，也不会给你处方。',
    prompts: [
      '把这段经典拆成原文、注解和白话',
      '用时间轴整理一个合成病例',
      '比较中医证候与西医诊断的边界',
      '检查一项医学信息的证据等级',
    ],
  },
  book: {
    shelf: [
      '医学通识与经典阅读手册',
      '《黄帝内经》选读',
      '人体生理与循证医学入门',
    ],
    title: '医学通识与经典阅读手册',
    unit: '安全边界、经典阅读与证据判断',
    kind: '医学通识',
    original: '上工治未病，不治已病。',
    translation: '好的医学关注风险预防和早期变化，不只等到疾病形成后才处理。',
    notes: [
      { term: '治未病', text: '传统医学强调预防与早期干预；现代使用时要区分公共卫生、筛查、生活方式和个体诊疗。' },
      { term: '证候', text: '中医对一组可观察表现及其关系的概括，不等同于西医疾病诊断，也不能替代必要检查。' },
      { term: '鉴别诊断', text: '在诊断尚未确定时并列比较多种可能，用病史、体检和检查逐步缩小范围。' },
    ],
    annotation: '医学学习先建立安全和证据边界，再比较中医与西医如何描述人体、疾病和干预。两套体系可以用于理解与沟通，但课程不提供真人诊断、处方、剂量或急救替代。',
    source: '《黄帝内经》《伤寒论》《金匮要略》《神农本草经》公版文本；现代医学参考 WHO、国家卫健委、国家中医药管理局、MedlinePlus 与 Cochrane。',
  },
  studio: {
    type: '医学思考与沟通演练台',
    title: '从固定病例到双路径复盘',
    task: '使用预写合成病例完成观察、时间轴、危险信号复核、双路径解释和就医沟通摘要。',
    steps: ['固定病例', '观察记录', '双路径解释', '红旗复核', '沟通产出', '证据复盘'],
    output: '一份不含个人隐私、处方和诊断指令的病例学习卡',
    boundary: '只做医学通识、经典阅读和就医沟通训练；不诊断真人，不提供处方、剂量、停药或急救替代。',
    features: ['中医经典', '西医机制', '合成病例', '危险信号', '双路径对照', '证据核验'],
  },
};
