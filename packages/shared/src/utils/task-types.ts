// 任务类型注册表 —— 「目录即任务」的类型定义（前后端共用，纯数据）。
//
// 设计意图（用户 2026-09-27 拍板）：
//   用户给一个目录选定任务类型后，系统负责：
//     ① 建出该类型的**资源目录骨架**（用户往里放素材就能被识别）；
//     ② 在系统提示词里注入该类型的**执行 SOP**（分步引导 + 确认点）；
//     ③ 让模型按 SOP 一步步推进，每步让用户确认，确认结果落任务记忆（跨会话）。
//
// 为什么放在 shared 而不是后端：
//   类型既是**后端提示词**的素材（注入 SOP），也是**前端 UI** 的素材（下拉选项、
//   资源目录引导文案、目录说明）。放在 shared 保证两边同一份数据，不会各写一套后漂移。
//
// 目录命名（用户拍板：英文数字前缀，跨平台编码安全）：
//   00-source     用户上传/拷入的原始素材
//   01-reference  参考资料（人设图、术语表、风格参考）
//   02-work       过程产物（草稿、人物卡、逐段译文）
//   03-output     最终交付
//   数字前缀让文件树天然按流程顺序排列 —— 用户一眼看懂「素材 → 参考 → 过程 → 交付」。

/** 资源目录（目录级，跨会话共享；与会话级 .yan-zhi/tasks/<convId>/ 不同） */
export interface ResourceDirSpec {
  /** 目录名（含数字前缀，直接用作磁盘目录名） */
  dir: string;
  /** 中文说明（UI 展示 + 提示词引导） */
  label: string;
  /** 用途说明（引导用户往哪放什么） */
  hint: string;
}

/** 资源目录骨架 —— 所有任务类型共用同一套四段结构（结构自解释，用户放错也能被认出来） */
export const RESOURCE_DIRS: ResourceDirSpec[] = [
  { dir: '00-source', label: '原始素材', hint: '待处理的原件：小说原文、剧本、待译文本、视频素材' },
  { dir: '01-reference', label: '参考资料', hint: '风格参考、人设图、术语表、设定集' },
  { dir: '02-work', label: '过程产物', hint: '草稿与中间结果：人物卡、分镜草稿、逐段译文' },
  { dir: '03-output', label: '最终交付', hint: '最终成品：成稿、成片、字幕、导出文件' },
];

/** 资源目录名索引（校验用） */
export const RESOURCE_DIR_NAMES: readonly string[] = RESOURCE_DIRS.map((d) => d.dir);

/** 确认粒度：每批多少段询问用户一次（用户拍板：询问用户、默认 3） */
export const DEFAULT_CONFIRM_BATCH_SIZE = 3;

/**
 * 步骤产出落到哪一段资源目录。
 * 用枚举而不是自由文本：**落点决定产物可被跨会话复用**（03-output 是交付、02-work 是过程），
 * 写错的后果是「产物散在对话里、下次开新会话找不到」——必须钉死可选值。
 */
export type StepOutput = '01-reference' | '02-work' | '03-output' | 'none';

export interface TaskStep {
  /** 步骤名（提示词里作为流程项标题） */
  title: string;
  /** 这步具体做什么（说给模型听的执行要点） */
  detail?: string;
  /** 需要用户确认时：用哪个确认形态（confirm_user = 多页向导 / ask_user = 单项提问） */
  confirmTool?: 'confirm' | 'ask';
  /** 确认什么（用户看到的问题要点，模型据此组织向导页） */
  confirmAbout?: string;
  /** 这步产出落到哪段资源目录 */
  output?: StepOutput;
  /**
   * 是否允许成批处理（每批 N 段确认一次）。
   * 长任务（逐章改写/逐段翻译/逐镜配音）必须成批，否则要么一次问到底（用户烦死）、
   * 要么一段一问（模型把上下文问没了）。
   */
  batchable?: boolean;
}

/** 保留旧字段名（`confirm`）的兼容视图：部分既有测试/调用方按 s.confirm 读 */
export interface TaskTypeSpec {
  /** 类型标识（落库值，勿改） */
  id: string;
  /** 显示名 */
  label: string;
  /** 一句话说明（下拉选项副标题） */
  summary: string;
  /** 首次选该类型时给用户的引导（弹窗/提示词里转述） */
  guide: string;
  /**
   * 该类型的**专属智能体** id（用户拍板 A 方案：类型 → 专属智能体 → skill 挂在智能体上）。
   *
   * ★ 为什么必须有：通用助手的提示词压不住各类型的专属纪律 ——
   *   改写最怕「跑飞不逐章」、脚本文案最怕「写成散文」、配音/有声小说最怕「音色没定就批量」。
   *   选定任务类型时切到对应智能体，人格 + 技能 + 工具面一次性对齐。
   * ★ 留空 = 用默认助手（该类型纪律不特殊，复用即可）。
   * ★★ 必须与后端 seed 的智能体 id 完全一致（`builtin-task-mode-agents.ts`）——
   *   写错的表现是「切了类型但智能体没变」且**不报错**。
   */
  agentId?: string;
  /**
   * 该类型的技能 id 列表（展示 + 校验用；**实际注入靠智能体挂载**）。
   *
   * ★ 这里只登记「这个类型该用哪些技能」，真正生效的是 `agent.skill_ids`
   *   （后端 `llm-task-manager` 从 agent 行读 skill_ids 注入系统提示词）。
   *   登记的好处：映射自检（技能必须存在）+ UI 能显示"这个模式会用到哪些技能"。
   */
  skillIds?: string[];
  /**
   * 父任务类型 id（2026-10-14 加「父任务」层）。
   *
   * ★ 解决什么问题：原来一个空间只能绑**一个**任务类型，想把「引流」和「带货」放在
   *   同一个抖音目录里管，就得建两个空间/两份 00-source~03-output，素材与复盘被劈开。
   *   加父层后：空间绑**父类型**（如抖音运营），目录仍是**一套**资源骨架，
   *   而每条任务（会话）可以各选一条子线 —— 「一个目录管很多不同的任务」。
   * ★ 父类型自身 steps 为空（它不规定流程，只负责分组与绑定智能体）；
   *   子类型的 SOP 在任务级注入（conversation.task_type 优先于 space.task_type）。
   */
  parentId?: string;
  /** 执行 SOP：对话里逐步推进的规则，含确认点与产出落点 */
  steps: TaskStep[];
}

