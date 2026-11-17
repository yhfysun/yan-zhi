import type { CuratedCoursePlanMap } from './types.js';

export const MILESTONE_LANGUAGES_CULTURE_CURATED_PLANS = {
  'english:身体与健康': {
    prerequisite: '能识别基础名词可数性，会使用 have、feel 等简单动词。',
    plainLanguageGoal: '学完后，你能用身体部位、常见症状和健康建议词汇完成一次简单描述，并区分事实、感受和建议句。',
    guidedPractice: '把 head、shoulder、stomach、fever、cough 等词分到身体部位和症状两组，再配对“I have…”与“You should…”短句。',
    independentPractice: '写一段六句健康对话：描述一个症状、说明持续多久、询问建议、给出两条建议和一个就医边界。',
    commonErrors: [
      '把不可数症状词随意加复数，如 a fever 与 fevers 混用。',
      '把“我头痛”直译成 I am headache，混淆状态与拥有结构。',
      '把网络建议当作医疗诊断，忽略就医边界。',
    ],
    sourceRefs: [
      'Cambridge Dictionary Grammar 与 Health vocabulary 参考入口。https://dictionary.cambridge.org/',
      'World Health Organization 公开健康信息入口。https://www.who.int/',
      '课程对话为语言练习，不构成医疗建议。',
    ],
    steps: [
      {
        title: '先分身体部位与症状',
        body: 'head、stomach 是身体部位，fever、cough 是症状或状态。分类清楚后，才能选择 have、feel 或 hurt 等不同句型。',
        note: '部位、症状、动作分开',
      },
      {
        title: '练习描述句',
        body: '用“I have a headache”“My throat hurts”“I feel tired”描述不同状态。注意句型随词性变化，不逐字翻译中文。',
        note: '一句只选一个核心句型',
      },
      {
        title: '加入持续时间和程度',
        body: '使用 for two days、since yesterday、a little、very 等表达时长与程度。时间介词要和表达类型匹配。',
        note: '症状 + 时长 + 程度',
      },
      {
        title: '写对话并加就医边界',
        body: '完成询问与建议对话，再补一句“严重或持续症状应咨询医生”。语言练习不提供诊断，也不替代专业意见。',
        note: '语言目标与健康边界同时保留',
      },
    ],
  },
  'japanese:动词分类与ます形': {
    prerequisite: '完成名词句和五十音，能识别动词词尾并读基本假名。',
    plainLanguageGoal: '学完后，你能区分一类、二类、三类动词，把常见动词变为礼貌ます形，并用肯定、否定和疑问构造简单日常句。',
    guidedPractice: '把「書く」「食べる」「する」「来る」按三类动词分组，写出ます形、否定和过去形式，并朗读原形与变形。',
    independentPractice: '选五个日常动作动词，制作变形卡：原形、类别、ます形、否定、过去和例句；至少包含一个不规则动词。',
    commonErrors: [
      '只按词尾猜类别，忽略二类动词中看似一类的形式。',
      '把「する」和「来る」套用规则动词变化。',
      '会变形但不会在句中搭配助词和宾语。',
    ],
    sourceRefs: [
      'Tofugu, Japanese Verb Conjugation 入门资源。https://www.tofugu.com/japanese/',
      '青空文库公开日文作品，用于观察ます形和动词使用。https://www.aozora.gr.jp/',
      '课程动词表为原创教学整理。',
    ],
    steps: [
      {
        title: '先学分类判断',
        body: '一类动词通常以う段假名结尾，二类常见る结尾且前接い/え段，三类包括する和来る。分类是变形入口，但需要逐词核对。',
        note: '先分类，再变形',
      },
      {
        title: '把一类动词变为ます形',
        body: '一类动词把词尾变为い段并加ます，例如書く→書きます。不要只背一个词，要按行观察词尾变化。',
        note: '词尾行与い段对应',
      },
      {
        title: '处理二类和三类',
        body: '食べる→食べます，見る→見ます；する→します，来る→来ます。三类必须单独记忆，不套一类规则。',
        note: '不规则动词单独成卡',
      },
      {
        title: '构造肯定否定疑问',
        body: 'ます→ません→ました→ませんでした，疑问加か。用同一动词练四种形式，保持主语和宾语不变。',
        note: '只改变句尾时态与极性',
      },
      {
        title: '放回日常句',
        body: '用を、に、で等助词构造“读书”“去学校”“在家吃饭”等短句。变形正确但助词缺失仍不算完整表达。',
        note: '动词、助词、名词一起练',
      },
    ],
  },
  'security:云与容器安全': {
    prerequisite: '完成身份与访问管理、API 安全和网络安全基础，理解最小权限与信任边界。',
    plainLanguageGoal: '学完后，你能识别云身份、网络、存储、镜像和编排配置的主要风险，并为教学环境设计一份分层防护与审计检查表。',
    guidedPractice: '为一个虚构容器化课程平台画云账户、网络、工作负载、镜像仓库、密钥和日志边界，逐项标出谁能读取、部署和删除。',
    independentPractice: '写一份发布前云安全检查：身份、网络、镜像来源、密钥、持久卷、日志、备份和回滚，每项写出验证证据。',
    commonErrors: [
      '只检查容器内部应用，不检查云账户、网络、镜像和密钥权限。',
      '把容器当成强隔离边界，忽略共享内核、宿主和编排层。',
      '使用 latest 镜像和长期高权限凭据，缺少来源验证与轮换。',
    ],
    sourceRefs: [
      'NIST SP 800-190, Application Container Security Guide。https://csrc.nist.gov/pubs/sp/800/190/final',
      'NIST Cybersecurity Framework 2.0。https://www.nist.gov/cyberframework',
      'OWASP Docker Security Cheat Sheet。https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html',
      '课程只使用虚构云账户与授权教学环境。',
    ],
    steps: [
      {
        title: '先画云的控制平面',
        body: '账户、身份、网络、镜像仓库、编排、密钥和日志共同构成控制面。只盯工作负载会漏掉谁能部署、读取密钥或修改网络。',
        note: '控制面与数据面分开',
      },
      {
        title: '检查身份和权限',
        body: '区分人员、服务和 CI 身份，使用短期凭据与最小权限。审计高权限角色、跨账户信任和未使用密钥。',
        note: '人员身份与服务身份分别管理',
      },
      {
        title: '限制网络与存储边界',
        body: '明确哪些工作负载可以互访、哪些端口对外、持久卷保存什么。默认拒绝和分段比事后封堵更可维护。',
        note: '网络、存储、密钥都有边界',
      },
      {
        title: '验证镜像与运行时',
        body: '镜像固定版本和摘要，检查来源、漏洞与构建链。运行时限制权限、文件系统和能力，不把容器当完整虚拟机。',
        note: '镜像来源与运行时限制同时检查',
      },
      {
        title: '写云发布 gate',
        body: '把身份、网络、镜像、密钥、日志、备份和回滚写成可重复检查项。失败时阻止发布，并记录残余责任。',
        note: '安全要求必须可验证和阻断',
      },
    ],
  },
  'zhouyi:系辞下与说卦': {
    prerequisite: '完成《系辞上》，能把原文、原注、转述和现代解释分开。',
    plainLanguageGoal: '学完后，你能比较《系辞下》的变动、人事与历史叙述，以及《说卦》的八卦取象，说明两者文本功能不同且不宜混引。',
    guidedPractice: '各选《系辞下》《说卦》一则短段，分别列出关键词、句间关系、篇目来源和一个不能确定的问题，不先合并成同一套理论。',
    independentPractice: '制作对照卡：同一八卦在《说卦》中的取象与《系辞下》中的论述各一条，写明来源、语境和不能直接互换的理由。',
    commonErrors: [
      '把《说卦》取象直接回填到所有经传段落。',
      '把《系辞下》的历史叙述当成连续史实年表。',
      '引文不标篇名，把系辞、说卦和后世注混在一起。',
    ],
    sourceRefs: [
      '《周易》经传公版文本；中国哲学书电子化计划。https://ctext.org/book-of-changes',
      '维基文库《周易》公版校本；逐篇核对版本。https://zh.wikisource.org/wiki/周易',
      '王弼注、朱熹《周易本义》等古代公版注本仅作对照，区分原注与转述。',
    ],
    steps: [
      {
        title: '先确认篇目和功能',
        body: '《系辞下》讨论变动、卦爻、人事与制作，《说卦》集中说明八卦性质与取象。先明确篇目功能，再比较概念。',
        note: '篇目不同，问题意识不同',
      },
      {
        title: '拆系辞下的论证链',
        body: '把条件、例子和结论分开，观察文本如何从卦爻变化推到人事判断。不要把比喻句直接读成固定规则。',
        note: '条件、例子、结论分层',
      },
      {
        title: '整理说卦的取象表',
        body: '按八卦列出性质、方位、家庭和时间等取象，标明每一项来自哪一段。取象可能因语境和注家不同，不能无限扩展。',
        note: '取象必须有篇目来源',
      },
      {
        title: '比较同一概念的差异',
        body: '选乾坤或某一卦，对比两篇中的叙述。相同词不代表同一功能，要说明文本层次和解释对象。',
        note: '同词不同篇也要重新定位',
      },
      {
        title: '并列注家解释',
        body: '王弼偏重义理，朱熹重经传结构。引用注语必须标书名和原句或“大意转述”，不让现代总结覆盖注文。',
        note: '原注、转述、今按标签分开',
      },
      {
        title: '完成篇目来源自测',
        body: '给三条解释判断来自《系辞下》《说卦》还是后世注解，并写出依据。不能确定时标“待核”，不补造古句。',
        note: '自测重点是篇目与来源边界',
      },
    ],
  },
  'divination:星座的文化史': {
    prerequisite: '完成“世界占卜文化导论”和“象征、隐喻与解释”，知道天文事实与文化象征分层。',
    plainLanguageGoal: '学完后，你能区分现代星座日期、古代星象传统和流行占星叙事，说明星座文化如何随历法、贸易和媒体变化，而不把象征当科学事实。',
    guidedPractice: '为黄道十二宫制作三列卡：现代流行名称、古代天文/历法背景、后世文化叙事；每条至少写一个来源或标“待核”。',
    independentPractice: '选择一个星座，写一段 200 字文化史说明，区分天文学对象、历法划分、神话图像和现代媒体叙事四层。',
    commonErrors: [
      '把现代星座日期直接当成古代固定制度。',
      '把天文学星座与占星黄道十二宫完全等同。',
      '用星座文化解释个人性格，却不说明这是象征叙事而非实证结论。',
    ],
    sourceRefs: [
      'International Astronomical Union, Constellations。https://www.iau.org/public/themes/constellations/',
      'Bibliothèque nationale de France, Gallica 公版星图与手稿。https://gallica.bnf.fr/',
      'Smithsonian Open Access 公开馆藏。https://www.si.edu/openaccess',
      '课程固定边界：文化娱乐体验，不构成现实预测或心理诊断。',
    ],
    steps: [
      {
        title: '先分天文星座与黄道十二宫',
        body: '天文学星座有明确天区边界，占星黄道十二宫是按黄道划分的文化符号系统。名称相似，不等于同一对象。',
        note: '天文对象 ≠ 占星符号',
      },
      {
        title: '追踪历法与时代变化',
        body: '星座日期和岁差、历法改革、地区传播有关。现代流行表不是自古不变，先查历史来源再解释差异。',
        note: '日期表也有历史',
      },
      {
        title: '阅读图像和神话',
        body: '星图中的动物、人物和器物属于图像传统，需要结合时代、地区与制图者。不能把一幅图的象征扩展到所有文化。',
        note: '图像、神话、历法分开',
      },
      {
        title: '分析现代媒体叙事',
        body: '报纸、社交平台和商业内容塑造了现代星座性格描述。它属于文化传播现象，不等同于天文学发现。',
        note: '现代流行文化要标时代',
      },
      {
        title: '写边界清楚的说明',
        body: '结论同时写“文化上如何理解”和“科学上不能推出什么”，固定注明非现实预测与心理诊断。',
        note: '文化解释和事实预测分开',
      },
    ],
  },
} satisfies CuratedCoursePlanMap;
