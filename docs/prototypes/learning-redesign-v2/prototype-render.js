(function () {
  const DATA = window.LEARNING_PROTOTYPE;
  const ICONS = {
    home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15 9-2 4-4 2 2-4 4-2Z"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
    review: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    arrowLeft: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    play: '<path d="m8 5 11 7-11 7V5Z"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18 6a8.5 8.5 0 0 1 0 12"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    notes: '<path d="M4 4h16v16H4z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    spark: '<path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8L12 3Z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z"/>',
    menu: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
    rotate: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    mic: '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v4"/>',
    send: '<path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/>',
  };

  function icon(name, size) {
    const sizeValue = size || 16;
    return `<svg width="${sizeValue}" height="${sizeValue}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function subjectStyle(subject) {
    return `--accent:${subject.accent};--tint:${subject.tint};`;
  }

  function subjectInitial(subject) {
    return escapeHtml(subject.short.slice(0, 1));
  }

  function getQueryState() {
    const params = new URLSearchParams(location.search);
    const subject = DATA.subjects.some((item) => item.key === params.get('subject'))
      ? params.get('subject')
      : DATA.subjects[0].key;
    const page = DATA.pages.some((item) => item.key === params.get('page'))
      ? params.get('page')
      : 'overview';
    const step = Math.max(0, Number(params.get('step')) || 0);
    return {
      subject,
      page,
      step,
      course: params.get('course') || '',
      bookLayer: ['notes', 'annotation', 'translation', 'source'].includes(params.get('layer'))
        ? params.get('layer')
        : 'notes',
      studioStarted: params.get('run') === '1',
      subjectSheet: params.get('sheet') === 'subject',
      courseSheet: params.get('sheet') === 'course',
      practiceAnswer: params.get('answer') == null ? null : Number(params.get('answer')),
      practiceSubmitted: params.get('submitted') === '1',
    };
  }

  function syncQuery(state) {
    const params = new URLSearchParams();
    params.set('subject', state.subject);
    params.set('page', state.page);
    if (state.course) params.set('course', state.course);
    if (state.step) params.set('step', String(state.step));
    if (state.bookLayer && state.bookLayer !== 'notes') params.set('layer', state.bookLayer);
    if (state.studioStarted) params.set('run', '1');
    if (state.subjectSheet) params.set('sheet', 'subject');
    if (state.courseSheet) params.set('sheet', 'course');
    if (state.practiceAnswer != null) params.set('answer', String(state.practiceAnswer));
    if (state.practiceSubmitted) params.set('submitted', '1');
    history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
  }

  function currentSubject(state) {
    return DATA.subjects.find((subject) => subject.key === state.subject) || DATA.subjects[0];
  }

  function currentPage(state) {
    return DATA.pages.find((page) => page.key === state.page) || DATA.pages[0];
  }

  function selectedCourse(subject, state) {
    const courses = allCourses(subject);
    return (
      courses.find((course) => course.name === state.course) ||
      courses.find((course) => course.name === subject.current.course) ||
      courses[0]
    );
  }

  function allCourses(subject) {
    return subject.tracks.flatMap((track) =>
      track.courses.map((course) => ({ ...course, stage: track.name, trackNote: track.note })),
    );
  }

  function nextCourses(subject, state, limit) {
    const all = allCourses(subject);
    const current = selectedCourse(subject, state);
    const index = Math.max(0, all.findIndex((course) => course.name === current.name));
    const after = all.slice(index + 1);
    return (after.length ? after : all.filter((course) => course.name !== current.name)).slice(0, limit || 4);
  }

  function studioTaskFor(subject, courseName) {
    const tasks = {
      party: `围绕“${courseName}”选择材料，列出可验证事件、证据与因果链。`,
      politics: `围绕“${courseName}”固定比较变量，完成一张制度或概念比较表。`,
      economics: `围绕“${courseName}”改变一个模型变量，解释图形与现实结论的边界。`,
      military: `围绕“${courseName}”重做一次历史态势判断，并复盘行动代价。`,
      history: `围绕“${courseName}”建立来源卡，完成一次互证与短论证。`,
      calligraphy: `围绕“${courseName}”完成读帖、摹写、叠合对照和第二次临写。`,
      memory: `围绕“${courseName}”完成编码、提取测试与下一次复习安排。`,
      thinking: `围绕“${courseName}”定义状态与约束，画出一次问题模型。`,
      math: `围绕“${courseName}”完成一次图像、代数或证明操作。`,
      physics: `围绕“${courseName}”完成一次测量、作图、模型建立与误差复盘。`,
      schools: `围绕“${courseName}”选择两段原典，先复述再完成概念比较。`,
      english: `围绕“${courseName}”完成听音、拆音、跟读或短句表达。`,
      japanese: `围绕“${courseName}”完成听音、认形、跟读与一次替换造句。`,
      soft: `围绕“${courseName}”拆一个案例，写出约束、方案权衡与结论。`,
      security: `围绕“${courseName}”在授权靶场完成一次识别、复现、修复与回归复盘。`,
      culture: `围绕“${courseName}”完成一次原文诵读、注释核对与对句练习。`,
      music: `围绕“${courseName}”完成四小节试奏、修改与回放。`,
      zhouyi: `围绕“${courseName}”完成原文核对、规则演练与依据复盘。`,
      divination: `围绕“${courseName}”完成一次符号观察、牌阵叙事与概率复盘。`,
    };
    return tasks[subject.key] || `围绕“${courseName}”完成一次${subject.studio.type}。`;
  }

  function studioForCourse(subject, state) {
    const course = selectedCourse(subject, state);
    return {
      ...subject.studio,
      courseName: course.name,
      task: studioTaskFor(subject, course.name),
    };
  }

  function prototypeBar(platform, state) {
    if (new URLSearchParams(location.search).get('embed') === '1') return '';
    const subject = currentSubject(state);
    const page = currentPage(state);
    return `
      <div class="prototype-bar">
        <div class="prototype-brand">
          <span class="prototype-mark">学</span>
          <div>
            <strong>Learning OS v2 · ${platform === 'mobile' ? '移动端' : '桌面端'}原型</strong>
            <span>${escapeHtml(subject.name)} · ${escapeHtml(page.label)}</span>
          </div>
        </div>
        <div class="prototype-controls">
          <div class="prototype-links" aria-label="原型入口">
            <a href="./index.html">全页面索引</a>
            <a href="./library.html">公共图书馆</a>
            <a class="${platform === 'desktop' ? 'active' : ''}" href="./desktop.html?subject=${subject.key}&page=${page.key}">桌面端</a>
            <a class="${platform === 'mobile' ? 'active' : ''}" href="./mobile.html?subject=${subject.key}&page=${page.key}">移动端</a>
          </div>
          <button class="btn small" type="button" data-action="prev-subject">${icon('chevronLeft', 13)} 上一科</button>
          <button class="btn small" type="button" data-action="next-subject">下一科 ${icon('chevronRight', 13)}</button>
        </div>
      </div>
      <p class="prototype-caption">桌面端与移动端使用同一学习信息架构；移动端不是桌面的缩小版，课程选择、复习入口与学习步骤均重新排布。</p>
    `;
  }

  function pageTabs(state, className) {
    return `
      <nav class="${className || 'page-tabs'}" aria-label="学习页面">
        ${DATA.pages
          .map(
            (page) =>
              `<button type="button" class="page-tab ${state.page === page.key ? 'active' : ''}" data-action="page" data-page="${page.key}">${escapeHtml(page.label)}</button>`,
          )
          .join('')}
      </nav>
    `;
  }

  function desktopSubjectRail(subject, state) {
    return `
      <aside class="subject-rail" aria-label="学习科目">
        <div class="subject-rail-head">
          <h2>学习科目</h2>
          <p>${DATA.subjects.length} 个科目 · 统一学习骨架</p>
        </div>
        <div class="subject-list">
          ${DATA.subjects
            .map(
              (item) => `
                <button class="subject-btn ${item.key === subject.key ? 'active' : ''}" type="button" style="${subjectStyle(item)}" data-action="subject" data-subject="${item.key}">
                  <span class="subject-dot">${subjectInitial(item)}</span>
                  <span>
                    <b>${escapeHtml(item.name)}</b>
                    <small>${item.tracks.length} 阶段 · ${item.tracks.reduce((count, track) => count + track.courses.length, 0)} 门</small>
                  </span>
                  <span class="mini-progress" aria-hidden="true"><i style="width:${item.current.progress}%"></i></span>
                </button>`,
            )
            .join('')}
        </div>
      </aside>
    `;
  }

  function desktopTopbar(subject) {
    return `
      <header class="desk-topbar">
        <div class="desk-logo"><span>言</span></div>
        <div class="desk-title">
          <b>学习</b>
          <span>沉浸学习模式</span>
        </div>
        <div class="desk-search">${icon('search', 15)} 搜索课程、题目、典籍或笔记</div>
        <div class="desk-actions">
          <span class="streak">${icon('spark', 13)} 连续学习 8 天</span>
          <a class="icon-btn" href="./library.html" aria-label="公共图书馆">${icon('book', 15)}</a>
          <button class="icon-btn" type="button" aria-label="学习设置">${icon('settings', 15)}</button>
        </div>
      </header>
    `;
  }

  function desktopModeRail() {
    return `
      <aside class="mode-rail" aria-label="应用模式">
        <button class="rail-btn" type="button" aria-label="任务">${icon('menu', 17)}</button>
        <button class="rail-btn active" type="button" aria-label="学习">${icon('book', 17)}</button>
        <button class="rail-btn" type="button" aria-label="复习">${icon('review', 17)}</button>
        <button class="rail-btn" type="button" aria-label="笔记">${icon('notes', 17)}</button>
        <span class="rail-spacer"></span>
        <button class="rail-btn" type="button" aria-label="我的">${icon('user', 17)}</button>
      </aside>
    `;
  }

  function desktopMainHead(subject, state) {
    return `
      <div class="desk-main-head">
        ${pageTabs(state)}
      </div>
    `;
  }

  function desktopRightRail(subject, state) {
    const doneReview = state.page === 'review';
    return `
      <aside class="right-rail" aria-label="今日学习状态">
        <h2>今天</h2>
        <p>建议学习 32 分钟</p>
        <div class="progress-label"><span>今日目标</span><span>24 / 32 分钟</span></div>
        <div class="progress-track"><i style="width:75%;background:var(--accent)"></i></div>
        <section class="rail-section">
          <h3>学习清单 <span>3 项</span></h3>
          <div class="rail-task done"><i>${icon('check', 10)}</i><div><b>完成 1 课</b><small>今日计划</small></div></div>
          <div class="rail-task ${doneReview ? 'done' : ''}"><i>${doneReview ? icon('check', 10) : ''}</i><div><b>复习 ${subject.review.due} 个知识点</b><small>预计 8 分钟</small></div></div>
          <div class="rail-task"><i></i><div><b>用自己的话复述</b><small>至少 3 句，记录薄弱点</small></div></div>
        </section>
        <section class="rail-section">
          <h3>掌握度 <span>${subject.review.mastery}%</span></h3>
          <div class="progress-track"><i style="width:${subject.review.mastery}%;background:var(--accent)"></i></div>
          <p class="small-note">薄弱点：${escapeHtml(subject.review.items[0])}</p>
        </section>
        <section class="rail-section">
          <h3>最近记录 <span>刚刚</span></h3>
          <div class="rail-task"><i>${icon('notes', 10)}</i><div><b>2 条笔记 · 1 个疑问</b><small>刚刚</small></div></div>
        </section>
      </aside>
    `;
  }

  function desktopShell(subject, state) {
    const immersive = state.page === 'lesson';
    return `
      ${prototypeBar('desktop', state)}
      <main class="desktop-app ${immersive ? 'immersive-app' : ''}" style="${subjectStyle(subject)}">
        ${immersive ? '' : desktopTopbar(subject)}
        ${
          immersive
            ? renderLessonDesktop(subject, state)
            : `
              <div class="desk-body">
                ${desktopModeRail()}
                ${desktopSubjectRail(subject, state)}
                <section class="desk-main">
                  ${desktopMainHead(subject, state)}
                  <div class="desk-content">
                    ${renderDesktopPage(subject, state)}
                  </div>
                </section>
                ${desktopRightRail(subject, state)}
              </div>`
        }
      </main>
    `;
  }

  function renderDesktopPage(subject, state) {
    if (state.page === 'roadmap') return renderRoadmapDesktop(subject, state);
    if (state.page === 'books') return renderBooksDesktop(subject, state);
    if (state.page === 'studio') return renderStudioDesktop(subject, state);
    if (state.page === 'practice') return renderPracticeDesktop(subject, state);
    if (state.page === 'review') return renderReviewDesktop(subject, state);
    if (state.page === 'coach') return renderCoachDesktop(subject, state);
    return renderOverviewDesktop(subject, state);
  }

  function pageIntro(subject, state, title, description) {
    return `
      <div class="page-intro">
        <div>
          <span class="eyebrow">${escapeHtml(subject.current.stage)}</span>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(description)}</p>
        </div>
        <div class="meta-line">
          <span>${escapeHtml(currentPage(state).label)}</span>
          <i class="dot-sep"></i>
          <span>${escapeHtml(subject.current.minutes)} 分钟</span>
        </div>
      </div>
    `;
  }

  function subpageBack() {
    return `<div class="subpage-back"><button class="btn small" type="button" data-action="page" data-page="overview">${icon('arrowLeft', 13)} 返回学科</button></div>`;
  }

  function renderOverviewDesktop(subject, state) {
    const currentCourse = selectedCourse(subject, state);
    const courses = nextCourses(subject, state, 4);
    return `
      ${pageIntro(subject, state, subject.name, subject.line)}
      <section class="continue-strip" aria-label="继续学习">
        <div>
          <span class="eyebrow">继续学习</span>
          <h2>${escapeHtml(currentCourse.name)}</h2>
          <p>约 ${subject.current.minutes} 分钟</p>
        </div>
        <div class="continue-actions">
          <div class="progress-block">
            <div class="progress-label"><span>本课进度</span><span>${subject.current.progress}%</span></div>
            <div class="progress-track"><i style="width:${subject.current.progress}%"></i></div>
          </div>
          <button class="btn primary" type="button" data-action="start-lesson">${icon('play', 14)} 进入学习台</button>
        </div>
      </section>
      <section class="stat-strip" aria-label="学习统计">
        ${subject.stats.map((item) => `<div class="stat-item"><b>${escapeHtml(item[0])}</b><span>${escapeHtml(item[1])}</span></div>`).join('')}
      </section>
      <div class="section-head">
        <div><h2>接下来</h2><p>${escapeHtml(subject.current.stage)}</p></div>
        <button class="link" type="button" data-action="page" data-page="roadmap">全部课程</button>
      </div>
      <div class="course-track" aria-label="后续课程">
        ${courses
          .map(
            (course, index) => `
              <button class="course-card" type="button" data-action="course" data-course="${escapeHtml(course.name)}">
                <div><span class="kicker">${escapeHtml(course.stage)}</span><b>${escapeHtml(course.name)}</b></div>
                <div class="card-foot"><small>${escapeHtml(course.meta || `${12 + index * 2} 分钟`)}</small><span>${icon('arrowRight', 13)}</span></div>
              </button>`,
          )
          .join('')}
      </div>
    `;
  }

  function renderRoadmapDesktop(subject, state) {
    const selected = selectedCourse(subject, state);
    return `
      ${pageIntro(subject, state, '课程地图', '从零基础开始，按阶段逐步进入概念、应用与专题。')}
      ${depthScale()}
      <section class="continue-strip">
        <div>
          <span class="eyebrow">当前课程</span>
          <h2>${escapeHtml(selected.name)}</h2>
          <p>${escapeHtml(subject.lesson.eyebrow)}</p>
        </div>
        <button class="btn primary" type="button" data-action="start-lesson">${icon('play', 14)} 继续学习</button>
      </section>
      <div class="section-head">
        <div><h2>${escapeHtml(subject.name)} · ${allCourses(subject).length} 门课程</h2><p>课程地图只负责定位，不把课时内容直接铺在总览页。</p></div>
        <span class="platform-badge">${escapeHtml(subject.tracks.length)} 个阶段</span>
      </div>
      <div class="stage-list">
        ${subject.tracks
          .map(
            (track, index) => `
              <div class="stage-row">
                <div>
                  <span class="eyebrow">${String(index + 1).padStart(2, '0')}</span>
                  <h3>${escapeHtml(track.name)}</h3>
                  <p>${escapeHtml(track.note)}</p>
                </div>
                <div class="stage-courses">
                  ${track.courses
                    .map(
                      (course) =>
                        `<button type="button" class="stage-course ${course.name === selected.name ? 'current' : ''}" data-action="course" data-course="${escapeHtml(course.name)}" ${course.name === selected.name ? 'aria-current="true"' : ''}>${escapeHtml(course.name)}</button>`,
                    )
                    .join('')}
                </div>
                <div class="stage-progress">
                  <div class="progress-label"><span>阶段进度</span><span>${Math.min(100, index * 17 + 22)}%</span></div>
                  <div class="progress-track"><i style="width:${Math.min(100, index * 17 + 22)}%;background:var(--accent)"></i></div>
                  <p class="meta-line" style="margin-top:7px">${track.courses.length} 门 · 约 ${track.courses.length * 14} 分钟</p>
                </div>
              </div>`,
          )
          .join('')}
      </div>
    `;
  }

  function depthScale() {
    return `
      <div class="depth-scale" aria-label="学习深度">
        <span>零基础</span><i>→</i><span>基础</span><i>→</i><span>进阶</span><i>→</i><span>实战与专题</span>
      </div>
    `;
  }

  function renderBooksDesktop(subject, state) {
    const book = subject.book;
    return `
      ${subpageBack()}
      ${pageIntro(subject, state, '书籍研读', '原文始终可见，注释、注解、译文和来源分开查看。')}
      <div class="book-layout">
        <aside class="book-shelf" aria-label="${escapeHtml(subject.name)}书库">
          <div class="book-shelf-head">
            <span class="eyebrow">本科书籍</span>
            <h2>${book.shelf.length} 种在读</h2>
          </div>
          <div class="book-list">
            ${book.shelf
              .map(
                (title, index) => `
                  <div class="book-item ${index === 0 ? 'active' : ''}">
                    <span class="book-index">${String(index + 1).padStart(2, '0')}</span>
                    <div><b>${escapeHtml(title)}</b><small>${index === 0 ? '当前阅读' : '已加入书库'}</small></div>
                  </div>`,
              )
              .join('')}
          </div>
          <p class="book-shelf-note">公版或授权原文才随应用分发；受版权保护的书目接授权版本或用户自有书库。</p>
        </aside>
        <section class="book-reader">
          <header class="book-reader-head">
            <div>
              <span class="eyebrow">${escapeHtml(book.kind)} · ${escapeHtml(book.unit)}</span>
              <h2>${escapeHtml(book.title)}</h2>
            </div>
            <span class="platform-badge">原文收录</span>
          </header>
          <nav class="reader-layer-tabs" aria-label="阅读信息层">
            ${readerLayerButton('notes', '注释', state)}
            ${readerLayerButton('annotation', '注解', state)}
            ${readerLayerButton('translation', '译文', state)}
            ${readerLayerButton('source', '来源', state)}
          </nav>
          <article class="reader-paper">
            <div class="reader-original">
              <span class="reader-label">原文</span>
              <blockquote>${escapeHtml(book.original)}</blockquote>
            </div>
            <section class="reader-layer">
              <span class="reader-label">${readerLayerLabel(state.bookLayer)}</span>
              ${readerLayerBody(book, state.bookLayer)}
            </section>
          </article>
        </section>
      </div>
    `;
  }

  function readerLayerButton(key, label, state) {
    return `<button type="button" class="${state.bookLayer === key ? 'active' : ''}" data-action="book-layer" data-layer="${key}" ${state.bookLayer === key ? 'aria-current="true"' : ''}>${label}</button>`;
  }

  function readerLayerLabel(layer) {
    return { notes: '注释', annotation: '注解', translation: '译文', source: '版本与来源' }[layer] || '注释';
  }

  function readerLayerBody(book, layer) {
    if (layer === 'annotation') return `<p>${escapeHtml(book.annotation)}</p>`;
    if (layer === 'translation') return `<p>${escapeHtml(book.translation)}</p>`;
    if (layer === 'source') return `<p>${escapeHtml(book.source)}</p>`;
    return `
      <dl class="reader-notes">
        ${book.notes
          .map((note) => `<div><dt>${escapeHtml(note.term)}</dt><dd>${escapeHtml(note.text)}</dd></div>`)
          .join('')}
      </dl>`;
  }

  function renderStudioDesktop(subject, state) {
    const studio = studioForCourse(subject, state);
    return `
      ${subpageBack()}
      ${pageIntro(subject, state, '实践', '每门课程都有对应实践任务；练习测评只负责检验掌握情况。')}
      <div class="studio-layout">
        <section class="studio-workbench">
          <header class="studio-workbench-head">
            <div>
              <span class="eyebrow">${escapeHtml(subject.name)} · ${escapeHtml(studio.type)}</span>
              <h2>${escapeHtml(studio.title)}</h2>
              <span class="studio-course-context">当前课程 · ${escapeHtml(studio.courseName)}</span>
              <p>${escapeHtml(studio.task)}</p>
            </div>
            <span class="platform-badge">${state.studioStarted ? '实践进行中' : '原型工作台'}</span>
          </header>
          <div class="studio-tools" aria-label="实践工具">
            ${studio.features.map((feature) => `<span>${escapeHtml(feature)}</span>`).join('')}
          </div>
          <section class="studio-visual">
            <div class="lesson-visual-title"><b>${escapeHtml(studio.type)}</b><span>${escapeHtml(subject.current.stage)}</span></div>
            ${visualBody(subject)}
          </section>
          <div class="studio-steps">
            ${studio.steps
              .map(
                (step, index) => `
                  <div class="studio-step ${state.studioStarted && index === 0 ? 'active' : ''}">
                    <span>${String(index + 1).padStart(2, '0')}</span>
                    <b>${escapeHtml(step)}</b>
                  </div>`,
              )
              .join('')}
          </div>
          <footer class="studio-foot">
            <span class="meta-line">${icon('target', 13)} 产出：${escapeHtml(studio.output)}</span>
            <button class="btn primary" type="button" data-action="studio-start">${state.studioStarted ? '实践进行中' : '开始实践'}</button>
          </footer>
        </section>
        <aside class="insight-panel">
          <h3>本次产出</h3>
          <p class="studio-output">${escapeHtml(studio.output)}</p>
          <h3 style="margin-top:22px">操作边界</h3>
          <p class="studio-boundary">${escapeHtml(studio.boundary)}</p>
          <p class="small-note">实践记录用于复盘，不自动替学习者生成结论。</p>
        </aside>
      </div>
    `;
  }

  function renderPracticeDesktop(subject, state) {
    const practice = subject.practice;
    return `
      ${subpageBack()}
      ${pageIntro(subject, state, '练习测评', '练习只围绕当前课程目标。作答后给出可解释反馈，并把错因送入复习队列。')}
      <div class="practice-layout">
        <section class="practice-card">
          <span class="eyebrow">${escapeHtml(subject.name)} · ${escapeHtml(practice.focus)}</span>
          <h2>${escapeHtml(practice.prompt)}</h2>
          <div class="option-list">
            ${practice.options
              .map(
                (option, index) => `
                  <button class="option-btn ${optionClass(state, practice.answer, index)}" type="button" data-action="practice-answer" data-answer="${index}">
                    <span class="option-index">${String.fromCharCode(65 + index)}</span>
                    <span>${escapeHtml(option)}</span>
                    <span>${state.practiceSubmitted && index === practice.answer ? icon('check', 14) : ''}</span>
                  </button>`,
              )
              .join('')}
          </div>
          ${
            state.practiceSubmitted
              ? `<div class="feedback ${state.practiceAnswer === practice.answer ? '' : 'wrong'}"><b>${state.practiceAnswer === practice.answer ? '判断正确' : '需要再想一步'}</b><br>${escapeHtml(practice.explanation)}</div>`
              : ''
          }
          <div class="practice-foot">
            <span class="meta-line">${icon('target', 13)} 目标：先解释，再选择</span>
            <button class="btn primary" type="button" data-action="practice-submit" ${state.practiceAnswer == null ? 'disabled' : ''}>提交判断</button>
          </div>
        </section>
        <aside class="insight-panel">
          <h3>本题覆盖</h3>
          <div class="insight-list">
            ${subject.lesson.labels
              .slice(0, 4)
              .map(
                (label, index) =>
                  `<div class="insight-item"><span class="insight-index">${String(index + 1).padStart(2, '0')}</span><div><b>${escapeHtml(label)}</b><span>${index === 0 ? '当前重点' : '用于排除与复核'}</span></div></div>`,
              )
              .join('')}
          </div>
          <p class="small-note">答错不扣分。系统会把“${escapeHtml(practice.focus)}”加入今晚与七天后的复习。</p>
        </aside>
      </div>
    `;
  }

  function optionClass(state, answer, index) {
    if (!state.practiceSubmitted) return state.practiceAnswer === index ? 'picked' : '';
    if (index === answer) return 'correct';
    if (state.practiceAnswer === index) return 'wrong';
    return '';
  }

  function renderReviewDesktop(subject, state) {
    return `
      ${pageIntro(subject, state, '复习巩固', '复习队列按“到期、薄弱、最近出错”排序。先回忆，再看答案，完成后自动安排下一次。')}
      <div class="review-summary">
        <div class="review-metric"><b>${subject.review.due}</b><span>今日到期</span></div>
        <div class="review-metric"><b>${subject.review.mastery}%</b><span>当前掌握度</span></div>
        <div class="review-metric"><b>7</b><span>连续复习天数</span></div>
      </div>
      <div class="section-head">
        <div><h2>今天先复习这 3 项</h2><p>${escapeHtml(subject.name)} · 预计 ${8 + subject.review.items.length} 分钟</p></div>
        <button class="btn primary small" type="button" data-action="page" data-page="practice">开始复习</button>
      </div>
      <div class="review-list">
        ${subject.review.items
          .map(
            (item, index) => `
              <div class="review-row">
                <span class="review-no">${String(index + 1).padStart(2, '0')}</span>
                <div><b>${escapeHtml(item)}</b><small>${index === 0 ? '今天到期 · 掌握度偏低' : index === 1 ? '3 天前学 · 需要主动提取' : '最近出错 · 先看错因再作答'}</small></div>
                <button class="btn small" type="button" data-action="page" data-page="practice">复习</button>
              </div>`,
          )
          .join('')}
      </div>
      <p class="small-note">复习记录会进入本科目的学习上下文，但不会把其他科目的词汇、术语或题目串进来。</p>
    `;
  }

  function renderCoachDesktop(subject, state) {
    return `
      ${pageIntro(subject, state, 'AI 陪练', '陪练只基于当前课程、已学内容与引用材料回答。它先提问、再解释，不替学习者跳过思考。')}
      <div class="coach-layout">
        <section class="coach-window">
          <div class="coach-head">
            <span class="coach-avatar">言</span>
            <div><b>${escapeHtml(subject.name)}陪练</b><small>课程上下文已隔离 · 可引用当前材料</small></div>
          </div>
          <div class="coach-messages">
            <div class="message ai">${escapeHtml(subject.coach.opening)}</div>
            <div class="message user">我先说说自己的理解，再请你指出证据或推理上缺了哪一步。</div>
            <div class="message ai">可以。请用“我的判断是……因为……”说一遍。我会先检查你的理由，不急着给结论。</div>
          </div>
          <form class="coach-input" data-action="coach-form">
            <input aria-label="向陪练提问" placeholder="向陪练描述你的理解或疑问" />
            <button class="btn primary" type="submit" aria-label="发送">${icon('send', 15)}</button>
          </form>
        </section>
        <aside class="insight-panel">
          <h3>建议问法</h3>
          <div class="coach-prompts">
            ${subject.coach.prompts.map((prompt) => `<button type="button" data-action="coach-prompt" data-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join('')}
          </div>
          <p class="small-note">陪练不生成未标注的典籍原文、历史事实或占断结论；不确定时会明确说明来源边界。</p>
          <div class="section-head" style="margin-top:24px"><div><h2>系统状态</h2></div></div>
          <div class="insight-list">
            <div class="insight-item"><span class="insight-index">${icon('book', 13)}</span><div><b>课程上下文</b><span>${escapeHtml(selectedCourse(subject, state).name)}</span></div></div>
            <div class="insight-item"><span class="insight-index">${icon('notes', 13)}</span><div><b>最近笔记</b><span>2 条，可被引用</span></div></div>
            <div class="insight-item"><span class="insight-index">${icon('volume', 13)}</span><div><b>朗读</b><span>可用 · 当前设备输出正常</span></div></div>
          </div>
        </aside>
      </div>
    `;
  }

  function renderLessonDesktop(subject, state) {
    const stepIndex = Math.min(state.step, subject.lesson.steps.length - 1);
    const step = subject.lesson.steps[stepIndex];
    const last = stepIndex === subject.lesson.steps.length - 1;
    return `
      <section class="lesson-shell" role="dialog" aria-modal="true" aria-label="${escapeHtml(subject.lesson.title)}">
        <div class="lesson-topbar">
          <div class="left">
            <button type="button" data-action="page" data-page="overview">${icon('arrowLeft', 13)} 返回路线</button>
          </div>
          <div class="course-name">${escapeHtml(subject.lesson.title)}</div>
          <div class="right">
            <span class="lesson-progress">步骤 ${stepIndex + 1}/${subject.lesson.steps.length}</span>
            <button type="button" aria-label="退出本课" data-action="page" data-page="overview">${icon('close', 14)}</button>
          </div>
        </div>
        <div class="lesson-rail-wrap">
          <nav class="lesson-rail" aria-label="本课步骤">
            ${subject.lesson.labels
              .map(
                (label, index) => `
                  <button class="lesson-step-pill ${index === stepIndex ? 'active' : ''} ${index < stepIndex ? 'done' : ''}" type="button" data-action="step" data-step="${index}" ${index === stepIndex ? 'aria-current="step"' : ''}>
                    <i>${index < stepIndex ? '✓' : index + 1}</i>${escapeHtml(label)}
                  </button>`,
              )
              .join('')}
          </nav>
        </div>
        <div class="lesson-stage">
          <article class="lesson-paper">
            <span class="eyebrow">${escapeHtml(subject.lesson.eyebrow)} · ${escapeHtml(subject.lesson.labels[stepIndex])}</span>
            <h1>${escapeHtml(step.title)}</h1>
            <div class="lesson-goal"><b>本步目标：</b>${escapeHtml(subject.lesson.goal)}</div>
            <div class="lesson-body">
              <p>${escapeHtml(step.body)}</p>
              ${lessonVisual(subject)}
              <span class="lesson-note">${icon('book', 12)} ${escapeHtml(step.note)}</span>
            </div>
            <div class="lesson-actions">
              <button class="speak-btn" type="button" data-action="speak">${icon('volume', 13)} 朗读本步</button>
              <button class="speak-btn" type="button" data-action="note">${icon('notes', 13)} 记到笔记</button>
            </div>
          </article>
        </div>
        <footer class="lesson-foot">
          <span class="step-copy">${escapeHtml(selectedCourse(subject, state).name)} · ${escapeHtml(step.note)}</span>
          <div class="lesson-foot-actions">
            <button class="btn" type="button" data-action="step" data-step="${Math.max(0, stepIndex - 1)}" ${stepIndex === 0 ? 'disabled' : ''}>${icon('arrowLeft', 13)} 上一步</button>
            <button class="btn primary" type="button" data-action="${last ? 'finish-lesson' : 'step'}" ${last ? '' : `data-step="${stepIndex + 1}"`}>${last ? '完成本课' : `下一步 ${icon('arrowRight', 13)}`}</button>
          </div>
        </footer>
      </section>
    `;
  }

  function lessonVisual(subject) {
    const title = visualTitle(subject);
    return `
      <section class="lesson-visual" aria-label="${escapeHtml(title)}">
        <div class="lesson-visual-title"><b>${escapeHtml(title)}</b><span>${escapeHtml(subject.current.stage)}</span></div>
        ${visualBody(subject)}
      </section>
    `;
  }

  function visualTitle(subject) {
    return (
      {
        party: '事件坐标与史料链',
        politics: '国家能力四维比较',
        economics: '供需曲线与市场均衡',
        military: '坎尼会战态势示意',
        history: '来源卡与互证矩阵',
        calligraphy: '九成宫横画叠合对照',
        memory: '空间锚点路线',
        thinking: '状态空间与合法转移',
        math: '参数与图像联动',
        physics: '位置、速度与加速度图像',
        schools: '义利概念对照',
        english: '声音接通而不是逐字母念',
        japanese: '平假名与元音对应',
        soft: '质量属性知识树',
        security: '请求中的信任边界',
        culture: '注释、注解与白话分层',
        music: '五线谱与五声名对照',
        zhouyi: '乾卦六爻与文本层次',
        divination: '星图、牌阵与象征解释',
      }[subject.key] || '本步可视化'
    );
  }

  function visualBody(subject) {
    switch (subject.key) {
      case 'party':
        return `
          <div class="viz-timeline">
            <div class="timeline-event"><b>1934.12</b><span>通道转兵</span></div>
            <div class="timeline-event"><b>1934.12</b><span>黎平会议</span></div>
            <div class="timeline-event"><b>1935.01</b><span>猴场会议</span></div>
            <div class="timeline-event"><b>1935.01</b><span>遵义会议</span></div>
          </div>
          <div class="cause-chain" style="margin-top:14px">
            <span class="cause-node">组织：集体决策</span><span class="cause-arrow">→</span><span class="cause-node">军事：主动机动</span><span class="cause-arrow">→</span><span class="cause-node">结果：战略转折</span>
          </div>`;
      case 'politics':
        return `
          <div class="concept-grid">
            <div class="concept-chip"><b>强制能力</b><span>维持秩序与安全</span></div>
            <div class="concept-chip"><b>财政能力</b><span>动员与分配资源</span></div>
            <div class="concept-chip"><b>行政能力</b><span>政策穿透与执行</span></div>
            <div class="concept-chip"><b>合法化能力</b><span>让服从被解释为正当</span></div>
          </div>`;
      case 'economics':
        return `
          <svg class="math-plot" viewBox="0 0 520 180" role="img" aria-label="供给需求曲线与市场均衡">
            ${Array.from({ length: 9 })
              .map((_, i) => `<line class="plot-grid" x1="${40 + i * 55}" y1="10" x2="${40 + i * 55}" y2="170"/>`)
              .join('')}
            ${Array.from({ length: 5 })
              .map((_, i) => `<line class="plot-grid" x1="20" y1="${15 + i * 36}" x2="500" y2="${15 + i * 36}"/>`)
              .join('')}
            <line class="plot-axis" x1="20" y1="145" x2="500" y2="145"/>
            <line class="plot-axis" x1="40" y1="8" x2="40" y2="170"/>
            <path class="plot-curve" d="M70 35 Q230 120 455 150"/>
            <path class="plot-curve supply" d="M70 150 Q260 115 455 35"/>
            <circle cx="264" cy="98" r="5" fill="${subject.accent}"/>
            <text class="plot-label" x="270" y="90">E 均衡</text>
            <text class="plot-label" x="465" y="154">D</text>
            <text class="plot-label" x="465" y="40">S</text>
          </svg>`;
      case 'military':
        return `
          <div class="battle-map">
            <span class="map-river"></span>
            <span class="map-unit" style="left:12%;top:28%">步兵</span>
            <span class="map-unit" style="left:34%;top:52%">步兵</span>
            <span class="map-unit alt" style="left:55%;top:34%">骑兵</span>
            <span class="map-unit alt" style="left:72%;top:68%">包围</span>
            <span class="map-label">示意：中线后撤 + 两翼保持接触 + 骑兵外线机动</span>
          </div>`;
      case 'history':
        return `
          <div class="source-grid">
            <div class="source-chip"><b>《宋史》</b><span>后世官修 · 评价框架明确</span></div>
            <div class="source-chip"><b>王安石文集</b><span>当事人自述 · 能看动机</span></div>
            <div class="source-chip"><b>地方奏议</b><span>执行现场 · 能看到摩擦</span></div>
            <div class="source-chip"><b>近人研究</b><span>二手解释 · 可追引文</span></div>
          </div>`;
      case 'calligraphy':
        return `
          <div class="calligraphy-sheet">
            <span class="calligraphy-axis"></span>
            <span class="calligraphy-ghost">宫</span>
            <span class="calligraphy-char">宫</span>
          </div>
          <p class="meta-line" style="margin-top:10px">对照项：起笔方向 · 横势角度 · 中段提按 · 收笔回锋</p>`;
      case 'memory':
        return `
          <div class="memory-route">
            <div class="memory-node"><b>01 门口</b><span>钥匙 / 雨伞 / 书 / 苹果</span></div>
            <div class="memory-node"><b>02 楼梯</b><span>鞋带 / 灯泡 / 猫 / 信封</span></div>
            <div class="memory-node"><b>03 客厅</b><span>沙发 / 茶杯 / 遥控 / 相框</span></div>
            <div class="memory-node"><b>04 厨房</b><span>锅 / 盐 / 刀 / 冰箱</span></div>
            <div class="memory-node"><b>05 书桌</b><span>笔 / 电脑 / 台灯 / 日历</span></div>
          </div>`;
      case 'thinking':
        return `
          <div class="logic-graph">
            <div class="logic-node">初始状态<br>全部在左岸</div>
            <div class="logic-node">合法转移<br>船 + 允许对象</div>
            <div class="logic-node">目标状态<br>全部在右岸</div>
          </div>
          <p class="meta-line" style="justify-content:center">记录已访问状态，避免回到同一局面</p>`;
      case 'math':
        return `
          <svg class="math-plot" viewBox="0 0 520 180" role="img" aria-label="二次函数图像和顶点">
            ${Array.from({ length: 9 })
              .map((_, i) => `<line class="plot-grid" x1="${40 + i * 55}" y1="10" x2="${40 + i * 55}" y2="170"/>`)
              .join('')}
            ${Array.from({ length: 5 })
              .map((_, i) => `<line class="plot-grid" x1="20" y1="${15 + i * 36}" x2="500" y2="${15 + i * 36}"/>`)
              .join('')}
            <line class="plot-axis" x1="20" y1="120" x2="500" y2="120"/>
            <line class="plot-axis" x1="260" y1="8" x2="260" y2="172"/>
            <path class="plot-curve" d="M70 20 Q260 230 450 20"/>
            <circle cx="260" cy="125" r="5" fill="${subject.accent}"/>
            <text x="272" y="118" font-size="10" fill="#46534d">顶点 (h, k)</text>
          </svg>`;
      case 'physics':
        return `
          <svg class="math-plot" viewBox="0 0 520 180" role="img" aria-label="速度时间图像">
            ${Array.from({ length: 9 })
              .map((_, i) => `<line class="plot-grid" x1="${40 + i * 55}" y1="10" x2="${40 + i * 55}" y2="170"/>`)
              .join('')}
            ${Array.from({ length: 5 })
              .map((_, i) => `<line class="plot-grid" x1="20" y1="${15 + i * 36}" x2="500" y2="${15 + i * 36}"/>`)
              .join('')}
            <line class="plot-axis" x1="40" y1="150" x2="500" y2="150"/>
            <line class="plot-axis" x1="40" y1="8" x2="40" y2="170"/>
            <path class="plot-curve" d="M55 142 L455 38"/>
            <text class="plot-label" x="465" y="158">t</text>
            <text class="plot-label" x="22" y="20">v</text>
            <text class="plot-label" x="210" y="76">斜率 = 加速度</text>
          </svg>`;
      case 'schools':
        return `
          <div class="thought-grid">
            <div class="school-panel"><b>儒家</b><p>以仁礼安顿关系，义先于私利。</p></div>
            <div class="school-panel"><b>墨家</b><p>以兼爱与非攻追求公共效用。</p></div>
            <div class="school-panel"><b>法家</b><p>以法、术、势建立可执行秩序。</p></div>
            <div class="school-panel"><b>道家</b><p>警惕人为标准的反作用，重自然。</p></div>
          </div>`;
      case 'english':
        return `
          <div class="phonics-row">
            <span class="sound-block">c<small>/k/</small></span><span class="cause-arrow">+</span>
            <span class="sound-block">a<small>/æ/</small></span><span class="cause-arrow">+</span>
            <span class="sound-block">t<small>/t/</small></span><span class="cause-arrow">→</span>
            <span class="sound-block result">cat</span>
          </div>`;
      case 'japanese':
        return `
          <div class="phonics-row">
            <span class="sound-block">あ<small>a</small></span>
            <span class="sound-block">い<small>i</small></span>
            <span class="sound-block">う<small>u</small></span>
            <span class="sound-block">え<small>e</small></span>
            <span class="sound-block">お<small>o</small></span>
          </div>
          <p class="meta-line" style="justify-content:center;margin-top:10px">先听元音，再认字形，最后按笔顺书写</p>`;
      case 'soft':
        return `
          <div class="knowledge-tree">
            <div class="tree-root">质量属性<br>可度量场景</div>
            <div class="tree-branches">
              <div class="tree-leaf">性能：响应时间 / 吞吐量</div>
              <div class="tree-leaf">可用性：可用时间比例</div>
              <div class="tree-leaf">安全：认证 / 授权 / 审计</div>
              <div class="tree-leaf">可维护：修改成本 / 回归范围</div>
            </div>
          </div>`;
      case 'security':
        return `
          <div class="cyber-flow">
            <div class="flow-node">客户端请求<br>resource_id</div>
            <div class="flow-node risk">不可信输入<br>对象编号</div>
            <div class="flow-node guard">服务端校验<br>主体与资源关系</div>
            <div class="flow-node">返回资源<br>或拒绝</div>
          </div>`;
      case 'culture':
        return `
          <p class="classic-lines">学而时习之，不亦说乎？</p>
          <div class="annotation-strip"><span>注释：说通悦</span><span>注解：习含实践</span><span>白话：不断实践</span></div>`;
      case 'music':
        return `
          <div class="music-staff">
            ${Array.from({ length: 5 })
              .map((_, i) => `<span class="staff-line" style="top:${32 + i * 18}px"></span>`)
              .join('')}
            <span class="note-dot" style="left:17%;top:84px"></span>
            <span class="note-dot" style="left:34%;top:66px"></span>
            <span class="note-dot" style="left:51%;top:48px"></span>
            <span class="note-dot" style="left:68%;top:66px"></span>
            <span class="note-dot" style="left:84%;top:84px"></span>
          </div>
          <div class="annotation-strip"><span>宫 1 上 C</span><span>商 2 尺 D</span><span>角 3 工 E</span><span>徵 5 六 G</span><span>羽 6 五 A</span></div>`;
      case 'zhouyi':
        return `
          <div class="hexagram" aria-label="乾卦六爻">
            ${Array.from({ length: 6 })
              .map(() => `<div class="hex-line"><span></span></div>`)
              .join('')}
          </div>
          <div class="annotation-strip"><span>经：卦辞</span><span>传：彖象</span><span>注：字词</span><span>今按：编者释义</span></div>`;
      case 'divination':
        return `
          <div class="divination-board">
            <div class="celestial-ring" aria-label="简化星图">
              <span style="left:22%;top:32%"></span>
              <span style="left:62%;top:18%"></span>
              <span style="left:78%;top:56%"></span>
              <span style="left:48%;top:72%"></span>
              <span style="left:16%;top:62%"></span>
              <b>星图 · 黄道十二宫</b>
            </div>
            <div class="tarot-row" aria-label="三张牌阵">
              <div class="tarot-mini"><small>I</small><b>LE MAT</b><span>愚者</span></div>
              <div class="tarot-mini"><small>II</small><b>LA PAPESSE</b><span>女祭司</span></div>
              <div class="tarot-mini"><small>XXI</small><b>LE MONDE</b><span>世界</span></div>
            </div>
          </div>
          <div class="annotation-strip"><span>先描述</span><span>再联想</span><span>给替代解释</span><span>写复盘</span></div>`;
      default:
        return '<div class="concept-grid"><div class="concept-chip"><b>当前步骤</b><span>只显示本步内容</span></div><div class="concept-chip"><b>下一步</b><span>底部保持可见</span></div></div>';
    }
  }

  function renderMobileSubjectSheet(subject) {
    return `
      <div class="mobile-sheet-mask" data-action="close-sheet">
        <section class="mobile-sheet mobile-subject-sheet" role="dialog" aria-modal="true" aria-label="切换科目" data-sheet-panel>
          <div class="sheet-grab"></div>
          <div class="sheet-head"><b>切换科目</b><button class="icon-btn" type="button" data-action="close-sheet" aria-label="关闭">${icon('close', 14)}</button></div>
          <div class="sheet-group">
            ${DATA.subjects
              .map(
                (item) => `
                  <button class="sheet-option ${item.key === subject.key ? 'active' : ''}" type="button" style="${subjectStyle(item)}" data-action="subject" data-subject="${item.key}">
                    <span><span class="subject-dot" style="display:inline-grid;margin-right:9px;vertical-align:middle">${subjectInitial(item)}</span>${escapeHtml(item.name)}</span>
                    <small>${item.current.progress}%</small>
                  </button>`,
              )
              .join('')}
          </div>
        </section>
      </div>
    `;
  }

  function renderMobileCourseSheet(subject, state) {
    return `
      <div class="mobile-sheet-mask" data-action="close-sheet">
        <section class="mobile-sheet" role="dialog" aria-modal="true" aria-label="选择课程" data-sheet-panel>
          <div class="sheet-grab"></div>
          <div class="sheet-head"><b>选择阶段与课程</b><button class="icon-btn" type="button" data-action="close-sheet" aria-label="关闭">${icon('close', 14)}</button></div>
          ${subject.tracks
            .map(
              (track) => `
                <div class="sheet-group">
                  <div class="sheet-group-label">${escapeHtml(track.name)}</div>
                  ${track.courses
                    .map(
                      (course) =>
                        `<button class="sheet-option ${course.name === selectedCourse(subject, state).name ? 'active' : ''}" type="button" data-action="course" data-course="${escapeHtml(course.name)}"><span>${escapeHtml(course.name)}</span><small>${escapeHtml(course.meta || '开始学习')}</small></button>`,
                    )
                    .join('')}
                </div>`,
            )
            .join('')}
        </section>
      </div>
    `;
  }

  function mobileHeader(subject) {
    return `
      <header class="mobile-header">
        <button class="mobile-subject-trigger" type="button" data-action="open-subject" aria-label="切换科目">${escapeHtml(subject.name)} ${icon('chevronDown', 15)}</button>
        <div class="mobile-header-actions">
          <span class="mobile-mode-pill">学习</span>
          <a class="icon-btn" href="./library.html" aria-label="公共图书馆" style="width:38px;height:38px;display:grid;place-items:center">${icon('book', 15)}</a>
          <button class="icon-btn" type="button" aria-label="搜索" style="width:38px;height:38px">${icon('search', 15)}</button>
        </div>
      </header>
    `;
  }

  function mobileBottomNav(subject, state) {
    const current = state.page;
    const showSticky = !['books', 'studio', 'practice'].includes(current);
    return `
      <div class="mobile-bottom">
        ${
          showSticky
            ? `<button class="mobile-sticky-action" type="button" data-action="${current === 'overview' ? 'start-lesson' : current === 'review' ? 'page' : 'start-lesson'}" ${current === 'review' ? 'data-page="practice"' : ''}>
                <span><b>${current === 'review' ? `复习 ${subject.review.due} 个到期知识点` : `继续：${selectedCourse(subject, state).name}`}</b><small>${current === 'review' ? '先回忆，再看答案' : `约 ${subject.current.minutes} 分钟 · 退出后保留原位`}</small></span>
                ${icon('arrowRight', 16)}
              </button>`
            : ''
        }
        <nav class="mobile-tabbar" aria-label="移动端主导航">
          <button class="mobile-tab ${current === 'overview' ? 'active' : ''}" type="button" data-action="page" data-page="overview"><i>${icon('home', 14)}</i>今日</button>
          <button class="mobile-tab ${current === 'roadmap' ? 'active' : ''}" type="button" data-action="page" data-page="roadmap"><i>${icon('book', 14)}</i>学科</button>
          <button class="mobile-tab ${current === 'review' ? 'active' : ''}" type="button" data-action="page" data-page="review"><i>${icon('review', 14)}</i>复习</button>
          <button class="mobile-tab ${current === 'coach' ? 'active' : ''}" type="button" data-action="page" data-page="coach"><i>${icon('user', 14)}</i>我的</button>
        </nav>
      </div>
    `;
  }

  function mobileCourseSelect(subject, state) {
    return `
      <div class="mobile-select">
        <button class="mobile-select-trigger" type="button" data-action="open-course">
          <span>${escapeHtml(subject.current.stage)} · ${escapeHtml(selectedCourse(subject, state).name)}</span>
          ${icon('chevronDown', 15)}
        </button>
      </div>
    `;
  }

  function renderMobileOverview(subject, state) {
    const courses = nextCourses(subject, state, 4);
    return `
      ${mobileCourseSelect(subject, state)}
      <section class="mobile-continue">
        <span class="eyebrow">继续学习</span>
        <h1>${escapeHtml(selectedCourse(subject, state).name)}</h1>
        <p>${escapeHtml(subject.current.stage)} · 约 ${subject.current.minutes} 分钟</p>
        <div class="mobile-continue-foot">
          <div class="progress-block">
            <div class="progress-label"><span>本课进度</span><span>${subject.current.progress}%</span></div>
            <div class="progress-track"><i style="width:${subject.current.progress}%"></i></div>
          </div>
          <button class="btn primary" type="button" data-action="start-lesson">开始本节</button>
        </div>
      </section>
      <div class="mobile-tool-row" aria-label="学习工具">
        <button class="mobile-tool" type="button" data-action="page" data-page="studio"><i>${icon('compass', 16)}</i>实践</button>
        <button class="mobile-tool" type="button" data-action="page" data-page="practice"><i>${icon('target', 16)}</i>练习</button>
        <button class="mobile-tool" type="button" data-action="page" data-page="books"><i>${icon('book', 16)}</i>书籍</button>
        <button class="mobile-tool" type="button" data-action="page" data-page="review"><i>${icon('review', 16)}</i>复习</button>
        <button class="mobile-tool" type="button" data-action="page" data-page="coach"><i>${icon('spark', 16)}</i>陪练</button>
      </div>
      <div class="mobile-section-head"><h2>接下来</h2><span>左右滑动</span></div>
      <div class="mobile-course-strip">
        ${courses
          .map(
            (course) => `
              <button class="mobile-course-card" type="button" data-action="course" data-course="${escapeHtml(course.name)}">
                <div><span class="eyebrow">${escapeHtml(course.stage)}</span><b>${escapeHtml(course.name)}</b></div>
                <small>${escapeHtml(course.meta || `${subject.current.minutes} 分钟`)}</small>
              </button>`,
          )
          .join('')}
      </div>
      <div class="mobile-section-head"><h2>今日复习</h2><span>${subject.stats[2][0]} ${escapeHtml(subject.stats[2][1])}</span></div>
      <div class="review-list">
        <div class="review-row"><span class="review-no">01</span><div><b>${escapeHtml(subject.review.items[0])}</b><small>复习 ${subject.review.due} 项 · 约 8 分钟</small></div><button class="btn small" type="button" data-action="page" data-page="practice">开始</button></div>
        <div class="review-row"><span class="review-no">02</span><div><b>用自己的话复述本课</b><small>至少 3 句 · 系统会记录薄弱点</small></div><button class="btn small" type="button" data-action="page" data-page="coach">去说</button></div>
      </div>
    `;
  }

  function renderMobileRoadmap(subject, state) {
    return `
      ${mobileCourseSelect(subject, state)}
      ${depthScale()}
      <div class="mobile-section-head"><h2>${escapeHtml(subject.name)} · 完整课程地图</h2><span>${allCourses(subject).length} 门</span></div>
      <div class="mobile-roadmap">
        ${subject.tracks
          .map(
            (track) => `
              <section class="mobile-stage">
                <div class="mobile-stage-head"><b>${escapeHtml(track.name)}</b><span>${escapeHtml(track.note)}</span></div>
                ${track.courses
                  .map(
                    (course) =>
                      `<button class="mobile-stage-course ${course.name === selectedCourse(subject, state).name ? 'current' : ''}" type="button" data-action="course" data-course="${escapeHtml(course.name)}"><span>${escapeHtml(course.name)}</span><small>${escapeHtml(course.meta || '开始')}</small></button>`,
                  )
                  .join('')}
              </section>`,
          )
          .join('')}
      </div>
    `;
  }

  function renderMobilePractice(subject, state) {
    const practice = subject.practice;
    return `
      <div class="mobile-subpage-back"><button class="btn small" type="button" data-action="page" data-page="overview">${icon('arrowLeft', 13)} 返回学科</button></div>
      <div class="mobile-practice-card">
        <span class="eyebrow">${escapeHtml(subject.name)} · ${escapeHtml(practice.focus)}</span>
        <h1>${escapeHtml(practice.prompt)}</h1>
        <div class="option-list">
          ${practice.options
            .map(
              (option, index) => `
                <button class="option-btn ${optionClass(state, practice.answer, index)}" type="button" data-action="practice-answer" data-answer="${index}">
                  <span class="option-index">${String.fromCharCode(65 + index)}</span><span>${escapeHtml(option)}</span><span>${state.practiceSubmitted && index === practice.answer ? icon('check', 13) : ''}</span>
                </button>`,
            )
            .join('')}
        </div>
        ${
          state.practiceSubmitted
            ? `<div class="feedback ${state.practiceAnswer === practice.answer ? '' : 'wrong'}"><b>${state.practiceAnswer === practice.answer ? '判断正确' : '再看一步'}</b><br>${escapeHtml(practice.explanation)}</div>`
            : ''
        }
        <div class="practice-foot">
          <span class="meta-line">${icon('target', 13)} 先解释，再选择</span>
          <button class="btn primary" type="button" data-action="practice-submit" ${state.practiceAnswer == null ? 'disabled' : ''}>提交</button>
        </div>
      </div>
      <p class="small-note">错因会进入复习队列；这里不会一次铺出整套题库。</p>
    `;
  }

  function renderMobileReview(subject) {
    return `
      <div class="mobile-review-metrics">
        <div><b>${subject.review.due}</b><span>今日到期</span></div>
        <div><b>${subject.review.mastery}%</b><span>掌握度</span></div>
        <div><b>7</b><span>连续天数</span></div>
      </div>
      <div class="mobile-section-head"><h2>先复习这 3 项</h2><span>约 ${8 + subject.review.items.length} 分钟</span></div>
      <div class="review-list">
        ${subject.review.items
          .map(
            (item, index) => `
              <div class="review-row">
                <span class="review-no">${String(index + 1).padStart(2, '0')}</span>
                <div><b>${escapeHtml(item)}</b><small>${index === 0 ? '今天到期' : index === 1 ? '需要主动提取' : '最近出错'}</small></div>
                <button class="btn small" type="button" data-action="page" data-page="practice">开始</button>
              </div>`,
          )
          .join('')}
      </div>
      <p class="small-note">复习上下文按科目隔离。从${escapeHtml(subject.name)}进入时，不会带出其他科目的题目或词表。</p>
    `;
  }

  function renderMobileBooks(subject, state) {
    const book = subject.book;
    return `
      <div class="mobile-subpage-back"><button class="btn small" type="button" data-action="page" data-page="overview">${icon('arrowLeft', 13)} 返回学科</button></div>
      <div class="mobile-book-head">
        <span class="eyebrow">${escapeHtml(book.kind)}</span>
        <h1>${escapeHtml(book.title)}</h1>
        <p>${escapeHtml(book.unit)} · 原文收录</p>
      </div>
      <nav class="mobile-reader-tabs" aria-label="阅读信息层">
        ${readerLayerButton('notes', '注释', state)}
        ${readerLayerButton('annotation', '注解', state)}
        ${readerLayerButton('translation', '译文', state)}
        ${readerLayerButton('source', '来源', state)}
      </nav>
      <article class="mobile-reader-paper">
        <span class="reader-label">原文</span>
        <blockquote>${escapeHtml(book.original)}</blockquote>
        <section class="reader-layer">
          <span class="reader-label">${readerLayerLabel(state.bookLayer)}</span>
          ${readerLayerBody(book, state.bookLayer)}
        </section>
      </article>
      <div class="mobile-section-head"><h2>本科书库</h2><span>${book.shelf.length} 种</span></div>
      <div class="review-list">
        ${book.shelf
          .map(
            (title, index) => `
              <div class="review-row">
                <span class="review-no">${String(index + 1).padStart(2, '0')}</span>
                <div><b>${escapeHtml(title)}</b><small>${index === 0 ? '当前阅读' : '已加入书库'}</small></div>
                <span class="platform-badge">${index === 0 ? '在读' : '书库'}</span>
              </div>`,
          )
          .join('')}
      </div>
    `;
  }

  function renderMobileStudio(subject, state) {
    const studio = studioForCourse(subject, state);
    return `
      <div class="mobile-subpage-back"><button class="btn small" type="button" data-action="page" data-page="overview">${icon('arrowLeft', 13)} 返回学科</button></div>
      <section class="mobile-studio-card">
        <span class="eyebrow">${escapeHtml(subject.name)} · ${escapeHtml(studio.type)}</span>
        <h1>${escapeHtml(studio.title)}</h1>
        <span class="studio-course-context">当前课程 · ${escapeHtml(studio.courseName)}</span>
        <p>${escapeHtml(studio.task)}</p>
        <div class="studio-tools" aria-label="实践工具">
          ${studio.features.map((feature) => `<span>${escapeHtml(feature)}</span>`).join('')}
        </div>
        <section class="mobile-studio-visual">
          ${visualBody(subject)}
        </section>
        <div class="studio-steps">
          ${studio.steps
            .map(
              (step, index) => `
                <div class="studio-step ${state.studioStarted && index === 0 ? 'active' : ''}">
                  <span>${String(index + 1).padStart(2, '0')}</span>
                  <b>${escapeHtml(step)}</b>
                </div>`,
            )
            .join('')}
        </div>
        <div class="mobile-studio-meta">
          <div><span>本次产出</span><b>${escapeHtml(studio.output)}</b></div>
          <div><span>操作边界</span><b>${escapeHtml(studio.boundary)}</b></div>
        </div>
        <button class="btn primary mobile-studio-start" type="button" data-action="studio-start">${state.studioStarted ? '实践进行中' : '开始实践'}</button>
      </section>
    `;
  }

  function renderMobileCoach(subject) {
    return `
      <section class="mobile-coach">
        <div class="coach-head">
          <span class="coach-avatar">言</span>
          <div><b>${escapeHtml(subject.name)}陪练</b><small>当前课程上下文 · 可引用材料</small></div>
        </div>
        <div class="coach-messages">
          <div class="message ai">${escapeHtml(subject.coach.opening)}</div>
          <div class="message user">我先说自己的理解，你只指出理由里缺的证据。</div>
          <div class="message ai">可以。请按“判断、理由、证据”三句话说出来。</div>
        </div>
        <form class="coach-input" data-action="coach-form">
          <input aria-label="向陪练提问" placeholder="说出你的理解或问题" />
          <button class="btn primary" type="submit" aria-label="发送">${icon('send', 14)}</button>
        </form>
      </section>
      <div class="coach-prompts">
        ${subject.coach.prompts.map((prompt) => `<button type="button" data-action="coach-prompt" data-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join('')}
      </div>
    `;
  }

  function renderMobilePage(subject, state) {
    if (state.page === 'roadmap') return renderMobileRoadmap(subject, state);
    if (state.page === 'books') return renderMobileBooks(subject, state);
    if (state.page === 'studio') return renderMobileStudio(subject, state);
    if (state.page === 'practice') return renderMobilePractice(subject, state);
    if (state.page === 'review') return renderMobileReview(subject);
    if (state.page === 'coach') return renderMobileCoach(subject);
    return renderMobileOverview(subject, state);
  }

  function renderMobileLesson(subject, state) {
    const stepIndex = Math.min(state.step, subject.lesson.steps.length - 1);
    const step = subject.lesson.steps[stepIndex];
    const last = stepIndex === subject.lesson.steps.length - 1;
    return `
      <section class="mobile-lesson" role="dialog" aria-modal="true" aria-label="${escapeHtml(subject.lesson.title)}">
        <div class="phone-status"><b>09:41</b><span>5G&nbsp;&nbsp;87%</span></div>
        <header class="mobile-lesson-top">
          <button type="button" aria-label="返回路线" data-action="page" data-page="overview">${icon('arrowLeft', 15)}</button>
          <div class="mobile-lesson-title"><b>${escapeHtml(subject.lesson.title)}</b><small>${subject.lesson.labels[stepIndex]} · 步骤 ${stepIndex + 1}/${subject.lesson.labels.length}</small></div>
          <button type="button" aria-label="退出本课" data-action="page" data-page="overview">${icon('close', 15)}</button>
        </header>
        <nav class="mobile-lesson-rail" aria-label="本课步骤">
          ${subject.lesson.labels
            .map(
              (label, index) =>
                `<button class="mobile-step ${index === stepIndex ? 'active' : ''}" type="button" data-action="step" data-step="${index}">${index < stepIndex ? '✓ ' : ''}${escapeHtml(label)}</button>`,
            )
            .join('')}
        </nav>
        <div class="mobile-lesson-scroll">
          <article class="mobile-paper">
            <span class="eyebrow">${escapeHtml(subject.lesson.eyebrow)}</span>
            <h1>${escapeHtml(step.title)}</h1>
            <div class="lesson-goal"><b>本步目标：</b>${escapeHtml(subject.lesson.goal)}</div>
            <div class="lesson-body">
              <p>${escapeHtml(step.body)}</p>
              ${lessonVisual(subject)}
              <span class="lesson-note">${icon('book', 12)} ${escapeHtml(step.note)}</span>
            </div>
            <div class="lesson-actions" style="justify-content:flex-start">
              <button class="speak-btn" type="button" data-action="speak">${icon('volume', 13)} 朗读本步</button>
              <button class="speak-btn" type="button" data-action="note">${icon('notes', 13)} 记笔记</button>
            </div>
          </article>
        </div>
        <footer class="mobile-lesson-foot">
          <button class="btn" type="button" data-action="step" data-step="${Math.max(0, stepIndex - 1)}" ${stepIndex === 0 ? 'disabled' : ''}>${icon('arrowLeft', 14)} 上一步</button>
          <button class="btn primary" type="button" data-action="${last ? 'finish-lesson' : 'step'}" ${last ? '' : `data-step="${stepIndex + 1}"`}>${last ? '完成本课' : `下一步 ${icon('arrowRight', 14)}`}</button>
        </footer>
      </section>
    `;
  }

  function renderMobile(subject, state) {
    return `
      ${prototypeBar('mobile', state)}
      <main class="mobile-page" style="${subjectStyle(subject)}">
        <div class="mobile-layout">
          <div class="phone-shell">
            <div class="phone-screen">
              <div class="phone-status"><b>09:41</b><span>5G&nbsp;&nbsp;87%</span></div>
              ${mobileHeader(subject)}
              <div class="mobile-scroll">${renderMobilePage(subject, state)}</div>
              ${mobileBottomNav(subject, state)}
              ${state.subjectSheet ? renderMobileSubjectSheet(subject) : ''}
              ${state.courseSheet ? renderMobileCourseSheet(subject, state) : ''}
              ${state.page === 'lesson' ? renderMobileLesson(subject, state) : ''}
            </div>
          </div>
          <p class="prototype-caption" style="width:390px;text-align:center">≤900px 单列 · 44px 触摸目标 · 课程与科目使用 App 内浮层选择</p>
        </div>
      </main>
    `;
  }

  function bindCommon(root, state, rerender) {
    root.querySelectorAll('[data-action]').forEach((node) => {
      const action = node.dataset.action;
      if (action === 'subject') {
        node.addEventListener('click', () => {
          state.subject = node.dataset.subject;
          state.page = 'overview';
          state.step = 0;
          state.course = '';
          state.bookLayer = 'notes';
          state.studioStarted = false;
          state.subjectSheet = false;
          state.courseSheet = false;
          state.practiceAnswer = null;
          state.practiceSubmitted = false;
          syncQuery(state);
          rerender();
        });
      } else if (action === 'page') {
        node.addEventListener('click', () => {
          state.page = node.dataset.page;
          if (state.page !== 'studio') state.studioStarted = false;
          state.step = 0;
          state.subjectSheet = false;
          state.courseSheet = false;
          syncQuery(state);
          rerender();
        });
      } else if (action === 'course') {
        node.addEventListener('click', () => {
          state.course = node.dataset.course;
          state.courseSheet = false;
          state.practiceAnswer = null;
          state.practiceSubmitted = false;
          syncQuery(state);
          rerender();
        });
      } else if (action === 'step') {
        node.addEventListener('click', () => {
          state.step = Number(node.dataset.step) || 0;
          syncQuery(state);
          rerender();
        });
      } else if (action === 'book-layer') {
        node.addEventListener('click', () => {
          state.bookLayer = node.dataset.layer || 'notes';
          syncQuery(state);
          rerender();
        });
      } else if (action === 'studio-start') {
        node.addEventListener('click', () => {
          state.studioStarted = true;
          syncQuery(state);
          rerender();
        });
      } else if (action === 'start-lesson') {
        node.addEventListener('click', () => {
          state.page = 'lesson';
          state.step = 0;
          state.subjectSheet = false;
          state.courseSheet = false;
          syncQuery(state);
          rerender();
        });
      } else if (action === 'finish-lesson') {
        node.addEventListener('click', () => {
          state.page = 'review';
          state.step = 0;
          syncQuery(state);
          rerender();
        });
      } else if (action === 'practice-answer') {
        node.addEventListener('click', () => {
          if (state.practiceSubmitted) return;
          state.practiceAnswer = Number(node.dataset.answer);
          syncQuery(state);
          rerender();
        });
      } else if (action === 'practice-submit') {
        node.addEventListener('click', () => {
          if (state.practiceAnswer == null) return;
          state.practiceSubmitted = true;
          syncQuery(state);
          rerender();
        });
      } else if (action === 'open-subject') {
        node.addEventListener('click', () => {
          state.subjectSheet = true;
          state.courseSheet = false;
          syncQuery(state);
          rerender();
        });
      } else if (action === 'open-course') {
        node.addEventListener('click', () => {
          state.courseSheet = true;
          state.subjectSheet = false;
          syncQuery(state);
          rerender();
        });
      } else if (action === 'close-sheet') {
        node.addEventListener('click', (event) => {
          if (event.target.closest('[data-sheet-panel]') && event.currentTarget === event.target.closest('[data-sheet-panel]')) return;
          if (event.target.closest('[data-sheet-panel]') && !event.target.closest('[data-action="close-sheet"]')) return;
          if (event.target.closest('[data-sheet-panel]') && !node.classList.contains('mobile-sheet-mask')) return;
          state.subjectSheet = false;
          state.courseSheet = false;
          syncQuery(state);
          rerender();
        });
      } else if (action === 'prev-subject' || action === 'next-subject') {
        node.addEventListener('click', () => {
          const current = DATA.subjects.findIndex((item) => item.key === state.subject);
          const direction = action === 'next-subject' ? 1 : -1;
          state.subject = DATA.subjects[(current + direction + DATA.subjects.length) % DATA.subjects.length].key;
          state.page = 'overview';
          state.step = 0;
          state.course = '';
          state.bookLayer = 'notes';
          state.studioStarted = false;
          state.practiceAnswer = null;
          state.practiceSubmitted = false;
          syncQuery(state);
          rerender();
        });
      } else if (action === 'speak') {
        node.addEventListener('click', () => {
          node.textContent = '正在朗读本步';
          node.disabled = true;
          setTimeout(() => {
            node.disabled = false;
            node.textContent = '朗读本步';
          }, 1200);
        });
      } else if (action === 'note') {
        node.addEventListener('click', () => {
          node.textContent = '已加入笔记';
          setTimeout(() => {
            node.textContent = '记到笔记';
          }, 1200);
        });
      } else if (action === 'coach-prompt') {
        node.addEventListener('click', () => {
          const input = root.querySelector('.coach-input input');
          if (input) {
            input.value = node.dataset.prompt;
            input.focus();
          }
        });
      }
    });
    root.querySelectorAll('form[data-action="coach-form"]').forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const input = form.querySelector('input');
        if (input && !input.value.trim()) return;
        input.value = '';
        input.placeholder = '原型演示：已发送到当前科目陪练';
      });
    });
  }

  window.LearningProto = {
    DATA,
    icon,
    escapeHtml,
    subjectStyle,
    getQueryState,
    syncQuery,
    currentSubject,
    currentPage,
    allCourses,
    desktopShell,
    renderMobile,
    bindCommon,
  };
})();