/**
 * 内置任务类型。
 *
 * ★★ 定位（2026-09-27 用户澄清，务必按这个理解）：
 *   这是**对话式任务模式规则** —— 用户给目录选定类型后，在**对话里**按规则一步步完成，
 *   模型用 `confirm_user`（多页向导）/ `ask_user` 做结构化确认，产物落到约定的资源目录。
 *   **不是**让用户去工作台跑 DAG 流水线（内置流水线是"可选的重环节机械保证"，不是主路径）。
 *   因此每类的 SOP 必须回答三个问题：**问什么（什么工具）→ 产出什么 → 落到哪**。
 */
export const TASK_TYPES: TaskTypeSpec[] = [
  {
    id: 'general',
    label: '通用',
    summary: '不限定流程，按需执行',
    guide: '通用模式不做流程约束，适合零散任务。',
    // 通用类型不指定专属智能体（用当前选中的），也不注入任何技能
    steps: [],
  },
  {
    id: 'novel_rewrite',
    label: '小说改写',
    summary: '原文 → 目标确认 → 大纲 → 逐章改写',
    guide: '把原文放进 00-source（也可直接粘贴）。我会先确认改写目标（风格/人称/篇幅/受众），再确认大纲，然后逐章改写、每批让你确认一次。',
    agentId: 'a_builtin_novel_agent',
    skillIds: ['skill_novel_rewrite', 'skill_markdown_doc'],
    steps: [
      { title: '导入原文', detail: '读 00-source 的原文（无素材就先请用户上传或粘贴，不要凭空编造章节）；切出章节清单与字数', output: 'none' },
      {
        title: '确认改写目标',
        detail: '给出 2-3 组候选（风格 / 人称 / 篇幅 / 目标读者）让用户挑，可自定义；同时问清每批改写几章',
        confirmTool: 'confirm',
        confirmAbout: '风格、人称视角、篇幅处理、目标读者、每批章数',
        output: '02-work',
      },
      { title: '产出改写大纲', detail: '逐章列出「保留什么 / 改什么 / 为什么」+ 全局改动（人称、时间线、删并章）', output: '02-work' },
      {
        title: '确认大纲',
        detail: '大纲方向错了要先拦住，别等几十章都改完才发现',
        confirmTool: 'confirm',
        confirmAbout: '大纲是否可以直接开始改写',
        output: 'none',
      },
      {
        title: '逐批改写',
        detail: `每批按确认的章数改写（默认 ${DEFAULT_CONFIRM_BATCH_SIZE} 章），逐章输出完整正文，不概括不跳章`,
        confirmTool: 'confirm',
        confirmAbout: '本批改写稿是否定稿，可否进入下一批',
        output: '02-work',
        batchable: true,
      },
      { title: '一致性检查', detail: '人名/称谓、时间线、设定、伏笔前后是否一致，列出冲突项与建议改法', output: 'none' },
      { title: '成稿导出', detail: '合并全稿导出到 03-output，报告文件路径', output: '03-output' },
    ],
  },
  {
    id: 'novel_tuiwen',
    label: '小说推文',
    summary: '授权选书 → 过滤打分 → 取正文 → 配音出片（全自动）',
    guide: '我会自动在推文授权平台选书、按热度/钩子/竞争度过滤打分、取已授权章节正文、下载背景视频，然后一键合成 4:3 推文成片；你只需首次在授权平台登录一次。',
    agentId: 'a_builtin_novel_tuiwen_agent',
    skillIds: ['skill_novel_tuiwen'],
    steps: [
      {
        title: '选书',
        detail: '在推文授权平台（巨日禄/番茄推文等，仅限已授权渠道，禁止爬未授权小说站）用浏览器打开榜单/书架页，抓书目清单（书名/题材/简介）',
        output: 'none',
      },
      { title: '过滤打分', detail: '按题材热度 / 开头钩子强度 / 同书竞争度（同书视频少优先）打分排序，取 Top1-3 并告知用户选了什么、为什么', output: 'none' },
      {
        title: '取授权正文',
        detail: '从授权平台取该书的推广章节正文并落盘 novel/<书名>/ch01.txt；平台不提供全文时用 ask_user 向用户要正文，禁止去盗版站爬',
        output: 'none',
      },
      {
        title: '准备背景视频',
        detail: '用户给过链接 → api_media_fetch { url, kind:"video", category:"source" } 下载（yt-dlp 缺失先 media_install_ytdlp）；本地文件直接用；都没有 → 省略背景用占位画面',
        output: 'none',
      },
      { title: '合成出片', detail: 'novel_tuiwen { chapter, title, bg_video } 生成 4:3 (1080x1440) 成片（顶部标题+逐句字幕+配音），最终交付进 03-output 并回报路径', output: '03-output' },
    ],
  },
  {
    id: 'translate',
    label: '翻译',
    summary: '原文 → 语种术语 → 分批翻译 → 校验',
    guide: '把待译原文放进 00-source（术语表可放 01-reference）。我会先确认语种方向、术语表与风格，再确认输出格式，然后分批翻译、每批让你确认。',
    agentId: 'a_builtin_translate_agent',
    skillIds: ['skill_translation_workflow', 'skill_file_convert', 'skill_markdown_doc', 'skill_docx_processing', 'skill_pdf_processing'],
    steps: [
      { title: '导入原文', detail: '读 00-source 的待译文本；判断源语言并按自然段切分（无素材就引导上传，不要凭空生成原文）', output: 'none' },
      { title: '抽取术语表', detail: '把反复出现的专有名词/机构名/人名/产品名/行业术语列成对照表（源词 → 建议译法 → 依据），放 01-reference 供全篇锁定', output: '01-reference' },
      {
        title: '确认语种与术语',
        detail: '确认源/目标语言、核对术语表（用户有既有译法以用户为准）、翻译风格与用途；同时问清每批段数',
        confirmTool: 'confirm',
        confirmAbout: '语种方向、术语表是否照用、风格与用途、每批段数',
        output: '02-work',
      },
      {
        title: '确认输出格式',
        detail: '对照排版（双语逐段）还是纯译文；是否保留原文格式（标题层级/编号/表格）。格式决定每批产出结构，必须先定',
        confirmTool: 'confirm',
        confirmAbout: '输出格式（对照/纯译）、是否保留原格式',
        output: 'none',
      },
      {
        title: '分批翻译',
        detail: `每批按确认的段数翻译（默认 ${DEFAULT_CONFIRM_BATCH_SIZE} 段），术语统一、数字与专有名词零改动、不漏译不增删`,
        confirmTool: 'confirm',
        confirmAbout: '本批译文是否定稿，可否进入下一批',
        output: '02-work',
        batchable: true,
      },
      { title: '术语一致性校验', detail: '全文术语是否同一译法；段落数是否对得上（漏译）；关键段落做回译校验', output: 'none' },
      { title: '导出', detail: '译文落到 03-output，附术语表与存疑点清单', output: '03-output' },
    ],
  },
  {
    id: 'script_copy',
    label: '脚本文案',
    summary: '脚本/文案 → 定位 → 分稿 → 成稿',
    guide: '把素材、产品资料或选题放进 00-source（01-reference 可放调性与风格参考）。我会先确认用途与调性，再确认分稿/分镜方案，然后逐篇或逐段产出。',
    agentId: 'a_builtin_script_agent',
    skillIds: ['skill_script_copy', 'skill_markdown_doc'],
    steps: [
      { title: '读素材', detail: '读 00-source 的素材（产品资料/选题/已有脚本），提炼可用的卖点、信息点与受众线索；没有素材就先问清主题', output: 'none' },
      {
        title: '确认用途与调性',
        detail: '文案类型（短视频脚本 / 口播稿 / 广告文案 / 宣传稿 / 分镜脚本）、投放平台与时长的硬约束、调性与禁忌词、目标受众',
        confirmTool: 'confirm',
        confirmAbout: '文案类型、平台与时长、调性、受众、禁忌',
        output: '02-work',
      },
      { title: '产出结构方案', detail: '给逐段/逐镜的结构方案（钩子 → 展开 → 转折 → 行动号召），标出每段的目的与时长', output: '02-work' },
      {
        title: '确认结构方案',
        detail: '结构/分镜表确认后再写正文，避免整篇写完才发现方向不对',
        confirmTool: 'confirm',
        confirmAbout: '结构与分镜表是否可以直接开写',
        output: 'none',
      },
      {
        title: '逐批产出正文',
        detail: `每批按确认的段数产出（默认 ${DEFAULT_CONFIRM_BATCH_SIZE} 段），口语化可直接念；标清【画面】【台词/旁白】【音效】分层，不要混写成一段`,
        confirmTool: 'confirm',
        confirmAbout: '本批脚本是否定稿，可否进入下一批',
        output: '02-work',
        batchable: true,
      },
      { title: '成稿导出', detail: '合并导出到 03-output（脚本文件），必要时代出配音用纯文本稿', output: '03-output' },
    ],
  },
  {
    id: 'audiobook',
    label: '有声小说',
    summary: '文本+视频 → 配音字幕 → 时间轴 → 成片',
    guide: '把要朗读的文本与视频素材放进 00-source。我会先确认配音与字幕参数，再逐段配音 + 生成字幕，校准时间轴后合成成片。',
    agentId: 'a_builtin_audiobook_agent',
    skillIds: ['skill_audiobook_production', 'skill_video_shot_prompt'],
    steps: [
      { title: '导入素材', detail: '读 00-source 的文本（按适合朗读的语义单元分段，25-60 字/段并标注语气）与视频素材（记录路径与时长）', output: 'none' },
      {
        title: '确认配音与字幕参数',
        detail: '音色与角色分配（同角色锁定同音色）、语速、字幕样式与语言、是否保留视频原声',
        confirmTool: 'confirm',
        confirmAbout: '音色分配、语速、字幕样式与语言、原声处理',
        output: '02-work',
      },
      { title: '分段配音 + 字幕', detail: '逐段调 api_tts_speak（传 character 锁定音色）+ api_srt_generate 生成 SRT；空文本段跳过而不是报错', output: '02-work', batchable: true },
      {
        title: '时间轴校准',
        detail: '音频与字幕是否对齐、总时长是否与视频匹配；对不上要先调（改语速或调整分段），别直接合成',
        confirmTool: 'confirm',
        confirmAbout: '时间轴与音色是否可以定稿',
        output: 'none',
      },
      { title: '合成导出', detail: '调 media_compose（dub 混音 / subtitle 烧字幕）合成成片到 03-output；subtitle 传 title，subtitleFontSize 不要显式传（默认已合适），发竖屏平台传 safeArea=true；**多段视频要先 api_media_normalize 统一成 1080x1920 再 concat（否则直拼会报参数不一致）**；缺 ffmpeg 时先用 confirm_user 告知体积并征得同意再 media_install_ffmpeg', output: '03-output' },
      { title: '可选加工', detail: '按用户要求用 media_edit 逐个加效果（抽帧封面 snapshot / 裁剪 trim / 变速 speed / 淡入淡出 fade / 调色 color / BGM bgsound / 响度拉平 loudnorm）；**用户没提的效果不要主动加**', output: '03-output' },
    ],
  },
  {
    id: 'dubbing',
    label: '配音',
    summary: '文本/脚本 → 音色参数 → 逐段配音 → 合成',
    guide: '把要配音的文本或脚本放进 00-source。我会先确认音色与语速，再逐段配音，最后按需合成或导出音频。',
    agentId: 'a_builtin_dubbing_agent',
    skillIds: ['skill_dubbing_production', 'skill_markdown_doc'],
    steps: [
      { title: '读稿', detail: '读 00-source 的文本/脚本；按语气切分成配音段（旁白/对白/独白分开），标出每段的角色与情绪', output: 'none' },
      {
        title: '确认音色与参数',
        detail: '音色与角色分配（同角色锁定同音色）、语速、情绪强度、是否需要分轨导出（对白/旁白分文件）',
        confirmTool: 'confirm',
        confirmAbout: '音色分配、语速、情绪、是否分轨',
        output: '02-work',
      },
      { title: '逐段配音', detail: '逐段调 api_tts_speak（传 character 与 rate）；先出 1 段样音给用户听，确认音色后再批量', output: '02-work', batchable: true },
      {
        title: '试听确认',
        detail: '样音/首批音频让用户试听后确认音色，再继续其余段落（音色错了批量做完就白费）',
        confirmTool: 'confirm',
        confirmAbout: '音色是否合适，可否继续批量配音',
        output: 'none',
      },
      { title: '合成/导出', detail: '按需拼接多段为整条音轨或分轨导出到 03-output；需要混入视频时用 media_compose（缺 ffmpeg 先征得同意再装）', output: '03-output' },
    ],
  },
  {
    id: 'comic',
    label: '漫画绘本',
    summary: '脚本 → 人设 → 分页画稿 → 成书',
    guide: '把脚本或故事放进 00-source。逐个人物确认人设（文字 + 图像提示词），再定画风与分页，逐页出稿。',
    agentId: 'a_builtin_design_agent',
    skillIds: ['skill_design_creation', 'skill_ai_image_prompt'],
    steps: [
      { title: '读取脚本', detail: '从 00-source 读取故事/脚本，切分页与场次；没有素材就先问清故事方向', output: 'none' },
      {
        title: '人物设定',
        detail: '逐个人物输出文字描述 + 图像生成提示词（外貌/服装/标志性道具），**一人一卡逐个确认**',
        confirmTool: 'confirm',
        confirmAbout: '每个人物的形象（文字 + 图像描述）是否可用',
        output: '02-work',
      },
      {
        title: '画风与分页',
        detail: '确认整体画风（参考风格/色彩/线条）与每页内容分配',
        confirmTool: 'confirm',
        confirmAbout: '画风与分页方案',
        output: '02-work',
      },
      {
        title: '逐页出稿',
        detail: `按画风与已确认人设逐页生成（每批默认 ${DEFAULT_CONFIRM_BATCH_SIZE} 页），提示词必须复用人物锚点防形象漂移`,
        confirmTool: 'confirm',
        confirmAbout: '本批画稿是否可用，可否继续',
        output: '02-work',
        batchable: true,
      },
      { title: '成书导出', detail: '按图文顺序合并导出到 03-output', output: '03-output' },
    ],
  },
  {
    id: 'ppt_deck',
    label: 'PPT 生成',
    summary: '大纲 → 逐页确认 → 成稿导出',
    guide: '把素材或提纲放进 00-source。先确认大纲与受众，再逐页生成，确认后导出 pptx。',
    agentId: 'a_default_assistant',
    skillIds: ['skill_pptx_creation', 'skill_data_visualization'],
    steps: [
      { title: '素材整理', detail: '读取 00-source 素材并提炼要点；素材不足就先问清主题与受众', output: 'none' },
      {
        title: '确认大纲',
        detail: '页数 / 结构 / 受众 / 风格（商务/学术/路演）',
        confirmTool: 'confirm',
        confirmAbout: '大纲结构、页数、受众、风格',
        output: '02-work',
      },
      { title: '逐页生成', detail: `每批默认 ${DEFAULT_CONFIRM_BATCH_SIZE} 页产出（标题 + 要点 + 讲稿备注）`, confirmTool: 'confirm', confirmAbout: '本批内容是否定稿', output: '02-work', batchable: true },
      { title: '导出 pptx', detail: '生成演示文稿落到 03-output', output: '03-output' },
    ],
  },
  {
    id: 'short_drama',
    label: '短剧',
    summary: '剧本 → 人物 → 场景 → 分镜 → 成片',
    guide: '把剧本放进 00-source（也可直接粘贴）。我会先逐个人物做形象分析（文字 + 图像描述）让你确认，再定场景、出中英双语分镜脚本，最后生成素材。',
    agentId: 'a_builtin_storyboard_agent',
    skillIds: ['skill_anime_storyboard', 'skill_video_shot_prompt', 'skill_markdown_doc'],
    steps: [
      { title: '读取剧本', detail: '从 00-source 读取剧本原文，确认分集与时长目标；无素材就先问清题材方向', output: 'none' },
      {
        title: '逐个人物分析',
        detail: '每个人物输出文字描述 + 图像生成提示词，**逐个让用户确认形象**（一人一卡）',
        confirmTool: 'confirm',
        confirmAbout: '每个人物的形象描述与参考图是否可用',
        output: '02-work',
      },
      {
        title: '场景设定',
        detail: '整理主要场景，输出场景描述与参考提示词',
        confirmTool: 'confirm',
        confirmAbout: '场景描述是否可用',
        output: '02-work',
      },
      {
        title: '分镜脚本',
        detail: `逐段产出分镜（中英双语），每批默认 ${DEFAULT_CONFIRM_BATCH_SIZE} 段让用户确认`,
        confirmTool: 'confirm',
        confirmAbout: '本批分镜是否可用',
        output: '02-work',
        batchable: true,
      },
      {
        title: '确认响应格式',
        detail: '与用户确定分镜的输出格式（表格 / JSON / Markdown）',
        confirmTool: 'confirm',
        confirmAbout: '分镜的输出格式',
        output: 'none',
      },
      { title: '生成素材', detail: '按已确认的人物与分镜生成图像、配音等素材（**批量前先出 1 镜样片**确认风格）；需要真实空镜/参考视频时可用 api_media_fetch 从公开素材站下载到 00-source', output: '02-work' },
      { title: '合成成片', detail: '**多镜拼接前先 api_media_normalize 统一成 1080x1920 竖屏**（各镜参数一致才能 concat 直拼），再 media_compose 合成；缺 ffmpeg 先征得用户同意', output: '03-output' },
      { title: '字幕与交付', detail: '生成字幕文件与交付清单，落到 03-output', output: '03-output' },
    ],
  },
  {
    id: 'longform',
    label: '长文写作',
    summary: '选题 → 大纲 → 分节写作 → 统稿',
    guide: '在 01-reference 放参考资料。先确认选题与大纲，再分节写作（每节确认），最后统稿。',
    agentId: 'a_default_assistant',
    skillIds: ['skill_markdown_doc', 'skill_pdf_processing'],
    steps: [
      {
        title: '确认选题',
        detail: '主题 / 目标读者 / 篇幅 / 体裁；参考资料在 01-reference 时先读一遍',
        confirmTool: 'confirm',
        confirmAbout: '选题、读者、篇幅、体裁',
        output: '02-work',
      },
      { title: '大纲确认', detail: '章节结构 + 每节要点', confirmTool: 'confirm', confirmAbout: '大纲结构是否可用', output: '02-work' },
      { title: '分节写作', detail: `每批默认 ${DEFAULT_CONFIRM_BATCH_SIZE} 节`, confirmTool: 'confirm', confirmAbout: '本批章节是否定稿', output: '02-work', batchable: true },
      { title: '统稿', detail: '语气统一、衔接顺滑、去重', output: 'none' },
      { title: '导出', detail: '成稿落到 03-output', output: '03-output' },
    ],
  },
  {
    // 抖音运营（父任务类型，2026-10-14）：本身不规定流程，只负责「一个目录管两类任务」。
    // 空间绑它 → 每条任务再选子线（douyin_traffic 引流 / douyin_sell 带货）。
    // 智能体与两个子类型共用（一个智能体两线，见 builtin-douyin-agents.ts 文件头）。
    id: 'douyin_ops',
    label: '抖音运营',
    summary: '一个目录管两类任务：引流涨粉 + 图文带货',
    guide: '这是父任务类型：本目录共用一套资源目录（00-source~03-output），每条任务可以各选一条线——「抖音引流」做涨粉内容，「抖音图文带货」做选品与变现。新建任务时选一条线即可。',
    agentId: 'a_builtin_douyin_agent',
    skillIds: ['skill_douyin_traffic', 'skill_douyin_sell'],
    steps: [],
  },
  {
    // 抖音引流线（2026-10-14 补）：与 douyin_sell 共用 a_builtin_douyin_agent，
    // 区别在 SOP 与 skill（引流做涨粉内容，带货做变现）。用户拍板"一个智能体两线"，
    // 因为引流内容决定进来什么人、人群决定卖什么 —— 拆两个智能体会让用户来回切。
    id: 'douyin_traffic',
    label: '抖音引流',
    summary: '风口选题 → 逐镜脚本 → 发布排期',
    guide: '做涨粉向内容（大模型/智能体使用方法、AI 工具实测等离变现近的题材）。竞品结构与热点可用 pageAgent 核实；逐镜脚本落到 02-work，发布排期与复盘表落到 03-output。',
    agentId: 'a_builtin_douyin_agent',
    skillIds: ['skill_douyin_traffic'],
    parentId: 'douyin_ops',
    steps: [
      {
        title: '账号与人群定位',
        detail: '粉丝数 / 已发内容类型 / 完播与互动水平；想吸引谁（年龄/性别/职业/痛点）；每周能出几条、能不能出镜或实拍',
        confirmTool: 'confirm',
        confirmAbout: '账号现状、目标人群、每周产能',
        output: '02-work',
      },
      {
        title: '风口选题',
        detail: '用 browser_navigate / pageAgent 扒平台热点与搜索长尾，产出 10+ 候选选题（离变现近、搜索长尾稳），逐个标注切入角度与预期人群',
        confirmTool: 'confirm',
        confirmAbout: '本批选题是否采用',
        output: '02-work',
        batchable: true,
      },
      {
        title: '逐镜脚本',
        detail: '每条按「3 秒钩子 → 痛点 → 解法 → 演示 → CTA」写逐镜脚本（画面/台词/字幕/时长），只出脚本不出片；**不代发布、不碰登录态、不承诺涨粉数据**',
        confirmTool: 'confirm',
        confirmAbout: '本批脚本是否定稿',
        output: '02-work',
        batchable: true,
      },
      {
        title: '封面与素材',
        detail: `封面底图用 api_image_generate 出**无字底图**（生图模型画中文字必糊，字交给后期烧），批量前先出 1 张样片确认风格；每批默认 ${DEFAULT_CONFIRM_BATCH_SIZE} 张`,
        confirmTool: 'confirm',
        confirmAbout: '封面样片风格是否可用',
        output: '02-work',
        batchable: true,
      },
      { title: '发布排期', detail: '生成内容日历（发布时间/频率/话题标签/系列化编号），落到 03-output', output: '03-output' },
      { title: '数据复盘', detail: '发布后记录曝光/完播/互动基线，指出下一条具体改什么（钩子/节奏/选题）', output: '03-output' },
    ],
  },
  {
    // 抖音带货线（2026-10-14 补）：图文带货变现，与 douyin_traffic 同一智能体。
    id: 'douyin_sell',
    label: '抖音图文带货',
    summary: '精选联盟选品 → 图文结构 → 挂车 SOP → 漏斗复盘',
    guide: '把商品资料、竞品图文截图放进 00-source。先按人群匹配选品（佣金/销量/季节/体验），再定图文结构与封面，按挂车 SOP 发布，最后复盘曝光-点击-转化漏斗。',
    agentId: 'a_builtin_douyin_agent',
    skillIds: ['skill_douyin_sell'],
    parentId: 'douyin_ops',
    steps: [
      {
        title: '账号与变现前提',
        detail: '粉丝数 / 是否已开橱窗 / 带货权限与保证金口径（平台规则委派 pageAgent 核实，不凭记忆作答）',
        confirmTool: 'confirm',
        confirmAbout: '带货前提与可用品类范围',
        output: '02-work',
      },
      {
        title: '选品打分',
        detail: '每次给 3~5 个候选，按佣金/销量/人群匹配/季节性/体验打分；佣金与利润测算用 python_exec；**不承诺收益、不刷量**，极限词与功效宣称一律不写',
        confirmTool: 'confirm',
        confirmAbout: '本批候选品是否入选',
        output: '02-work',
        batchable: true,
      },
      {
        title: '图文结构',
        detail: '封面 + 3~9 张轮播 + 文案 + 话题；封面大字用 qwen-image-3.0-pro 出无字底图再烧字，商品图用 wan2.7-image-pro，批量前先出 1 张样片',
        confirmTool: 'confirm',
        confirmAbout: '图文结构与封面是否定稿',
        output: '02-work',
      },
      {
        title: '挂车发布 SOP',
        detail: '图文编辑页 → 添加商品 → 核对标题/价格/佣金 → 发布；**只给可照做的步骤与校验清单，不代发布、不碰登录态**',
        confirmTool: 'confirm',
        confirmAbout: '发布清单是否就绪',
        output: '02-work',
      },
      { title: '发布后跟进', detail: '1 小时内回评区顶前排问题（互动率影响推流）；记录该条数据基线', output: 'none' },
      { title: '漏斗复盘', detail: '曝光/点击/成交三段漏斗，指出下一轮具体改什么（选品/封面/前三张图/发布时间），落到 03-output', output: '03-output' },
    ],
  },
];

