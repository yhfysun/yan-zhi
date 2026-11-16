/**
 * 学习页「移动端紧凑布局」契约守卫（2026-11-16 用户实报「目录全平铺页面很长很丑」）。
 *
 * 设计（见 Learning.vue isCompactLayout 注释）：
 *   ≤900px 单列下，课程地图从「全部阶段×全部课程卡平铺」收成**阶段手风琴**
 *   （标题=折叠按钮，单开；选完课自动收起）；我的词单同折叠；右栏默认收起、
 *   展开轨变通栏文字按钮。桌面 >900px 零改动（v-show 恒真 / 点击 no-op）。
 *
 * 为什么用源码锚点：jsdom 不算布局，折叠与否的**行为**只能靠模板/逻辑契约钉死
 * （本仓 learning 系既有做法）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, 'Learning.vue'), 'utf8');

describe('Learning · 移动端紧凑布局契约', () => {
  it('★ v1.1 骨架：移动端课程导航=分组下拉（阶段 optgroup + 课程 option），桌面手风琴保留', () => {
    // 分组下拉：仅移动端渲染（isCompactLayout 门控），选项来自 groupedCourses
    expect(SRC).toMatch(/<select\s+v-if="isCompactLayout"\s+class="lp-stage-select"/);
    expect(SRC).toMatch(/<optgroup v-for="grp in groupedCourses" :key="grp\.stage" :label="grp\.stage">/);
    expect(SRC).toMatch(/<option v-for="c in grp\.courses" :key="c\.id" :value="c\.id">/);
    expect(SRC).toMatch(/@change="onCompactCourseChange\(\$event\)"/);
    // 手风琴整段只在桌面渲染（移动端不再出 400px 纵向列表）
    expect(SRC).toMatch(/<template v-if="!isCompactLayout">/);
    // 桌面手风琴内部契约保持：折叠按钮 + v-show 门控 + 词单折叠
    expect(SRC).toMatch(/class="lp-stage-name lp-stage-toggle"/);
    expect(SRC).toMatch(/@click="toggleStage\(grp\.stage\)"/);
    expect(SRC).toMatch(/v-show="!isCompactLayout \|\| openStage === grp\.stage" class="lp-stage-courses"/);
    expect(SRC).toMatch(/:aria-expanded="!isCompactLayout \|\| booksOpen"/);
    expect(SRC).toMatch(/v-show="!isCompactLayout \|\| booksOpen" class="lp-books"/);
  });

  it('★ 选课必须登记 activeCourseId（下拉回显）+ 选完课自动收起面板', () => {
    expect(SRC).toMatch(
      /function openCourse\(c: CourseView\) \{[\s\S]{0,300}activeCourseId\.value = c\.id;[\s\S]{0,300}isCompactLayout\.value\) \{ openStage\.value = ''; booksOpen\.value = false; \}/,
    );
    expect(SRC).toMatch(
      /async function openBook\(book: Book, courseId = ''\) \{[\s\S]{0,200}isCompactLayout\.value\) booksOpen\.value = false;/,
    );
    expect(SRC).toMatch(/const compactCourseId = computed\(\(\) => activeCourseId\.value \|\| courses\.value\[0\]\?\.courses\[0\]\?\.id \|\| ''\);/);
    expect(SRC).toMatch(/function onCompactCourseChange\(event: Event\)/);
  });

  it('★ v1.1 骨架：顶栏状态文案隐藏 + 复习 CTA 吸底（sticky，拇指热区）', () => {
    expect(SRC).toMatch(/@media \(max-width: 900px\) \{[\s\S]*?\.lp-top-status \{ display: none; \}/);
    expect(SRC).toMatch(/\.lp-expand-rail\.right \{[\s\S]{0,200}position: sticky; bottom: 6px;/);
    // 通栏文字入口：桌面窄条不放字（v-if 门控），文案区分 软考/英语/扩展科目
    expect(SRC).toMatch(/v-if="isCompactLayout" class="lp-rail-label"/);
    expect(SRC).toMatch(/subject === '软考' \? '考试信息 · 学习清单 · 知识体系'/);
    expect(SRC).toMatch(/subject === '英语' \? `今日复习 · \$\{dueCount\} 词到期 · 口语跟读`/);
  });

  it('★ 紧凑判定用 900px 断点（与单列 CSS 同口径），且对 matchMedia 缺失环境安全', () => {
    expect(SRC).toContain("window.matchMedia?.('(max-width: 900px)')?.matches");
  });

  it('★ 科目工作台总览层同步浓缩（第二轮「布局还是长的很」）', () => {
    const read2 = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
    // 英语主线：≤900px 阶段胶囊在 v1.1.1 已隐藏（改小节下拉，见下方工具条契约）
    const epw = read2('../components/learning/EnglishPathWorkbench.vue');
    expect(epw).toMatch(/@media \(max-width: 900px\) \{[\s\S]*?\.lp-path-stages \{ display: none; \}/);
    // 音乐：单开手风琴（此前全部阶段×全部课程平铺），移动端默认全收起
    const music = read2('../components/learning/MusicWorkbench.vue');
    expect(music).toContain('function toggleStage(level: string)');
    expect(music).toMatch(/openStage\.value = isCompactViewport\(\) \? '' : first;/);
    // 周易：紧凑态不自动展开第一条路径
    const zy = read2('../components/learning/zhouyi/ZhouyiWorkbench.vue');
    expect(zy).toContain("window.matchMedia?.('(max-width: 900px)')?.matches");
    expect(zy).toMatch(/仅桌面自动展开第一条路径/);
    expect(zy).toMatch(/expandedTrack\.value = tracks\.value\[0\]\?\.id/);
  });

  it('★★ v1.1 横滑契约：全科目长列表（网安/软考/语法/场景）≤900px 全量进横向轨道；无「展开全部」按钮', () => {
    const read2 = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
    const stripPattern = (src: string, listClass: string, cardClass: string, flexPattern: RegExp) => {
      expect(src).toMatch(new RegExp(`@media \\(max-width: 900px\\) \\{[\\s\\S]*?\\.${listClass} \\{[^}]*display: flex; overflow-x: auto;`));
      expect(src).toMatch(flexPattern);
      // 只查展开按钮 class（aria-expanded 是合法属性，不能进负向断言）
      expect(src).not.toMatch(new RegExp(`class="${cardClass.replace(/[.-]/g, '\\$&')}-expand"`));
    };
    // 网安：模块卡 170px 横滑
    const sec = read2('../components/learning/CyberSecurityWorkbench.vue');
    stripPattern(sec, 'sec-module-list', 'sec', /\.sec-module-card \{ flex: 0 0 170px;/);
    expect(sec).not.toMatch(/modulesExpanded|MODULE_PREVIEW_COUNT|visibleModules/);
    // 软考：试卷卡 210px 横滑
    const exam = read2('../components/learning/ExamTrainer.vue');
    stripPattern(exam, 'lp-exam-grid', 'lp-exam', /\.lp-exam-card \{ flex: 0 0 210px;/);
    expect(exam).not.toMatch(/papersExpanded|PAPER_PREVIEW_COUNT|visiblePapers/);
    // 语法：语法卡 160px 横滑
    const gram = read2('../components/learning/GrammarWorkbench.vue');
    stripPattern(gram, 'grammar-grid', 'grammar', /\.grammar-card \{ flex: 0 0 160px;/);
    // 场景卡：200px 横滑（Learning.vue）
    stripPattern(SRC, 'lp-scene-grid', 'lp-expand-toggle', /\.lp-scene-grid > \.lp-scene \{ flex: 0 0 200px;/);
    expect(SRC).not.toMatch(/scenesExpanded|SCENE_PREVIEW_COUNT|visibleScenes/);
    // 词汇表：移动端每页 20 词（桌面 50 不变）
    expect(SRC).toMatch(/const WORD_PAGE_SIZE = computed\(\(\) => \(isCompactLayout\.value \? 20 : 50\)\)/);
  });

  it('★★ v1.1.1 英语主线（EPW）：移动端=小节下拉工具条吸顶；桌面原布局逐字不动', () => {
    const epw = readFileSync(resolve(__dirname, '../components/learning/EnglishPathWorkbench.vue'), 'utf8');
    // hero 装饰文案删除（大标语/副文案），行动按钮保留
    expect(epw).toMatch(/\.lp-path-head > div:first-child \{ display: none; \}/);
    // 移动端工具条：小节下拉（optgroup=阶段）+ 开始按钮，sticky 吸顶（课程条下方 64px）
    expect(epw).toMatch(/class="lp-path-compact-bar"/);
    expect(epw).toMatch(/class="lp-lesson-select"/);
    expect(epw).toMatch(/<optgroup\s*v-for="\(s, si\) in stages"/);
    expect(epw).toMatch(/:value="globalLessonIndex\(si, li\)"/);
    expect(epw).toMatch(/@click="openFocus\(compactLessonIdx\)"/);
    expect(epw).toMatch(/\.lp-path-compact-bar \{[\s\S]{0,120}position: sticky; top: 64px;/);
    // 与下拉重复的移动端展示（阶段胶囊/课件卡）隐藏；桌面网格保持
    expect(epw).toMatch(/@media \(max-width: 900px\) \{[\s\S]*?\.lp-path-stages \{ display: none; \}/);
    expect(epw).toMatch(/\.lp-path-step-list \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); gap: 8px; \}/);
    expect(epw).not.toMatch(/lessonsExpanded|LESSON_PREVIEW_COUNT|visibleSteps/);
  });
});
