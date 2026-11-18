(() => {
  const root = document.querySelector('#desktop-root');
  const reviewBar = document.querySelector('.review-bar');
  const prototypeParams = new URLSearchParams(location.search);
  if (prototypeParams.get('review') === '0') document.body.classList.add('clean-review');

  const iconPaths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    store: '<path d="M3 9 4.5 4h15L21 9"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/><path d="M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3"/>',
    code: '<path d="m8 9-4 3 4 3"/><path d="m16 9 4 3-4 3"/><path d="m14 5-4 14"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h5a3 3 0 0 1 3 3v15a3 3 0 0 0-3-3H4z"/><path d="M20 5a2 2 0 0 0-2-2h-4v18a3 3 0 0 1 3-3h3z"/>',
    bot: '<rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 3v4"/><path d="M8 12h.01M16 12h.01"/><path d="M9 16h6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2"/><path d="M9 10h6M9 14h6M9 18h4"/>',
    paw: '<circle cx="6" cy="9" r="2"/><circle cx="10" cy="5" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="19" cy="9" r="2"/><path d="M7 18c0-4 2-7 5-7s5 3 5 7c0 2-2 3-5 3s-5-1-5-3z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 3a7 7 0 0 0-1.7 1L5 6.1 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5l2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 3h5l.4-3a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2.1-1.5a7 7 0 0 0 .1-1z"/>',
    command: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    package: '<path d="m3 7 9 5 9-5"/><path d="M3 7v10l9 5 9-5V7l-9-5z"/><path d="M12 12v10"/>',
    cart: '<circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M3 4h2l2.4 11.5A2 2 0 0 0 9.4 17H18a2 2 0 0 0 2-1.6L21 8H6"/>',
    truck: '<path d="M3 6h11v11H3z"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
    boxes: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    alert: '<path d="M12 3 2 21h20z"/><path d="M12 9v5"/><path d="M12 18h.01"/>',
    arrowUpRight: '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    message: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    laptop: '<rect x="4" y="4" width="16" height="12" rx="2"/><path d="M2 20h20"/>',
    minimize: '<path d="M5 12h14"/>',
    maximize: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    play: '<path d="m8 5 11 7-11 7z"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    pin: '<path d="m15 4 5 5-2 2-1 4-4 4-1-1 1-5-3-3 4-1z"/><path d="m7 17-4 4"/>',
    sparkles: '<path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4z"/><path d="M5 3v4M19 17v4M3 5h4M17 19h4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
    upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M4 3h16"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    shield: '<path d="M12 3 4 6v5c0 5 3 9 8 10 5-1 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="m3 3 18 18"/><path d="M10.6 6.3A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a15.6 15.6 0 0 1-3.1 3.7"/><path d="M6.2 6.2C3.5 8 2 12 2 12s3.5 6 10 6c1.8 0 3.4-.5 4.7-1.2"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    paperclip: '<path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L14 3a3.5 3.5 0 0 1 5 5l-9.5 9.5a2 2 0 0 1-3-3L15 6"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="2"/><path d="m21 15-5-5L5 19"/>',
    microphone: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6"/>',
    tag: '<path d="M20 13 13 20a2 2 0 0 1-3 0L3 13V4h9z"/><circle cx="8" cy="9" r="1"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>',
    monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    flow: '<rect x="3" y="4" width="6" height="6" rx="1"/><rect x="15" y="14" width="6" height="6" rx="1"/><path d="M9 7h3a3 3 0 0 1 3 3v4"/><path d="m12 11 3 3 3-3"/>',
    automation: '<path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7z"/><path d="M5 15v4M3 17h4M19 4v4M17 6h4"/>',
    video: '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-2v8l-4-2z"/>',
    grip: '<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/>',
    ai: '<path d="M12 3 9.8 9.8 3 12l6.8 2.2L12 21l2.2-6.8L21 12l-6.8-2.2z"/><path d="M5 3v4M3 5h4M19 17v4M17 19h4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  };

  function icon(name, size = 16, stroke = 1.8) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.more}</svg>`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  const learningSubjects = [
    { key: '党史', label: '党史', meta: '4 阶段 · 13 门课程', course: '遵义会议：转折如何发生', desc: '从会议文献、军事态势和后续决策，理解组织转折如何发生。', progress: '7 / 13', mastery: '68%', streak: '7 天' },
    { key: '政治', label: '政治', meta: '制度 · 治理 · 公共政策', course: '公共政策如何形成', desc: '从问题识别、议程设置和执行条件理解公共政策的完整链路。', progress: '9 / 24', mastery: '73%', streak: '5 天' },
    { key: '经济学', label: '经济学', meta: '微观 · 宏观 · 商业分析', course: '市场失灵与外部性', desc: '从激励、成本和产权边界理解市场失灵，并比较治理工具。', progress: '8 / 20', mastery: '71%', streak: '6 天' },
    { key: '军事', label: '军事', meta: '战史 · 战略 · 组织', course: '战役目标与资源约束', desc: '把战略目标拆成可执行的兵力、补给与时间约束。', progress: '4 / 16', mastery: '64%', streak: '3 天' },
    { key: '历史', label: '历史', meta: '通史 · 史料 · 比较', course: '制度变迁的长期线索', desc: '通过制度、人口与财政数据辨认历史变化中的连续与断裂。', progress: '12 / 32', mastery: '76%', streak: '9 天' },
    { key: '书法', label: '书法', meta: '笔法 · 结构 · 临帖', course: '楷书横画的起收与转折', desc: '把起笔、行笔、收笔拆成可观察的动作，并用临帖校正结构。', progress: '6 / 18', mastery: '59%', streak: '4 天' },
    { key: '记忆训练', label: '记忆训练', meta: '编码 · 联想 · 间隔复习', course: '地点法构建稳定记忆线索', desc: '用空间路线组织信息，并设计可复用的间隔复习节奏。', progress: '14 / 28', mastery: '81%', streak: '15 天' },
    { key: '思维训练', label: '思维训练', meta: '结构化 · 推理 · 决策', course: '把复杂问题拆成判断树', desc: '用假设、证据和反例建立可复核的问题判断过程。', progress: '10 / 24', mastery: '77%', streak: '8 天' },
    { key: '数学', label: '数学', meta: '代数 · 几何 · 概率', course: '概率中的条件与独立性', desc: '从事件关系理解条件概率，并识别日常判断中的独立性误区。', progress: '16 / 36', mastery: '74%', streak: '11 天' },
    { key: '物理', label: '物理', meta: '力学 · 电磁 · 实验', course: '受力分析与运动状态', desc: '先画清相互作用，再判断物体运动状态会如何改变。', progress: '7 / 28', mastery: '61%', streak: '5 天' },
    { key: '百家思想', label: '百家思想', meta: '原典 · 比较 · 论证', course: '儒墨道法的秩序观', desc: '比较四家如何理解人性、秩序与治理责任。', progress: '9 / 22', mastery: '69%', streak: '6 天' },
    { key: '英语', label: '英语', meta: '自然拼读 · 词根 · 长篇阅读', course: '词根 port：携带与运输', desc: '从 transport、export、portable 的共同词根建立词汇网络。', progress: '18 / 120', mastery: '62%', streak: '12 天' },
    { key: '日语', label: '日语', meta: '五十音 · 语法 · 会话', course: '助词は与が的句子焦点', desc: '通过信息焦点理解主题与主语的差异，而不是死记中文对译。', progress: '5 / 60', mastery: '46%', streak: '4 天' },
    { key: '软考', label: '软考', meta: '知识体系 · 真题 · 案例', course: '需求分析与范围管理', desc: '从干系人、边界与验收标准识别项目范围风险。', progress: '11 / 48', mastery: '66%', streak: '7 天' },
    { key: '网络安全', label: '网络安全', meta: '威胁建模 · 攻防 · 审计', course: '威胁建模与 STRIDE', desc: '把模糊的安全担心拆成可评审的威胁类别，并映射控制措施。', progress: '5 / 12', mastery: '74%', streak: '4 天' },
    { key: '传统文化', label: '传统文化', meta: '典籍 · 礼俗 · 艺术', course: '典籍阅读中的注释层次', desc: '区分原文、传统注疏和现代解释，建立可靠的阅读边界。', progress: '13 / 30', mastery: '78%', streak: '10 天' },
    { key: '音乐', label: '音乐', meta: '乐理 · 听辨 · 编曲', course: '和弦功能与段落推进', desc: '通过主、属、下属功能理解段落张力和解决方向。', progress: '4 / 24', mastery: '52%', streak: '3 天' },
    { key: '周易', label: '周易', meta: '课程主线 · 测算实践 · 陪练', course: '象数与解释边界', desc: '区分原文、传统注疏和现代解释，理解象数系统的规则边界。', progress: '11 / 53', mastery: '58%', streak: '3 天' },
    { key: '占卜', label: '占卜', meta: '文化史 · 方法 · 边界', course: '占卜文本的历史语境', desc: '把占卜作为文化材料阅读，区分史料、方法与现代演绎。', progress: '3 / 16', mastery: '49%', streak: '2 天' },
  ];

  const libraryBooks = [
    { title: '《红楼梦》导读', category: '经典名著', author: '曹雪芹', source: '公共领域', license: '公版馆藏', progress: '第 12 / 40 章', tone: 'accent' },
    { title: '《聊斋志异》选读', category: '志怪小说', author: '蒲松龄', source: '公共领域', license: '公版馆藏', progress: '未开始', tone: 'accent' },
    { title: '党史重要文献选读', category: '课程原典', author: '课程材料', source: '课程原典', license: '馆内学习材料', progress: '第 4 / 12 章', tone: 'info' },
    { title: '经济学通识', category: '馆藏借阅', author: '馆藏书目', source: '图书馆借阅', license: '限馆藏借阅', progress: '可借阅', tone: 'warn' },
    { title: '长夜行舟', category: '网络小说', author: '官方授权平台', source: '外部阅读', license: '官方授权入口', progress: '去官方平台', tone: 'default' },
    { title: '山海小品', category: '漫画', author: '公版档案', source: '公共领域', license: '档案预览', progress: '预览', tone: 'accent' },
  ];

  const modes = [
    { key: 'office', label: '办公', sub: '文档、表格与岗位任务', icon: 'home' },
    { key: 'shop', label: '店铺运营', sub: '商品、订单与履约', icon: 'store' },
    { key: 'dev', label: '开发', sub: '项目、代码与运行', icon: 'code' },
    { key: 'ops', label: '运维', sub: '服务、告警与发布', icon: 'monitor' },
    { key: 'sec', label: '安全', sub: '风险、扫描与审计', icon: 'shield' },
    { key: 'wf', label: '工作流', sub: '编排、运行与调试', icon: 'flow' },
    { key: 'rpa', label: '自动化', sub: '录制、脚本与运行记录', icon: 'automation' },
    { key: 'clip', label: '剪辑', sub: '素材、时间线与成片', icon: 'video' },
    { key: 'learning', label: '学习', sub: '19 科课程、训练与图书馆', icon: 'book' },
  ];

  const shopPages = [
    ['overview', '总览'],
    ['products', '商品'],
    ['orders', '订单'],
    ['shipments', '发货'],
    ['inventory', '库存'],
    ['logistics', '物流'],
    ['audit', '操作日志'],
    ['reference', '口径速查'],
  ];

  const shopSetupSteps = [
    ['platform', '选择平台', '淘宝、Amazon、拼多多或 1688'],
    ['store', '店铺类型', '演示、测试或生产店铺'],
    ['source', '货源方式', '有货源、无货源或混合'],
    ['connect', '连接方式', '官方授权、浏览器或手工导入'],
    ['confirm', '确认创建', '检查配置和授权边界'],
  ];

  const assistantPages = [
    ['command', '对话'],
    ['clipboard', '剪贴板'],
    ['pet', '宠物'],
    ['memory', '记忆'],
  ];

  const aiAgents = [
    ['日常办公助手', '文档、表格、会议与任务'],
    ['店铺运营助手', '商品、订单、履约与经营分析'],
    ['数据分析助手', '查询本地业务库并生成图表'],
    ['浏览器助手', '读取网页、填写表单与执行浏览器任务'],
  ];

  const aiSkills = [
    ['文档处理', '生成、改写与校验文档', true],
    ['网页检索', '检索网页并保留来源', true],
    ['表格分析', '读取表格、计算并生成图表', false],
    ['剪贴板归档', '整理复制内容与工作话术', false],
    ['日历排程', '读取空闲时间并创建提醒', false],
  ];

  const aiModels = [
    ['Agnes 3.0 Flash', '速度快，适合日常任务'],
    ['Claude 4 Sonnet', '长文与代码能力强'],
    ['GPT-5.1', '复杂推理与工具调用'],
    ['DeepSeek V3.2', '本地成本低，中文任务稳定'],
  ];

  const aiConversationSeeds = {
    office: [
      { role: 'user', content: '把今天 18 个待发货订单按超时风险排序，先处理最紧急的。', meta: '今天 09:46' },
      { role: 'assistant', agent: '日常办公助手', model: 'Agnes 3.0 Flash', content: '已读取订单和承诺发货时间。建议先处理 SO-1031、SO-1035、SO-1038、SO-1042；其中 SO-1042 将在 2 小时后超时。已生成批量处理计划，等待你确认后创建发货。', meta: '今天 09:46 · 4 个工具调用' },
    ],
    dev: [
      { role: 'user', content: '检查当前的桌面开发壳，保留文件树和 Git，同时把 AI 与人工布局统一到同一套代码上下文。', meta: '今天 10:02' },
      { role: 'assistant', agent: '代码助手', model: 'Agnes 3.0 Flash', content: '已完成结构检查：App.vue 负责壳层，desktop.js 负责原型，Git 当前有 3 个变更。建议先修复键盘焦点路径，再提交 App.vue 和 LearningV2.vue；desktop.js 作为独立原型文件暂不混入业务提交。', meta: '今天 10:03 · 6 个工具调用' },
    ],
    ops: [
      { role: 'user', content: '检查订单服务 P95 升高和同步队列积压，先列出风险最高的处理顺序。', meta: '今天 09:52' },
      { role: 'assistant', agent: '运维助手', model: 'Agnes 3.0 Flash', content: '订单服务延迟与数据库连接池 92% 使用率相关，应优先扩容连接池并回放慢查询；同步队列仍在自动扩容，建议观察 6 分钟后再决定是否人工干预。', meta: '今天 09:53 · 4 个工具调用' },
    ],
    sec: [
      { role: 'user', content: '复核当前两个高危风险，确认修复顺序和授权边界。', meta: '今天 09:44' },
      { role: 'assistant', agent: '安全助手', model: 'Agnes 3.0 Flash', content: '建议先处理对象存储公开读权限，再修复网关 TLS 1.0。两项都在当前授权资产范围内，修复动作会生成变更单并写入审计。', meta: '今天 09:45 · 3 个工具调用' },
    ],
    wf: [
      { role: 'user', content: '检查昨天晨报工作流通知节点超时的原因，保留已生成数据。', meta: '今天 09:38' },
      { role: 'assistant', agent: '工作流助手', model: 'Agnes 3.0 Flash', content: '数据节点和摘要节点均成功，只有通知节点超时。建议重试通知节点，不重跑整条工作流；运行记录中已保留产物。', meta: '今天 09:39 · 2 个工具调用' },
    ],
    rpa: [
      { role: 'user', content: '检查淘宝订单导出脚本第 3 步为什么变慢。', meta: '今天 09:31' },
      { role: 'assistant', agent: '自动化助手', model: 'Agnes 3.0 Flash', content: '下载订单文件的响应时间从 4 秒增加到 18 秒，页面结构没有变化。建议给该步骤增加 30 秒超时和一次重试，不修改后续入库步骤。', meta: '今天 09:32 · 3 个工具调用' },
    ],
    clip: [
      { role: 'user', content: '把主视频压缩到 40 秒，优先保留产品卖点和字幕节奏。', meta: '今天 10:12' },
      { role: 'assistant', agent: '剪辑助手', model: 'Agnes 3.0 Flash', content: '已标记 3 个可删减区间，集中在开场停顿和重复演示。建议保留第 2、4、7 段的主镜头，预计可压缩 8 秒，并自动重排字幕。', meta: '今天 10:13 · 2 个工具调用' },
    ],
    learning: [
      { role: 'user', content: '根据党史当前进度和 12 个薄弱点，安排今天的复习顺序。', meta: '今天 09:20' },
      { role: 'assistant', agent: '学习教练', model: 'Agnes 3.0 Flash', content: '先用 4 分钟复习三次会议的时间线，再做 5 道概念辨析，最后闭卷复述转折链路。薄弱点集中在会议背景和后续影响，不建议继续开新章节。', meta: '今天 09:21 · 2 个工具调用' },
    ],
  };

  const modeAliases = {
    ai: 'office',
    work: 'office',
    code: 'dev',
    workflow: 'wf',
    automation: 'rpa',
    video: 'clip',
    assistant: 'office',
  };
  const projectCenteredModes = new Set(['dev', 'shop', 'clip']);
  const requestedMode = prototypeParams.get('mode') || 'shop';
  const initialMode = modeAliases[requestedMode] || requestedMode;
  const leadDefaults = {
    office: 'ai',
    dev: 'human',
    ops: 'human',
    sec: 'human',
    wf: 'human',
    rpa: 'human',
    clip: 'human',
    shop: 'human',
    learning: 'human',
  };
  const aiAgentByMode = {
    office: '日常办公助手',
    dev: '代码助手',
    ops: '运维助手',
    sec: '安全助手',
    wf: '工作流助手',
    rpa: '自动化助手',
    clip: '剪辑助手',
    shop: '店铺运营助手',
    learning: '学习教练',
  };

  const state = {
    mode: modes.some((mode) => mode.key === initialMode) ? initialMode : 'shop',
    shopPage: prototypeParams.get('page') || 'overview',
    shopSetupOpen: false,
    shopSetupStep: 0,
    shopSetupSelections: {
      platform: '淘宝',
      storeType: '测试店铺',
      sourceMode: '无货源',
      connectMode: '浏览器连接',
    },
    assistantPage: 'command',
    leadByMode: { ...leadDefaults },
    aiAgent: aiAgentByMode[modeAliases[requestedMode] || requestedMode] || '日常办公助手',
    aiSkills: ['文档处理', '网页检索'],
    aiModel: 'Agnes 3.0 Flash',
    aiPermission: '读写',
    aiPicker: null,
    aiMessages: aiConversationSeeds[initialMode] || aiConversationSeeds.office,
    settingsTab: 'general',
    subject: '党史',
    libraryOpen: false,
    libraryTab: 'discover',
    selectedBook: 0,
    contextOpen: true,
    inspectorOpen: true,
    contextWidth: 224,
    inspectorWidth: 306,
    overlay: null,
    menu: null,
    rowMenu: null,
    learningImmersive: false,
    toast: null,
  };
  const requestedLead = prototypeParams.get('lead');
  if (requestedLead === 'ai' || requestedLead === 'human') {
    state.leadByMode[state.mode] = requestedLead;
    if (requestedLead === 'ai') state.aiAgent = aiAgentByMode[state.mode] || state.aiAgent;
  }
  if (prototypeParams.get('inspector') === '1') state.inspectorOpen = true;
  else if (prototypeParams.get('inspector') === '0' || projectCenteredModes.has(state.mode)) state.inspectorOpen = false;

  function modeMeta(key = state.mode) {
    return modes.find((item) => item.key === key) || modes[0];
  }

  function currentLead() {
    return state.leadByMode[state.mode] || 'human';
  }

  function currentSubject() {
    return learningSubjects.find((item) => item.key === state.subject) || learningSubjects[0];
  }

  function status(text) {
    state.toast = text;
    render();
    window.clearTimeout(status.timer);
    status.timer = window.setTimeout(() => {
      state.toast = null;
      render();
    }, 2200);
  }

  function openMenu(type, details = {}) {
    state.menu = type === 'mode' ? null : state.menu;
    state.rowMenu = type === 'row' ? details : null;
    state.overlay = type;
    render();
  }

  function closeOverlays() {
    state.overlay = null;
    state.rowMenu = null;
    render();
  }

  function startPaneResize(kind, event) {
    if (window.matchMedia('(max-width: 1180px)').matches) return;
    const grid = root.querySelector('.workspace-grid');
    if (!grid) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = kind === 'context' ? state.contextWidth : state.inspectorWidth;
    document.body.classList.add('is-resizing-panes');

    const onMove = (moveEvent) => {
      const delta = kind === 'context' ? moveEvent.clientX - startX : startX - moveEvent.clientX;
      const next = kind === 'context'
        ? Math.min(380, Math.max(200, startWidth + delta))
        : Math.min(420, Math.max(260, startWidth + delta));
      if (kind === 'context') {
        state.contextWidth = next;
        grid.style.setProperty('--context-w', `${next}px`);
      } else {
        state.inspectorWidth = next;
        grid.style.setProperty('--inspector-w', `${next}px`);
      }
      const handle = grid.querySelector(`[data-resize="${kind}"]`);
      handle?.setAttribute('aria-valuenow', String(next));
    };

    const onUp = () => {
      document.body.classList.remove('is-resizing-panes');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  function setMode(mode) {
    if (!modes.some((item) => item.key === mode)) return;
    state.mode = mode;
    state.overlay = null;
    state.aiPicker = null;
    state.learningImmersive = false;
    if (mode !== 'learning') state.libraryOpen = false;
    state.leadByMode[mode] ||= leadDefaults[mode] || 'human';
    if (currentLead() === 'ai') {
      state.aiAgent = aiAgentByMode[mode] || '日常办公助手';
      state.assistantPage = 'command';
      state.aiMessages = [...(aiConversationSeeds[mode] || aiConversationSeeds.office)];
    }
    if (projectCenteredModes.has(mode)) state.inspectorOpen = false;
    if (mode === 'shop') state.shopPage = state.shopPage || 'overview';
    history.replaceState(null, '', `?mode=${mode}&lead=${currentLead()}${mode === 'shop' ? `&page=${state.shopPage}` : ''}`);
    render();
  }

  function setLead(lead) {
    if (!['ai', 'human'].includes(lead)) return;
    state.leadByMode[state.mode] = lead;
    state.aiPicker = null;
    state.overlay = null;
    if (lead === 'ai') {
      state.aiAgent = aiAgentByMode[state.mode] || '日常办公助手';
      state.assistantPage = 'command';
      state.aiMessages = [...(aiConversationSeeds[state.mode] || aiConversationSeeds.office)];
    }
    if (projectCenteredModes.has(state.mode)) state.inspectorOpen = false;
    history.replaceState(null, '', `?mode=${state.mode}&lead=${lead}${state.mode === 'shop' ? `&page=${state.shopPage}` : ''}`);
    render();
  }

  function setSubject(subject) {
    if (!learningSubjects.some((item) => item.key === subject)) return;
    state.subject = subject;
    state.overlay = null;
    render();
  }

  function setLibraryTab(tab) {
    if (!['discover', 'shelf', 'sources'].includes(tab)) return;
    state.libraryTab = tab;
    render();
  }

  function setShopPage(page) {
    state.shopSetupOpen = false;
    state.shopPage = page;
    history.replaceState(null, '', `?mode=shop&page=${page}`);
    render();
  }

  function renderTitlebar() {
    const meta = modeMeta();
    const breadcrumb = state.mode === 'shop'
      ? state.shopSetupOpen
        ? `开店向导 / ${shopSetupSteps[state.shopSetupStep]?.[1] || '选择平台'}`
        : `家居出海 / ${shopPages.find(([key]) => key === state.shopPage)?.[1] || '总览'}`
      : state.mode === 'learning'
        ? state.libraryOpen
          ? `图书馆 / ${{ discover: '发现', shelf: '书架', sources: '书源' }[state.libraryTab] || '发现'}`
          : `${currentSubject().label} / ${currentSubject().course}`
        : meta.sub;
    return `
      <header class="window-titlebar">
        <button class="brand-button" data-action="home" aria-label="返回办公模式">
          <span class="brand-mark">言</span>
          <span class="brand-name">言智</span>
        </button>
        <span class="title-divider"></span>
        <button class="mode-trigger ${state.overlay === 'mode' ? 'open' : ''}" data-menu="mode">
          ${icon(meta.icon, 14)} ${meta.label} ${icon('down', 13)}
        </button>
        <div class="lead-switch" role="group" aria-label="AI 与人工工作方式">
          <button class="${currentLead() === 'ai' ? 'active' : ''}" data-lead="ai" aria-pressed="${currentLead() === 'ai'}" title="切换到 AI 工作方式">AI</button>
          <button class="${currentLead() === 'human' ? 'active' : ''}" data-lead="human" aria-pressed="${currentLead() === 'human'}" title="切换到人工工作台">人工</button>
        </div>
        <div class="breadcrumb"><span>/</span><strong>${breadcrumb}</strong></div>
        <div class="pane-controls" aria-label="布局工具">
          <button class="pane-control ${state.contextOpen ? 'is-open' : ''}" data-action="toggle-context" aria-pressed="${state.contextOpen}" title="${state.contextOpen ? '收起上下文栏' : '展开上下文栏'}">${icon('panel', 14)}<span>上下文</span></button>
          <button class="pane-control ${state.inspectorOpen ? 'is-open' : ''}" data-action="toggle-inspector" aria-pressed="${state.inspectorOpen}" title="${state.inspectorOpen ? '收起检查器' : '展开检查器'}">${icon('layers', 14)}<span>检查器</span></button>
        </div>
        <button class="title-command" data-menu="command">
          ${icon('search', 14)}<span>搜索任务、订单、商品或命令</span><kbd>Ctrl K</kbd>
        </button>
        <div class="title-tools">
          <button class="icon-btn" data-menu="notifications" aria-label="通知">${icon('bell', 16)}</button>
          <span class="notification-dot"></span>
          <button class="icon-btn" data-menu="clipboard" aria-label="剪贴板">${icon('clipboard', 16)}</button>
          <button class="icon-btn" data-menu="pet-panel" aria-label="宠物任务">${icon('paw', 16)}</button>
          <button class="title-avatar" data-menu="profile" aria-label="账号菜单"><span class="rail-avatar">Y</span></button>
        </div>
        <div class="window-controls">
          <button aria-label="最小化">${icon('minimize', 14)}</button>
          <button aria-label="最大化">${icon('maximize', 13)}</button>
          <button class="close" aria-label="关闭">${icon('close', 14)}</button>
        </div>
      </header>
    `;
  }

  function contextItem(label, iconName, active = false, extra = '') {
    return `
      <button class="context-item ${active ? 'active' : ''}" ${extra}>
        ${icon(iconName, 14)}
        <span>${label}</span>
      </button>
    `;
  }

  function devTreeRow(label, iconName, depth = 0, active = false, expanded = false) {
    const expandedAttribute = iconName === 'folder' ? ` aria-expanded="${expanded ? 'true' : 'false'}"` : '';
    return `
      <button class="dev-tree-row depth-${depth} ${active ? 'active' : ''}" role="treeitem"${expandedAttribute}>
        <span class="dev-tree-chevron">${expanded ? icon('down', 11) : ''}</span>
        ${icon(iconName, 13)}
        <span>${label}</span>
      </button>
    `;
  }

  function renderDevContextBody() {
    return `
      <div class="dev-project-summary">
        <span class="dev-project-mark">${icon('folder', 15)}</span>
        <div><strong>ai-assistant</strong><small>dev0.1-mobile</small></div>
        <button class="icon-btn" data-menu="workspace" title="项目菜单">${icon('more', 14)}</button>
      </div>
      <div class="dev-tree" role="tree" aria-label="项目文件">
        ${devTreeRow('packages', 'folder', 0, false, true)}
        ${devTreeRow('ui', 'folder', 1, false, true)}
        ${devTreeRow('src', 'folder', 2, false, true)}
        ${devTreeRow('views', 'folder', 3, false, true)}
        ${devTreeRow('CodeWorkbench.vue', 'file', 4, true)}
        ${devTreeRow('ShopConsole.vue', 'file', 4)}
        ${devTreeRow('App.vue', 'file', 3)}
        ${devTreeRow('docs', 'folder', 0, false, true)}
        ${devTreeRow('prototypes', 'folder', 1, false, true)}
        ${devTreeRow('desktop.js', 'file', 2)}
      </div>
      <div class="context-section dev-task-section">
        <div class="context-label">Agent 会话</div>
        ${contextItem('检查项目工作区结构', 'message', true)}
        ${contextItem('修复键盘焦点路径', 'alert')}
      </div>
      <button class="context-git-card" data-action="open-git-panel">
        <span>${icon('code', 14)}</span>
        <div><strong>Git · 3 个变更</strong><small>1 已暂存 · 领先远端 2</small></div>
        ${icon('right', 13)}
      </button>
    `;
  }

  function renderContext() {
    const heads = {
      ai: ['AI 会话', '对话、工具与变更单'],
      office: ['办公空间', '3 个运行中任务'],
      shop: state.shopSetupOpen ? ['开店向导', '从 0 开始创建店铺'] : ['店铺项目', '家居出海'],
      dev: ['开发项目', 'ai-assistant'],
      ops: ['环境与资源', '生产环境'],
      sec: ['授权与资产', '50 个资产'],
      wf: ['工作流', '8 个已启用'],
      rpa: ['自动化项目', '录制与固定脚本'],
      clip: ['剪辑项目', '品牌短视频 11 月'],
      learning: state.libraryOpen ? ['图书馆', '发现、书架与书源'] : ['学习科目', '19 个科目'],
    };
    let [title, subtitle] = heads[state.mode] || [modeMeta().label, modeMeta().sub];
    if (currentLead() === 'ai') {
      title = `${modeMeta().label} · AI`;
      subtitle = `${state.aiAgent} · ${state.aiModel}`;
    }
    let body = '';
    if (state.mode === 'shop' && state.shopSetupOpen) {
      body = `
        <div class="context-section">
          <div class="context-label">创建步骤</div>
          ${shopSetupSteps.map(([key, label, desc], index) => `<button class="context-item ${index === state.shopSetupStep ? 'active' : ''}" data-shop-setup-step="${index}">${icon(index < state.shopSetupStep ? 'check' : 'right', 14)}<span>${index + 1}. ${label}</span></button>`).join('')}
        </div>
        <div class="context-section">
          <div class="context-label">当前选择</div>
          ${contextItem(state.shopSetupSelections.platform, 'store')}
          ${contextItem(state.shopSetupSelections.storeType, 'shield')}
          ${contextItem(state.shopSetupSelections.sourceMode, 'boxes')}
          ${contextItem(state.shopSetupSelections.connectMode, 'external')}
        </div>
      `;
    } else if (state.mode === 'shop') {
      body = `
        <div class="context-section">
          <div class="context-label">项目</div>
          ${contextItem('家居出海', 'folder', true)}
          ${contextItem('宠物用品测试店', 'folder')}
          ${contextItem('未归属资源', 'store')}
        </div>
        <div class="context-section">
          <div class="context-label">当前店铺</div>
          ${contextItem('淘宝旗舰店', 'store', true, 'data-action="shop-store"')}
          ${contextItem('1688 供应链', 'boxes')}
          ${contextItem('顺丰物流', 'truck')}
        </div>
        <div class="context-section">
          <div class="context-label">保存的视图</div>
          ${contextItem('待发货 · 今日', 'clock')}
          ${contextItem('低库存 · 有货源', 'alert')}
          ${contextItem('异常同步', 'refresh')}
        </div>
      `;
    } else if (state.mode === 'office') {
      body = `
        <div class="context-section">
          <div class="context-label">正在运行</div>
          ${contextItem('竞品价格监测', 'play', true)}
          ${contextItem('季度经营复盘', 'chart')}
          ${contextItem('商品详情页翻译', 'file')}
        </div>
        <div class="context-section">
          <div class="context-label">工作空间</div>
          ${contextItem('家居出海', 'folder', true)}
          ${contextItem('个人工作台', 'folder')}
          ${contextItem('自动化', 'sparkles')}
        </div>
      `;
    } else if (state.mode === 'dev') {
      body = renderDevContextBody();
    } else if (state.mode === 'ops') {
      body = `
        <div class="context-section">
          <div class="context-label">环境</div>
          ${contextItem('生产环境', 'monitor', true)}
          ${contextItem('预发布环境', 'layers')}
          ${contextItem('本地开发', 'laptop')}
        </div>
        <div class="context-section">
          <div class="context-label">服务</div>
          ${contextItem('order-service', 'server')}
          ${contextItem('sync-worker', 'refresh')}
          ${contextItem('web-gateway', 'flow')}
        </div>
        <div class="context-section">
          <div class="context-label">快捷视图</div>
          ${contextItem('活跃告警 2', 'alert')}
          ${contextItem('待审批发布 1', 'package')}
        </div>
      `;
    } else if (state.mode === 'sec') {
      body = `
        <div class="context-section">
          <div class="context-label">授权范围</div>
          ${contextItem('生产资产 50', 'shield', true)}
          ${contextItem('研发测试网 24', 'server')}
          ${contextItem('公开域名 12', 'external')}
        </div>
        <div class="context-section">
          <div class="context-label">当前任务</div>
          ${contextItem('基线扫描 68%', 'refresh', true)}
          ${contextItem('本周风险评审', 'list')}
          ${contextItem('审计报告', 'file')}
        </div>
      `;
    } else if (state.mode === 'wf') {
      body = `
        <div class="context-section">
          <div class="context-label">工作流</div>
          ${contextItem('每日经营晨报', 'flow', true)}
          ${contextItem('商品价格监测', 'flow')}
          ${contextItem('异常订单分流', 'flow')}
        </div>
        <div class="context-section">
          <div class="context-label">运行</div>
          ${contextItem('今日运行 18', 'play')}
          ${contextItem('失败待排查 1', 'alert')}
          ${contextItem('定时任务 6', 'clock')}
        </div>
      `;
    } else if (state.mode === 'rpa') {
      body = `
        <div class="context-section">
          <div class="context-label">自动化</div>
          ${contextItem('淘宝订单导出', 'automation', true)}
          ${contextItem('日报入库', 'automation')}
          ${contextItem('竞品快照', 'automation')}
        </div>
        <div class="context-section">
          <div class="context-label">运行记录</div>
          ${contextItem('今日成功 14', 'check')}
          ${contextItem('需要复核 2', 'alert')}
          ${contextItem('已暂停 1', 'pause')}
        </div>
      `;
    } else if (state.mode === 'clip') {
      body = `
        <div class="context-section">
          <div class="context-label">项目</div>
          ${contextItem('品牌短视频 11 月', 'video', true)}
          ${contextItem('商品详情动图', 'video')}
          ${contextItem('直播切片', 'video')}
        </div>
        <div class="context-section">
          <div class="context-label">素材</div>
          ${contextItem('视频 12', 'file')}
          ${contextItem('音频 6', 'message')}
          ${contextItem('字幕轨道 2', 'list')}
        </div>
      `;
    } else if (state.mode === 'learning') {
      body = state.libraryOpen ? `
        <div class="context-section">
          <div class="context-label">馆藏分区</div>
          ${contextItem('发现', 'search', state.libraryTab === 'discover', 'data-library-tab="discover"')}
          ${contextItem('书架', 'book', state.libraryTab === 'shelf', 'data-library-tab="shelf"')}
          ${contextItem('书源', 'external', state.libraryTab === 'sources', 'data-library-tab="sources"')}
        </div>
        <div class="context-section">
          <div class="context-label">分类</div>
          ${contextItem('经典名著', 'book')}
          ${contextItem('志怪小说', 'book')}
          ${contextItem('课程原典', 'book')}
          ${contextItem('网络小说', 'external')}
          ${contextItem('漫画', 'file')}
        </div>
      ` : `
        <div class="context-section">
          <div class="context-label">科目</div>
          ${learningSubjects.map((subject) => contextItem(subject.label, subject.key === '网络安全' ? 'shield' : subject.key === '周易' || subject.key === '占卜' ? 'sparkles' : 'book', state.subject === subject.key, `data-subject="${subject.key}"`)).join('')}
        </div>
        <div class="context-section">
          <div class="context-label">课程</div>
          ${contextItem(currentSubject().course, 'list', true)}
          ${contextItem('课程路线与阶段', 'flow')}
          ${contextItem('复习与训练', 'refresh')}
        </div>
      `;
    } else {
      body = `
        <div class="context-section">
          <div class="context-label">${modeMeta().label}</div>
          ${contextItem(modeMeta().sub, modeMeta().icon, true)}
        </div>
      `;
    }
    if (currentLead() === 'ai') {
      body = state.mode === 'dev' ? renderDevContextBody() : `
        <div class="context-section">
          <div class="context-label">AI 工作区</div>
          ${assistantPages.map(([key, label]) => contextItem(label, key === 'clipboard' ? 'clipboard' : key === 'pet' ? 'paw' : key === 'memory' ? 'layers' : 'command', state.assistantPage === key, `data-assistant-page="${key}"`)).join('')}
        </div>
        <div class="context-section">
          <div class="context-label">最近会话</div>
          ${contextItem('把待发货订单按超时风险排序', 'message', true)}
          ${contextItem('整理 6 条剪贴板话术', 'clipboard')}
          ${contextItem('给订单 SO-1042 创建发货', 'truck')}
        </div>
      `;
    }
    return `
      <aside class="context-pane" aria-label="${title}">
        <div class="context-head">
          <div class="context-title">${title}</div>
          <div class="context-actions">
            <button class="icon-btn" data-menu="workspace" title="工作区菜单">${icon('more', 16)}</button>
            <button class="icon-btn" data-action="toggle-context" title="收起上下文栏">${icon('left', 15)}</button>
          </div>
        </div>
        <label class="context-search">${icon('search', 14)}<input placeholder="${state.libraryOpen ? '搜索书名、作者或书源' : state.mode === 'shop' ? '搜索项目或资源' : '搜索'}"></label>
        <div class="context-body">${body}</div>
        <div class="context-footer">
          <button class="button" data-action="${state.mode === 'shop' ? state.shopSetupOpen ? 'shop-exit-setup' : 'shop-start' : state.mode === 'learning' ? state.libraryOpen ? 'add-library-source' : 'open-library' : 'context-primary'}">${icon(state.mode === 'shop' ? state.shopSetupOpen ? 'left' : 'plus' : state.mode === 'learning' ? 'book' : 'plus', 14)} ${state.mode === 'shop' ? state.shopSetupOpen ? '返回店铺' : '从 0 开店' : state.mode === 'learning' ? state.libraryOpen ? '添加书源' : '打开图书馆' : '新建'}</button>
        </div>
        <div class="context-note">${subtitle}</div>
      </aside>
    `;
  }

  function metrics() {
    const data = [
      ['今日销售额', '¥ 28,460', '+12.4% 对比昨日', 'up'],
      ['今日订单', '126', '+18 单', 'up'],
      ['待发货', '18', '4 单即将超时', 'down'],
      ['低库存', '6', '需补货 3 个 SKU', 'down'],
      ['同步异常', '1', '平台授权失效', 'down'],
    ];
    return `<div class="metric-row">${data.map(([label, value, foot, dir]) => `
      <div class="metric">
        <div class="metric-label">${label}</div>
        <strong class="metric-value">${value}</strong>
        <div class="metric-foot ${dir}">${icon(dir === 'up' ? 'arrowUpRight' : 'alert', 12)}${foot}</div>
      </div>
    `).join('')}</div>`;
  }

  function chart() {
    return `
      <div class="surface-card mini-chart">
        <div class="section-head">
          <h3>订单与履约趋势</h3>
          <span class="sub">近 14 天</span>
          <span class="spacer"></span>
          <div class="segmented"><button class="active">订单</button><button>销售额</button></div>
        </div>
        <div class="chart-legend"><span><i class="legend-dot"></i>订单量</span><span><i class="legend-dot alt"></i>及时发货率</span></div>
        <div class="line-chart">
          <svg viewBox="0 0 420 138" preserveAspectRatio="none" aria-label="最近订单趋势图">
            <path d="M0 112 C35 102, 48 78, 74 88 S112 118, 145 73 S185 63, 214 84 S246 45, 278 58 S323 88, 350 40 S388 42, 420 23" fill="none" stroke="#1f6b5c" stroke-width="2.4" vector-effect="non-scaling-stroke"/>
            <path d="M0 124 C40 119, 65 106, 92 110 S132 96, 168 101 S208 75, 240 82 S283 91, 316 64 S360 78, 420 55" fill="none" stroke="#2f5f9d" stroke-width="1.7" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>
          </svg>
        </div>
        <div class="chart-labels"><span>11-04</span><span>11-07</span><span>11-10</span><span>11-13</span><span>11-17</span></div>
      </div>
    `;
  }

  function priorityInbox() {
    const rows = [
      ['truck', '18 单待发货', '4 单将在 2 小时后超时', '处理'],
      ['alert', '6 个 SKU 低于安全库存', '影响 3 个主推商品', '补货'],
      ['refresh', 'Amazon 店铺同步失败', '授权已过期，需要重新登录', '重试'],
      ['message', '2 条售后消息未回复', '平均等待 36 分钟', '查看'],
    ];
    return `
      <div class="surface-card">
        <div class="section-head" style="padding: 12px 12px 0"><h3>需要你处理</h3><span class="sub">按风险和时限排序</span><span class="spacer"></span><button class="button soft">全部处理</button></div>
        <div class="priority-list" style="margin-top:8px">
          ${rows.map(([ic, title, meta, action]) => `
            <div class="priority-row">
              <span class="priority-icon">${icon(ic, 13)}</span>
              <div class="priority-main"><div class="priority-title">${title}</div><div class="priority-meta">${meta}</div></div>
              <span class="badge warn">待处理</span>
              <button class="button">${action}</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function ordersTable(min = 6) {
    const rows = [
      ['SO-1042', 'TB20261117042', '林**', '¥ 329.00', '待发货', '09:42', 'warning'],
      ['SO-1041', 'TB20261117041', '周**', '¥ 188.00', '运输中', '09:30', 'info'],
      ['SO-1040', 'TB20261117040', '陈**', '¥ 568.00', '待采购', '09:12', 'warning'],
      ['SO-1039', 'TB20261117039', '吴**', '¥ 99.00', '已完成', '08:58', 'success'],
      ['SO-1038', 'TB20261117038', '赵**', '¥ 229.00', '退款中', '08:41', 'danger'],
      ['SO-1037', 'TB20261117037', '何**', '¥ 418.00', '待发货', '08:22', 'warning'],
    ].slice(0, min);
    return `
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr><th style="width:28px"><input type="checkbox" aria-label="全选订单"></th><th>订单号</th><th>买家</th><th>金额</th><th>状态</th><th>下单时间</th><th style="width:44px"></th></tr></thead>
          <tbody>
            ${rows.map(([no, ext, buyer, amount, statusText, time, tone], i) => `
              <tr class="${i === 0 ? 'selected' : ''}">
                <td><input type="checkbox" ${i === 0 ? 'checked' : ''} aria-label="选择订单 ${no}"></td>
                <td><strong>${no}</strong><div style="color:var(--muted);font-size:9.5px">${ext}</div></td>
                <td>${buyer}</td><td class="num">${amount}</td><td><span class="badge ${tone}">${statusText}</span></td><td>${time}</td>
                <td><button class="icon-btn" data-row-menu="${no}" aria-label="订单 ${no} 菜单">${icon('more', 15)}</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function shopOverview() {
    return `
      <div class="page-stack">
        <div class="page-header-line">
          <div><h1>今日运营</h1><p>家居出海 · 淘宝旗舰店 · 11 月 17 日 09:48 更新</p></div>
          <div class="spacer"></div>
          <div class="segmented"><button>人工工作台</button><button class="active">AI 协作</button></div>
          <button class="button">${icon('calendar', 14)} 今日 ${icon('down', 12)}</button>
          <button class="button primary" data-menu="command">${icon('sparkles', 14)} 问 AI</button>
        </div>
        ${metrics()}
        <div class="two-column">${priorityInbox()}${chart()}</div>
        <div class="surface-card pad">
          <div class="section-head"><h3>最近订单</h3><span class="sub">18 单待发货</span><span class="spacer"></span><button class="button">导出</button><button class="button" data-shop-page="orders">查看全部 ${icon('right', 13)}</button></div>
          ${ordersTable(4)}
        </div>
        <div class="state-banner warn">${icon('alert', 16)} 平台同步存在 1 个异常。数据仍以本地业务库为准，重新授权前不会覆盖线上库存。</div>
      </div>
    `;
  }

  function shopProducts() {
    const rows = [
      ['HO-001', '胡桃木猫爬架', '自营', '¥ 129.00', '¥ 329.00', '46.8%', '12', '在售'],
      ['HO-002', '云朵宠物窝', '1688 · 义乌', '¥ 68.00', '¥ 189.00', '48.1%', '3', '在售'],
      ['HO-003', '可拆洗猫抓板', '自营', '¥ 22.00', '¥ 79.00', '52.7%', '0', '缺货'],
      ['HO-004', '智能饮水机', '1688 · 深圳', '¥ 96.00', '¥ 269.00', '47.6%', '24', '草稿'],
      ['HO-005', '折叠航空箱', '自营', '¥ 143.00', '¥ 399.00', '46.4%', '8', '在售'],
    ];
    return `
      <div class="page-stack">
        <div class="toolbar-row">
          <label class="search-field">${icon('search', 14)}<input placeholder="搜索 SKU、标题或货源链接"></label>
          <button class="button">${icon('filter', 14)} 筛选</button>
          <button class="button">${icon('table', 14)} 列设置</button>
          <button class="button primary">${icon('plus', 14)} 新建商品</button>
        </div>
        <div class="filter-row">
          <button class="chip active">全部 128</button><button class="chip">在售 96</button><button class="chip">草稿 14</button><button class="chip">缺货 6</button><button class="chip">低库存 12</button>
          <span class="main-spacer"></span><span class="badge info">有货源</span>
        </div>
        <div class="selection-bar">${icon('check', 14)} 已选择 1 个商品 <span class="spacer"></span><button class="button square">${icon('upload', 14)}</button><button class="button square">${icon('download', 14)}</button><button class="button danger">批量下架</button></div>
        <div class="data-table-wrap">
          <table class="data-table">
            <thead><tr><th><input type="checkbox" aria-label="全选商品"></th><th>商品</th><th>货源</th><th>成本</th><th>售价</th><th>毛利率</th><th>库存</th><th>状态</th><th></th></tr></thead>
            <tbody>${rows.map((r, i) => `
              <tr class="${i === 1 ? 'selected' : ''}">
                <td><input type="checkbox" ${i === 1 ? 'checked' : ''} aria-label="选择 ${r[1]}"></td>
                <td><div class="table-product"><span class="product-thumb">${r[0].slice(-3)}</span><div><strong>${r[1]}</strong><div style="color:var(--muted);font-size:9.5px">${r[0]}</div></div></div></td>
                <td>${r[2]}</td><td class="num">${r[3]}</td><td class="num">${r[4]}</td><td class="num">${r[5]}</td>
                <td><span class="${r[6] === '0' || Number(r[6]) < 6 ? 'badge danger' : ''}">${r[6]}</span></td><td><span class="badge ${r[7] === '在售' ? 'accent' : r[7] === '缺货' ? 'danger' : ''}">${r[7]}</span></td>
                <td><button class="icon-btn" data-row-menu="${r[0]}" aria-label="${r[1]} 菜单">${icon('more', 15)}</button></td>
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function shopOrders() {
    return `
      <div class="page-stack">
        <div class="toolbar-row"><label class="search-field">${icon('search', 14)}<input placeholder="搜索订单号、买家或商品"></label><button class="button">${icon('filter', 14)} 筛选</button><button class="button">${icon('download', 14)} 导出</button></div>
        <div class="filter-row"><button class="chip active">全部 126</button><button class="chip">待发货 18</button><button class="chip">待采购 4</button><button class="chip">运输中 36</button><button class="chip">退款 2</button></div>
        <div class="two-column" style="grid-template-columns:minmax(0,1fr)">
          ${ordersTable(6)}
        </div>
        <div class="state-banner info">${icon('truck', 16)} 选中订单后可在右侧检查器创建发货。批量发货会先校验运单号与超时风险。</div>
      </div>
    `;
  }

  function shopShipments() {
    return `
      <div class="page-stack">
        <div class="toolbar-row"><label class="search-field">${icon('search', 14)}<input placeholder="搜索运单号或订单号"></label><button class="button">${icon('refresh', 14)} 刷新轨迹</button><button class="button primary">${icon('truck', 14)} 创建发货</button></div>
        <div class="metric-row" style="grid-template-columns:repeat(4,minmax(0,1fr))">
          <div class="metric"><div class="metric-label">待揽收</div><strong class="metric-value">8</strong><div class="metric-foot">平均等待 1.4h</div></div>
          <div class="metric"><div class="metric-label">运输中</div><strong class="metric-value">36</strong><div class="metric-foot up">2 单即将签收</div></div>
          <div class="metric"><div class="metric-label">今日签收</div><strong class="metric-value">21</strong><div class="metric-foot">签收率 94.6%</div></div>
          <div class="metric"><div class="metric-label">异常</div><strong class="metric-value">2</strong><div class="metric-foot down">地址异常 1 · 超时 1</div></div>
        </div>
        <div class="two-column">
          <div class="surface-card pad">
            <div class="section-head"><h3>发货单</h3><span class="spacer"></span><span class="badge warn">2 个异常</span></div>
            <div class="data-table-wrap">
              <table class="data-table"><thead><tr><th>运单号</th><th>订单</th><th>物流商</th><th>状态</th><th>更新时间</th></tr></thead>
              <tbody><tr><td>SF1498221032</td><td>SO-1042</td><td>顺丰</td><td><span class="badge info">运输中</span></td><td>09:40</td></tr><tr><td>YT72830119</td><td>SO-1037</td><td>云途</td><td><span class="badge warn">待揽收</span></td><td>08:55</td></tr><tr><td>SF1498221001</td><td>SO-1021</td><td>顺丰</td><td><span class="badge danger">地址异常</span></td><td>08:22</td></tr></tbody></table>
            </div>
          </div>
          <div class="surface-card pad">
            <div class="section-head"><h3>轨迹</h3><span class="sub">SF1498221032</span></div>
            <div class="timeline">
              <div class="timeline-row"><span class="timeline-dot done">${icon('check', 10)}</span><div><div class="timeline-title">已到达深圳南山营业点</div><div class="timeline-meta">正在安排派送</div></div><span class="timeline-time">09:18</span></div>
              <div class="timeline-row"><span class="timeline-dot done">${icon('check', 10)}</span><div><div class="timeline-title">运输中</div><div class="timeline-meta">深圳转运中心 → 南山营业点</div></div><span class="timeline-time">07:42</span></div>
              <div class="timeline-row"><span class="timeline-dot done">${icon('check', 10)}</span><div><div class="timeline-title">已揽收</div><div class="timeline-meta">快递员 王师傅</div></div><span class="timeline-time">昨日 20:16</span></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function shopInventory() {
    return `
      <div class="page-stack">
        <div class="toolbar-row"><label class="search-field">${icon('search', 14)}<input placeholder="搜索 SKU 或商品"></label><button class="button">${icon('download', 14)} 导出流水</button><button class="button primary">${icon('plus', 14)} 入库</button></div>
        <div class="state-banner warn">${icon('alert', 16)} 3 个主推 SKU 低于安全库存，预计 4.2 天售罄。</div>
        <div class="two-column">
          <div class="surface-card pad">
            <div class="section-head"><h3>库存明细</h3><span class="sub">本地业务库</span><span class="spacer"></span><button class="chip active">全部仓库</button></div>
            <div class="data-table-wrap"><table class="data-table"><thead><tr><th>SKU</th><th>商品</th><th>可用</th><th>安全库存</th><th>状态</th></tr></thead><tbody><tr><td>HO-001</td><td>胡桃木猫爬架</td><td>12</td><td>10</td><td><span class="badge accent">正常</span></td></tr><tr><td>HO-002</td><td>云朵宠物窝</td><td>3</td><td>12</td><td><span class="badge danger">低库存</span></td></tr><tr><td>HO-003</td><td>可拆洗猫抓板</td><td>0</td><td>8</td><td><span class="badge danger">缺货</span></td></tr><tr><td>HO-005</td><td>折叠航空箱</td><td>8</td><td>6</td><td><span class="badge accent">正常</span></td></tr></tbody></table></div>
          </div>
          <div class="surface-card pad">
            <div class="section-head"><h3>最近库存流水</h3></div>
            <div class="timeline">
              <div class="timeline-row"><span class="timeline-dot done">${icon('plus', 10)}</span><div><div class="timeline-title">HO-001 入库 20</div><div class="timeline-meta">采购单 PO-092 · 操作人 Y</div></div><span class="timeline-time">09:12</span></div>
              <div class="timeline-row"><span class="timeline-dot">${icon('minus', 10)}</span><div><div class="timeline-title">HO-002 出库 6</div><div class="timeline-meta">订单 SO-1042 占用</div></div><span class="timeline-time">09:06</span></div>
              <div class="timeline-row"><span class="timeline-dot">${icon('refresh', 10)}</span><div><div class="timeline-title">HO-003 盘点调整</div><div class="timeline-meta">账面 1 → 实际 0</div></div><span class="timeline-time">08:30</span></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function shopLogistics() {
    return `
      <div class="page-stack">
        <div class="page-header-line"><div><h1>物流与承运商</h1><p>连接状态、面单余额与轨迹查询</p></div><div class="spacer"></div><button class="button primary">${icon('plus', 14)} 新增承运商</button></div>
        <div class="three-column">
          <div class="surface-card pad"><div class="section-head"><h3>顺丰</h3><span class="badge accent">已连接</span></div><div class="kv-list"><div class="kv-row"><span>面单余额</span><strong>1,286 张</strong></div><div class="kv-row"><span>今日调用</span><strong>84 次</strong></div><div class="kv-row"><span>轨迹延迟</span><strong>2 分钟</strong></div></div></div>
          <div class="surface-card pad"><div class="section-head"><h3>云途</h3><span class="badge accent">已连接</span></div><div class="kv-list"><div class="kv-row"><span>面单余额</span><strong>326 张</strong></div><div class="kv-row"><span>今日调用</span><strong>16 次</strong></div><div class="kv-row"><span>轨迹延迟</span><strong>8 分钟</strong></div></div></div>
          <div class="surface-card pad"><div class="section-head"><h3>4PX</h3><span class="badge">未连接</span></div><div class="empty-state" style="min-height:120px">${icon('truck', 28)}<strong>尚未配置凭据</strong><p>跨境订单可添加 4PX 后直接回填运单。</p></div></div>
        </div>
        <div class="surface-card pad"><div class="section-head"><h3>最近轨迹查询</h3><button class="button">查看全部</button></div>${ordersTable(3).replace('订单号', '订单 / 运单')}</div>
      </div>
    `;
  }

  function shopAudit() {
    return `
      <div class="page-stack">
        <div class="toolbar-row"><label class="search-field">${icon('search', 14)}<input placeholder="搜索操作人、对象或动作"></label><button class="button">${icon('filter', 14)} 筛选</button><button class="button">${icon('download', 14)} 导出审计</button></div>
        <div class="surface-card pad">
          <div class="timeline">
            <div class="timeline-row"><span class="timeline-dot done">${icon('check', 10)}</span><div><div class="timeline-title">AI 修改 HO-001 售价</div><div class="timeline-meta">¥319.00 → ¥329.00 · 变更单 CH-031 · 已批准</div></div><span class="timeline-time">09:31</span></div>
            <div class="timeline-row"><span class="timeline-dot done">${icon('check', 10)}</span><div><div class="timeline-title">人工创建发货 SO-1042</div><div class="timeline-meta">顺丰 · SF1498221032 · actor=human</div></div><span class="timeline-time">09:26</span></div>
            <div class="timeline-row"><span class="timeline-dot">${icon('shield', 10)}</span><div><div class="timeline-title">Amazon 配置自检失败</div><div class="timeline-meta">LWA refresh token 已过期 · 未执行写操作</div></div><span class="timeline-time">09:02</span></div>
          </div>
        </div>
      </div>
    `;
  }

  function shopReference() {
    return `
      <div class="page-stack">
        <div class="page-header-line"><div><h1>经营口径速查</h1><p>团队统一使用以下口径解释看板与变更单</p></div></div>
        <div class="two-column equal">
          <div class="surface-card pad"><div class="section-head"><h3>销售额</h3></div><div class="kv-list"><div class="kv-row"><span>口径</span><strong>已付款且未退款订单金额</strong></div><div class="kv-row"><span>币种</span><strong>按店铺站点币种</strong></div><div class="kv-row"><span>时区</span><strong>店铺经营时区</strong></div><div class="kv-row"><span>刷新</span><strong>手动刷新 + 5 分钟缓存</strong></div></div></div>
          <div class="surface-card pad"><div class="section-head"><h3>待发货</h3></div><div class="kv-list"><div class="kv-row"><span>口径</span><strong>已付款 + 采购中</strong></div><div class="kv-row"><span>超时</span><strong>承诺发货时间前 2 小时提醒</strong></div><div class="kv-row"><span>无货源</span><strong>先标记采购，再创建发货</strong></div><div class="kv-row"><span>异常</span><strong>地址异常单独计数</strong></div></div></div>
          <div class="surface-card pad"><div class="section-head"><h3>毛利率</h3></div><div class="kv-list"><div class="kv-row"><span>公式</span><strong>(售价 - 成本 - 平台费) / 售价</strong></div><div class="kv-row"><span>金额</span><strong>整数分计算，展示保留 1 位</strong></div><div class="kv-row"><span>缺失成本</span><strong>显示“待补成本”，不估算</strong></div></div></div>
          <div class="surface-card pad"><div class="section-head"><h3>AI 操作</h3></div><div class="kv-list"><div class="kv-row"><span>写操作</span><strong>必须出变更单并人工批准</strong></div><div class="kv-row"><span>生产店铺</span><strong>禁止批量，额外批准</strong></div><div class="kv-row"><span>审计</span><strong>记录 actor、前后值和来源</strong></div></div></div>
        </div>
      </div>
    `;
  }

  function renderShopPage() {
    const pages = {
      overview: shopOverview,
      products: shopProducts,
      orders: shopOrders,
      shipments: shopShipments,
      inventory: shopInventory,
      logistics: shopLogistics,
      audit: shopAudit,
      reference: shopReference,
    };
    return (pages[state.shopPage] || shopOverview)();
  }

  function renderShopSetup() {
    const step = shopSetupSteps[state.shopSetupStep] || shopSetupSteps[0];
    const selections = state.shopSetupSelections;
    const choiceGroup = (stepKey, options, description) => `
      <div class="settings-group">
        <div class="settings-group-head"><h3>${step[1]}</h3><p>${description}</p></div>
        <div class="shop-setup-options">
          ${options.map(([value, title, text, iconName]) => `<button class="shop-setup-option ${selections[stepKey] === value ? 'active' : ''}" data-shop-choice="${stepKey}" data-value="${value}"><span class="priority-icon">${icon(iconName, 16)}</span><span><strong>${title}</strong><small>${text}</small></span>${selections[stepKey] === value ? icon('check', 15) : ''}</button>`).join('')}
        </div>
      </div>
    `;
    let body = '';
    if (step[0] === 'platform') {
      body = choiceGroup('platform', [
        ['淘宝', '淘宝 / 天猫', '适合国内店铺订单与履约流程', 'store'],
        ['Amazon', 'Amazon', '适合跨境 Listing、FBA 与广告运营', 'external'],
        ['拼多多', '拼多多', '适合低价高频与活动运营', 'cart'],
        ['1688', '1688 / 供应链', '先从货源与采购开始', 'boxes'],
      ], '先选择这家店从哪里开始经营。');
    } else if (step[0] === 'store') {
      body = choiceGroup('storeType', [
        ['演示店铺', '演示店铺', '使用示例数据熟悉流程，不影响真实业务', 'play'],
        ['测试店铺', '测试店铺', '连接测试账号，验证同步与履约边界', 'shield'],
        ['生产店铺', '生产店铺', '真实订单和库存，所有写操作进入审计', 'store'],
      ], '店铺类型会决定默认权限、确认和审计策略。');
    } else if (step[0] === 'source') {
      body = choiceGroup('sourceMode', [
        ['有货源', '有货源', '自己管理库存、采购成本与发货', 'boxes'],
        ['无货源', '无货源', '订单进入后先采购，再回填物流', 'truck'],
        ['混合', '混合经营', '部分商品自备库存，部分商品按单采购', 'layers'],
      ], '选择货源方式后，商品、库存和发货工作台会使用不同字段。');
    } else if (step[0] === 'connect') {
      body = choiceGroup('connectMode', [
        ['官方授权', '官方平台授权', '使用平台 OAuth 或 API 同步数据', 'external'],
        ['浏览器连接', '浏览器连接', '在应用内浏览器登录，只操作已授权页面', 'monitor'],
        ['手工导入', '手工导入', '先导入 CSV，稍后再连接平台', 'upload'],
      ], '连接方式决定数据同步、登录和故障恢复流程。');
    } else {
      body = `
        <div class="settings-group">
          <div class="settings-group-head"><h3>确认店铺配置</h3><p>创建后仍可在店铺设置中修改，但生产店铺切换需要额外确认。</p></div>
          <div class="shop-setup-summary">
            <div><span>平台</span><strong>${selections.platform}</strong></div>
            <div><span>店铺类型</span><strong>${selections.storeType}</strong></div>
            <div><span>货源方式</span><strong>${selections.sourceMode}</strong></div>
            <div><span>连接方式</span><strong>${selections.connectMode}</strong></div>
            <div><span>默认工作方式</span><strong>人工</strong></div>
            <div><span>高风险动作</span><strong>变更单 + 人工批准</strong></div>
          </div>
        </div>
        <div class="state-banner info">${icon('shield', 15)} 创建完成后先进入开店清单。同步授权、商品导入和首单履约验证完成前，不会自动开启生产写操作。</div>
      `;
    }
    const isLast = state.shopSetupStep === shopSetupSteps.length - 1;
    return `
      <div class="main-toolbar"><div><div class="main-title">从 0 开店</div><span class="main-subtitle">步骤 ${state.shopSetupStep + 1} / ${shopSetupSteps.length} · ${step[1]}</span></div><span class="main-spacer"></span><button class="button" data-action="shop-save-draft">保存草稿</button><button class="button" data-action="shop-exit-setup">${icon('left', 14)} 返回店铺</button></div>
      <div class="main-content shop-setup-content">
        <div class="shop-setup-layout">
          <aside class="shop-setup-steps" aria-label="开店步骤">
            ${shopSetupSteps.map(([key, label, desc], index) => `<button class="${index === state.shopSetupStep ? 'active' : ''} ${index < state.shopSetupStep ? 'done' : ''}" data-shop-setup-step="${index}"><span>${index < state.shopSetupStep ? icon('check', 12) : index + 1}</span><div><strong>${label}</strong><small>${desc}</small></div></button>`).join('')}
          </aside>
          <section class="shop-setup-panel">
            <div class="shop-setup-progress"><i style="width:${((state.shopSetupStep + 1) / shopSetupSteps.length) * 100}%"></i></div>
            ${body}
            <footer class="shop-setup-footer">
              <button class="button" data-action="shop-setup-prev" ${state.shopSetupStep === 0 ? 'disabled' : ''}>${icon('left', 14)} 上一步</button>
              <span class="spacer"></span>
              <button class="button primary" data-action="${isLast ? 'shop-create' : 'shop-setup-next'}">${isLast ? `${icon('check', 14)} 创建店铺` : `下一步 ${icon('right', 14)}`}</button>
            </footer>
          </section>
        </div>
      </div>
    `;
  }

  function renderShopMain() {
    if (state.shopSetupOpen) return renderShopSetup();
    return `
      <div class="main-toolbar">
        <div><div class="main-title">淘宝旗舰店</div><span class="main-subtitle">生产店铺 · 有货源 · 本地业务库</span></div>
        <span class="badge danger">生产</span><span class="badge">有货源</span>
        <span class="main-spacer"></span>
        <button class="icon-btn" title="搜索">${icon('search', 15)}</button>
        <button class="icon-btn" title="刷新">${icon('refresh', 15)}</button>
        <button class="button">${icon('monitor', 14)} 浏览器</button>
        <button class="button">${icon('shield', 14)} 配置自检</button>
        <button class="button primary" data-action="shop-start">${icon('plus', 14)} 从 0 开店</button>
        <button class="icon-btn active" data-action="toggle-inspector" title="检查器">${icon('panel', 15)}</button>
      </div>
      <div class="main-tabs">${shopPages.map(([key, label]) => `<button class="main-tab ${state.shopPage === key ? 'active' : ''}" data-shop-page="${key}">${label}${key === 'orders' ? ' <span class="badge warn">18</span>' : key === 'inventory' ? ' <span class="badge danger">6</span>' : ''}</button>`).join('')}</div>
      <div class="main-content">${renderShopPage()}</div>
    `;
  }

  function renderShopInspector() {
    if (state.shopSetupOpen) {
      const step = shopSetupSteps[state.shopSetupStep];
      return `
        <div class="inspector-head"><span class="inspector-title">开店检查器</span><button class="icon-btn" data-action="toggle-inspector">${icon('right', 14)}</button></div>
        <div class="inspector-body page-stack">
          <div class="section-head"><h3>${step[1]}</h3><span class="badge accent">步骤 ${state.shopSetupStep + 1}/${shopSetupSteps.length}</span></div>
          <p style="margin:0;color:var(--muted);font-size:11px;line-height:1.65">${step[2]}</p>
          <div class="kv-list"><div class="kv-row"><span>平台</span><strong>${state.shopSetupSelections.platform}</strong></div><div class="kv-row"><span>店铺类型</span><strong>${state.shopSetupSelections.storeType}</strong></div><div class="kv-row"><span>货源</span><strong>${state.shopSetupSelections.sourceMode}</strong></div><div class="kv-row"><span>连接</span><strong>${state.shopSetupSelections.connectMode}</strong></div></div>
          <div class="state-banner info">${icon('shield', 15)} 测试店铺和演示店铺默认不写入真实订单；生产店铺需要额外确认。</div>
          <button class="button" style="width:100%" data-action="shop-exit-setup">${icon('left', 14)} 返回店铺</button>
        </div>
      `;
    }
    if (state.shopPage === 'products') {
      return `
        <div class="inspector-head"><span class="inspector-title">商品检查器</span><button class="icon-btn" data-action="toggle-inspector">${icon('right', 14)}</button></div>
        <div class="inspector-body page-stack">
          <div class="ai-card"><div class="ai-card-head">${icon('sparkles', 14)} AI 建议</div><p style="font-size:11.5px;line-height:1.65;margin:7px 0 0">HO-002 成本 68 元，建议售价保持 189 元；若参加平台满减，毛利率将降至 38.6%。</p></div>
          <div class="kv-list"><div class="kv-row"><span>SKU</span><strong>HO-002</strong></div><div class="kv-row"><span>安全库存</span><strong>12</strong></div><div class="kv-row"><span>可售天数</span><strong>1.8 天</strong></div><div class="kv-row"><span>供应商</span><strong>1688 · 义乌</strong></div></div>
          <div class="ai-change"><div class="ai-change-title">建议补货 40 件</div><div class="ai-change-diff"><span class="diff-old">库存 3</span>${icon('right', 12)}<span class="diff-new">43</span></div><button class="button primary" style="width:100%;margin-top:10px">生成采购变更单</button></div>
        </div>
      `;
    }
    if (state.shopPage === 'orders' || state.shopPage === 'shipments') {
      return `
        <div class="inspector-head"><span class="inspector-title">订单详情</span><button class="button soft">${icon('truck', 13)} 创建发货</button><button class="icon-btn" data-action="toggle-inspector">${icon('right', 14)}</button></div>
        <div class="inspector-body page-stack">
          <div><div class="badge warn">待发货</div><h3 style="margin:8px 0 3px;font-size:15px">SO-1042</h3><div style="color:var(--muted);font-size:10.5px">淘宝订单 TB20261117042</div></div>
          <div class="kv-list"><div class="kv-row"><span>买家</span><strong>林**</strong></div><div class="kv-row"><span>金额</span><strong>¥329.00</strong></div><div class="kv-row"><span>下单</span><strong>今天 09:42</strong></div><div class="kv-row"><span>承诺发货</span><strong>今天 18:00</strong></div></div>
          <div class="surface-card pad"><div class="section-head"><h3>商品</h3></div><div class="list-row"><span class="product-thumb">001</span><div class="list-row-main"><div class="list-row-title">胡桃木猫爬架</div><div class="list-row-meta">HO-001 · 数量 1</div></div><strong>¥329</strong></div></div>
          <div class="ai-card"><div class="ai-card-head">${icon('sparkles', 14)} AI 变更单</div><div class="ai-change"><div class="ai-change-title">创建顺丰发货</div><p style="margin:5px 0 0;color:var(--muted);font-size:10.5px">预计运费 ¥12，回填 SF1498221032，发货后短信通知买家。</p><div style="display:flex;gap:6px;margin-top:9px"><button class="button">修改</button><button class="button primary" style="flex:1">批准并执行</button></div></div></div>
        </div>
      `;
    }
    return `
      <div class="inspector-head"><span class="inspector-title">运营检查器</span><button class="icon-btn" data-action="toggle-inspector">${icon('right', 14)}</button></div>
      <div class="inspector-body page-stack">
        <div class="section-head"><h3>今日经营</h3><span class="spacer"></span><span class="badge accent">健康</span></div>
        <div class="kv-list"><div class="kv-row"><span>转化率</span><strong>4.8%</strong></div><div class="kv-row"><span>客单价</span><strong>¥225.87</strong></div><div class="kv-row"><span>退款率</span><strong>1.6%</strong></div><div class="kv-row"><span>履约超时</span><strong style="color:var(--danger)">4 单</strong></div></div>
        <div class="ai-card"><div class="ai-card-head">${icon('sparkles', 14)} AI 运营摘要</div><p style="font-size:11.5px;line-height:1.65;margin:7px 0 0">销售额高于近 7 日均值 12%。主要增量来自 HO-001，但 HO-002 库存只够 1.8 天，建议先补货再追加投放。</p></div>
        <div class="ai-change"><div class="ai-change-title">变更单 CH-031</div><div class="ai-change-diff"><span class="diff-old">HO-001 ¥319</span>${icon('right', 12)}<span class="diff-new">¥329</span></div><p style="margin:6px 0 0;color:var(--muted);font-size:10.5px">AI 基于近 14 天转化与竞品价格提出。等待人工批准。</p><div style="display:flex;gap:6px;margin-top:8px"><button class="button">拒绝</button><button class="button primary" style="flex:1" data-action="approve-change">批准</button></div></div>
      </div>
    `;
  }

  function renderWorkMain() {
    return `
      <div class="main-toolbar"><div><div class="main-title">办公</div><span class="main-subtitle">3 个任务运行中 · 2 个产物待验收</span></div><span class="main-spacer"></span><button class="button">${icon('refresh', 14)} 刷新</button><button class="button primary">${icon('plus', 14)} 新建任务</button></div>
      <div class="main-content office-desk">
        <div class="office-brief"><div><span class="eyebrow">今日任务台</span><h1>上午好，Y</h1><p>3 个任务在跑，1 个结果需要你确认。</p></div><div class="office-brief-actions"><button class="button">${icon('command', 14)} 命令面板</button><button class="button primary">${icon('plus', 14)} 快速新建</button></div></div>
        <div class="office-kanban">
          <section class="office-column"><header><span class="office-column-dot running"></span><h3>执行中</h3><span class="badge accent">3</span></header><div class="office-task-card"><div class="office-task-head"><span class="priority-icon">${icon('refresh', 13)}</span><strong>监控竞品价格</strong><button class="icon-btn">${icon('pause', 13)}</button></div><p>浏览器任务 · 已运行 8 分钟</p><div class="progress"><i style="width:60%"></i></div><small>步骤 3 / 5</small></div><div class="office-task-card"><div class="office-task-head"><span class="priority-icon">${icon('chart', 13)}</span><strong>生成经营复盘</strong><button class="icon-btn">${icon('more', 13)}</button></div><p>数据查询 · 正在计算毛利率</p><div class="progress"><i style="width:38%"></i></div><small>预计还需 4 分钟</small></div></section>
          <section class="office-column"><header><span class="office-column-dot waiting"></span><h3>等你输入</h3><span class="badge warn">1</span></header><div class="office-task-card attention"><div class="office-task-head"><span class="priority-icon">${icon('message', 13)}</span><strong>确认英文 Listing 语气</strong></div><p>商品详情页翻译已完成初稿，需要选择品牌语气。</p><div class="office-task-choices"><button class="chip active">专业</button><button class="chip">友好</button><button class="chip">简洁</button></div><button class="button primary">确认并继续</button></div><div class="office-task-card"><div class="office-task-head"><span class="priority-icon">${icon('file', 13)}</span><strong>整理会议纪要</strong></div><p>等待上传录音或转写文本。</p></div></section>
          <section class="office-column"><header><span class="office-column-dot done"></span><h3>待验收</h3><span class="badge">2</span></header><div class="office-task-card"><div class="office-task-head"><span class="product-thumb">XLS</span><strong>11 月订单毛利分析.xlsx</strong></div><p>刚刚生成 · 7 个工作表</p><div class="office-task-actions"><button class="button">打开</button><button class="button soft">验收</button></div></div><div class="office-task-card"><div class="office-task-head"><span class="product-thumb">DOC</span><strong>SO-1042 异常处理报告.docx</strong></div><p>12 分钟前 · 3 条建议</p><div class="office-task-actions"><button class="button">打开</button><button class="button soft">验收</button></div></div></section>
        </div>
        <section class="office-recent"><header><h3>最近任务</h3><span class="spacer"></span><button class="button">查看全部</button></header>${ordersTable(3).replaceAll('SO-', 'TASK-')}</section>
      </div>
    `;
  }

  function renderCodeMain() {
    return `
      <div class="main-toolbar"><div><div class="main-title">重构应用壳</div><span class="main-subtitle">ai-assistant · dev0.1-mobile</span></div><span class="badge accent">运行中</span><span class="main-spacer"></span><button class="button" data-action="open-git-panel">${icon('code', 14)} Git <span class="badge warn">3</span></button><button class="button">${icon('refresh', 14)} 运行测试</button><button class="button primary">${icon('send', 14)} 继续执行</button></div>
      <div class="main-content">
        <div class="code-layout">
          <div class="code-panel"><div class="code-head">${icon('file', 13)} desktop.js <span class="main-spacer"></span><span class="badge accent">修改 18 行</span></div><div class="code-lines"><div class="code-line"><span class="ln">1</span><span><span class="token-key">const</span> state = {</span></div><div class="code-line"><span class="ln">2</span><span>  mode: <span class="token-str">'shop'</span>,</span></div><div class="code-line del"><span class="ln">3</span><span>  legacyNav: <span class="token-key">true</span>,</span></div><div class="code-line add"><span class="ln">3</span><span>  modeRail: <span class="token-key">true</span>,</span></div><div class="code-line add"><span class="ln">4</span><span>  inspector: <span class="token-key">true</span>,</span></div><div class="code-line"><span class="ln">5</span><span>  context: <span class="token-str">'current-project'</span></span></div><div class="code-line"><span class="ln">6</span><span>}</span></div><div class="code-line"><span class="ln">7</span><span>&nbsp;</span></div><div class="code-line"><span class="ln">8</span><span><span class="token-com">// keyboard-first desktop shell</span></span></div><div class="code-line"><span class="ln">9</span><span><span class="token-key">function</span> renderShell() { … }</span></div></div></div>
          <div class="code-panel" style="background:var(--surface);color:var(--ink)"><div class="code-head" style="border-color:var(--line);color:var(--muted)">${icon('message', 13)} Agent 会话 <span class="main-spacer"></span><span class="badge accent">3 个工具调用</span></div><div style="padding:12px;display:flex;flex-direction:column;gap:9px"><div class="state-banner info">${icon('sparkles', 15)} 已完成壳层结构拆分，正在补快捷键测试。</div><div class="list-row"><span class="priority-icon">${icon('check', 12)}</span><div class="list-row-main"><div class="list-row-title">提取模式栏和上下文栏</div><div class="list-row-meta">desktop.js · 2 分钟前</div></div></div><div class="list-row"><span class="priority-icon">${icon('check', 12)}</span><div class="list-row-main"><div class="list-row-title">接入 Ctrl+K 命令面板</div><div class="list-row-meta">desktop.js · 1 分钟前</div></div></div><div class="list-row"><span class="priority-icon">${icon('clock', 12)}</span><div class="list-row-main"><div class="list-row-title">验证检查器关闭与恢复</div><div class="list-row-meta">运行中 · 等待测试完成</div></div></div><div class="surface-card pad"><div class="section-head"><h3>测试</h3><span class="badge warn">2/4</span></div><div class="kv-list"><div class="kv-row"><span>类型检查</span><strong style="color:var(--success)">通过</strong></div><div class="kv-row"><span>命令面板</span><strong style="color:var(--success)">通过</strong></div><div class="kv-row"><span>键盘导航</span><strong>运行中</strong></div><div class="kv-row"><span>截图回归</span><strong>待执行</strong></div></div></div></div></div>
        </div>
      </div>
    `;
  }

  function renderOpsMain() {
    return `
      <div class="main-toolbar"><div><div class="main-title">生产环境</div><span class="main-subtitle">12 个服务 · 2 个告警 · 最近更新 09:48</span></div><span class="badge warn">2 个告警</span><span class="main-spacer"></span><button class="button">${icon('refresh', 14)} 刷新</button><button class="button primary">${icon('play', 14)} 创建发布</button></div>
      <div class="main-content ops-console-content">
        <div class="ops-kpi-strip"><div><span>可用性</span><strong>99.97%</strong><small>近 24 小时</small></div><div><span>P95 延迟</span><strong class="warn">428ms</strong><small>较昨日 +18%</small></div><div><span>活跃告警</span><strong class="danger">2</strong><small>1 个严重</small></div><div><span>发布窗口</span><strong>1</strong><small>等待安全审查</small></div></div>
        <div class="ops-console-grid">
          <section class="ops-service-board"><header><h3>服务矩阵</h3><span class="spacer"></span><span class="ops-live"><i></i>实时</span></header><div class="ops-service-row critical"><span class="ops-state">S1</span><div><strong>order-service</strong><small>3/3 实例 · P95 1.8s · 连接池 92%</small></div><span class="badge warn">降级</span></div><div class="ops-service-row"><span class="ops-state">S2</span><div><strong>sync-worker</strong><small>队列 1,284 · 自动扩容中</small></div><span class="badge warn">扩容</span></div><div class="ops-service-row"><span class="ops-state">S3</span><div><strong>web-gateway</strong><small>6/6 实例 · 错误率 0.02%</small></div><span class="badge accent">正常</span></div><div class="ops-service-row"><span class="ops-state">S4</span><div><strong>shop-api</strong><small>4/4 实例 · P95 220ms</small></div><span class="badge accent">正常</span></div></section>
          <section class="ops-incident-panel"><header><h3>当前事故</h3><span class="badge danger">2</span></header><div class="ops-incident-card"><div><strong>订单服务 P95 超过 2s</strong><span>已持续 8 分钟</span></div><p>影响结算链路，数据库连接池达到 92%。</p><button class="button soft">查看处置建议</button></div><div class="ops-incident-card"><div><strong>同步队列积压</strong><span>worker-03</span></div><p>自动扩容中，预计 6 分钟恢复。</p></div><div class="ops-log-stream" aria-label="实时日志"><div><time>09:48:12</time><span>worker-03 scaled to 6 replicas</span></div><div><time>09:47:40</time><span>order-service p95=1.82s</span></div><div><time>09:46:55</time><span>db pool usage reached 92%</span></div></div></section>
        </div>
        <div class="ops-release-strip"><span>${icon('package', 15)} shop-api v2.8.4 · 3 个提交 · 全部测试通过</span><span class="badge accent">可发布</span><span class="spacer"></span><button class="button">查看差异</button><button class="button primary">进入发布</button></div>
      </div>
    `;
  }

  function renderSecMain() {
    return `
      <div class="main-toolbar"><div><div class="main-title">安全态势</div><span class="main-subtitle">授权范围 50 个资产 · 最近扫描 09:42</span></div><span class="main-spacer"></span><button class="button">${icon('eye', 14)} 授权范围</button><button class="button primary">${icon('shield', 14)} 发起扫描</button></div>
      <div class="main-content sec-risk-content">
        <div class="sec-scope-strip"><span class="sec-score">72<small>风险分</small></span><div><span>授权资产</span><strong>50</strong></div><div><span>高危</span><strong class="danger">2</strong></div><div><span>基线扫描</span><strong>68%</strong></div><div><span>本周修复</span><strong class="success">11</strong></div><span class="spacer"></span><span class="badge danger">授权范围内</span></div>
        <div class="sec-workbench">
          <section class="sec-findings"><header><h3>风险队列</h3><span class="spacer"></span><button class="button">全部风险</button></header><div class="sec-finding critical"><span class="sec-severity">高</span><div><strong>网关允许 TLS 1.0</strong><p>web-gateway · 影响 3 个公开域名</p><small>CVSS 8.1 · 已确认</small></div><button class="button primary">修复单</button></div><div class="sec-finding critical"><span class="sec-severity">高</span><div><strong>对象存储公开读权限</strong><p>3 个文件可匿名访问</p><small>CVSS 7.8 · 待处理</small></div><button class="button">隔离</button></div><div class="sec-finding medium"><span class="sec-severity">中</span><div><strong>fast-xml-parser 版本过期</strong><p>兼容测试已完成</p><small>可灰度升级</small></div><button class="button">升级</button></div></section>
          <section class="sec-surface"><header><h3>攻击面</h3><span class="badge">生产资产</span></header><div class="sec-surface-grid"><div class="surface-node exposed"><strong>公开域名</strong><span>12</span><small>3 个需关注</small></div><div class="surface-node"><strong>应用服务</strong><span>18</span><small>2 个高风险</small></div><div class="surface-node"><strong>存储桶</strong><span>6</span><small>1 个公开</small></div><div class="surface-node"><strong>身份与权限</strong><span>14</span><small>本周正常</small></div></div><div class="sec-scan-line"><span>基线扫描</span><strong>34 / 50</strong><div class="progress"><i style="width:68%"></i></div><small>预计还需 6 分钟</small></div></section>
        </div>
        <div class="sec-audit-strip"><span>${icon('shield', 14)} 所有扫描与修复动作写入审计</span><span>今日人工操作 18</span><span>AI 变更单 4</span><span>已批准 3</span><span class="spacer"></span><button class="button">打开审计</button></div>
      </div>
    `;
  }

  function renderWorkflowMain() {
    return `
      <div class="main-toolbar"><div><div class="main-title">每日经营晨报</div><span class="main-subtitle">工作流 · 6 个节点 · 最近运行成功</span></div><span class="badge accent">已启用</span><span class="main-spacer"></span><button class="button">${icon('clock', 14)} 定时设置</button><button class="button primary">${icon('play', 14)} 运行</button></div>
      <div class="main-content workflow-content">
        <div class="workflow-canvas-shell">
          <header class="workflow-canvas-toolbar"><span class="badge accent">草稿已保存</span><span>画布缩放 92%</span><span class="spacer"></span><button class="button">${icon('plus', 13)} 添加节点</button></header>
          <div class="workflow-canvas-area">
            <i class="workflow-link link-a"></i><i class="workflow-link link-b"></i><i class="workflow-link link-c"></i>
            <div class="workflow-node trigger"><span class="node-icon">${icon('clock', 15)}</span><strong>每天 09:00</strong><small>定时触发</small></div>
            <div class="workflow-node data"><span class="node-icon">${icon('table', 15)}</span><strong>读取经营数据</strong><small>本地业务库</small></div>
            <div class="workflow-node transform"><span class="node-icon">${icon('chart', 15)}</span><strong>计算 KPI</strong><small>销售额 · 毛利 · 履约</small></div>
            <div class="workflow-node human"><span class="node-icon">${icon('user', 15)}</span><strong>人工复核</strong><small>异常才暂停</small></div>
            <div class="workflow-node output"><span class="node-icon">${icon('file', 15)}</span><strong>生成晨报</strong><small>文件 + 通知</small></div>
          </div>
        </div>
        <div class="workflow-run-dock"><header><h3>运行队列</h3><span class="badge accent">今天成功 3</span><span class="spacer"></span><button class="button">全部运行</button></header><div class="workflow-run-row"><span class="ops-state">09:00</span><div><strong>运行成功 · 18 秒</strong><small>生成 1 份晨报，6 / 6 节点完成</small></div><button class="button soft">查看产物</button></div><div class="workflow-run-row"><span class="ops-state">昨天</span><div><strong>部分失败</strong><small>通知节点超时，核心数据已生成</small></div><button class="button">重试失败节点</button></div></div>
      </div>
    `;
  }

  function renderAutomationMain() {
    return `
      <div class="main-toolbar"><div><div class="main-title">自动化</div><span class="main-subtitle">录制、固定脚本与运行记录</span></div><span class="badge accent">14 次成功</span><span class="main-spacer"></span><button class="button">${icon('plus', 14)} 新建自动化</button></div>
      <div class="main-content automation-content">
        <div class="automation-layout">
          <section class="automation-library"><header><h3>自动化脚本</h3><span class="spacer"></span><label class="search-field" style="width:180px;height:30px">${icon('search', 13)}<input placeholder="搜索脚本"></label></header><div class="automation-script-row selected"><span class="automation-status running"></span><div><strong>淘宝订单导出</strong><small>每 30 分钟 · 3 个固定步骤</small></div><span class="badge accent">运行中</span></div><div class="automation-script-row"><span class="automation-status"></span><div><strong>日报入库</strong><small>每天 18:30 · 读取 → 校验 → 归档</small></div><span class="badge accent">已启用</span></div><div class="automation-script-row"><span class="automation-status paused"></span><div><strong>竞品快照</strong><small>手动触发 · 上次检查：3 天前</small></div><span class="badge">已暂停</span></div><div class="automation-script-row"><span class="automation-status"></span><div><strong>售后消息归档</strong><small>复制含 #售后 的文本后触发</small></div><span class="badge accent">已启用</span></div></section>
          <section class="automation-runner"><header><h3>实时运行</h3><span class="badge accent">淘宝订单导出</span></header><div class="automation-run-meta"><span>开始 09:30:12</span><span>第 3 / 5 步</span><span>已导入 18 个订单</span></div><div class="automation-trace"><div class="done"><i>${icon('check', 11)}</i><span>检查平台登录状态</span><time>0.8s</time></div><div class="done"><i>${icon('check', 11)}</i><span>打开订单导出页</span><time>1.4s</time></div><div class="active"><i>${icon('refresh', 11)}</i><span>下载订单文件</span><time>进行中</time></div><div><i></i><span>校验字段与订单数量</span><time>等待</time></div><div><i></i><span>写入本地业务库</span><time>等待</time></div></div><div class="automation-run-actions"><button class="button">暂停</button><button class="button">查看浏览器</button><button class="button primary">查看运行记录</button></div></section>
        </div>
        <div class="automation-history"><header><h3>最近运行</h3><span class="spacer"></span><button class="button">全部记录</button></header><div class="stack-list"><div class="list-row"><span class="priority-icon">${icon('check', 12)}</span><div class="list-row-main"><div class="list-row-title">淘宝订单导出 · 成功</div><div class="list-row-meta">今天 09:30 · 导入 18 个订单</div></div><span class="badge accent">成功</span></div><div class="list-row"><span class="priority-icon">${icon('alert', 12)}</span><div class="list-row-main"><div class="list-row-title">竞品快照 · 需要复核</div><div class="list-row-meta">页面结构与录制时不同，已暂停下一步</div></div><button class="button soft">检查</button></div></div></div>
      </div>
    `;
  }

  function renderClipMain() {
    return `
      <div class="main-toolbar"><div><div class="main-title">品牌短视频 11 月</div><span class="main-subtitle">1920 × 1080 · 00:00:48:12</span></div><span class="badge accent">已自动保存</span><span class="main-spacer"></span><button class="button">${icon('play', 14)} 预览</button><button class="button primary">${icon('download', 14)} 导出成片</button></div>
      <div class="main-content clip-editor-content">
        <div class="clip-editor-shell">
          <section class="clip-preview-stage"><header><span>节目监看</span><span class="badge">1080P · 25fps</span><span class="spacer"></span><button class="button">${icon('monitor', 13)} 画布设置</button></header><div class="clip-preview-screen"><div class="clip-video-frame"><span>品牌短视频 · 冬季宠物窝</span>${icon('play', 34)}</div></div><div class="clip-transport"><button class="icon-btn">${icon('play', 15)}</button><button class="icon-btn">${icon('pause', 15)}</button><span>00:00:24:08 / 00:00:48:12</span><div class="progress"><i style="width:50%"></i></div><button class="chip active">1×</button></div></section>
          <section class="clip-timeline"><header><h3>时间线</h3><span class="spacer"></span><div class="filter-row"><button class="chip active">全部轨道</button><button class="chip">视频</button><button class="chip">字幕</button><button class="chip">音频</button></div></header><div class="clip-ruler"><span>00:00</span><span>00:12</span><span>00:24</span><span>00:36</span><span>00:48</span></div><div class="clip-track"><span class="clip-track-name">V2 主视频</span><div class="clip-track-lane video"><i style="left:2%;width:38%"></i><i style="left:42%;width:34%"></i><em style="left:49%"></em></div></div><div class="clip-track"><span class="clip-track-name">T1 字幕</span><div class="clip-track-lane subtitle"><i style="left:5%;width:21%"></i><i style="left:29%;width:26%"></i><i style="left:58%;width:18%"></i></div></div><div class="clip-track"><span class="clip-track-name">A1 音乐</span><div class="clip-track-lane audio"><i style="left:1%;width:94%"></i></div></div></section>
        </div>
      </div>
    `;
  }

  function renderLearningMain() {
    if (state.libraryOpen) return renderLibraryMain();
    const subject = currentSubject();
    return `
      <div class="main-toolbar"><div><div class="main-title">${subject.label}</div><span class="main-subtitle">${subject.meta}</span></div><span class="badge accent">进行中</span><span class="main-spacer"></span><label class="toolbar-select"><span>当前科目</span><select data-subject-select aria-label="切换学习科目">${learningSubjects.map((item) => `<option value="${item.key}" ${item.key === subject.key ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label><button class="button" data-action="open-library">${icon('book', 14)} 图书馆</button><button class="button learning-read-button">${icon('play', 14)} 朗读本页</button><button class="button primary" data-action="learning-immersive">${icon('book', 14)} 沉浸学习</button></div>
      <div class="main-content learning-desk-content">
        <div class="learning-desk">
          <section class="learning-current-pane"><div class="learning-course-meta"><span class="eyebrow">${subject.meta}</span><span class="badge accent">当前课程</span></div><h1>${subject.course}</h1><p>${subject.desc}</p><div class="learning-step-path"><div class="done"><i>${icon('check', 11)}</i><span>理解概念</span></div><div class="current"><i>2</i><span>阅读与例子</span></div><div><i>3</i><span>练习</span></div><div><i>4</i><span>闭卷自测</span></div></div><div class="learning-resume-bar"><div><strong>继续第 2 步</strong><small>约 18 分钟 · 已掌握 ${subject.mastery}</small></div><button class="button primary" data-action="learning-immersive">${icon('play', 14)} 进入沉浸学习</button></div></section>
          <aside class="learning-side-pane"><div class="learning-progress-ring"><strong>${subject.mastery}</strong><span>掌握度</span></div><div class="learning-goal-list"><div><span>${icon('book', 14)}</span><strong>完成当前课</strong><small>18 分钟</small></div><div><span>${icon('refresh', 14)}</span><strong>复习 12 个薄弱点</strong><small>9 分钟</small></div><div><span>${icon('check', 14)}</span><strong>连续学习 ${subject.streak}</strong><small>保持记录</small></div></div><div class="learning-note-card"><div class="ai-line">${icon('sparkles', 14)} 学霸笔记</div><p>${subject.desc}</p><button class="button">打开本章笔记</button></div></aside>
        </div>
        <div class="learning-module-strip"><header><h3>课程路线</h3><span>${subject.progress}</span><span class="spacer"></span><button class="button">全部课程</button></header><div class="learning-module-track"><button class="active"><span>01</span><strong>${subject.course}</strong><small>进行中</small></button><button><span>02</span><strong>核心概念与判断框架</strong><small>下一课</small></button><button><span>03</span><strong>案例推演与实践</strong><small>待开始</small></button><button><span>04</span><strong>闭卷复习与自测</strong><small>待开始</small></button></div></div>
      </div>
    `;
  }

  function renderLibraryMain() {
    const tabs = [['discover', '发现'], ['shelf', '书架'], ['sources', '书源']];
    let body = '';
    if (state.libraryTab === 'shelf') {
      body = `<div class="surface-card pad"><div class="section-head"><h3>继续阅读</h3><span class="badge accent">3</span></div><div class="stack-list">${libraryBooks.slice(0, 3).map((book, index) => `<button class="list-row" data-library-book="${index}"><span class="product-thumb">${book.title.replace(/[《》]/g, '').slice(0, 1)}</span><div class="list-row-main"><div class="list-row-title">${book.title}</div><div class="list-row-meta">${book.progress} · ${book.author}</div></div><span class="badge ${book.tone}">${book.source}</span></button>`).join('')}</div></div><div class="surface-card pad"><div class="section-head"><h3>我的书架</h3><span class="badge">8</span></div><div class="stack-list">${libraryBooks.map((book, index) => `<button class="list-row" data-library-book="${index}"><span class="priority-icon">${icon('book', 13)}</span><div class="list-row-main"><div class="list-row-title">${book.title}</div><div class="list-row-meta">${book.category} · ${book.license}</div></div>${icon('right', 13)}</button>`).join('')}</div></div>`;
    } else if (state.libraryTab === 'sources') {
      body = `<div class="surface-card pad"><div class="section-head"><h3>内置书源</h3><span class="badge accent">4</span></div><div class="stack-list">${[['公共领域馆藏', '经典名著 · 志怪小说 · 漫画档案', '可用'], ['官方授权平台', '网络小说跳转官方入口', '可用'], ['课程原典', '与学习科目和课程进度联动', '可用'], ['馆藏借阅', '限有借阅权限的书目', '需授权']].map(([title, meta, badge]) => `<div class="list-row"><span class="priority-icon">${icon('external', 13)}</span><div class="list-row-main"><div class="list-row-title">${title}</div><div class="list-row-meta">${meta}</div></div><span class="badge ${badge === '可用' ? 'accent' : 'warn'}">${badge}</span></div>`).join('')}</div></div><div class="surface-card pad"><div class="section-head"><h3>自定义书源</h3><span class="spacer"></span><button class="button" data-action="add-library-source">添加书源</button></div><div class="state-banner info">${icon('shield', 15)} 自定义书源只接受完整 HTTPS 地址，并保留逐条许可说明。</div></div>`;
    } else {
      body = `<div class="surface-card pad"><div class="section-head"><h3>发现好书</h3><span class="spacer"></span><label class="search-field" style="width:280px;height:32px">${icon('search', 13)}<input placeholder="搜索书名、作者、ISBN 或课程原典"></label></div><div class="filter-row"><button class="chip active">全部</button><button class="chip">经典名著</button><button class="chip">志怪小说</button><button class="chip">网络小说</button><button class="chip">漫画</button><button class="chip">课程原典</button></div><div class="stack-list">${libraryBooks.map((book, index) => `<button class="list-row" data-library-book="${index}"><span class="product-thumb">${book.title.replace(/[《》]/g, '').slice(0, 1)}</span><div class="list-row-main"><div class="list-row-title">${book.title}</div><div class="list-row-meta">${book.category} · ${book.author} · ${book.license}</div></div><span class="badge ${book.tone}">${book.progress}</span>${icon('right', 13)}</button>`).join('')}</div></div>`;
    }
    return `
      <div class="main-toolbar"><div><div class="main-title">图书馆</div><span class="main-subtitle">发现、书架与书源</span></div><span class="main-spacer"></span><button class="button" data-action="close-library">${icon('left', 14)} 返回 ${currentSubject().label}</button></div>
      <div class="main-tabs">${tabs.map(([key, label]) => `<button class="main-tab ${state.libraryTab === key ? 'active' : ''}" data-library-tab="${key}">${label}</button>`).join('')}</div>
      <div class="main-content"><div class="page-stack">${body}</div></div>
    `;
  }

  function renderAiPicker() {
    if (!state.aiPicker) return '';
    const titles = {
      agent: '选择智能体',
      skills: '挂载 Skill',
      model: '选择模型',
      permission: '工具权限',
      plus: '添加内容与工具',
    };
    let body = '';
    if (state.aiPicker === 'agent') {
      body = aiAgents.map(([name, desc]) => `<button class="ai-picker-item ${state.aiAgent === name ? 'active' : ''}" data-ai-agent="${name}"><span class="ai-picker-icon">${icon('bot', 17)}</span><span><strong>${name}</strong><small>${desc}</small></span>${state.aiAgent === name ? icon('check', 15) : ''}</button>`).join('');
    } else if (state.aiPicker === 'skills') {
      body = aiSkills.map(([name, desc]) => `<button class="ai-picker-item ${state.aiSkills.includes(name) ? 'active' : ''}" data-ai-skill="${name}"><span class="ai-picker-check">${state.aiSkills.includes(name) ? icon('check', 12) : ''}</span><span><strong>${name}</strong><small>${desc}</small></span></button>`).join('');
    } else if (state.aiPicker === 'model') {
      body = aiModels.map(([name, desc]) => `<button class="ai-picker-item ${state.aiModel === name ? 'active' : ''}" data-ai-model="${name}"><span class="ai-picker-icon">${icon('sparkles', 17)}</span><span><strong>${name}</strong><small>${desc}</small></span>${state.aiModel === name ? icon('check', 15) : ''}</button>`).join('');
    } else if (state.aiPicker === 'permission') {
      body = ['只读', '读写', '完全执行'].map((name) => `<button class="ai-picker-item ${state.aiPermission === name ? 'active' : ''}" data-ai-permission="${name}"><span class="ai-picker-icon">${icon('shield', 17)}</span><span><strong>${name}</strong><small>${name === '只读' ? '只读取数据，不执行写入' : name === '读写' ? '允许修改并要求高风险确认' : '允许连续执行，关键操作仍需批准'}</small></span>${state.aiPermission === name ? icon('check', 15) : ''}</button>`).join('');
    } else {
      body = `
        <div class="ai-plus-grid">
          <button data-ai-plus="文件"><span>${icon('paperclip', 18)}</span><strong>文件</strong><small>添加本地文件或文件夹</small></button>
          <button data-ai-plus="图片"><span>${icon('image', 18)}</span><strong>图片</strong><small>截图、图片或视觉输入</small></button>
          <button data-ai-plus="浏览器"><span>${icon('monitor', 18)}</span><strong>浏览器页面</strong><small>引用当前打开页面</small></button>
          <button data-ai-plus="剪贴板"><span>${icon('clipboard', 18)}</span><strong>剪贴板</strong><small>引用最近复制的 3 条内容</small></button>
          <button data-ai-plus="记忆"><span>${icon('layers', 18)}</span><strong>记忆</strong><small>附加项目约定或偏好</small></button>
          <button data-ai-plus="工作流"><span>${icon('flow', 18)}</span><strong>工作流</strong><small>把当前任务变成可复用流程</small></button>
        </div>
      `;
    }
    return `
      <div class="ai-picker-popover" role="dialog" aria-label="${titles[state.aiPicker]}">
        <header><strong>${titles[state.aiPicker]}</strong><button class="icon-btn" data-action="close-ai-picker" aria-label="关闭">${icon('x', 15)}</button></header>
        <div class="ai-picker-body">${body}</div>
      </div>
    `;
  }

  function renderDevAiCodeDock() {
    return `
      <aside class="dev-ai-code-dock" aria-label="代码编辑与 Git 状态">
        <header class="dev-ai-code-head">
          <div class="dev-ai-file-tabs">
            <button class="active">${icon('file', 12)} CodeWorkbench.vue <span class="dev-editor-dot"></span></button>
            <button>${icon('file', 12)} desktop.js</button>
          </div>
          <span class="main-spacer"></span>
          <button class="dev-editor-tool" data-action="open-git-panel" title="打开 Git 插件">${icon('code', 13)} Git <span class="badge warn">3</span></button>
          <button class="icon-btn" data-action="open-git-panel" title="更多 Git 操作">${icon('more', 14)}</button>
        </header>
        <div class="dev-ai-branch"><span>packages / ui / src / views / CodeWorkbench.vue</span><span class="spacer"></span><span>Vue</span><span>UTF-8</span></div>
        <div class="dev-ai-code-lines">
          <div><span>1</span><code><i>&lt;script setup lang="ts"&gt;</i></code></div>
          <div><span>2</span><code><b>import</b> { computed, ref } <b>from</b> <em>'vue'</em></code></div>
          <div><span>3</span><code><b>import</b> CodeSidebar <b>from</b> <em>'./code/CodeSidebar.vue'</em></code></div>
          <div><span>4</span><code><b>import</b> CodeEditorArea <b>from</b> <em>'./code/CodeEditorArea.vue'</em></code></div>
          <div><span>5</span><code></code></div>
          <div><span>6</span><code><b>const</b> code = useCodeStore()</code></div>
          <div><span>7</span><code><b>const</b> chat = useChatStore()</code></div>
          <div><span>8</span><code><b>const</b> editorOpen = ref(<b>true</b>)</code></div>
          <div><span>9</span><code><b>const</b> sideCollapsed = ref(<b>false</b>)</code></div>
          <div><span>10</span><code></code></div>
          <div><span>11</span><code><b>const</b> currentSpaceConvs = computed(() =&gt;</code></div>
          <div><span>12</span><code>  chat.conversations.filter((item) =&gt; item.spaceId === code.spaceId)</code></div>
          <div><span>13</span><code>)</code></div>
          <div><span>14</span><code></code></div>
          <div class="add"><span>15</span><code><b>function</b> selectTask(id: <em>string</em>) {</code></div>
          <div class="add"><span>16</span><code>  chat.selectConversation(id)</code></div>
          <div class="add"><span>17</span><code>  editorOpen.value = <b>true</b></code></div>
          <div class="add"><span>18</span><code>}</code></div>
          <div><span>19</span><code></code></div>
          <div><span>20</span><code><i>&lt;/script&gt;</i></code></div>
          <div><span>21</span><code></code></div>
          <div><span>22</span><code><i>&lt;template&gt;</i></code></div>
          <div><span>23</span><code>  &lt;div class=<em>"code-page"</em> :class=<em>"lead"</em>&gt;</code></div>
          <div><span>24</span><code>    &lt;CodeSidebar v-show=<em>"!sideCollapsed"</em> /&gt;</code></div>
          <div><span>25</span><code>  &lt;/div&gt;</code></div>
          <div><span>26</span><code><i>&lt;/template&gt;</i></code></div>
        </div>
        <footer class="dev-ai-test-strip"><span>${icon('code', 12)} dev0.1-mobile</span><span>${icon('check', 12)} 类型检查通过</span><span>${icon('alert', 12)} 1 个提示</span><span class="spacer"></span><button class="button" data-action="open-git-panel">查看 Git 变更</button></footer>
      </aside>
    `;
  }

  function renderAiChatMain() {
    const messages = state.aiMessages.map((message) => message.role === 'user'
      ? `<article class="ai-message user"><div class="ai-message-bubble">${escapeHtml(message.content)}</div><div class="ai-message-meta">${message.meta}</div></article>`
      : `<article class="ai-message assistant"><div class="ai-message-head"><span class="ai-avatar">AI</span><strong>${message.agent || state.aiAgent}</strong><span class="badge accent">${message.model || state.aiModel}</span><span class="spacer"></span><span class="ai-message-meta">${message.meta}</span></div><div class="ai-message-body">${escapeHtml(message.content)}</div><div class="ai-message-actions"><button data-action="copy-ai-message">${icon('copy', 13)} 复制</button><button data-action="retry-ai-message">${icon('refresh', 13)} 重试</button><button data-action="convert-ai-task">${icon('layers', 13)} 转为任务</button></div></article>`).join('');
    const devDock = state.mode === 'dev' ? renderDevAiCodeDock() : '';
    return `
      <div class="main-toolbar ${state.mode === 'dev' ? 'dev-ai-toolbar' : ''}"><div><div class="main-title">${state.aiAgent}</div><span class="main-subtitle">${state.aiModel} · ${state.aiSkills.length} 个 Skill · ${state.aiPermission}权限</span></div><span class="badge accent">对话中</span><span class="main-spacer"></span><button class="button ai-toolbar-action" data-action="new-ai-chat" title="新建对话">${icon('plus', 14)}<span>新建对话</span></button><button class="button ai-toolbar-action" data-menu="command" title="命令面板">${icon('command', 14)}<span>命令面板</span></button><button class="button ai-toolbar-action" data-action="settings" title="设置">${icon('settings', 14)}<span>设置</span></button></div>
      <div class="main-content ai-chat-content ${state.mode === 'dev' ? 'dev-ai-chat-content' : ''}">
        ${devDock}
        <div class="ai-chat-shell">
          <div class="ai-chat-thread" aria-live="polite">${messages}</div>
          <div class="ai-composer-wrap">
            ${renderAiPicker()}
            <form class="ai-composer" data-ai-form>
              <div class="ai-composer-selectors">
                <button type="button" class="ai-select-pill" data-ai-picker="agent" aria-expanded="${state.aiPicker === 'agent'}">${icon('bot', 14)}<span>${state.aiAgent}</span>${icon('down', 12)}</button>
                <button type="button" class="ai-select-pill" data-ai-picker="skills" aria-expanded="${state.aiPicker === 'skills'}">${icon('sparkles', 14)}<span>${state.aiSkills.length} 个 Skill</span>${icon('down', 12)}</button>
                <button type="button" class="ai-select-pill" data-ai-picker="model" aria-expanded="${state.aiPicker === 'model'}">${icon('layers', 14)}<span>${state.aiModel}</span>${icon('down', 12)}</button>
                <button type="button" class="ai-select-pill" data-ai-picker="permission" aria-expanded="${state.aiPicker === 'permission'}">${icon('shield', 14)}<span>${state.aiPermission}</span>${icon('down', 12)}</button>
              </div>
              <textarea data-ai-input rows="2" aria-label="发送给智能体的消息" placeholder="给 ${state.aiAgent} 发送消息，Enter 发送，Shift + Enter 换行"></textarea>
              <div class="ai-composer-footer">
                <button type="button" class="ai-tool-button" data-ai-picker="plus" aria-expanded="${state.aiPicker === 'plus'}" title="添加内容与工具">${icon('plus', 17)}</button>
                <button type="button" class="ai-tool-button" title="添加文件">${icon('paperclip', 17)}</button>
                <button type="button" class="ai-tool-button" title="语音输入">${icon('microphone', 17)}</button>
                <span class="ai-composer-hint">${state.aiPermission === '只读' ? '仅读取本地与已授权数据' : '写入和外部操作会请求确认'}</span>
                <button class="ai-send-button" type="submit" aria-label="发送消息">${icon('send', 17)}<span>发送</span></button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
  }

  function renderAiMemoryPage() {
    return `
      <div class="main-toolbar"><div><div class="main-title">记忆</div><span class="main-subtitle">用户偏好、项目约定与任务经验</span></div><span class="main-spacer"></span><button class="button" data-assistant-page="command">${icon('left', 14)} 返回对话</button><button class="button" data-action="settings">${icon('settings', 14)} 记忆设置</button><button class="button primary">${icon('plus', 14)} 新建记忆</button></div>
      <div class="main-content"><div class="page-stack"><div class="filter-row"><button class="chip active">全部 28</button><button class="chip">用户偏好 8</button><button class="chip">项目 12</button><button class="chip">任务 8</button></div><div class="surface-card pad"><div class="stack-list"><div class="list-row"><span class="priority-icon">${icon('user', 13)}</span><div class="list-row-main"><div class="list-row-title">偏好使用中文输出运营摘要，金额保留两位小数</div><div class="list-row-meta">用户偏好 · 2026-11-10 · 本地</div></div><button class="icon-btn">${icon('more', 14)}</button></div><div class="list-row"><span class="priority-icon">${icon('folder', 13)}</span><div class="list-row-main"><div class="list-row-title">家居出海：不承诺收益，不搬运竞品文案</div><div class="list-row-meta">项目记忆 · 2026-11-12 · 同步</div></div><button class="icon-btn">${icon('more', 14)}</button></div><div class="list-row"><span class="priority-icon">${icon('bot', 13)}</span><div class="list-row-main"><div class="list-row-title">批量发货前必须先检查超时和地址异常</div><div class="list-row-meta">任务经验 · 2026-11-16 · 已复用 6 次</div></div><button class="icon-btn">${icon('more', 14)}</button></div></div></div></div></div>
    `;
  }

  function renderAssistantMain() {
    if (state.assistantPage === 'clipboard') return renderClipboardInline();
    if (state.assistantPage === 'pet') return renderPetInline();
    if (state.assistantPage === 'memory') return renderAiMemoryPage();
    return renderAiChatMain();
  }

  function renderClipboardInline() {
    return `
      <div class="main-toolbar"><div><div class="main-title">超级剪贴板</div><span class="main-subtitle">管理态 · 500 条 · 本地存储</span></div><span class="main-spacer"></span><button class="button" data-assistant-page="command">${icon('left', 14)} 返回对话</button><button class="button" data-menu="clipboard">${icon('clipboard', 14)} 快贴窗</button></div>
      <div class="main-content narrow" style="padding:0">${clipboardMarkup(true)}</div>
    `;
  }

  function renderPetInline() {
    return `
      <div class="main-toolbar"><div><div class="main-title">宠物</div><span class="main-subtitle">Boba · 2D 精灵图 · 跟随任务</span></div><span class="main-spacer"></span><button class="button" data-assistant-page="command">${icon('left', 14)} 返回对话</button><button class="button" data-menu="pet-radial">${icon('paw', 14)} 打开半圆菜单</button><button class="button primary" data-menu="pet-panel">${icon('layers', 14)} 任务面板</button></div>
      <div class="main-content">
        <div class="two-column"><div class="surface-card pad"><div class="section-head"><h3>状态与行为</h3></div><div style="display:flex;align-items:center;gap:18px;padding:12px 0"><div class="pet-character" style="position:relative;right:auto;bottom:auto;width:120px;height:132px"><div class="pet-sprite" style="width:96px;height:104px"></div><span class="pet-nameplate">Boba · 等待你</span></div><div class="kv-list" style="flex:1"><div class="kv-row"><span>当前状态</span><strong>需要你输入</strong></div><div class="kv-row"><span>跟随任务</span><strong>竞品价格监测</strong></div><div class="kv-row"><span>通知</span><strong>只保留需要输入</strong></div><div class="kv-row"><span>动作</span><strong>减少动态</strong></div></div></div></div><div class="surface-card pad"><div class="section-head"><h3>它记得的事</h3></div><div class="kv-list"><div class="kv-row"><span>工作时段</span><strong>09:00–19:00</strong></div><div class="kv-row"><span>偏好</span><strong>不要遮住输入框</strong></div><div class="kv-row"><span>常用动作</span><strong>张望、跳一跳</strong></div><div class="kv-row"><span>记忆开关</span><strong>开启</strong></div></div></div></div>
      </div>
    `;
  }

  function renderMain() {
    if (currentLead() === 'ai') return renderAssistantMain();
    if (state.mode === 'office') return renderWorkMain();
    if (state.mode === 'shop') return renderShopMain();
    if (state.mode === 'dev') return renderCodeMain();
    if (state.mode === 'ops') return renderOpsMain();
    if (state.mode === 'sec') return renderSecMain();
    if (state.mode === 'wf') return renderWorkflowMain();
    if (state.mode === 'rpa') return renderAutomationMain();
    if (state.mode === 'clip') return renderClipMain();
    return renderLearningMain();
  }

  function renderInspector() {
    if (!state.inspectorOpen) return '';
    if (currentLead() === 'ai') {
      if (state.mode === 'dev') {
        return `<aside class="inspector"><div class="inspector-head"><span class="inspector-title">开发检查器</span><button class="icon-btn" data-action="toggle-inspector">${icon('right', 14)}</button></div><div class="inspector-body page-stack"><div class="section-head"><h3>Git</h3><span class="badge warn">3 个变更</span></div><div class="kv-list"><div class="kv-row"><span>分支</span><strong>dev0.1-mobile</strong></div><div class="kv-row"><span>领先远端</span><strong>2</strong></div><div class="kv-row"><span>暂存</span><strong>1 个文件</strong></div><div class="kv-row"><span>未暂存</span><strong>2 个文件</strong></div></div><button class="button" style="width:100%" data-action="open-git-panel">${icon('code', 14)} 打开 Git 插件</button><div class="section-head"><h3>测试</h3><span class="badge accent">2 / 4</span></div><div class="kv-list"><div class="kv-row"><span>类型检查</span><strong style="color:var(--success)">通过</strong></div><div class="kv-row"><span>命令面板</span><strong style="color:var(--success)">通过</strong></div><div class="kv-row"><span>键盘导航</span><strong>运行中</strong></div></div><div class="ai-card"><div class="ai-card-head">${icon('sparkles', 14)} AI 建议</div><p style="margin:7px 0 0;font-size:11.5px;line-height:1.65">先修复键盘焦点路径，再提交当前变更；Git 提交仍由你确认。</p></div></div></aside>`;
      }
      return `<aside class="inspector"><div class="inspector-head"><span class="inspector-title">AI 运行状态</span><button class="icon-btn" data-action="toggle-inspector">${icon('right', 14)}</button></div><div class="inspector-body page-stack"><div class="kv-list"><div class="kv-row"><span>当前模式</span><strong>${modeMeta().label}</strong></div><div class="kv-row"><span>智能体</span><strong>${state.aiAgent}</strong></div><div class="kv-row"><span>模型</span><strong>${state.aiModel}</strong></div><div class="kv-row"><span>工具权限</span><strong>${state.aiPermission}</strong></div></div><div class="ai-card"><div class="ai-card-head">${icon('sparkles', 14)} 当前建议</div><p style="margin:7px 0 0;font-size:11.5px;line-height:1.65">AI 会继承「${modeMeta().label}」模式的上下文和授权边界；需要写入、发布或外部操作时先生成变更单。</p></div><button class="button" style="width:100%" data-action="settings" data-settings-target="permissions">${icon('shield', 14)} 调整权限</button></div></aside>`;
    }
    if (state.mode === 'shop') return `<aside class="inspector">${renderShopInspector()}</aside>`;
    if (state.mode === 'office') {
      return `<aside class="inspector"><div class="inspector-head"><span class="inspector-title">任务检查器</span><button class="icon-btn" data-action="toggle-inspector">${icon('right', 14)}</button></div><div class="inspector-body page-stack"><div class="section-head"><h3>竞品价格监测</h3><span class="badge accent">运行中</span></div><div class="kv-list"><div class="kv-row"><span>智能体</span><strong>运营助手</strong></div><div class="kv-row"><span>工具</span><strong>浏览器 · 数据查询</strong></div><div class="kv-row"><span>已运行</span><strong>08:42</strong></div><div class="kv-row"><span>当前步骤</span><strong>读取第 3 个竞品</strong></div></div><div class="timeline" style="margin-top:12px"><div class="timeline-row"><span class="timeline-dot done">${icon('check', 10)}</span><div><div class="timeline-title">打开竞品列表</div><div class="timeline-meta">读取 24 个商品</div></div><span class="timeline-time">09:35</span></div><div class="timeline-row"><span class="timeline-dot done">${icon('check', 10)}</span><div><div class="timeline-title">抓取价格</div><div class="timeline-meta">已保存 2 个页面</div></div><span class="timeline-time">09:38</span></div><div class="timeline-row"><span class="timeline-dot">${icon('clock', 10)}</span><div><div class="timeline-title">对比同款</div><div class="timeline-meta">等待页面加载</div></div><span class="timeline-time">现在</span></div></div><button class="button primary" style="width:100%">${icon('eye', 14)} 查看执行现场</button></div></aside>`;
    }
    if (state.mode === 'dev') {
      return `<aside class="inspector"><div class="inspector-head"><span class="inspector-title">变更检查器</span><button class="icon-btn" data-action="toggle-inspector">${icon('right', 14)}</button></div><div class="inspector-body page-stack"><div class="kv-list"><div class="kv-row"><span>分支</span><strong>dev0.1-mobile</strong></div><div class="kv-row"><span>修改</span><strong>3 个文件</strong></div><div class="kv-row"><span>新增</span><strong>+124</strong></div><div class="kv-row"><span>删除</span><strong>-38</strong></div></div><div class="state-banner info">${icon('shield', 15)} 发现 1 个未覆盖的键盘焦点路径。</div><button class="button primary" style="width:100%">${icon('check', 14)} 运行完整检查</button></div></aside>`;
    }
    if (state.mode === 'learning') {
      if (state.libraryOpen) {
        const book = libraryBooks[state.selectedBook] || libraryBooks[0];
        return `<aside class="inspector"><div class="inspector-head"><span class="inspector-title">书籍详情</span><button class="icon-btn" data-action="toggle-inspector">${icon('right', 14)}</button></div><div class="inspector-body page-stack"><div style="display:flex;gap:12px;align-items:flex-start"><span class="product-thumb" style="width:64px;height:86px;font-size:20px">${book.title.replace(/[《》]/g, '').slice(0, 1)}</span><div><div class="badge ${book.tone}">${book.source}</div><h3 style="margin:8px 0 3px;font-size:15px">${book.title}</h3><div style="color:var(--muted);font-size:10.5px">${book.category} · ${book.author}</div></div></div><div class="kv-list"><div class="kv-row"><span>许可</span><strong>${book.license}</strong></div><div class="kv-row"><span>阅读进度</span><strong>${book.progress}</strong></div><div class="kv-row"><span>访问方式</span><strong>${book.source === '外部阅读' ? '官方平台' : '应用内阅读'}</strong></div></div><div class="state-banner info">${icon('shield', 15)} ${book.source === '外部阅读' ? '保留官方登录、付费和地区限制，不在应用内复制正文。' : '来源与许可在书架中保持可追溯。'}</div><button class="button primary" style="width:100%">${icon('book', 14)} ${book.source === '外部阅读' ? '打开官方入口' : '继续阅读'}</button></div></aside>`;
      }
      const subject = currentSubject();
      return `<aside class="inspector"><div class="inspector-head"><span class="inspector-title">课程检查器</span><button class="icon-btn" data-action="toggle-inspector">${icon('right', 14)}</button></div><div class="inspector-body page-stack"><div class="section-head"><h3>${subject.label}</h3><span class="badge accent">${subject.mastery}</span></div><div class="kv-list"><div class="kv-row"><span>当前课程</span><strong>${subject.course}</strong></div><div class="kv-row"><span>进度</span><strong>${subject.progress}</strong></div><div class="kv-row"><span>连续学习</span><strong>${subject.streak}</strong></div><div class="kv-row"><span>待复习</span><strong>12 个</strong></div></div><div class="ai-card"><div class="ai-card-head">${icon('sparkles', 14)} 学习建议</div><p style="margin:7px 0 0;font-size:11.5px;line-height:1.65">先完成当前步骤的自测，再进入复习。错误集中的概念会自动加入下一次训练。</p></div><button class="button" style="width:100%" data-action="open-library">${icon('book', 14)} 打开图书馆</button><button class="button primary" style="width:100%" data-action="learning-immersive">${icon('play', 14)} 继续学习</button></div></aside>`;
    }
    if (state.mode === 'ops') {
      return `<aside class="inspector"><div class="inspector-head"><span class="inspector-title">资源检查器</span><button class="icon-btn" data-action="toggle-inspector">${icon('right', 14)}</button></div><div class="inspector-body page-stack"><div class="section-head"><h3>order-service</h3><span class="badge warn">降级</span></div><div class="kv-list"><div class="kv-row"><span>实例</span><strong>3 / 3 健康</strong></div><div class="kv-row"><span>P95</span><strong>1.8s</strong></div><div class="kv-row"><span>连接池</span><strong style="color:var(--danger)">92%</strong></div><div class="kv-row"><span>最近发布</span><strong>v2.8.3</strong></div></div><div class="state-banner info">${icon('alert', 15)} 延迟与数据库连接池高度相关，先扩容连接池，再回放慢查询样本。</div><button class="button primary" style="width:100%">${icon('play', 14)} 创建修复任务</button></div></aside>`;
    }
    if (state.mode === 'sec') {
      return `<aside class="inspector"><div class="inspector-head"><span class="inspector-title">风险检查器</span><button class="icon-btn" data-action="toggle-inspector">${icon('right', 14)}</button></div><div class="inspector-body page-stack"><div><span class="badge danger">高风险</span><h3 style="margin:8px 0 3px;font-size:15px">网关 TLS 配置弱</h3><div style="color:var(--muted);font-size:10.5px">web-gateway · 影响 3 个公开域名</div></div><div class="kv-list"><div class="kv-row"><span>证据</span><strong>TLS 1.0 已启用</strong></div><div class="kv-row"><span>CVSS</span><strong>8.1</strong></div><div class="kv-row"><span>授权范围</span><strong>生产资产</strong></div></div><div class="ai-change"><div class="ai-change-title">建议变更单</div><p style="margin:6px 0 0;color:var(--muted);font-size:10.5px">禁用 TLS 1.0，保留 TLS 1.2/1.3，并回放网关配置检查。</p><button class="button primary" style="width:100%;margin-top:10px">${icon('shield', 14)} 生成修复单</button></div></div></aside>`;
    }
    if (state.mode === 'wf') {
      return `<aside class="inspector"><div class="inspector-head"><span class="inspector-title">运行检查器</span><button class="icon-btn" data-action="toggle-inspector">${icon('right', 14)}</button></div><div class="inspector-body page-stack"><div class="section-head"><h3>今天 09:00</h3><span class="badge accent">成功</span></div><div class="kv-list"><div class="kv-row"><span>运行耗时</span><strong>18 秒</strong></div><div class="kv-row"><span>节点</span><strong>6 / 6</strong></div><div class="kv-row"><span>产物</span><strong>1 份晨报</strong></div><div class="kv-row"><span>触发</span><strong>定时</strong></div></div><div class="timeline"><div class="timeline-row"><span class="timeline-dot done">${icon('check', 10)}</span><div><div class="timeline-title">读取数据</div><div class="timeline-meta">近 24 小时</div></div><span class="timeline-time">4s</span></div><div class="timeline-row"><span class="timeline-dot done">${icon('check', 10)}</span><div><div class="timeline-title">生成摘要</div><div class="timeline-meta">8 个经营指标</div></div><span class="timeline-time">11s</span></div><div class="timeline-row"><span class="timeline-dot done">${icon('check', 10)}</span><div><div class="timeline-title">发送通知</div><div class="timeline-meta">本机通知</div></div><span class="timeline-time">3s</span></div></div></div></aside>`;
    }
    if (state.mode === 'rpa') {
      return `<aside class="inspector"><div class="inspector-head"><span class="inspector-title">自动化检查器</span><button class="icon-btn" data-action="toggle-inspector">${icon('right', 14)}</button></div><div class="inspector-body page-stack"><div class="section-head"><h3>淘宝订单导出</h3><span class="badge accent">运行中</span></div><div class="kv-list"><div class="kv-row"><span>步骤</span><strong>3 / 5</strong></div><div class="kv-row"><span>本次导入</span><strong>18 个订单</strong></div><div class="kv-row"><span>失败重试</span><strong>0</strong></div></div><div class="state-banner info">${icon('shield', 15)} 登录状态通过平台授权维护，脚本只操作已授权页面。</div><button class="button primary" style="width:100%">${icon('eye', 14)} 查看运行记录</button></div></aside>`;
    }
    if (state.mode === 'clip') {
      return `<aside class="inspector"><div class="inspector-head"><span class="inspector-title">片段检查器</span><button class="icon-btn" data-action="toggle-inspector">${icon('right', 14)}</button></div><div class="inspector-body page-stack"><div class="section-head"><h3>主视频片段 03</h3><span class="badge accent">已选中</span></div><div class="kv-list"><div class="kv-row"><span>时长</span><strong>00:00:08:12</strong></div><div class="kv-row"><span>分辨率</span><strong>1920 × 1080</strong></div><div class="kv-row"><span>音量</span><strong>-6 dB</strong></div><div class="kv-row"><span>转场</span><strong>淡入淡出</strong></div></div><div class="surface-card pad"><div class="section-head"><h3>字幕</h3></div><p style="margin:0;color:var(--muted);font-size:11px;line-height:1.6">冬季也要给宠物一个温暖、可拆洗的休息空间。</p></div><button class="button" style="width:100%">${icon('sparkles', 14)} 生成字幕建议</button></div></aside>`;
    }
    return `<aside class="inspector"><div class="inspector-head"><span class="inspector-title">${modeMeta().label}检查器</span><button class="icon-btn" data-action="toggle-inspector">${icon('right', 14)}</button></div><div class="inspector-body page-stack"><div class="ai-card"><div class="ai-card-head">${icon('sparkles', 14)} 当前上下文</div><p style="margin:7px 0 0;font-size:11.5px;line-height:1.65">${modeMeta().sub}</p></div></div></aside>`;
  }

  function renderStatusbar() {
    const projectLabel = state.mode === 'shop'
      ? '家居出海'
      : state.mode === 'dev'
        ? 'ai-assistant'
        : state.mode === 'ops'
          ? '生产环境'
          : state.mode === 'sec'
            ? '生产资产'
            : state.mode === 'learning'
              ? state.libraryOpen ? '图书馆' : currentSubject().label
              : state.mode === 'clip' ? '品牌短视频 11 月' : '本机工作台';
    return `
      <footer class="statusbar">
        <span class="status-item"><i class="status-dot"></i><strong>${modeMeta().label}</strong></span>
        <span class="status-item">工作方式 <strong>${currentLead() === 'ai' ? 'AI' : '人工'}</strong></span>
        <span class="status-item">当前 <strong>${projectLabel}</strong></span>
        <span class="status-item">${icon('bot', 12)} agnes 3.0 Flash</span>
        <span class="status-spacer"></span>
        <span class="status-item">${icon('refresh', 11)} 同步正常</span>
        <span class="status-item">${icon('clock', 11)} 09:48</span>
      </footer>
    `;
  }

  function renderModePopover() {
    return `
      <div class="popover mode-pop" role="menu" aria-label="切换工作模式">
        <div class="menu-group-label">切换工作模式</div>
        ${modes.map((mode) => `<button class="mode-option ${state.mode === mode.key ? 'active' : ''}" data-mode="${mode.key}" role="menuitemradio" aria-checked="${state.mode === mode.key}"><span class="mode-option-icon">${icon(mode.icon, 16)}</span><span><span class="mode-option-title">${mode.label}</span><span class="mode-option-sub">${mode.sub}</span></span>${state.mode === mode.key ? icon('check', 14) : ''}</button>`).join('')}
        <div class="menu-separator"></div>
        <button class="menu-item" role="menuitem" data-action="settings">${icon('settings', 14)} 管理模式与授权</button>
      </div>
    `;
  }

  function renderNotifications() {
    return `
      <div class="popover notification-pop">
        <div class="section-head" style="padding:4px 6px 7px"><h3>通知</h3><span class="spacer"></span><button class="button soft">全部已读</button></div>
        <div class="notification-item"><span class="notice-icon">${icon('alert', 13)}</span><div><div class="notification-title">18 单待发货，其中 4 单即将超时</div><div class="notification-meta">店铺运营 · 2 分钟前</div></div><span class="badge warn">待办</span></div>
        <div class="notification-item"><span class="notice-icon">${icon('sparkles', 13)}</span><div><div class="notification-title">AI 已完成竞品价格监测</div><div class="notification-meta">任务 · 4 分钟前 · 3 个价格变化</div></div><span class="badge accent">完成</span></div>
        <div class="notification-item"><span class="notice-icon">${icon('shield', 13)}</span><div><div class="notification-title">Amazon 店铺需要重新授权</div><div class="notification-meta">同步异常 · 16 分钟前</div></div><span class="badge danger">异常</span></div>
        <div class="menu-separator"></div><button class="menu-item">${icon('bell', 14)} 打开通知中心 <span class="shortcut">Ctrl Shift N</span></button>
      </div>
    `;
  }

  function renderProfilePopover() {
    return `
      <div class="popover profile-pop">
        <div style="display:flex;align-items:center;gap:9px;padding:7px"><span class="rail-avatar" style="background:var(--ink);color:var(--surface)">Y</span><div><div style="font-size:12px;font-weight:650">本机管理员</div><div style="color:var(--muted);font-size:10px">guest · 单机工作区</div></div></div>
        <div class="menu-separator"></div>
        <button class="menu-item" data-action="settings">${icon('settings', 14)} 设置 <span class="shortcut">Ctrl ,</span></button>
        <button class="menu-item">${icon('layers', 14)} 记忆管理</button>
        <button class="menu-item">${icon('shield', 14)} 授权管理</button>
        <button class="menu-item" data-action="settings" data-settings-target="shortcuts">${icon('command', 14)} 键盘快捷键</button>
        <div class="menu-separator"></div>
        <button class="menu-item">${icon('download', 14)} 导出诊断信息</button>
      </div>
    `;
  }

  function renderWorkspacePopover() {
    return `
      <div class="popover context-pop">
        <div class="menu-group-label">家居出海</div>
        <button class="menu-item">${icon('plus', 14)} 新建店铺项目</button>
        <button class="menu-item">${icon('folder', 14)} 绑定素材目录</button>
        <button class="menu-item">${icon('download', 14)} 导出项目数据</button>
        <div class="menu-separator"></div>
        <button class="menu-item">${icon('pin', 14)} 固定到左栏</button>
        <button class="menu-item danger">${icon('trash', 14)} 删除项目</button>
      </div>
    `;
  }

  function renderRowPopover(row = 'SO-1042') {
    return `
      <div class="popover row-pop" style="left:auto;right:330px;top:255px">
        <div class="menu-group-label">${row}</div>
        <button class="menu-item">${icon('eye', 14)} 查看详情 <span class="shortcut">Enter</span></button>
        <button class="menu-item">${icon('truck', 14)} 创建发货</button>
        <button class="menu-item">${icon('message', 14)} 联系买家</button>
        <button class="menu-item">${icon('copy', 14)} 复制订单号</button>
        <div class="menu-separator"></div>
        <button class="menu-item">${icon('sparkles', 14)} 交给 AI 处理</button>
        <button class="menu-item danger">${icon('x', 14)} 标记异常</button>
      </div>
    `;
  }

  function renderCommandPalette() {
    const results = [
      ['动作', '新建店铺项目', 'plus', ''],
      ['动作', '把 SO-1042 创建发货', 'truck', 'AI'],
      ['导航', '打开店铺总览', 'store', 'Alt 1'],
      ['实体', 'SO-1042 · 林** · ¥329.00', 'package', '订单'],
      ['实体', 'HO-002 · 云朵宠物窝', 'boxes', '商品'],
      ['设置', '切换深色模式', 'moon', 'Ctrl Shift L'],
      ['设置', '打开键盘快捷键', 'command', '?'],
    ];
    return `
      <div class="overlay-backdrop" data-action="close-overlay"></div>
      <div class="command-palette">
        <div class="command-input">${icon('search', 18)}<input autofocus placeholder="输入任务、订单、商品或动作"><kbd>Esc</kbd></div>
        <div class="command-results"><div class="menu-group-label">按当前上下文推荐</div>${results.map(([kind, label, ic, hint], i) => `<button class="command-result ${i === 1 ? 'active' : ''}">${icon(ic, 15)}<span>${label}</span><span class="result-kind">${kind}</span><span class="shortcut">${hint ? `<kbd>${hint}</kbd>` : ''}</span></button>`).join('')}</div>
        <div class="command-footer"><span><kbd>↑↓</kbd> 选择</span><span><kbd>Enter</kbd> 执行</span><span><kbd>Esc</kbd> 关闭</span><span style="margin-left:auto">搜索 6 个来源</span></div>
      </div>
    `;
  }

  function clipboardMarkup(embedded = false) {
    const items = [
      ['1', '文本', '客户退款话术 · 温和版', '工作话术 · 2 分钟前', '2 分钟前'],
      ['2', '代码', 'DATASOURCE_URL=••••••••', '敏感内容已遮蔽 · 26 分钟前', '26 分钟前'],
      ['3', '链接', 'https://example.com/products/ho-002', 'example.com · 41 分钟前', '41 分钟前'],
      ['4', '文件', '订单毛利分析.xlsx', '184 KB · 今天 09:12', '09:12'],
      ['5', '图片', 'ho-001-main.webp', '1200×1200 · 今天 08:56', '08:56'],
      ['6', '文本', '把 HO-002 的售价改成 189', '最近 · 今天 08:40', '08:40'],
    ];
    return `
      <div class="${embedded ? '' : 'clip-manager'}" style="${embedded ? 'position:relative;inset:auto;transform:none;width:100%;height:100%;border:0;border-radius:0;box-shadow:none;grid-template-columns:150px minmax(0,1fr) 260px' : ''}">
        <aside class="clip-side"><div class="clip-side-title">资料库</div><button class="context-item active">${icon('clipboard', 14)}<span>全部</span><span class="count">500</span></button><button class="context-item">${icon('file', 14)}<span>文本</span><span class="count">211</span></button><button class="context-item">${icon('external', 14)}<span>链接</span><span class="count">15</span></button><button class="context-item">${icon('layers', 14)}<span>图片</span><span class="count">237</span></button><button class="context-item">${icon('folder', 14)}<span>文件</span><span class="count">37</span></button><div class="context-label">分组</div><button class="context-item">${icon('tag', 14)}<span>工作话术</span><span class="count">18</span></button><button class="context-item">${icon('tag', 14)}<span>数据库排障</span><span class="count">12</span></button></aside>
        <section class="clip-list-pane"><div class="main-toolbar" style="min-height:43px"><label class="search-field" style="height:30px">${icon('search', 14)}<input placeholder="搜索剪贴板内容"><kbd>/</kbd></label><button class="icon-btn active" title="列表">${icon('list', 15)}</button><button class="icon-btn" title="网格">${icon('table', 15)}</button></div><div style="min-height:0;flex:1;overflow:auto">${items.map(([n, type, title, meta, time], i) => `<div class="clip-item-row ${i === 0 ? 'selected' : ''}"><span class="clip-index">${n}</span><span class="clip-type">${type === '代码' ? '</>' : type === '图片' ? 'IMG' : type === '文件' ? 'FILE' : type === '链接' ? 'URL' : '文'}</span><div><div class="clip-title">${title}</div><div class="clip-meta">${meta}</div></div><span class="clip-time">${time}</span></div>`).join('')}</div><div class="statusbar" style="height:30px;padding-left:10px"><span>500 条</span><span>68.4 MB</span><span class="status-spacer"></span><span>1–9 快贴 · Enter 粘贴 · Space 预览</span></div></section>
        <aside class="clip-preview"><div class="inspector-head"><span class="inspector-title">预览</span><button class="icon-btn">${icon('pin', 14)}</button><button class="icon-btn">${icon('more', 14)}</button></div><div class="inspector-body"><div class="section-head"><h3>客户退款话术 · 温和版</h3><span class="badge accent">文本</span></div><div class="sensitive-preview">您好，已看到您的退款申请。我们会在今天 18:00 前完成核对，并通过站内消息同步结果。感谢您的耐心等待。</div><div class="kv-list" style="margin-top:12px"><div class="kv-row"><span>来源</span><strong>超级剪贴板</strong></div><div class="kv-row"><span>分组</span><strong>工作话术</strong></div><div class="kv-row"><span>标签</span><strong>售后 · 退款</strong></div><div class="kv-row"><span>快捷键</span><strong>Ctrl Alt 3</strong></div></div><div class="ai-card" style="margin-top:12px"><div class="ai-card-head">${icon('sparkles', 14)} AI 操作</div><p style="margin:6px 0 0;font-size:11px;color:var(--muted)">翻译、总结、润色或发送到当前会话。</p></div></div></aside>
      </div>
    `;
  }

  function renderClipboardWindow() {
    return `
      <div class="overlay-backdrop" data-action="close-overlay"></div>
      <button class="overlay-close-button" data-action="close-overlay" aria-label="关闭剪贴板管理">${icon('x', 16)}</button>
      ${clipboardMarkup(false)}
    `;
  }

  function renderPetOverlay() {
    if (state.overlay === 'pet-radial') {
      const labels = [
        ['play', '逗一下', 17, 7],
        ['plus', '新建任务', 62, 42],
        ['layers', '任务面板', 91, 92],
        ['paw', '换形象', 62, 142],
        ['x', '隐藏', 17, 177],
        ['settings', '设置', -28, 142],
      ];
      return `
        <div class="pet-overlay">
          <div class="pet-radial">${labels.map(([ic, label, x, y], i) => `<button style="left:${190 - x}px;top:${190 - y}px" data-pet-action="${label}">${icon(ic, 17)}<span>${label}</span></button>`).join('')}</div>
          <div class="pet-status-bubble"><strong>需要你确认</strong>竞品价格监测已完成，是否生成 3 条调价变更单？</div>
          <div class="pet-character"><div class="pet-sprite"></div><span class="pet-nameplate">Boba</span></div>
        </div>
      `;
    }
    return `
      <div class="pet-overlay">
        <div class="pet-panel-card">
          <div class="pet-panel-head"><span class="pet-panel-title">任务</span><span class="badge accent">1 待处理</span><span class="spacer" style="flex:1"></span><button class="icon-btn" title="静音">${icon('bell', 14)}</button><button class="icon-btn" data-action="close-overlay" aria-label="关闭宠物任务">${icon('x', 14)}</button></div>
          <div style="padding:6px"><div class="menu-group-label">需要处理</div><div class="pet-task"><span class="pet-task-dot"></span><div><div class="pet-task-title">竞品价格监测</div><div class="pet-task-meta">需要确认 3 条调价变更单</div></div><div class="pet-task-actions"><button class="icon-btn" title="打开">${icon('right', 14)}</button></div></div><div class="pet-task running"><span class="pet-task-dot"></span><div><div class="pet-task-title">11 月经营复盘</div><div class="pet-task-meta">运行中 · 已用 3 分 18 秒 · 步骤 4/6</div><div class="progress" style="margin-top:5px"><i style="width:66%"></i></div></div><div class="pet-task-actions"><button class="icon-btn" title="暂停">${icon('pause', 14)}</button></div></div><div class="menu-group-label">刚完成</div><div class="pet-task"><span class="pet-task-dot" style="background:var(--success)"></span><div><div class="pet-task-title">商品详情页翻译</div><div class="pet-task-meta">完成于 09:31 · 生成 1 个文档</div></div><div class="pet-task-actions"><button class="icon-btn" title="查看">${icon('eye', 14)}</button></div></div></div>
          <div class="pet-panel-head" style="border-top:1px solid var(--line);border-bottom:0"><button class="button" style="width:100%">打开全部任务</button></div>
        </div>
        <div class="pet-character"><div class="pet-sprite"></div><span class="pet-nameplate">Boba · 1 待处理</span></div>
      </div>
    `;
  }

  function renderSettingsPanel() {
    const sections = [
      ['general', '通用', 'monitor'],
      ['models', '模型与平台', 'layers'],
      ['agents', '智能体', 'bot'],
      ['skills', 'Skill 与工具', 'sparkles'],
      ['permissions', '权限与审批', 'shield'],
      ['notifications', '通知', 'bell'],
      ['shortcuts', '快捷键', 'command'],
    ];
    let body = '';
    if (state.settingsTab === 'general') {
      body = `<div class="settings-group"><div class="settings-group-head"><h3>外观与语言</h3><p>只影响当前设备，不改变账号级配置。</p></div><div class="settings-row"><div><strong>主题</strong><small>浅色、深色或跟随系统</small></div><div class="segmented"><button class="${document.documentElement.dataset.theme !== 'dark' ? 'active' : ''}" data-action="theme">浅色</button><button class="${document.documentElement.dataset.theme === 'dark' ? 'active' : ''}" data-action="theme">深色</button></div></div><div class="settings-row"><div><strong>界面语言</strong><small>菜单、提示和系统消息</small></div><select><option>简体中文</option><option>English</option></select></div><div class="settings-row"><div><strong>启动时恢复上次工作区</strong><small>恢复模式、侧栏宽度和打开的面板</small></div><button class="settings-switch active" aria-pressed="true"><i></i></button></div></div><div class="settings-group"><div class="settings-group-head"><h3>桌面窗口</h3></div><div class="settings-row"><div><strong>关闭主窗口时</strong><small>桌面宠物和后台任务可继续运行</small></div><select><option>最小化到托盘</option><option>退出应用</option><option>每次询问</option></select></div><div class="settings-row"><div><strong>自动更新</strong><small>下载前先提示，不自动重启</small></div><button class="settings-switch active" aria-pressed="true"><i></i></button></div></div>`;
    } else if (state.settingsTab === 'models') {
      body = `<div class="settings-group"><div class="settings-group-head"><h3>模型平台</h3><p>模型选择会出现在 AI 输入框下方，不要求每次进入设置。</p></div>${[['Agnes', '官方 · 3 个模型', '已连接'], ['OpenAI', '4 个模型 · GPT-5.1', '已连接'], ['Anthropic', '2 个模型 · Claude 4', '已连接'], ['本地 Ollama', '2 个本地模型', '需启动']].map(([name, meta, badge]) => `<div class="settings-row"><div class="settings-provider"><span class="priority-icon">${icon('layers', 14)}</span><div><strong>${name}</strong><small>${meta}</small></div></div><span class="badge ${badge === '已连接' ? 'accent' : 'warn'}">${badge}</span><button class="button">配置</button></div>`).join('')}</div><div class="settings-group"><div class="settings-group-head"><h3>默认模型</h3></div><div class="settings-row"><div><strong>新对话默认模型</strong><small>仍可在每次发送前切换</small></div><select>${aiModels.map(([name]) => `<option ${name === state.aiModel ? 'selected' : ''}>${name}</option>`).join('')}</select></div><div class="settings-row"><div><strong>推理强度</strong><small>复杂任务可提高推理预算</small></div><div class="segmented"><button>快速</button><button class="active">平衡</button><button>深入</button></div></div></div>`;
    } else if (state.settingsTab === 'agents') {
      body = `<div class="settings-group"><div class="settings-group-head"><h3>对话智能体</h3><p>智能体决定角色、默认工具和可用 Skill。</p></div>${aiAgents.map(([name, desc]) => `<div class="settings-row"><div class="settings-provider"><span class="rail-avatar">${name.slice(0, 1)}</span><div><strong>${name}</strong><small>${desc}</small></div></div>${name === state.aiAgent ? '<span class="badge accent">当前</span>' : '<button class="button">设为默认</button>'}<button class="icon-btn">${icon('more', 15)}</button></div>`).join('')}</div><button class="settings-add-row">${icon('plus', 15)} 新建智能体</button>`;
    } else if (state.settingsTab === 'skills') {
      body = `<div class="settings-group"><div class="settings-group-head"><h3>已安装 Skill</h3><p>Skill 可以在输入框中选择或取消挂载，不会自动永久生效。</p></div>${aiSkills.map(([name, desc, enabled]) => `<div class="settings-row"><div class="settings-provider"><span class="priority-icon">${icon('sparkles', 14)}</span><div><strong>${name}</strong><small>${desc}</small></div></div><span class="badge">${enabled ? '已安装' : '已停用'}</span><button class="settings-switch ${state.aiSkills.includes(name) ? 'active' : ''}" data-ai-setting-skill="${name}" aria-pressed="${state.aiSkills.includes(name)}"><i></i></button></div>`).join('')}</div><div class="settings-group"><div class="settings-group-head"><h3>工具策略</h3></div><div class="settings-row"><div><strong>外部写入前询问</strong><small>发送消息、提交表单、修改订单时请求确认</small></div><button class="settings-switch active" aria-pressed="true"><i></i></button></div><div class="settings-row"><div><strong>保留工具调用记录</strong><small>用于回放和审计，不记录敏感凭据</small></div><button class="settings-switch active" aria-pressed="true"><i></i></button></div></div>`;
    } else if (state.settingsTab === 'permissions') {
      body = `<div class="settings-group"><div class="settings-group-head"><h3>默认工具权限</h3><p>每次发送前仍可在输入框中临时调整。</p></div><div class="settings-choice-list">${[['只读', '读取本地文件、剪贴板和授权数据，不执行写入。'], ['读写', '允许创建和修改文件，外部副作用操作需要确认。'], ['完全执行', '允许连续执行多步任务，付款、删除和发布仍需批准。']].map(([name, desc]) => `<button class="settings-choice ${state.aiPermission === name ? 'active' : ''}" data-ai-permission-setting="${name}"><span>${icon('shield', 17)}</span><span><strong>${name}</strong><small>${desc}</small></span>${state.aiPermission === name ? icon('check', 16) : ''}</button>`).join('')}</div></div><div class="settings-group"><div class="settings-group-head"><h3>高风险动作</h3></div><div class="settings-row"><div><strong>删除本地文件</strong><small>始终要求二次确认</small></div><span class="badge danger">强制确认</span></div><div class="settings-row"><div><strong>发布、付款、发送消息</strong><small>展示变更单后由你批准</small></div><span class="badge danger">强制确认</span></div></div>`;
    } else if (state.settingsTab === 'notifications') {
      body = `<div class="settings-group"><div class="settings-group-head"><h3>提醒范围</h3><p>优先保留需要你输入或批准的状态。</p></div>${[['任务需要输入', '只在智能体阻塞时提醒', true], ['任务完成', '成功完成后显示一次通知', true], ['错误与失败', '持续保留到处理或关闭', true], ['后台运行进度', '仅显示在状态栏，不弹窗', false]].map(([name, desc, on]) => `<div class="settings-row"><div><strong>${name}</strong><small>${desc}</small></div><button class="settings-switch ${on ? 'active' : ''}" aria-pressed="${on}"><i></i></button></div>`).join('')}</div><div class="settings-group"><div class="settings-group-head"><h3>安静时段</h3></div><div class="settings-row"><div><strong>免打扰</strong><small>错误和审批仍会保留在通知中心</small></div><div class="settings-time-range"><input value="22:00"><span>至</span><input value="08:00"></div></div></div>`;
    } else {
      body = `<div class="settings-group"><div class="settings-group-head"><h3>键盘快捷键</h3><p>桌面端始终优先支持键盘操作。</p></div><div class="shortcut-grid">${[['打开命令面板', 'Ctrl K'], ['新对话', 'Ctrl N'], ['打开设置', 'Ctrl ,'], ['收起上下文栏', 'Ctrl B'], ['收起检查器', 'Ctrl J'], ['发送消息', 'Enter'], ['消息内换行', 'Shift Enter'], ['关闭浮层', 'Esc']].map(([name, key]) => `<div><span>${name}</span><kbd>${key}</kbd></div>`).join('')}</div></div><div class="settings-group"><div class="settings-group-head"><h3>其他菜单</h3></div><div class="settings-menu-links"><button data-menu="command">${icon('command', 15)} 命令面板</button><button data-action="settings">${icon('settings', 15)} 全局设置</button><button data-menu="profile">${icon('user', 15)} 账号菜单</button><button data-menu="workspace">${icon('folder', 15)} 工作区菜单</button><button data-menu="notifications">${icon('bell', 15)} 通知中心</button><button data-menu="clipboard">${icon('clipboard', 15)} 剪贴板管理</button></div></div>`;
    }
    return `
      <div class="overlay-backdrop" data-action="close-overlay"></div>
      <section class="settings-window" role="dialog" aria-modal="true" aria-label="设置">
        <header class="settings-window-head"><div><h2>设置</h2><span>本机管理员 · 单机工作区</span></div><button class="icon-btn" data-action="close-overlay" aria-label="关闭设置">${icon('x', 16)}</button></header>
        <div class="settings-layout">
          <nav class="settings-nav" aria-label="设置分类">${sections.map(([key, label, ic]) => `<button class="${state.settingsTab === key ? 'active' : ''}" data-settings-tab="${key}">${icon(ic, 16)}<span>${label}</span></button>`).join('')}</nav>
          <div class="settings-content">${body}</div>
        </div>
      </section>
    `;
  }

  function renderGitPanel() {
    return `
      <div class="overlay-backdrop" data-action="close-overlay"></div>
      <section class="git-plugin-window" role="dialog" aria-modal="true" aria-label="Git 插件">
        <header class="git-plugin-head"><div><h2>Git</h2><span>ai-assistant · dev0.1-mobile</span></div><button class="button">${icon('refresh', 13)} 拉取</button><button class="button">${icon('upload', 13)} 推送 2</button><button class="icon-btn" data-action="close-overlay" aria-label="关闭 Git 插件">${icon('x', 16)}</button></header>
        <div class="git-plugin-layout">
          <aside class="git-plugin-side"><div class="menu-group-label">仓库</div><button class="context-item active">${icon('code', 14)}<span>更改 3</span></button><button class="context-item">${icon('clock', 14)}<span>历史</span></button><button class="context-item">${icon('flow', 14)}<span>分支</span></button><button class="context-item">${icon('pin', 14)}<span>暂存</span></button></aside>
          <main class="git-plugin-main"><div class="git-branch-bar"><span>${icon('flow', 14)} dev0.1-mobile</span><span class="badge warn">3 个未提交变更</span><span class="spacer"></span><button class="button">切换分支</button></div><div class="git-change-group"><header><label><input type="checkbox" checked> 已暂存</label><span>1 个文件</span></header><div class="git-change-row"><span class="git-file-state">M</span><code>packages/ui/src/App.vue</code><span>+18 −4</span></div></div><div class="git-change-group"><header><label><input type="checkbox"> 更改</label><span>2 个文件</span></header><div class="git-change-row"><span class="git-file-state">M</span><code>packages/ui/src/views/LearningV2.vue</code><span>+42 −8</span></div><div class="git-change-row"><span class="git-file-state">?</span><code>docs/prototypes/app-v3/desktop.js</code><span>新文件</span></div></div><div class="git-diff-preview"><header><span>diff · App.vue</span><span class="badge accent">已暂存</span></header><div><code><i>+</i>  modeRail: true,</code><code><i>-</i>  legacyNav: true,</code><code>  inspector: true,</code></div></div></main>
          <aside class="git-commit-panel"><h3>提交</h3><label>提交信息</label><textarea rows="5">feat: 重构桌面应用壳与模式布局</textarea><div class="kv-list"><div class="kv-row"><span>分支</span><strong>dev0.1-mobile</strong></div><div class="kv-row"><span>签名</span><strong>已配置</strong></div><div class="kv-row"><span>检查</span><strong style="color:var(--success)">通过</strong></div></div><button class="button primary" data-action="git-commit">${icon('check', 14)} 提交已暂存更改</button><button class="button" data-action="git-commit-push">提交并推送</button></aside>
        </div>
      </section>
    `;
  }

  function renderImmersive() {
    if (!state.learningImmersive) return '';
    const subject = currentSubject();
    return `
      <section class="immersive-layer" aria-label="沉浸学习台">
        <header class="immersive-top"><button class="button" data-action="exit-immersive">${icon('left', 14)} 返回路线</button><div class="immersive-title">${subject.course}</div><span class="badge">步骤 2 / 4</span><button class="icon-btn" data-action="exit-immersive" title="退出">${icon('x', 15)}</button></header>
        <div class="immersive-content"><article class="lesson-paper"><div class="eyebrow">${subject.label} · 概念</div><h1>先把问题放进可判断的框架</h1><p>${subject.desc}</p><p>本步只处理当前概念：辨认关键事实，找出因果关系，再用一个具体例子验证自己的理解。</p><div class="lesson-note"><strong>本步目标：</strong>能用自己的话解释核心概念，并指出它在真实情境中的一个应用和一个边界。</div></article></div>
        <footer class="immersive-bottom"><div class="immersive-steps"><b class="active">1</b><span>概念</span><b>2</b><span>例子</span><b>3</b><span>练习</span><b>4</b><span>自测</span></div><div style="display:flex;gap:8px"><button class="button">上一页</button><button class="button primary">下一页 ${icon('right', 14)}</button></div></footer>
      </section>
    `;
  }

  function renderOverlays() {
    let overlays = '';
    if (['mode', 'notifications', 'profile', 'workspace', 'row'].includes(state.overlay)) {
      overlays += '<div class="dropdown-scrim" data-action="close-overlay" aria-hidden="true"></div>';
    }
    if (state.overlay === 'mode') overlays += renderModePopover();
    if (state.overlay === 'notifications') overlays += renderNotifications();
    if (state.overlay === 'profile') overlays += renderProfilePopover();
    if (state.overlay === 'workspace') overlays += renderWorkspacePopover();
    if (state.overlay === 'row') overlays += renderRowPopover(state.rowMenu);
    if (state.overlay === 'command') overlays += renderCommandPalette();
    if (state.overlay === 'settings') overlays += renderSettingsPanel();
    if (state.overlay === 'git-panel') overlays += renderGitPanel();
    if (state.overlay === 'clipboard') overlays += renderClipboardWindow();
    if (state.overlay === 'pet-radial' || state.overlay === 'pet-panel') overlays += renderPetOverlay();
    if (state.toast) overlays += `<div class="toast">${icon('check', 15)}${state.toast}</div>`;
    overlays += renderImmersive();
    return overlays;
  }

  function render() {
    document.querySelectorAll('[data-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === state.mode);
    });
    const themeButton = reviewBar.querySelector('[data-action="theme"]');
    if (themeButton) themeButton.innerHTML = `${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', 14)} ${document.documentElement.dataset.theme === 'dark' ? '浅色' : '深色'}`;
    root.innerHTML = `
      <div class="app-window">
        ${renderTitlebar()}
        <div class="workspace-grid mode-${state.mode} ${state.contextOpen ? '' : 'context-closed'} ${state.inspectorOpen ? '' : 'inspector-closed'}" style="--context-w:${state.contextWidth}px;--inspector-w:${state.inspectorWidth}px">
          ${state.contextOpen ? renderContext() : ''}
          ${state.contextOpen ? `<button class="pane-resizer context-resizer" data-resize="context" role="separator" aria-orientation="vertical" aria-valuemin="200" aria-valuemax="380" aria-valuenow="${state.contextWidth}" title="拖动调整上下文栏宽度，双击收起"></button>` : ''}
          <main class="main-pane mode-${state.mode} lead-${currentLead()}">${renderMain()}</main>
          ${state.inspectorOpen ? `<button class="pane-resizer inspector-resizer" data-resize="inspector" role="separator" aria-orientation="vertical" aria-valuemin="260" aria-valuemax="420" aria-valuenow="${state.inspectorWidth}" title="拖动调整检查器宽度，双击收起"></button>` : ''}
          ${renderInspector()}
        </div>
        ${renderStatusbar()}
        ${renderOverlays()}
      </div>
    `;
    if (state.overlay === 'mode') {
      window.requestAnimationFrame(() => root.querySelector('.mode-option')?.focus());
    } else if (state.overlay === 'settings') {
      window.requestAnimationFrame(() => root.querySelector('.settings-window [data-settings-tab].active')?.focus());
    } else if (currentLead() === 'ai' && state.assistantPage === 'command') {
      window.requestAnimationFrame(() => {
        const thread = root.querySelector('.ai-chat-thread');
        if (thread) thread.scrollTop = thread.scrollHeight;
      });
    }
  }

  root.addEventListener('click', (event) => {
    const petAction = event.target.closest('[data-pet-action]');
    if (petAction) {
      const label = petAction.dataset.petAction;
      if (label === '隐藏' || label === '设置') closeOverlays();
      else if (label === '任务面板') {
        state.overlay = 'pet-panel';
        render();
      } else {
        state.overlay = null;
        status(`${label}已执行`);
      }
      return;
    }
    const leadButton = event.target.closest('[data-lead]');
    if (leadButton) {
      setLead(leadButton.dataset.lead);
      return;
    }
    const modeButton = event.target.closest('[data-mode]');
    if (modeButton) {
      setMode(modeButton.dataset.mode);
      return;
    }
    const subjectButton = event.target.closest('[data-subject]');
    if (subjectButton) {
      setSubject(subjectButton.dataset.subject);
      return;
    }
    const libraryTabButton = event.target.closest('[data-library-tab]');
    if (libraryTabButton) {
      setLibraryTab(libraryTabButton.dataset.libraryTab);
      return;
    }
    const libraryBookButton = event.target.closest('[data-library-book]');
    if (libraryBookButton) {
      state.selectedBook = Number(libraryBookButton.dataset.libraryBook) || 0;
      render();
      return;
    }
    const shopButton = event.target.closest('[data-shop-page]');
    if (shopButton) {
      setShopPage(shopButton.dataset.shopPage);
      return;
    }
    const shopSetupStepButton = event.target.closest('[data-shop-setup-step]');
    if (shopSetupStepButton) {
      state.shopSetupStep = Math.min(shopSetupSteps.length - 1, Math.max(0, Number(shopSetupStepButton.dataset.shopSetupStep) || 0));
      render();
      return;
    }
    const shopChoiceButton = event.target.closest('[data-shop-choice]');
    if (shopChoiceButton) {
      state.shopSetupSelections[shopChoiceButton.dataset.shopChoice] = shopChoiceButton.dataset.value;
      render();
      return;
    }
    const assistantButton = event.target.closest('[data-assistant-page]');
    if (assistantButton) {
      state.assistantPage = assistantButton.dataset.assistantPage;
      state.overlay = null;
      render();
      return;
    }
    const aiPickerButton = event.target.closest('[data-ai-picker]');
    if (aiPickerButton) {
      const picker = aiPickerButton.dataset.aiPicker;
      state.aiPicker = state.aiPicker === picker ? null : picker;
      render();
      return;
    }
    const aiAgentButton = event.target.closest('[data-ai-agent]');
    if (aiAgentButton) {
      state.aiAgent = aiAgentButton.dataset.aiAgent;
      state.aiPicker = null;
      render();
      return;
    }
    const aiSkillButton = event.target.closest('[data-ai-skill]');
    if (aiSkillButton) {
      const skill = aiSkillButton.dataset.aiSkill;
      state.aiSkills = state.aiSkills.includes(skill)
        ? state.aiSkills.filter((item) => item !== skill)
        : [...state.aiSkills, skill];
      render();
      return;
    }
    const aiModelButton = event.target.closest('[data-ai-model]');
    if (aiModelButton) {
      state.aiModel = aiModelButton.dataset.aiModel;
      state.aiPicker = null;
      render();
      return;
    }
    const aiPermissionButton = event.target.closest('[data-ai-permission]');
    if (aiPermissionButton) {
      state.aiPermission = aiPermissionButton.dataset.aiPermission;
      state.aiPicker = null;
      render();
      return;
    }
    const aiPlusButton = event.target.closest('[data-ai-plus]');
    if (aiPlusButton) {
      const label = aiPlusButton.dataset.aiPlus;
      state.aiPicker = null;
      render();
      status(`已添加${label}到当前消息`);
      return;
    }
    const settingsTabButton = event.target.closest('[data-settings-tab]');
    if (settingsTabButton) {
      state.settingsTab = settingsTabButton.dataset.settingsTab;
      render();
      return;
    }
    const settingsSkillButton = event.target.closest('[data-ai-setting-skill]');
    if (settingsSkillButton) {
      const skill = settingsSkillButton.dataset.aiSettingSkill;
      state.aiSkills = state.aiSkills.includes(skill)
        ? state.aiSkills.filter((item) => item !== skill)
        : [...state.aiSkills, skill];
      render();
      return;
    }
    const permissionSettingButton = event.target.closest('[data-ai-permission-setting]');
    if (permissionSettingButton) {
      state.aiPermission = permissionSettingButton.dataset.aiPermissionSetting;
      render();
      return;
    }
    const menuButton = event.target.closest('[data-menu]');
    if (menuButton) {
      const type = menuButton.dataset.menu;
      state.overlay = state.overlay === type ? null : type;
      state.rowMenu = null;
      render();
      return;
    }
    const rowMenu = event.target.closest('[data-row-menu]');
    if (rowMenu) {
      const rect = rowMenu.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      state.overlay = 'row';
      state.rowMenu = rowMenu.dataset.rowMenu;
      render();
      window.requestAnimationFrame(() => {
        const pop = root.querySelector('.row-pop');
        if (pop) {
          pop.style.left = `${rect.left - rootRect.left - 190}px`;
          pop.style.top = `${rect.bottom - rootRect.top + 4}px`;
          pop.style.right = 'auto';
        }
      });
      return;
    }
    const actionTarget = event.target.closest('[data-action]');
    const action = actionTarget?.dataset.action;
    if (!action) {
      const menuItem = event.target.closest('.menu-item');
      if (menuItem) {
        state.overlay = null;
        status(`${menuItem.textContent.trim()}已打开`);
        return;
      }
      const localSwitch = event.target.closest('.settings-switch');
      if (localSwitch) {
        localSwitch.classList.toggle('active');
        localSwitch.setAttribute('aria-pressed', String(localSwitch.classList.contains('active')));
        return;
      }
      const plainButton = event.target.closest('button');
      if (plainButton && plainButton.type !== 'submit' && !plainButton.closest('.window-controls')) {
        const label = plainButton.getAttribute('aria-label') || plainButton.getAttribute('title') || plainButton.textContent.trim();
        if (label) status(`${label}已执行`);
      }
      return;
    }
    if (action === 'home') setMode('office');
    else if (action === 'toggle-context') {
      state.contextOpen = !state.contextOpen;
      render();
    } else if (action === 'toggle-inspector') {
      state.inspectorOpen = !state.inspectorOpen;
      render();
    } else if (action === 'close-overlay') closeOverlays();
    else if (action === 'close-ai-picker') {
      state.aiPicker = null;
      render();
    }
    else if (action === 'new-ai-chat') {
      state.assistantPage = 'command';
      state.aiMessages = [];
      state.aiPicker = null;
      render();
      window.requestAnimationFrame(() => root.querySelector('[data-ai-input]')?.focus());
    } else if (action === 'copy-ai-message') status('消息已复制');
    else if (action === 'retry-ai-message') status('已重新提交给智能体');
    else if (action === 'convert-ai-task') status('已转为可跟踪任务');
    else if (action === 'shop-start') {
      state.shopSetupOpen = true;
      state.shopSetupStep = 0;
      state.shopPage = 'overview';
      render();
    } else if (action === 'shop-exit-setup') {
      state.shopSetupOpen = false;
      render();
    } else if (action === 'shop-save-draft') status('开店草稿已保存');
    else if (action === 'shop-setup-next') {
      state.shopSetupStep = Math.min(shopSetupSteps.length - 1, state.shopSetupStep + 1);
      render();
    } else if (action === 'shop-setup-prev') {
      state.shopSetupStep = Math.max(0, state.shopSetupStep - 1);
      render();
    } else if (action === 'shop-create') {
      state.shopSetupOpen = false;
      state.shopPage = 'overview';
      status('店铺已创建，进入开店清单');
    }
    else if (action === 'open-git-panel') {
      state.overlay = 'git-panel';
      render();
    } else if (action === 'git-commit') {
      state.overlay = null;
      status('Git 提交已创建');
    } else if (action === 'git-commit-push') {
      state.overlay = null;
      status('提交已创建并推送 2 个提交');
    }
    else if (action === 'approve-change') status('变更单已批准，库存与价格已进入执行队列');
    else if (action === 'open-library') {
      state.libraryOpen = true;
      state.libraryTab = 'discover';
      render();
    } else if (action === 'close-library') {
      state.libraryOpen = false;
      render();
    } else if (action === 'add-library-source') {
      state.libraryOpen = true;
      state.libraryTab = 'sources';
      status('已打开自定义书源');
    }
    else if (action === 'learning-immersive') {
      state.learningImmersive = true;
      render();
    } else if (action === 'exit-immersive') {
      state.learningImmersive = false;
      render();
    } else if (action === 'context-primary') status('已打开新建流程');
    else if (action === 'settings') {
      state.settingsTab = actionTarget?.dataset.settingsTarget || 'general';
      state.overlay = 'settings';
      state.aiPicker = null;
      render();
    }
    else if (action === 'shop-store') status('当前店铺上下文已切换');
  });

  root.addEventListener('change', (event) => {
    const subjectSelect = event.target.closest('[data-subject-select]');
    if (subjectSelect) setSubject(subjectSelect.value);
  });

  root.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-ai-form]');
    if (!form) return;
    event.preventDefault();
    const input = form.querySelector('[data-ai-input]');
    const content = input?.value.trim();
    if (!content) {
      input?.focus();
      return;
    }
    state.aiMessages.push({ role: 'user', content, meta: '刚刚' });
    state.aiMessages.push({
      role: 'assistant',
      agent: state.aiAgent,
      model: state.aiModel,
      content: `已收到。我会使用「${state.aiAgent}」和 ${state.aiSkills.length} 个已挂载 Skill，在当前${state.aiPermission}权限下处理。涉及写入或外部操作时，我会先生成变更单请求确认。`,
      meta: '刚刚 · 已生成执行计划',
    });
    state.aiPicker = null;
    render();
    window.requestAnimationFrame(() => root.querySelector('[data-ai-input]')?.focus());
  });

  root.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('[data-resize]');
    if (handle) startPaneResize(handle.dataset.resize, event);
  });

  root.addEventListener('dblclick', (event) => {
    const handle = event.target.closest('[data-resize]');
    if (!handle) return;
    if (handle.dataset.resize === 'context') state.contextOpen = false;
    else state.inspectorOpen = false;
    render();
  });

  root.addEventListener('keydown', (event) => {
    const aiInput = event.target.closest('[data-ai-input]');
    if (aiInput && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      aiInput.closest('form')?.requestSubmit();
      return;
    }
    const handle = event.target.closest('[data-resize]');
    if (!handle || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 16 : -16;
    const grid = root.querySelector('.workspace-grid');
    if (handle.dataset.resize === 'context') {
      state.contextWidth = Math.min(380, Math.max(200, state.contextWidth + step));
      grid?.style.setProperty('--context-w', `${state.contextWidth}px`);
      handle.setAttribute('aria-valuenow', String(state.contextWidth));
    } else {
      state.inspectorWidth = Math.min(420, Math.max(260, state.inspectorWidth - step));
      grid?.style.setProperty('--inspector-w', `${state.inspectorWidth}px`);
      handle.setAttribute('aria-valuenow', String(state.inspectorWidth));
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.review-bar')) return;
    const modeButton = event.target.closest('[data-mode]');
    if (modeButton) {
      setMode(modeButton.dataset.mode);
      return;
    }
    const menuButton = event.target.closest('[data-menu]');
    if (menuButton) {
      const type = menuButton.dataset.menu;
      state.overlay = state.overlay === type ? null : type;
      state.rowMenu = null;
      render();
      return;
    }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'theme') {
      const dark = document.documentElement.dataset.theme === 'dark';
      document.documentElement.dataset.theme = dark ? 'light' : 'dark';
      render();
    } else if (action === 'settings') {
      state.settingsTab = event.target.closest('[data-settings-target]')?.dataset.settingsTarget || 'general';
      state.overlay = 'settings';
      state.aiPicker = null;
      render();
    } else if (action === 'clean') {
      document.body.classList.toggle('clean-review');
    } else if (action === 'learning-immersive') {
      state.learningImmersive = true;
      state.overlay = null;
      render();
    }
  });

  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      state.overlay = 'command';
      render();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      state.contextOpen = !state.contextOpen;
      render();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'j') {
      event.preventDefault();
      state.inspectorOpen = !state.inspectorOpen;
      render();
    } else if ((event.ctrlKey || event.metaKey) && event.key === ',') {
      event.preventDefault();
      state.settingsTab = 'general';
      state.overlay = 'settings';
      render();
    } else if (event.key === 'Escape') {
      if (state.learningImmersive) state.learningImmersive = false;
      else if (state.aiPicker) state.aiPicker = null;
      else state.overlay = null;
      render();
    }
  });

  render();
})();