/** 类型 id 集合（校验用） */
export const TASK_TYPE_IDS: readonly string[] = TASK_TYPES.map((t) => t.id);

/** 取类型定义；未知/空 → 通用类型（fail-safe，不抛错） */
export function getTaskType(id?: string | null): TaskTypeSpec {
  const hit = TASK_TYPES.find((t) => t.id === id);
  return hit || TASK_TYPES[0];
}

// ────────────────────────────────────────────────────────────
// 父任务层（2026-10-14）：一个空间绑父类型，每条任务各选一条子线
// ────────────────────────────────────────────────────────────

/** 某类型的**子任务类型**（没有子类的返回空数组） */
export function getChildTaskTypes(parentId?: string | null): TaskTypeSpec[] {
  if (!parentId) return [];
  return TASK_TYPES.filter((t) => t.parentId === parentId);
}

/** 某类型的父类型；没有父（本身就是父或普通类型）→ undefined */
export function getTaskTypeParent(id?: string | null): TaskTypeSpec | undefined {
  const t = getTaskType(id);
  if (!t.parentId) return undefined;
  return TASK_TYPES.find((x) => x.id === t.parentId);
}

/**
 * 是否父任务类型（= 有子类）。
 *
 * ★ 判据用"有子类"而不是加一个 isParent 布尔字段：布尔字段会与 parentId 漂移
 *   （加了子类忘了翻布尔 → 下拉分组错、父类型被当成普通类型注入空 SOP）。
 */
