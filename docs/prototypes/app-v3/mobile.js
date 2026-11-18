(() => {
  const root = document.querySelector('#mobile-root');
  const reviewPanel = document.querySelector('.mobile-review-panel');
  const reviewBar = document.querySelector('.review-bar');

  const iconPaths = {
    work: '<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/>',
    store: '<path d="M3 9 4.5 4h15L21 9"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/><path d="M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    sparkles: '<path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4z"/><path d="M5 3v4M19 17v4M3 5h4M17 19h4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    truck: '<path d="M3 6h11v11H3z"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
    alert: '<path d="M12 3 2 21h20z"/><path d="M12 9v5"/><path d="M12 18h.01"/>',
    message: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    package: '<path d="m3 7 9 5 9-5"/><path d="M3 7v10l9 5 9-5V7l-9-5z"/><path d="M12 12v10"/>',
    cart: '<circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M3 4h2l2.4 11.5A2 2 0 0 0 9.4 17H18a2 2 0 0 0 2-1.6L21 8H6"/>',
    boxes: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2"/><path d="M9 10h6M9 14h6M9 18h4"/>',
    paw: '<circle cx="6" cy="9" r="2"/><circle cx="10" cy="5" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="19" cy="9" r="2"/><path d="M7 18c0-4 2-7 5-7s5 3 5 7c0 2-2 3-5 3s-5-1-5-3z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 3a7 7 0 0 0-1.7 1L5 6.1 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5l2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 3h5l.4-3a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2.1-1.5a7 7 0 0 0 .1-1z"/>',
    shield: '<path d="M12 3 4 6v5c0 5 3 9 8 10 5-1 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/>',
    command: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    play: '<path d="m8 5 11 7-11 7z"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h5a3 3 0 0 1 3 3v15a3 3 0 0 0-3-3H4z"/><path d="M20 5a2 2 0 0 0-2-2h-4v18a3 3 0 0 1 3-3h3z"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    pin: '<path d="m15 4 5 5-2 2-1 4-4 4-1-1 1-5-3-3 4-1z"/><path d="m7 17-4 4"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/><path d="M10 12v2h4v-2"/>',
    flow: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M9 6h4a2 2 0 0 1 2 2v7"/><path d="m13 12 2 3 2-3"/>',
    code: '<path d="m8 9-4 3 4 3"/><path d="m16 9 4 3-4 3"/><path d="m14 5-4 14"/>',
    server: '<rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/><path d="M8 7h.01M8 17h.01M12 7h5M12 17h5"/>',
  };

  function icon(name, size = 18, stroke = 1.8) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.more}</svg>`;
  }

  const shopPages = [
    ['overview', '总览'],
    ['products', '商品'],
    ['orders', '订单'],
    ['shipments', '发货'],
    ['inventory', '库存'],
    ['more', '更多'],
  ];

  const tabs = [
    ['work', '工作', 'work'],
    ['shop', '店铺', 'store'],
    ['files', '文件', 'folder'],
    ['mine', '我的', 'user'],
  ];

  const workModes = [
    { key: 'office', label: '日常办公', sub: '文档 · 表格 · 会议', icon: 'briefcase', primary: true },
    { key: 'ops', label: '运维', sub: '告警 · 发布 · 审批', icon: 'server', primary: true },
    { key: 'sec', label: '安全', sub: '风险 · 扫描 · 报告', icon: 'shield', primary: true },
    { key: 'learning', label: '学习', sub: '课程 · 复习 · 训练', icon: 'book', primary: true },
    { key: 'shop', label: '店铺运营', sub: '总览 · 订单 · 履约', icon: 'store', primary: true },
  ];

  const workModePages = {
    office: [['today', '今日'], ['tasks', '任务'], ['outputs', '产物']],
    ops: [['overview', '总览'], ['alerts', '告警'], ['releases', '发布'], ['approvals', '审批']],
    sec: [['overview', '总览'], ['findings', '风险'], ['scans', '扫描'], ['reports', '报告']],
    learning: [['overview', '课程'], ['review', '复习'], ['practice', '训练']],
  };

  const learningSubjects = [
    { key: '党史', label: '党史', meta: '4 阶段 · 13 门课程', course: '遵义会议：转折如何发生', desc: '从会议文献、军事态势和后续决策，理解组织转折如何发生。', progress: '7 / 13 课', mastery: '68%', streak: '7 天' },
    { key: '政治', label: '政治', meta: '制度 · 治理 · 公共政策', course: '公共政策如何形成', desc: '从问题识别、议程设置和执行条件理解公共政策的完整链路。', progress: '9 / 24 课', mastery: '73%', streak: '5 天' },
    { key: '经济学', label: '经济学', meta: '微观 · 宏观 · 商业分析', course: '市场失灵与外部性', desc: '从激励、成本和产权边界理解市场失灵，并比较可能的治理工具。', progress: '8 / 20 课', mastery: '71%', streak: '6 天' },
    { key: '军事', label: '军事', meta: '战史 · 战略 · 组织', course: '战役目标与资源约束', desc: '把战略目标拆成可执行的兵力、补给与时间约束。', progress: '4 / 16 课', mastery: '64%', streak: '3 天' },
    { key: '历史', label: '历史', meta: '通史 · 史料 · 比较', course: '制度变迁的长期线索', desc: '通过制度、人口与财政数据辨认历史变化中的连续与断裂。', progress: '12 / 32 课', mastery: '76%', streak: '9 天' },
    { key: '书法', label: '书法', meta: '笔法 · 结构 · 临帖', course: '楷书横画的起收与转折', desc: '把起笔、行笔、收笔拆成可观察的动作，并用临帖校正结构。', progress: '6 / 18 课', mastery: '59%', streak: '4 天' },
    { key: '记忆训练', label: '记忆训练', meta: '编码 · 联想 · 间隔复习', course: '地点法构建稳定记忆线索', desc: '用空间路线组织信息，并设计可复用的间隔复习节奏。', progress: '14 / 28 课', mastery: '81%', streak: '15 天' },
    { key: '思维训练', label: '思维训练', meta: '结构化 · 推理 · 决策', course: '把复杂问题拆成判断树', desc: '用假设、证据和反例建立可复核的问题判断过程。', progress: '10 / 24 课', mastery: '77%', streak: '8 天' },
    { key: '数学', label: '数学', meta: '代数 · 几何 · 概率', course: '概率中的条件与独立性', desc: '从事件关系理解条件概率，并识别日常判断中的独立性误区。', progress: '16 / 36 课', mastery: '74%', streak: '11 天' },
    { key: '物理', label: '物理', meta: '力学 · 电磁 · 实验', course: '受力分析与运动状态', desc: '先画清相互作用，再判断物体运动状态会如何改变。', progress: '7 / 28 课', mastery: '61%', streak: '5 天' },
    { key: '百家思想', label: '百家思想', meta: '原典 · 比较 · 论证', course: '儒墨道法的秩序观', desc: '比较四家如何理解人性、秩序与治理责任。', progress: '9 / 22 课', mastery: '69%', streak: '6 天' },
    { key: '英语', label: '英语', meta: '自然拼读 · 词根 · 长篇阅读', course: '词根 port：携带与运输', desc: '从 transport、export、portable 的共同词根，建立可迁移的词汇网络。', progress: '18 / 120 课', mastery: '62%', streak: '12 天' },
    { key: '日语', label: '日语', meta: '五十音 · 语法 · 会话', course: '助词は与が的句子焦点', desc: '通过信息焦点理解主题与主语的差异，而不是死记中文对译。', progress: '5 / 60 课', mastery: '46%', streak: '4 天' },
    { key: '软考', label: '软考', meta: '知识体系 · 真题 · 案例', course: '需求分析与范围管理', desc: '从干系人、边界与验收标准识别项目范围风险。', progress: '11 / 48 课', mastery: '66%', streak: '7 天' },
    { key: '网络安全', label: '网络安全', meta: '威胁建模 · 攻防 · 审计', course: '威胁建模与 STRIDE', desc: '把模糊的安全担心拆成可评审的威胁类别，并映射到控制措施。', progress: '5 / 12 课', mastery: '74%', streak: '4 天' },
    { key: '传统文化', label: '传统文化', meta: '典籍 · 礼俗 · 艺术', course: '典籍阅读中的注释层次', desc: '区分原文、传统注疏和现代解释，建立可靠的阅读边界。', progress: '13 / 30 课', mastery: '78%', streak: '10 天' },
    { key: '音乐', label: '音乐', meta: '乐理 · 听辨 · 编曲', course: '和弦功能与段落推进', desc: '通过主、属、下属功能理解段落张力和解决方向。', progress: '4 / 24 课', mastery: '52%', streak: '3 天' },
    { key: '周易', label: '周易', meta: '课程主线 · 测算实践 · 陪练', course: '象数与解释边界', desc: '区分原文、传统注疏和现代解释，理解象数系统的文化与规则边界。', progress: '11 / 53 课', mastery: '58%', streak: '3 天' },
    { key: '占卜', label: '占卜', meta: '文化史 · 方法 · 边界', course: '占卜文本的历史语境', desc: '把占卜作为文化材料阅读，区分史料、方法与现代演绎。', progress: '3 / 16 课', mastery: '49%', streak: '2 天' },
  ];

  const state = {
    tab: new URLSearchParams(location.search).get('tab') || 'shop',
    workMode: workModes.some((mode) => mode.key === new URLSearchParams(location.search).get('mode'))
      ? new URLSearchParams(location.search).get('mode')
      : 'office',
    workPage: 'overview',
    subject: '党史',
    libraryOpen: false,
    libraryTab: 'discover',
    shopPage: new URLSearchParams(location.search).get('page') || 'overview',
    sheet: null,
    learningImmersive: false,
    toast: null,
    store: '杭州麦芽宠物生活馆',
  };

  function showToast(text) {
    state.toast = text;
    render();
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      state.toast = null;
      render();
    }, 2200);
  }

  function setTab(tab) {
    state.tab = tab;
    state.sheet = null;
    state.libraryOpen = false;
    history.replaceState(null, '', `?tab=${tab}${tab === 'shop' ? `&page=${state.shopPage}` : ''}${tab === 'work' ? `&mode=${state.workMode}` : ''}`);
    render();
  }

  function setWorkMode(mode) {
    const meta = workModes.find((item) => item.key === mode);
    if (!meta) return;
    state.sheet = null;
    state.libraryOpen = false;
    if (mode === 'shop') {
      state.tab = 'shop';
      state.shopPage = 'overview';
      history.replaceState(null, '', '?tab=shop&page=overview');
    } else {
      state.tab = 'work';
      state.workMode = mode;
      state.workPage = workModePages[mode]?.[0]?.[0] || 'overview';
      history.replaceState(null, '', `?tab=work&mode=${mode}`);
    }
    render();
  }

  function setWorkPage(page) {
    state.workPage = page;
    render();
  }

  function setShopPage(page) {
    state.tab = 'shop';
    state.shopPage = page;
    history.replaceState(null, '', `?tab=shop&page=${page}`);
    render();
  }

  function openSheet(name) {
    state.sheet = name;
    render();
  }

  function closeSheet() {
    state.sheet = null;
    render();
  }

  function topTitle() {
    if (state.libraryOpen) {
      const subtitles = { discover: '发现好书与课程原典', shelf: '已收藏与最近阅读', sources: '内置来源与自定义书源' };
      return ['图书馆', subtitles[state.libraryTab] || subtitles.discover];
    }
    if (state.tab === 'work') {
      const meta = workModes.find((item) => item.key === state.workMode) || workModes[0];
      const subs = {
        office: '今日 3 个任务 · 2 个需要处理',
        ops: '生产环境 · 2 个告警',
        sec: '授权范围内 · 风险分 72',
        learning: `${state.subject} · ${learningSubjects.find((item) => item.key === state.subject)?.progress || '继续学习'}`,
      };
      return [state.workMode === 'learning' ? state.subject : meta.label, subs[state.workMode] || meta.sub];
    }
    if (state.tab === 'shop') return ['店铺运营', state.store];
    if (state.tab === 'files') return ['文件', '本机与云端产物'];
    return ['我的', '本机管理员'];
  }

  function renderTopbar() {
    const [title, subtitle] = topTitle();
    const learningMode = state.tab === 'work' && state.workMode === 'learning';
    const titleAction = state.tab === 'shop' ? 'store-sheet' : learningMode && !state.libraryOpen ? 'subject-sheet' : 'mode-sheet';
    return `
      <div class="mobile-safe-top"><span>9:48</span><div class="mobile-status-icons"><span>5G</span><span>100%</span></div></div>
      <header class="mobile-topbar">
        ${state.libraryOpen
          ? `<button class="mobile-icon-btn" data-action="close-library" aria-label="返回学习">${icon('left', 19)}</button>`
          : `<button class="mobile-icon-btn" data-sheet="mode" aria-label="切换模式">${icon('menu', 19)}</button>`}
        <div class="mobile-topbar-main">
          <div class="mobile-title">
            <button data-action="${state.libraryOpen ? 'library-title' : titleAction}">${title} ${state.libraryOpen ? '' : icon('down', 14)}</button>
          </div>
          <div class="mobile-subtitle">${subtitle}</div>
        </div>
        ${learningMode && !state.libraryOpen ? `<button class="mobile-library-entry" data-action="open-library" aria-label="打开图书馆">${icon('book', 18)}<span>图书馆</span></button>` : ''}
        ${state.libraryOpen ? `<button class="mobile-icon-btn" data-sheet="library-search" aria-label="搜索图书馆">${icon('search', 19)}</button>` : ''}
        <button class="mobile-icon-btn" data-sheet="notifications" aria-label="通知">${icon('bell', 19)}</button>
        <button class="mobile-icon-btn" data-sheet="actions" aria-label="更多操作">${icon('more', 19)}</button>
      </header>
    `;
  }

  function renderSegment() {
    if (state.libraryOpen) return '';
    if (state.tab === 'shop') {
      return `<nav class="mobile-segment" aria-label="店铺页面">${shopPages.map(([key, label]) => `<button class="${state.shopPage === key ? 'active' : ''}" data-shop-page="${key}">${label}${key === 'orders' ? ' 18' : key === 'inventory' ? ' 6' : ''}</button>`).join('')}</nav>`;
    }
    if (state.tab === 'work') {
      const pages = workModePages[state.workMode] || [];
      return `<nav class="mobile-segment" aria-label="${workModes.find((item) => item.key === state.workMode)?.label || '工作'}页面">${pages.map(([key, label]) => `<button class="${state.workPage === key ? 'active' : ''}" data-work-page="${key}">${label}${key === 'alerts' ? ' 2' : key === 'findings' ? ' 5' : ''}</button>`).join('')}</nav>`;
    }
    return '';
  }

  function mobilePriorityRow(iconName, title, meta, badgeText, badgeTone, sheet) {
    return `<button class="mobile-priority-row" data-sheet="${sheet}"><span class="mobile-priority-icon">${icon(iconName, 15)}</span><span class="mobile-row-main"><span class="mobile-row-title">${title}</span><span class="mobile-row-meta">${meta}</span></span><span class="badge ${badgeTone}">${badgeText}</span>${icon('right', 14)}</button>`;
  }

  function renderShopOverview() {
    return `
      <div class="mobile-stack">
        <div class="mobile-greeting"><div><h1>今日运营</h1><p>11 月 17 日 · 数据更新于 09:48</p></div></div>
        <div class="mobile-kpis"><div class="mobile-kpi"><span>销售额</span><strong>¥28.4k</strong><small>+12.4%</small></div><div class="mobile-kpi"><span>订单</span><strong>126</strong><small>+18 单</small></div><div class="mobile-kpi"><span>待发货</span><strong style="color:var(--amber)">18</strong><small style="color:var(--danger)">4 单超时</small></div></div>
        <div class="mobile-card"><div class="mobile-card-head"><h2>现在需要你处理</h2><span class="badge warn">4 项</span></div>${mobilePriorityRow('truck', '18 单待发货', '4 单将在 2 小时后超时', '处理', 'warn', 'order')}${mobilePriorityRow('alert', '6 个 SKU 低于安全库存', 'HO-002 只够 1.8 天', '补货', 'danger', 'inventory')}${mobilePriorityRow('refresh', 'Amazon 同步失败', '授权已过期', '重试', 'danger', 'notifications')}</div>
        <div class="mobile-ai-insight"><div class="ai-line">${icon('sparkles', 15)} AI 今日摘要</div><p>销售额高于近 7 日均值 12%，增量主要来自 HO-001。HO-002 库存只够 1.8 天，建议先补货再追加投放。</p></div>
        <div class="mobile-card"><div class="mobile-card-head"><h2>最近订单</h2><button class="button soft" data-shop-page="orders">查看全部</button></div>${mobileOrderRow('SO-1042', '林** · 胡桃木猫爬架', '¥329.00', '待发货', 'warn')}${mobileOrderRow('SO-1041', '周** · 云朵宠物窝', '¥188.00', '运输中', 'info')}</div>
      </div>
    `;
  }

  function mobileOrderRow(no, meta, amount, statusText, tone) {
    return `<button class="mobile-order-row" data-sheet="order"><span class="mobile-row-main"><span class="mobile-row-title">${no} · ${amount}</span><span class="mobile-row-meta">${meta}</span></span><span class="badge ${tone}">${statusText}</span>${icon('right', 14)}</button>`;
  }

  function renderShopProducts() {
    return `
      <div class="mobile-stack">
        <div class="toolbar-row"><label class="search-field" style="height:42px">${icon('search', 16)}<input placeholder="搜索 SKU、标题或货源"></label><button class="button square" data-sheet="filter">${icon('filter', 16)}</button></div>
        <div class="filter-row"><button class="chip active">全部 128</button><button class="chip">在售 96</button><button class="chip">草稿 14</button><button class="chip">低库存 12</button></div>
        <div class="mobile-card">${mobileProductRow('HO-001', '胡桃木猫爬架', '成本 ¥129 · 库存 12', '¥329', '在售', 'accent')}${mobileProductRow('HO-002', '云朵宠物窝', '成本 ¥68 · 库存 3', '¥189', '低库存', 'danger')}${mobileProductRow('HO-003', '可拆洗猫抓板', '自营 · 库存 0', '¥79', '缺货', 'danger')}${mobileProductRow('HO-004', '智能饮水机', '1688 · 草稿', '¥269', '草稿', 'warn')}</div>
      </div>
    `;
  }

  function mobileProductRow(sku, title, meta, price, statusText, tone) {
    return `<button class="mobile-product-row" data-sheet="product"><span class="product-thumb">${sku.slice(-3)}</span><span class="mobile-row-main"><span class="mobile-row-title">${title}</span><span class="mobile-row-meta">${sku} · ${meta}</span></span><span style="text-align:right"><strong style="display:block;font-size:13px">${price}</strong><span class="badge ${tone}" style="margin-top:3px">${statusText}</span></span>${icon('right', 14)}</button>`;
  }

  function renderShopOrders() {
    return `
      <div class="mobile-stack">
        <div class="toolbar-row"><label class="search-field" style="height:42px">${icon('search', 16)}<input placeholder="搜索订单号或买家"></label><button class="button square" data-sheet="filter">${icon('filter', 16)}</button></div>
        <div class="filter-row"><button class="chip active">全部 126</button><button class="chip">待发货 18</button><button class="chip">待采购 4</button><button class="chip">运输中 36</button><button class="chip">退款 2</button></div>
        <div class="mobile-card">${mobileOrderRow('SO-1042', '林** · 胡桃木猫爬架 · 09:42', '¥329.00', '待发货', 'warn')}${mobileOrderRow('SO-1041', '周** · 云朵宠物窝 · 09:30', '¥188.00', '运输中', 'info')}${mobileOrderRow('SO-1040', '陈** · 猫爬架 + 猫抓板 · 09:12', '¥568.00', '待采购', 'warn')}${mobileOrderRow('SO-1039', '吴** · 可拆洗猫抓板 · 08:58', '¥99.00', '已完成', 'accent')}${mobileOrderRow('SO-1038', '赵** · 折叠航空箱 · 08:41', '¥229.00', '退款中', 'danger')}</div>
        <div class="mobile-error">${icon('alert', 18)}<span><strong>1 单地址异常</strong><br>发送前需要补充街道门牌号。</span></div>
      </div>
    `;
  }

  function renderShopShipments() {
    return `
      <div class="mobile-stack">
        <div class="mobile-kpis" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="mobile-kpi"><span>待揽收</span><strong>8</strong><small style="color:var(--amber)">平均 1.4h</small></div><div class="mobile-kpi"><span>异常</span><strong style="color:var(--danger)">2</strong><small style="color:var(--danger)">地址 1 · 超时 1</small></div></div>
        <div class="mobile-card"><div class="mobile-card-head"><h2>发货单</h2><span class="badge warn">2 个异常</span></div><button class="mobile-priority-row" data-sheet="order"><span class="mobile-priority-icon">${icon('truck', 15)}</span><span class="mobile-row-main"><span class="mobile-row-title">SF1498221032 · SO-1042</span><span class="mobile-row-meta">顺丰 · 运输中 · 09:18 到达南山营业点</span></span>${icon('right', 14)}</button><button class="mobile-priority-row" data-sheet="order"><span class="mobile-priority-icon" style="background:var(--danger-soft);color:var(--danger)">${icon('alert', 15)}</span><span class="mobile-row-main"><span class="mobile-row-title">SF1498221001 · SO-1021</span><span class="mobile-row-meta">顺丰 · 地址异常 · 需要补充门牌号</span></span><span class="badge danger">异常</span></button></div>
        <button class="button primary" style="min-height:46px" data-sheet="shipment">${icon('plus', 16)} 创建发货</button>
      </div>
    `;
  }

  function renderShopInventory() {
    return `
      <div class="mobile-stack">
        <div class="mobile-error" style="border-color:color-mix(in srgb,var(--amber) 28%,var(--line));background:var(--amber-soft);color:var(--amber)">${icon('alert', 18)}<span><strong>3 个主推 SKU 低于安全库存</strong><br>HO-002 预计 1.8 天售罄。</span></div>
        <div class="toolbar-row"><label class="search-field" style="height:42px">${icon('search', 16)}<input placeholder="搜索 SKU 或商品"></label><button class="button square" data-sheet="filter">${icon('filter', 16)}</button></div>
        <div class="mobile-card"><div class="mobile-card-head"><h2>库存明细</h2><span class="badge">本地业务库</span></div>${mobileProductRow('HO-001', '胡桃木猫爬架', '安全库存 10', '12 件', '正常', 'accent')}${mobileProductRow('HO-002', '云朵宠物窝', '安全库存 12', '3 件', '低库存', 'danger')}${mobileProductRow('HO-003', '可拆洗猫抓板', '安全库存 8', '0 件', '缺货', 'danger')}</div>
        <button class="button" style="min-height:46px" data-sheet="inventory">${icon('plus', 16)} 入库 / 出库 / 盘点</button>
      </div>
    `;
  }

  function renderShopMore() {
    const rows = [
      ['truck', '物流与承运商', '顺丰、云途 · 1 个未连接', '物流'],
      ['shield', '操作日志', '最近 12 条人工与 AI 操作', '审计'],
      ['file', '口径速查', '销售额、待发货与毛利率定义', '口径'],
      ['external', '平台后台', '打开淘宝卖家中心', '平台'],
      ['refresh', '同步任务', '1 个异常，2 个排队', '同步'],
    ];
    return `<div class="mobile-stack"><div class="mobile-card"><div class="mobile-card-head"><h2>履约与经营</h2></div>${rows.map(([ic, title, meta, badgeText]) => `<button class="mobile-priority-row" data-action="more-item"><span class="mobile-priority-icon">${icon(ic, 15)}</span><span class="mobile-row-main"><span class="mobile-row-title">${title}</span><span class="mobile-row-meta">${meta}</span></span><span class="badge">${badgeText}</span>${icon('right', 14)}</button>`).join('')}</div><div class="mobile-card"><div class="mobile-card-head"><h2>当前店铺</h2></div><button class="mobile-settings-row" data-sheet="store"><span class="product-thumb">淘</span><span>${state.store}<small>淘宝 · 生产 · 有货源</small></span>${icon('right', 14)}</button></div></div>`;
  }

  function renderOpsPage() {
    if (state.workPage === 'alerts') {
      return `<div class="mobile-stack"><div class="mobile-card"><div class="mobile-card-head"><h2>活跃告警</h2><span class="badge danger">2 严重</span></div>${mobilePriorityRow('alert', '订单服务 P95 超过 2s', 'prod · 已持续 8 分钟 · 影响结算', '严重', 'danger', 'actions')}${mobilePriorityRow('alert', '同步队列积压 1,284 条', 'worker-03 · 自动扩容中', '警告', 'warn', 'actions')}</div><div class="mobile-ai-insight"><div class="ai-line">${icon('sparkles', 15)} AI 初步归因</div><p>订单服务延迟与数据库连接池耗尽高度相关。建议先扩容连接池，再回放慢查询样本。</p></div></div>`;
    }
    if (state.workPage === 'releases') {
      return `<div class="mobile-stack"><div class="mobile-section-title"><h2>待发布</h2><span class="spacer"></span><span class="badge accent">2</span></div><div class="mobile-card">${mobilePriorityRow('package', 'shop-api v2.8.4', '3 个提交 · 通过全部测试', '可发布', 'accent', 'actions')}${mobilePriorityRow('package', 'desktop-shell v0.1.2', '等待安全审查', '待批', 'warn', 'actions')}</div><div class="mobile-card"><div class="mobile-card-head"><h2>最近发布</h2></div><div class="mobile-task-card" style="border:0;border-radius:0"><div class="mobile-task-head"><span class="mobile-priority-icon">${icon('check', 14)}</span><span class="mobile-task-title">shop-api v2.8.3</span><span class="badge accent">成功</span></div><div class="mobile-task-meta">今天 08:42 · 灰度 20% → 100%</div></div></div></div>`;
    }
    if (state.workPage === 'approvals') {
      return `<div class="mobile-stack"><div class="mobile-card"><div class="mobile-card-head"><h2>等待审批</h2><span class="badge warn">3</span></div>${mobilePriorityRow('shield', '生产数据库变更', '添加订单同步索引 · 预计 2 分钟锁表', '高风险', 'danger', 'actions')}${mobilePriorityRow('package', '发布 desktop-shell v0.1.2', '安全扫描已完成 · 0 高危', '普通', 'warn', 'actions')}</div><div style="display:flex;gap:8px"><button class="button" style="flex:1;min-height:46px">拒绝</button><button class="button primary" style="flex:1;min-height:46px">批准变更</button></div></div>`;
    }
    return `<div class="mobile-stack"><div class="mobile-greeting"><div><h1>生产环境</h1><p>运行正常 · 2 个告警需要关注</p></div></div><div class="mobile-kpis"><div class="mobile-kpi"><span>可用性</span><strong>99.97%</strong><small>近 24h</small></div><div class="mobile-kpi"><span>P95</span><strong>428ms</strong><small style="color:var(--amber)">较昨日 +18%</small></div><div class="mobile-kpi"><span>告警</span><strong style="color:var(--danger)">2</strong><small>1 严重</small></div></div><div class="mobile-card"><div class="mobile-card-head"><h2>服务状态</h2><span class="badge accent">运行中</span></div>${mobilePriorityRow('server', 'order-service', '3/3 实例健康 · P95 1.8s', '降级', 'warn', 'actions')}${mobilePriorityRow('server', 'sync-worker', '队列积压 1,284 · 扩容中', '警告', 'warn', 'actions')}${mobilePriorityRow('server', 'web-gateway', '6/6 实例健康', '正常', 'accent', 'actions')}</div><div class="mobile-ai-insight"><div class="ai-line">${icon('sparkles', 15)} 今日建议</div><p>先处理订单服务延迟和同步队列。其余服务稳定，不建议同时发布非紧急变更。</p></div></div>`;
  }

  function renderSecPage() {
    if (state.workPage === 'findings') {
      return `<div class="mobile-stack"><div class="mobile-card"><div class="mobile-card-head"><h2>风险项</h2><span class="badge danger">2 高</span></div>${mobilePriorityRow('shield', '网关 TLS 配置弱', '高风险 · 允许 TLS 1.0', '修复', 'danger', 'actions')}${mobilePriorityRow('shield', '对象存储公开读权限', '高风险 · 3 个文件可匿名访问', '隔离', 'danger', 'actions')}${mobilePriorityRow('alert', '依赖版本过期', '中风险 · fast-xml-parser 2.3.1', '升级', 'warn', 'actions')}</div><div class="mobile-ai-insight"><div class="ai-line">${icon('shield', 15)} 授权边界</div><p>当前任务只覆盖 192.168.10.0/24。移动端可查看与确认修复，不能扩大扫描范围。</p></div></div>`;
    }
    if (state.workPage === 'scans') {
      return `<div class="mobile-stack"><div class="mobile-card"><div class="mobile-card-head"><h2>扫描任务</h2><span class="badge accent">运行中</span></div><div class="mobile-task-card" style="border:0;border-radius:0"><div class="mobile-task-head"><span class="mobile-priority-icon">${icon('shield', 14)}</span><span class="mobile-task-title">授权资产基线扫描</span><span class="badge accent">68%</span></div><div class="mobile-task-meta">已检查 34 / 50 个资产 · 预计 6 分钟</div><div class="progress" style="margin-top:8px"><i style="width:68%"></i></div></div>${mobilePriorityRow('clock', '依赖漏洞检查', '上次完成 10:20 · 5 个风险', '查看', 'accent', 'actions')}</div><button class="button danger" style="min-height:46px">${icon('x', 16)} 紧急停止扫描</button></div>`;
    }
    if (state.workPage === 'reports') {
      return `<div class="mobile-stack"><div class="mobile-file-grid"><button class="mobile-file-card"><span class="mobile-file-icon" style="background:var(--danger-soft);color:var(--danger)">${icon('shield', 17)}</span><strong>周度安全评估.pdf</strong><span>今天 09:10 · 2 高危</span></button><button class="mobile-file-card"><span class="mobile-file-icon">${icon('file', 17)}</span><strong>主机加固基线.md</strong><span>昨天 · 38 项</span></button></div><div class="mobile-card"><div class="mobile-card-head"><h2>报告设置</h2></div><button class="mobile-settings-row"><span>自动脱敏</span><span class="badge accent">开启</span></button><button class="mobile-settings-row"><span>高危即时通知</span><span class="badge accent">开启</span></button></div></div>`;
    }
    return `<div class="mobile-stack"><div class="mobile-greeting"><div><h1>安全态势</h1><p>授权范围 50 个资产 · 最近更新 09:42</p></div></div><div class="mobile-kpis"><div class="mobile-kpi"><span>风险分</span><strong>72</strong><small style="color:var(--amber)">需关注</small></div><div class="mobile-kpi"><span>高危</span><strong style="color:var(--danger)">2</strong><small>待修复</small></div><div class="mobile-kpi"><span>扫描</span><strong>68%</strong><small>运行中</small></div></div><div class="mobile-card"><div class="mobile-card-head"><h2>需要你确认</h2><span class="badge danger">2</span></div>${mobilePriorityRow('shield', '隔离公开读对象存储', '影响 3 个文件 · 已生成变更单', '确认', 'danger', 'actions')}${mobilePriorityRow('alert', '升级 fast-xml-parser', '低风险依赖更新 · 兼容测试通过', '批准', 'warn', 'actions')}</div><div class="mobile-ai-insight"><div class="ai-line">${icon('sparkles', 15)} 安全摘要</div><p>本周新发现 5 项风险，其中 2 项高危。没有发现未授权资产，所有动作均记录审计。</p></div></div>`;
  }

  function renderLearningMode() {
    const subject = learningSubjects.find((item) => item.key === state.subject) || learningSubjects[0];
    if (state.workPage === 'review') {
      return `<div class="mobile-stack"><div class="mobile-greeting"><div><h1>${subject.key} · 今日复习</h1><p>12 个薄弱点 · 预计 9 分钟</p></div></div><div class="mobile-card"><div class="mobile-card-head"><h2>优先复习</h2><span class="badge warn">12</span></div>${mobilePriorityRow('refresh', `${subject.course}：关键概念`, `${subject.key} · 掌握度 42%`, '复习', 'warn', 'actions')}${mobilePriorityRow('refresh', `${subject.key}高频错误`, '概念辨析 · 掌握度 55%', '复习', 'warn', 'actions')}${mobilePriorityRow('refresh', '闭卷自测', '间隔复习 · 今天到期', '复习', 'accent', 'actions')}</div><button class="button primary" style="min-height:46px" data-action="learning-immersive">${icon('play', 16)} 开始 9 分钟复习</button></div>`;
    }
    if (state.workPage === 'practice') {
      return `<div class="mobile-stack"><div class="mobile-greeting"><div><h1>${subject.key} · 训练</h1><p>把概念放进可操作的练习里</p></div></div><div class="mobile-card"><div class="mobile-card-head"><h2>今日训练</h2></div>${mobilePriorityRow('book', '概念辨析 10 题', '约 6 分钟 · 适合当前进度', '开始', 'accent', 'actions')}${mobilePriorityRow('message', '闭卷复述', '用自己的话解释“${subject.course}”', '练习', 'warn', 'actions')}${mobilePriorityRow('refresh', '错题回炉', '3 个近期薄弱点', '复习', 'warn', 'actions')}</div></div>`;
    }
    return `<div class="mobile-stack"><div class="mobile-ai-insight" style="background:linear-gradient(135deg,var(--accent),#315b74);color:#fff;border:0"><div class="ai-line" style="color:rgba(255,255,255,.82)">${icon('book', 15)} ${subject.meta}</div><h1 style="margin:8px 0 5px;font-size:23px;color:#fff">${subject.course}</h1><p style="color:rgba(255,255,255,.8)">${subject.desc}</p><button class="button" style="margin-top:10px;background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.2);color:#fff" data-action="learning-immersive">继续学习 · 下一步</button></div><div class="mobile-kpis"><div class="mobile-kpi"><span>进度</span><strong>${subject.progress.split(' / ')[0]}</strong><small>${subject.progress}</small></div><div class="mobile-kpi"><span>掌握度</span><strong>${subject.mastery}</strong><small>本地进度</small></div><div class="mobile-kpi"><span>连续</span><strong>${subject.streak}</strong><small>保持中</small></div></div><div class="mobile-card"><div class="mobile-card-head"><h2>课程阶段</h2><button class="button soft">全部课程</button></div>${mobilePriorityRow('book', '当前阶段 01', '核心概念与基础框架', '进行中', 'accent', 'actions')}${mobilePriorityRow('book', '当前阶段 02', '方法、案例与练习', '待学', 'warn', 'actions')}</div></div>`;
  }

  const libraryBooks = [
    ['经典名著', '《红楼梦》导读', '曹雪芹 · 公版', '公共领域', 'accent'],
    ['志怪小说', '《聊斋志异》选读', '蒲松龄 · 公版', '公共领域', 'accent'],
    ['课程原典', '党史重要文献选读', '课程原典 · 12 章', '课程材料', 'info'],
    ['经济学', '经济学通识', '馆藏借阅', '可借阅', 'warn'],
    ['网络小说', '长夜行舟', '官方授权平台', '外部阅读', 'default'],
    ['漫画', '山海小品', '公版档案', '档案预览', 'accent'],
  ];

  function renderLibrary() {
    const tabs = [['discover', '发现'], ['shelf', '书架'], ['sources', '书源']];
    let body = '';
    if (state.libraryTab === 'shelf') {
      body = `<div class="mobile-card"><div class="mobile-card-head"><h2>继续阅读</h2><span class="badge accent">3</span></div>${mobilePriorityRow('book', '《论持久战》导读', '第 4 / 9 章 · 3 分钟前', '继续', 'accent', 'book')}${mobilePriorityRow('book', '《红楼梦》导读', '第 12 / 40 章 · 昨天', '继续', 'accent', 'book')}</div><div class="mobile-card"><div class="mobile-card-head"><h2>我的书架</h2><span class="badge">8</span></div>${libraryBooks.slice(0, 4).map((book) => mobilePriorityRow('book', book[1], `${book[2]} · ${book[3]}`, '详情', book[4] === 'danger' ? 'danger' : 'accent', 'book')).join('')}</div>`;
    } else if (state.libraryTab === 'sources') {
      body = `<div class="mobile-card"><div class="mobile-card-head"><h2>内置书源</h2><span class="badge accent">4</span></div>${mobilePriorityRow('shield', '公共领域馆藏', '经典名著 · 志怪小说 · 漫画档案', '可用', 'accent', 'actions')}${mobilePriorityRow('external', '官方授权平台', '网络小说 · 跳转官方入口', '可用', 'info', 'actions')}${mobilePriorityRow('book', '课程原典', '与学习科目内容联动', '可用', 'accent', 'actions')}</div><div class="mobile-card"><div class="mobile-card-head"><h2>自定义书源</h2><button class="button soft" data-sheet="library-search">添加</button></div><button class="mobile-settings-row"><span>${icon('external', 18)}</span><span>个人 OPDS / RSS 书源</span><small>仅接受 HTTPS</small>${icon('right', 14)}</button></div>`;
    } else {
      body = `<label class="search-field" style="height:44px" data-sheet="library-search">${icon('search', 16)}<input placeholder="搜索书名、作者或课程原典" readonly></label><div class="filter-row"><button class="chip active">全部</button><button class="chip">经典名著</button><button class="chip">志怪小说</button><button class="chip">网络小说</button><button class="chip">漫画</button><button class="chip">课程原典</button></div><div class="mobile-card">${libraryBooks.map((book) => `<button class="mobile-product-row" data-sheet="book"><span class="product-thumb">${book[1].replace(/[《》]/g, '').slice(0, 1)}</span><span class="mobile-row-main"><span class="mobile-row-title">${book[1]}</span><span class="mobile-row-meta">${book[0]} · ${book[2]}</span></span><span class="badge ${book[4]}">${book[3]}</span>${icon('right', 14)}</button>`).join('')}</div>`;
    }
    return `<nav class="mobile-segment" style="margin-top:0">${tabs.map(([key, label]) => `<button class="${state.libraryTab === key ? 'active' : ''}" data-library-tab="${key}">${label}</button>`).join('')}</nav><div class="mobile-stack">${body}</div>`;
  }

  function renderOfficePage() {
    if (state.workPage === 'tasks') return `<div class="mobile-stack"><div class="mobile-section-title"><h2>我的任务</h2><span class="spacer"></span><span class="badge accent">3</span></div><div class="mobile-card">${mobilePriorityRow('file', '整理周报', '今天 17:00 前 · 来自会议纪要', '进行中', 'accent', 'actions')}${mobilePriorityRow('chart', '核对月度费用', '待确认 4 条报销异常', '待处理', 'warn', 'actions')}${mobilePriorityRow('message', '起草项目同步邮件', '等待收件人名单', '待输入', 'warn', 'actions')}</div><button class="button primary" style="min-height:46px" data-sheet="ai">${icon('sparkles', 16)} 派给 AI</button></div>`;
    if (state.workPage === 'outputs') return `<div class="mobile-stack"><div class="mobile-file-grid"><button class="mobile-file-card"><span class="mobile-file-icon">${icon('file', 17)}</span><strong>项目周报.docx</strong><span>今天 09:12 · 2.1 MB</span></button><button class="mobile-file-card"><span class="mobile-file-icon">${icon('chart', 17)}</span><strong>费用核对表.xlsx</strong><span>昨天 · 7 个工作表</span></button><button class="mobile-file-card"><span class="mobile-file-icon">${icon('message', 17)}</span><strong>会议纪要.md</strong><span>11-16 · 18 条待办</span></button><button class="mobile-file-card"><span class="mobile-file-icon">${icon('book', 17)}</span><strong>培训材料.pdf</strong><span>11-15 · 36 页</span></button></div><button class="button" style="min-height:46px">${icon('folder', 16)} 打开全部文件</button></div>`;
    return `<div class="mobile-stack"><div class="mobile-greeting"><div><h1>上午好，Y</h1><p>今天 3 个任务，2 个需要你处理。</p></div></div><button class="mobile-ai-insight" style="text-align:left" data-sheet="ai"><div class="ai-line">${icon('sparkles', 15)} 问 AI 或直接派活</div><p>例如：把今天的会议记录整理成周报，并列出待办和负责人。</p></button><div class="mobile-card"><div class="mobile-card-head"><h2>正在处理</h2><span class="badge accent">3</span></div><div class="mobile-task-card" style="border:0;border-radius:0"><div class="mobile-task-head"><span class="mobile-priority-icon">${icon('file', 14)}</span><span class="mobile-task-title">整理项目周报</span><span class="badge accent">进行中</span></div><div class="mobile-task-meta">已汇总 4 份会议纪要 · 步骤 3/5</div><div class="progress" style="margin-top:8px"><i style="width:60%"></i></div></div>${mobilePriorityRow('chart', '核对月度费用', '4 条报销异常待确认', '处理', 'warn', 'actions')}${mobilePriorityRow('message', '客户项目同步邮件', '等待确认发件人署名', '填写', 'warn', 'actions')}</div><div class="mobile-ai-insight"><div class="ai-line">${icon('sparkles', 15)} 今日建议</div><p>先处理费用异常，再发送客户邮件。周报可在下午 16:30 自动生成初稿。</p></div></div>`;
  }

  function renderWorkModeContent() {
    if (state.workMode === 'ops') return renderOpsPage();
    if (state.workMode === 'sec') return renderSecPage();
    if (state.workMode === 'learning') return renderLearningMode();
    return renderOfficePage();
  }

  function renderFiles() {
    return `
      <div class="mobile-stack">
        <div class="toolbar-row"><label class="search-field" style="height:42px">${icon('search', 16)}<input placeholder="搜索文件或产物"></label><button class="button square">${icon('plus', 16)}</button></div>
        <div class="mobile-section-title"><h2>最近产物</h2><span class="spacer"></span><span class="badge">12</span></div>
        <div class="mobile-file-grid"><button class="mobile-file-card"><span class="mobile-file-icon">${icon('chart', 17)}</span><strong>11 月订单毛利分析.xlsx</strong><span>刚刚 · 184 KB</span></button><button class="mobile-file-card"><span class="mobile-file-icon">${icon('file', 17)}</span><strong>SO-1042 异常处理报告.docx</strong><span>12 分钟前 · 36 KB</span></button><button class="mobile-file-card"><span class="mobile-file-icon">${icon('folder', 17)}</span><strong>商品 Listing 素材</strong><span>24 个文件 · 今天</span></button><button class="mobile-file-card"><span class="mobile-file-icon">${icon('clipboard', 17)}</span><strong>客户话术合集</strong><span>来自剪贴板 · 18 条</span></button></div>
        <div class="mobile-card"><div class="mobile-card-head"><h2>工作空间</h2></div><button class="mobile-settings-row"><span>${icon('folder', 18)}</span><span>家居出海<small>C:\Projects\home-export</small></span><span class="badge accent">当前</span></button><button class="mobile-settings-row"><span>${icon('folder', 18)}</span><span>个人工作台<small>本机目录</small></span>${icon('right', 14)}</button></div>
      </div>
    `;
  }

  function renderMine() {
    return `
      <div class="mobile-stack">
        <div class="mobile-profile-head"><span class="mobile-avatar">Y</span><div style="flex:1"><strong style="font-size:16px">本机管理员</strong><div class="mobile-row-meta">guest · 单机工作区</div></div><span class="badge accent">本机</span></div>
        <div class="mobile-settings-list"><button class="mobile-settings-row" data-sheet="notifications"><span>${icon('bell', 18)}</span><span>通知与提醒</span><small>只留需要输入</small>${icon('right', 14)}</button><button class="mobile-settings-row" data-action="theme"><span>${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', 18)}</span><span>主题</span><small>${document.documentElement.dataset.theme === 'dark' ? '深色' : '浅色'}</small>${icon('right', 14)}</button><button class="mobile-settings-row" data-sheet="actions"><span>${icon('paw', 18)}</span><span>桌面宠物</span><small>Boba · 等待输入</small>${icon('right', 14)}</button><button class="mobile-settings-row"><span>${icon('clipboard', 18)}</span><span>超级剪贴板</span><small>500 条</small>${icon('right', 14)}</button><button class="mobile-settings-row"><span>${icon('command', 18)}</span><span>键盘与手势</span>${icon('right', 14)}</button></div>
        <div class="mobile-settings-list"><button class="mobile-settings-row"><span>${icon('shield', 18)}</span><span>授权与安全</span><span class="badge accent">正常</span>${icon('right', 14)}</button><button class="mobile-settings-row"><span>${icon('settings', 18)}</span><span>全部设置</span>${icon('right', 14)}</button></div>
        <div class="mobile-settings-list"><button class="mobile-settings-row"><span>${icon('book', 18)}</span><span>学习计划</span><span class="badge">7 天连续</span>${icon('right', 14)}</button><button class="mobile-settings-row" data-action="learning-immersive"><span>${icon('play', 18)}</span><span>继续学习</span><small>遵义会议 · 步骤 2/4</small>${icon('right', 14)}</button></div>
      </div>
    `;
  }

  function renderStickyAction() {
    if (state.tab === 'work') {
      const actions = {
        office: ['3 个任务', '问 AI 处理', 'ai', 'sparkles'],
        ops: ['2 个告警', '处理告警', 'actions', 'alert'],
        sec: ['2 个高危', '查看风险', 'actions', 'shield'],
        learning: ['今日 12 项复习', '开始复习', 'learning', 'play'],
      }[state.workMode];
      if (actions) {
        const [note, label, target, ic] = actions;
        const attr = target === 'learning' ? 'data-action="learning-immersive"' : target === 'ai' ? 'data-sheet="ai"' : 'data-sheet="actions"';
        return `<div class="mobile-sticky-action"><span class="mobile-sticky-note">${note}<br>${state.workMode === 'learning' ? '预计 9 分钟' : '需要你处理'}</span><button class="button primary" ${attr}>${icon(ic, 17)} ${label}</button></div>`;
      }
      return '';
    }
    if (state.tab !== 'shop') return '';
    if (state.shopPage === 'products') return `<div class="mobile-sticky-action"><span class="mobile-sticky-note">128 个商品 · 6 个缺货</span><button class="button primary" data-sheet="product">${icon('plus', 17)} 新建商品</button></div>`;
    if (state.shopPage === 'orders') return `<div class="mobile-sticky-action"><span class="mobile-sticky-note">18 单待发货<br>4 单即将超时</span><button class="button primary" data-sheet="order">${icon('truck', 17)} 处理待发货</button></div>`;
    if (state.shopPage === 'shipments') return `<div class="mobile-sticky-action"><span class="mobile-sticky-note">2 个异常<br>地址 1 · 超时 1</span><button class="button primary" data-sheet="shipment">${icon('plus', 17)} 创建发货</button></div>`;
    if (state.shopPage === 'inventory') return `<div class="mobile-sticky-action"><span class="mobile-sticky-note">3 个主推 SKU<br>低于安全库存</span><button class="button primary" data-sheet="inventory">${icon('boxes', 17)} 调整库存</button></div>`;
    if (state.shopPage === 'more') return '';
    return `<div class="mobile-sticky-action"><span class="mobile-sticky-note">4 项待办<br>最高：待发货</span><button class="button primary" data-sheet="ai">${icon('sparkles', 17)} 问 AI 怎么处理</button></div>`;
  }

  function renderContent() {
    if (state.tab === 'work') return renderWorkModeContent();
    if (state.tab === 'shop') {
      const pages = {
        overview: renderShopOverview,
        products: renderShopProducts,
        orders: renderShopOrders,
        shipments: renderShopShipments,
        inventory: renderShopInventory,
        more: renderShopMore,
      };
      return (pages[state.shopPage] || renderShopOverview)();
    }
    if (state.tab === 'files') return renderFiles();
    return renderMine();
  }

  function renderBottomNav() {
    return `<nav class="mobile-bottom-nav" aria-label="主导航">${tabs.map(([key, label, ic]) => `<button class="mobile-nav-item ${state.tab === key ? 'active' : ''}" data-tab="${key}">${icon(ic, 20)}<span>${label}</span></button>`).join('')}</nav>`;
  }

  function renderBase() {
    if (state.learningImmersive) {
      return `
        <div class="mobile-screen immersive-only">
          ${renderLearningImmersive()}
          ${state.toast ? `<div class="mobile-toast">${icon('check', 16)}<span>${state.toast}</span></div>` : ''}
        </div>
      `;
    }
    return `
      <div class="mobile-screen">
        ${renderTopbar()}
        <main class="mobile-content ${!state.libraryOpen && (state.tab === 'work' || (state.tab === 'shop' && state.shopPage !== 'more')) ? 'has-sticky-action' : ''}">
          ${state.libraryOpen ? renderLibrary() : `${renderSegment()}${renderContent()}`}
        </main>
        ${state.libraryOpen ? '' : renderStickyAction()}
        ${renderBottomNav()}
        ${renderSheet()}
        ${state.toast ? `<div class="mobile-toast">${icon('check', 16)}<span>${state.toast}</span></div>` : ''}
      </div>
    `;
  }

  function sheetFrame(title, body, footer = '', options = {}) {
    return `<div class="sheet-backdrop" data-action="close-sheet"><section class="bottom-sheet" style="${options.height ? `max-height:${options.height}` : ''}"><div class="sheet-handle"></div><header class="sheet-head"><h2>${title}</h2><button class="mobile-icon-btn" data-action="close-sheet" aria-label="关闭抽屉">${icon('x', 20)}</button></header><div class="sheet-body">${body}</div>${footer ? `<footer class="sheet-footer">${footer}</footer>` : ''}</section></div>`;
  }

  function renderSheet() {
    if (!state.sheet) return '';
    if (state.sheet === 'mode') {
      const primary = workModes.filter((mode) => mode.primary);
      const isCurrent = (mode) => (mode.key === 'shop' ? state.tab === 'shop' : state.tab === 'work' && state.workMode === mode.key);
      const option = (mode) => `<button class="sheet-option" data-work-mode="${mode.key}">${icon(mode.icon, 20)}<span><strong style="display:block">${mode.label}</strong><small style="color:var(--muted)">${mode.sub}</small></span><span class="spacer"></span>${isCurrent(mode) ? icon('check', 18) : icon('right', 16)}</button>`;
      return sheetFrame('切换工作模式', `<div class="mobile-review-label">移动端模式</div>${primary.map(option).join('')}`, '', { height: '70%' });
    }
    if (state.sheet === 'subject') {
      return sheetFrame('切换学习科目', learningSubjects.map((subject) => `<button class="sheet-option" data-subject="${subject.key}"><span class="product-thumb">${subject.key.slice(0, 1)}</span><span><strong style="display:block">${subject.label}</strong><small style="color:var(--muted)">${subject.meta}</small></span><span class="spacer"></span>${state.subject === subject.key ? icon('check', 18) : icon('right', 16)}</button>`).join(''), '', { height: '72%' });
    }
    if (state.sheet === 'library-search') {
      return sheetFrame('搜索图书馆', `<label class="search-field" style="height:48px">${icon('search', 18)}<input autofocus placeholder="书名、作者、ISBN 或课程原典"></label><div class="mobile-section-title"><h2>热门分类</h2></div><div class="filter-row"><button class="chip">经典名著</button><button class="chip">志怪小说</button><button class="chip">网络小说</button><button class="chip">漫画</button><button class="chip">课程原典</button></div>`, '', { height: '46%' });
    }
    if (state.sheet === 'book') {
      const book = libraryBooks[0];
      return sheetFrame(book[1], `<div style="display:flex;gap:12px;align-items:flex-start"><span class="product-thumb" style="width:66px;height:88px;font-size:22px">红</span><div><span class="badge ${book[4]}">${book[3]}</span><div style="margin-top:7px;color:var(--muted);font-size:11px">${book[0]} · ${book[2]}</div><div style="margin-top:5px;color:var(--muted);font-size:11px">来源与许可：公共领域馆藏</div></div></div><div class="mobile-field" style="margin-top:16px"><label>内容简介</label><textarea readonly>从家族结构、人物关系和时代背景进入经典文本，配合课程原典与阅读任务。</textarea></div><div class="mobile-card"><div class="mobile-settings-row"><span>阅读进度</span><small>第 12 / 40 章</small></div><div class="mobile-settings-row"><span>阅读方式</span><small>应用内阅读</small></div></div>`, `<button class="button primary" data-action="read-book">${icon('book', 18)} 继续阅读</button>`, { height: '76%' });
    }
    if (state.sheet === 'store') {
      const stores = [
        ['杭州麦芽宠物生活馆', '淘宝 · 生产 · 有货源'],
        ['Malt Pets US', 'Amazon · 生产 · 有货源'],
        ['宠物用品测试店', '拼多多 · 测试 · 无货源'],
      ];
      return sheetFrame('切换店铺', stores.map(([name, meta]) => `<button class="sheet-option" data-action="pick-store" data-store="${name}"><span class="product-thumb">店</span><span><strong style="display:block">${name}</strong><small style="color:var(--muted)">${meta}</small></span><span class="spacer"></span>${state.store === name ? icon('check', 18) : ''}</button>`).join(''));
    }
    if (state.sheet === 'filter') {
      return sheetFrame('筛选', `<div class="mobile-field"><label>订单状态</label><div class="filter-row"><button class="chip active">待发货</button><button class="chip">运输中</button><button class="chip">退款</button></div></div><div class="mobile-field"><label>下单时间</label><select><option>今天</option><option>近 7 天</option><option>自定义</option></select></div><div class="mobile-field"><label>风险</label><div class="filter-row"><button class="chip active">即将超时</button><button class="chip">地址异常</button><button class="chip">全部</button></div></div>`, `<button class="button primary" data-action="apply-filter">应用筛选</button>`);
    }
    if (state.sheet === 'product') {
      return sheetFrame('商品详情', `<div style="display:flex;gap:11px;align-items:center"><span class="product-thumb" style="width:54px;height:54px;font-size:14px">002</span><div><strong style="font-size:16px">云朵宠物窝</strong><div style="color:var(--muted);font-size:11px;margin-top:3px">HO-002 · 在售 · 有货源</div></div></div><div class="mobile-kpis" style="margin-top:14px"><div class="mobile-kpi"><span>售价</span><strong>¥189</strong></div><div class="mobile-kpi"><span>成本</span><strong>¥68</strong></div><div class="mobile-kpi"><span>库存</span><strong style="color:var(--danger)">3</strong></div></div><div class="mobile-field" style="margin-top:14px"><label>商品标题</label><input value="云朵宠物窝 冬季保暖可拆洗"></div><div class="mobile-field"><label>售价</label><input inputmode="decimal" value="189.00"></div><div class="mobile-error" style="border-color:color-mix(in srgb,var(--amber) 28%,var(--line));background:var(--amber-soft);color:var(--amber)">${icon('alert', 18)}<span>AI 建议：当前库存只够 1.8 天，先补货 40 件再追加投放。</span></div>`, `<button class="button primary" data-action="save-product">保存商品</button>`, { height: '82%' });
    }
    if (state.sheet === 'order') {
      return sheetFrame('SO-1042', `<div style="display:flex;align-items:center;gap:8px"><span class="badge warn">待发货</span><span class="badge danger">2 小时后超时</span></div><div class="kv-list" style="margin-top:14px"><div class="kv-row"><span>买家</span><strong>林**</strong></div><div class="kv-row"><span>金额</span><strong>¥329.00</strong></div><div class="kv-row"><span>下单</span><strong>今天 09:42</strong></div><div class="kv-row"><span>承诺发货</span><strong style="color:var(--danger)">今天 18:00</strong></div></div><div class="mobile-card" style="margin-top:14px"><div class="mobile-card-head"><h2>商品</h2></div><div class="mobile-product-row"><span class="product-thumb">001</span><span class="mobile-row-main"><span class="mobile-row-title">胡桃木猫爬架</span><span class="mobile-row-meta">HO-001 · 数量 1</span></span><strong>¥329</strong></div></div><div class="mobile-ai-insight" style="margin-top:14px"><div class="ai-line">${icon('sparkles', 15)} AI 变更单</div><p>创建顺丰发货，预计运费 ¥12，回填 SF1498221032，并短信通知买家。</p></div>`, `<button class="button primary" data-sheet="shipment">${icon('truck', 18)} 批准并创建发货</button>`, { height: '72%' });
    }
    if (state.sheet === 'shipment') {
      return sheetFrame('创建发货', `<div class="mobile-field"><label>订单</label><input value="SO-1042 · 胡桃木猫爬架" readonly></div><div class="mobile-field"><label>物流商</label><select><option>顺丰速运</option><option>云途物流</option><option>4PX</option></select></div><div class="mobile-field"><label>运单号</label><input value="SF1498221032" inputmode="text"><small>已通过物流商接口校验，预计运费 ¥12.00</small></div><div class="mobile-field"><label>给买家留言</label><textarea>您好，订单已安排顺丰发出，预计 2 天内送达。</textarea></div><div class="mobile-ai-insight"><div class="ai-line">${icon('shield', 15)} 发货检查</div><p>地址完整、运单号有效、库存充足。该操作会写入审计，可在 5 分钟内撤销回填。</p></div>`, `<button class="button primary" data-action="ship-order">确认发货</button>`, { height: '82%' });
    }
    if (state.sheet === 'inventory') {
      return sheetFrame('调整库存', `<div style="display:flex;align-items:center;gap:10px"><span class="product-thumb">002</span><div><strong>HO-002 · 云朵宠物窝</strong><div style="color:var(--muted);font-size:11px">当前可用库存 3</div></div></div><div class="segmented" style="margin-top:15px;width:100%;justify-content:space-between"><button class="active" style="flex:1">入库</button><button style="flex:1">出库</button><button style="flex:1">盘点</button></div><div class="mobile-field" style="margin-top:15px"><label>数量</label><input inputmode="numeric" value="40"></div><div class="mobile-field"><label>原因 / 备注</label><input value="采购补货 PO-092"></div><div class="mobile-field"><label>调整后库存</label><input value="43" readonly></div>`, `<button class="button primary" data-action="adjust-stock">确认入库 40 件</button>`);
    }
    if (state.sheet === 'ai') {
      return sheetFrame('AI 快速指令', `<div class="mobile-field"><label>你想处理什么？</label><textarea placeholder="例如：把待发货订单按超时风险排序，并告诉我先处理哪些"></textarea></div><div class="mobile-section-title"><h2>常用指令</h2></div><div class="mobile-card"><button class="sheet-option" data-action="ai-run">${icon('truck', 18)}<span>处理今天的待发货订单</span>${icon('right', 14)}</button><button class="sheet-option" data-action="ai-run">${icon('boxes', 18)}<span>找出低库存商品并给出补货建议</span>${icon('right', 14)}</button><button class="sheet-option" data-action="ai-run">${icon('chart', 18)}<span>总结今天经营变化</span>${icon('right', 14)}</button></div>`, `<button class="button primary" data-action="ai-send">${icon('send', 18)} 发送</button>`, { height: '70%' });
    }
    if (state.sheet === 'notifications') {
      return sheetFrame('通知', `<div class="mobile-card">${mobilePriorityRow('alert', '18 单待发货', '4 单将在 2 小时后超时', '待办', 'warn', 'order')}${mobilePriorityRow('sparkles', '竞品价格监测完成', '发现 3 个价格变化，等待确认', '完成', 'accent', 'ai')}${mobilePriorityRow('shield', 'Amazon 需要重新授权', '同步异常，点击重新登录', '异常', 'danger', 'actions')}</div><button class="button" style="width:100%;min-height:46px;margin-top:12px" data-action="read-all">全部标为已读</button>`);
    }
    if (state.sheet === 'actions') {
      return sheetFrame('更多操作', `<button class="sheet-option">${icon('refresh', 18)} 刷新当前数据</button><button class="sheet-option">${icon('filter', 18)} 保存当前视图</button><button class="sheet-option">${icon('download', 18)} 导出当前列表</button><button class="sheet-option">${icon('shield', 18)} 查看操作日志</button><div style="height:1px;background:var(--line);margin:5px 0"></div><button class="sheet-option" style="color:var(--danger)">${icon('alert', 18)} 报告数据异常</button>`);
    }
    return '';
  }

  function renderLearningImmersive() {
    if (!state.learningImmersive) return '';
    const subject = learningSubjects.find((item) => item.key === state.subject) || learningSubjects[0];
    return `
      <section class="mobile-immersive">
        <header class="mobile-immersive-top"><button class="mobile-icon-btn" data-action="exit-learning" aria-label="返回">${icon('left', 19)}</button><div class="mobile-immersive-title"><strong>${subject.course}</strong><span>步骤 2 / 4 · 概念</span></div><button class="mobile-icon-btn" data-action="exit-learning" aria-label="退出">${icon('x', 19)}</button></header>
        <div class="mobile-immersive-content"><article class="mobile-lesson-paper"><div class="eyebrow">${subject.label} · 当前步骤</div><h1>先把问题放进可判断的框架</h1><p>${subject.desc}</p><p>本步只处理当前概念：辨认关键事实，找出因果关系，再用一个具体例子验证自己的理解。</p><div class="mobile-lesson-note"><strong>本步目标：</strong>能用自己的话解释核心概念，并指出它在真实情境中的一个应用和一个边界。</div></article></div>
        <footer class="mobile-immersive-bottom"><div class="mobile-step-dots"><i class="mobile-step-dot active"></i><i class="mobile-step-dot"></i><i class="mobile-step-dot"></i><i class="mobile-step-dot"></i></div><button class="button">下一页 ${icon('right', 16)}</button></footer>
      </section>
    `;
  }

  function render() {
    reviewPanel?.querySelectorAll('[data-tab]').forEach((button) => button.classList.toggle('active', button.dataset.tab === state.tab));
    reviewPanel?.querySelectorAll('[data-work-mode]').forEach((button) => button.classList.toggle('active', state.tab === 'work' && button.dataset.workMode === state.workMode));
    reviewPanel?.querySelectorAll('[data-shop-page]').forEach((button) => button.classList.toggle('active', state.tab === 'shop' && button.dataset.shopPage === state.shopPage));
    const themeButton = reviewBar?.querySelector('[data-action="theme"]');
    if (themeButton) themeButton.innerHTML = `${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', 14)} ${document.documentElement.dataset.theme === 'dark' ? '浅色' : '深色'}`;
    root.innerHTML = renderBase();
  }

  function handleTabClick(button) {
    setTab(button.dataset.tab);
  }

  root.addEventListener('click', (event) => {
    const tabButton = event.target.closest('[data-tab]');
    if (tabButton) return handleTabClick(tabButton);
    const workModeButton = event.target.closest('[data-work-mode]');
    if (workModeButton) return setWorkMode(workModeButton.dataset.workMode);
    const workPageButton = event.target.closest('[data-work-page]');
    if (workPageButton) return setWorkPage(workPageButton.dataset.workPage);
    const shopButton = event.target.closest('[data-shop-page]');
    if (shopButton) return setShopPage(shopButton.dataset.shopPage);
    const subjectButton = event.target.closest('[data-subject]');
    if (subjectButton) {
      state.subject = subjectButton.dataset.subject;
      state.sheet = null;
      render();
      return;
    }
    const libraryTabButton = event.target.closest('[data-library-tab]');
    if (libraryTabButton) {
      state.libraryTab = libraryTabButton.dataset.libraryTab;
      render();
      return;
    }
    const sheetButton = event.target.closest('[data-sheet]');
    if (sheetButton) return openSheet(sheetButton.dataset.sheet);
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'close-sheet') closeSheet();
    else if (action === 'store-sheet') openSheet('store');
    else if (action === 'mode-sheet') openSheet('mode');
    else if (action === 'subject-sheet') openSheet('subject');
    else if (action === 'open-library') {
      state.libraryOpen = true;
      state.libraryTab = 'discover';
      state.sheet = null;
      render();
    } else if (action === 'close-library') {
      state.libraryOpen = false;
      render();
    } else if (action === 'library-title') {
      showToast('图书馆');
    } else if (action === 'read-book') {
      closeSheet();
      showToast('已打开阅读器');
    }
    else if (action === 'learning-immersive') {
      state.learningImmersive = true;
      state.sheet = null;
      render();
    } else if (action === 'exit-learning') {
      state.learningImmersive = false;
      render();
    } else if (action === 'pick-store') {
      const store = event.target.closest('[data-store]');
      if (store) {
        state.store = store.dataset.store;
        closeSheet();
      }
    } else if (action === 'theme') {
      const dark = document.documentElement.dataset.theme === 'dark';
      document.documentElement.dataset.theme = dark ? 'light' : 'dark';
      render();
    } else if (action === 'apply-filter') {
      closeSheet();
      showToast('已应用筛选：待发货 · 今日 · 即将超时');
    } else if (action === 'save-product') {
      closeSheet();
      showToast('商品已保存');
    } else if (action === 'ship-order') {
      closeSheet();
      showToast('已创建发货，可在 5 分钟内撤销');
    } else if (action === 'adjust-stock') {
      closeSheet();
      showToast('库存已更新：3 → 43');
    } else if (action === 'ai-run') {
      closeSheet();
      showToast('AI 已开始处理');
    } else if (action === 'ai-send') {
      closeSheet();
      showToast('指令已发送');
    } else if (action === 'read-all') {
      closeSheet();
      showToast('通知已全部标记为已读');
    } else if (action === 'more-item') {
      showToast('已打开详情');
    }
  });

  reviewPanel?.addEventListener('click', (event) => {
    const tabButton = event.target.closest('[data-tab]');
    if (tabButton) return handleTabClick(tabButton);
    const workModeButton = event.target.closest('[data-work-mode]');
    if (workModeButton) return setWorkMode(workModeButton.dataset.workMode);
    const workPageButton = event.target.closest('[data-work-page]');
    if (workPageButton) return setWorkPage(workPageButton.dataset.workPage);
    const shopButton = event.target.closest('[data-shop-page]');
    if (shopButton) return setShopPage(shopButton.dataset.shopPage);
    const subjectButton = event.target.closest('[data-subject]');
    if (subjectButton) {
      state.subject = subjectButton.dataset.subject;
      state.sheet = null;
      render();
      return;
    }
    const libraryTabButton = event.target.closest('[data-library-tab]');
    if (libraryTabButton) {
      state.libraryTab = libraryTabButton.dataset.libraryTab;
      render();
      return;
    }
    const sheetButton = event.target.closest('[data-sheet]');
    if (sheetButton) return openSheet(sheetButton.dataset.sheet);
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'learning-immersive') {
      state.learningImmersive = true;
      state.sheet = null;
      render();
    } else if (action === 'open-library') {
      state.libraryOpen = true;
      state.libraryTab = 'discover';
      state.sheet = null;
      render();
    } else if (action === 'close-library') {
      state.libraryOpen = false;
      render();
    } else if (action === 'read-book') {
      closeSheet();
      showToast('已打开阅读器');
    } else if (action === 'theme') {
      const dark = document.documentElement.dataset.theme === 'dark';
      document.documentElement.dataset.theme = dark ? 'light' : 'dark';
      render();
    }
  });

  reviewBar?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'theme') {
      const dark = document.documentElement.dataset.theme === 'dark';
      document.documentElement.dataset.theme = dark ? 'light' : 'dark';
      render();
    } else if (action === 'clean') {
      document.body.classList.add('clean-review');
      reviewBar.style.display = 'none';
      document.querySelector('.mobile-stage').style.minHeight = '100vh';
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (state.learningImmersive) state.learningImmersive = false;
      else state.sheet = null;
      render();
    }
  });

  render();
})();