export function isParentTaskType(id?: string | null): boolean {
  return getChildTaskTypes(id).length > 0;
}

/** 顶层类型（下拉第一层：普通类型 + 父类型；子类型缩进在父类型下面） */
export function getRootTaskTypes(): TaskTypeSpec[] {
  return TASK_TYPES.filter((t) => !t.parentId);
}

/**
 * 库行（`task_type` 表）→ 规格对象。
 *
 * ★ 列名映射必须只有这一处（2026-10-14 配置表化）：后端取库行注入提示词、
 *   前端取库行渲染下拉，两边各写一份映射必然漂移（改列名改一处忘另一处，
 *   表现为"下拉显示正常但提示词里是空的"——不报错，最难发现）。
 * ★ 坏 JSON 一律按空数组/空步骤吞掉：用户手工改坏了库行，不该让任务起不来。
 */
export function taskTypeFromRow(r: Record<string, any>): TaskTypeSpec {
  const parse = (s?: string | null) => {
    if (!s) return [];
    try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
  };
  return {
    id: String(r.key || r.id || ''),
    label: String(r.label || r.key || ''),
    summary: String(r.summary || ''),
    guide: String(r.guide || ''),
    agentId: r.agent_id || r.agentId || undefined,
    skillIds: parse(r.skill_ids_json ?? r.skillIdsJson),
    steps: parse(r.steps_json ?? r.stepsJson),
    parentId: (r.parent_key || r.parentId) ? String(r.parent_key || r.parentId) : undefined,
  };
}

/** 规格对象 → 库行字段（创建/更新时收口，避免调用方拼列名） */
export function taskTypeToRow(t: TaskTypeSpec, sortOrder = 0): Record<string, any> {
  return {
    key: t.id,
    label: t.label,
    summary: t.summary,
    guide: t.guide,
    agent_id: t.agentId || null,
    skill_ids_json: JSON.stringify(t.skillIds || []),
    steps_json: JSON.stringify(t.steps || []),
    parent_key: t.parentId || null,
    sort_order: sortOrder,
  };
}

/**
 * 多任务目录的引导块（薄壳）：空间绑了**父类型**、而本条任务还没选子线时注入。
 *
 * ★ 为什么必须显式让模型"问用户选哪条线"：父类型没有 SOP，若不引导，
 *   模型会按自己猜的一条线一路跑完（用户想带货它给你做选题），且不报错。
 */
export function formatParentTaskTypeContext(parentId: string): string {
  return formatParentTaskTypeSpecContext(getTaskType(parentId), getChildTaskTypes(parentId));
}

/** 交互工具 → 提示词里的中文名（模型读得懂"用哪个工具"比读英文工具名更不容易用错） */
const CONFIRM_TOOL_LABEL: Record<'confirm' | 'ask', string> = {
  confirm: 'confirm_user（多页向导）',
  ask: 'ask_user（单项提问）',
};

/**
 * 【规格对象 → 提示词片段】。
 *
 * ★ 为什么必须有一个"吃 spec"的版本（2026-10-14 配置表化）：
 *   任务类型搬进 `task_type` 表后，运行时的权威来源是**库行**，不是代码里的 TASK_TYPES。
 *   只留 `formatTaskTypeContext(id)`（内部按 id 查内置数组）的话，
 *   用户在库里新建/改过的类型根本进不了提示词 —— 配置表形同虚设。
 *   ⇒ 以 spec 版本为唯一实现，id 版本退化成「查内置 → 调 spec 版本」的薄壳。
 */
export function formatTaskTypeSpecContext(t: TaskTypeSpec, confirmBatchSize = DEFAULT_CONFIRM_BATCH_SIZE): string {
  if (!t.steps.length) return '';
  const lines = t.steps.map((s, i) => {
    const bits: string[] = [];
    if (s.confirmTool) {
      bits.push(`【必须用 ${CONFIRM_TOOL_LABEL[s.confirmTool]} 确认：${s.confirmAbout || s.title}】`);
    }
    if (s.output === '01-reference') bits.push('【产出写入 01-reference】');
    else if (s.output === '02-work') bits.push('【产出写入 02-work】');
    else if (s.output === '03-output') bits.push('【最终交付写入 03-output】');
    if (s.batchable) bits.push(`【可成批：每批默认 ${confirmBatchSize} 个，先问用户可调】`);
    return `${i + 1}. ${s.title}${bits.length ? ' ' + bits.join(' ') : ''}${s.detail ? `：${s.detail}` : ''}`;
  });
  return [
    `## 任务模式：${t.label}（本目录绑定的任务类型）`,
    `> ${t.guide}`,
    '',
    '### 执行规则（按顺序推进，**不要跳步、不要一路跑到底**）',
    ...lines,
    '',
    '### 规则要点',
    '- ★ **标了【必须用 confirm_user/ask_user 确认】的步骤，一定要真的发起该工具调用**，等用户回答后再继续。' +
    '只在正文里问一句"可以吗"然后继续往下跑，等于没确认（用户没机会回答，也拿不到结构化结果）。',
    `- ★ 成批步骤先问清楚每批处理多少（默认 ${confirmBatchSize} 个：小说按章、翻译/配音/脚本按段，与步骤里写的单位一致）；用户要求一次看完或一次一个，按用户说的来。`,
    '- ★ 用户确认过的内容（人物形象、风格格式、术语、调性）会记入本目录任务记忆，**同目录再开新会话时先复述再继续，不要重复追问**。',
    '- ★ 产出按上表写入对应资源目录（过程进 02-work、最终交付进 03-output），**不要只留在对话里** —— ' +
    '只留在对话里的产物，下次开新会话就找不到了。',
    '',
    '### 目录约定',
    '00-source = 用户上传/拷入的原始素材；01-reference = 参考资料（术语表、风格参考、人设图）；' +
    '02-work = 过程产物；03-output = 最终交付。',
    '**开工前先检查 00-source 有没有素材**：没有就先引导用户上传或粘贴。',
    ...(MATERIAL_NEEDS[t.id] ? ['', ...materialRules(MATERIAL_NEEDS[t.id])] : []),
  ].join('\n');
}

/** 按 id 取**内置**类型并渲染（薄壳：配置表化后运行时请直接调 spec 版本） */
export function formatTaskTypeContext(id?: string | null, confirmBatchSize = DEFAULT_CONFIRM_BATCH_SIZE): string {
  return formatTaskTypeSpecContext(getTaskType(id), confirmBatchSize);
}

/**
 * 【父类型规格对象 → 提示词片段】：多任务目录的「选线」引导。
 * 与 formatTaskTypeSpecContext 同理，配置表化后必须吃库行而不是内置数组。
 */
export function formatParentTaskTypeSpecContext(parent: TaskTypeSpec, children: TaskTypeSpec[]): string {
  if (!children.length) return '';
  const lines = children.map((c) => `- **${c.label}**（${c.id}）：${c.summary}`);
  return [
    `## 任务模式：${parent.label}（本目录为「多任务目录」）`,
    `> ${parent.guide}`,
    '',
    '### 本目录下每条任务选一条线推进',
    ...lines,
    '',
    '### 执行规则',
    '1. **开工第一步必须用 ask_user 让用户选本条任务走哪条线**（也可由用户直接说明），',
    '   选定后按该线的分步流程推进（含确认点与产出落点），**不要自己猜一条线就跑完**。',
    '2. 本目录共用一套资源目录：素材放 00-source、参考资料 01-reference、过程产物 02-work、最终交付 03-output；',
    '   **不同任务在同一套目录里协作，交付物文件名要带任务标识**（如 03-output/引流-选题清单.md），避免互相覆盖。',
    '3. 每条任务只做选中的那条线；需要换线时新建任务并选另一条线，不要在一个任务里混着做。',
  ].join('\n');
}

/** 各类型需要哪类素材（决定要不要注入「素材获取规则」） */
const MATERIAL_NEEDS: Record<string, Array<'source' | 'reference' | 'video'>> = {
  novel_rewrite: ['source'],
  novel_tuiwen: ['source', 'video'],
  translate: ['source', 'reference'],
  // 脚本/短剧都常要真实空镜或参考视频 → 需要"视频素材从哪来"这条规则
  script_copy: ['source', 'reference', 'video'],
  audiobook: ['source', 'video'],
  dubbing: ['source'],
  comic: ['source'],
  ppt_deck: ['source'],
  short_drama: ['source', 'video'],
  longform: ['reference'],
};

/**
 * 素材获取规则 —— 专门解决「用户还没把素材放进来时该怎么办」。
 *
 * ★★ 最后那条「不要为了有素材就自己造一个」是本节核心，来自用户明确诉求：
 *   模型缺素材时为了让流程跑起来，会**自己编一份原文/脚本/视频**（且完全不报错），
 *   用户拿到的东西看起来正常、实则无中生有 —— 比报错难发现得多。
 * ★ 视频素材给全三条来源（本机已有 / 在 00-source / **另开会话生成后放进 00-source**），
 *   否则模型只会干等用户上传，把本来能动的事说成做不到。
 * ★★ 「去网上找并下载」这条来自用户明确诉求（2026-09-27）：
 *   模型缺素材时一律回"请上传"，哪怕用户要的就是**公开视频**（解压视频/骑车/修驴蹄子这类）。
 *   根因是素材规则只列了「本机 / 00-source / 另开会话生成」，**没有一条指向网络** ——
 *   模型手上也没有可用的下载工具（http_request 只取文本、存不下二进制）。
 *   所以这里必须① 明写"先试着自己去找并下载"、② 点明用 `media_fetch` 与 `category:"source"`。
 * ★★ 「不要在授权上卡住用户」同样是用户明确要求（原话「让他不用考虑侵权」）：
 *   用户已自行判断过风险，模型再加一道版权确认 = 把可完成的事挡在门外。
 *   （仍保留"付费/会员/需登录授权"需说明 —— 那不是版权判断，是客观上拿不到。）
 */
function materialRules(needs: Array<'source' | 'reference' | 'video'>): string[] {
  const out: string[] = ['### 素材获取规则（缺素材时按这个来，别停在那干等）'];
  if (needs.includes('source')) {
    out.push(
      '- 原始素材（00-source）：① 先看 00-source 里有没有（见上方「目录资源现状」）；' +
      '② 没有就请用户上传，或让用户**直接粘贴内容**；③ 本机已有文件可直接带路径读取。',
    );
  }
  if (needs.includes('reference')) {
    out.push(
      '- 参考资料（01-reference）：术语表、风格参考、人设图等。用户可放进 01-reference，也可在对话里直接给；' +
      '本机已有文件直接带路径读，**不要等用户先归档才开工**。',
    );
  }
  if (needs.includes('video')) {
    out.push(
      '- 视频素材：① 本机已有直接带**绝对路径**读；② 放在 00-source 的按目录读；' +
      '③ 都没有时——**可以另开一个会话生成视频，再把文件放进本目录的 00-source**（本会话专注配音+字幕+合成，' +
      '避免把长任务拖成一条超长对话），放好后回本会话继续。',
    );
  }
  out.push(
    '- ★★ **素材缺失时先试着"去网上找"（别停在"请上传"）**：用户要的是「网上的公开视频/图片/音频」类素材' +
    '（解压视频、骑车、修驴蹄子、切肥皂、风景空镜、参考截图等）时，**自己去找并下载**：' +
    '找到链接后直接调 `api_media_fetch { url, kind, category:"source" }` —— **直链或视频网站页面链接都行**' +
    '（YouTube / B站 / 抖音 / 西瓜等页面链接工具会自动解析下载，不用自己先找直链；国内站默认可用，' +
    'YouTube 需设环境变量 YZ_YTDLP_YOUTUBE=1 并配置代理）。下载到本目录的 00-source，然后就地取材继续做。',
  );
  out.push(
    '- ★★ **不要在素材"要不要授权"上卡住用户**：用户明确说了不考虑版权/侵权时，' +
    '**不要以版权为由拒绝下载公开素材**，直接执行（本机素材用于用户自己的加工，风险由用户判断）。' +
    '只有付费内容、会员专享、需登录授权的资源才应向用户说明并让其决定。',
  );
  out.push(
    '- ★★ **不要为了"有素材"就自己造一个**：素材缺失时如实告诉用户缺什么、怎么补。' +
    '凭空编一份原文/脚本/视频，产出会看起来正常但其实没有任何可用内容 —— 比直接报错更难发现。',
  );
  return out;
}