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
  it('★ 阶段标题必须是折叠按钮（lp-stage-toggle），课程列表由 v-show 门控', () => {
    // 标题变按钮 + 手风琴开关
    expect(SRC).toMatch(/class="lp-stage-name lp-stage-toggle"/);
    expect(SRC).toMatch(/@click="toggleStage\(grp\.stage\)"/);
    // 课程列表包在 v-show 门控的面板里（紧凑态默认收起：openStage=''）
    expect(SRC).toMatch(/v-show="!isCompactLayout \|\| openStage === grp\.stage" class="lp-stage-courses"/);
    // 我的词单同折叠
    expect(SRC).toMatch(/:aria-expanded="!isCompactLayout \|\| booksOpen"/);
    expect(SRC).toMatch(/v-show="!isCompactLayout \|\| booksOpen" class="lp-books"/);
  });

  it('★ 选完课必须自动收起面板（否则页面又会变长——本次改造的全部意义）', () => {
    expect(SRC).toMatch(
      /function openCourse\(c: CourseView\) \{[\s\S]{0,200}isCompactLayout\.value\) \{ openStage\.value = ''; booksOpen\.value = false; \}/,
    );
    expect(SRC).toMatch(
      /async function openBook\(book: Book, courseId = ''\) \{[\s\S]{0,200}isCompactLayout\.value\) booksOpen\.value = false;/,
    );
    // 切科目重置折叠面板
    expect(SRC).toMatch(
      /async function switchSubject\(key: string\) \{[\s\S]{0,300}openStage\.value = '';/,
    );
  });

  it('★ 右栏移动端默认收起，展开轨在紧凑布局变通栏文字入口（且文案按科目分流）', () => {
    // 初始收起（仅紧凑布局）
    expect(SRC).toMatch(/if \(isCompactLayout\.value\) rightCollapsed\.value = true;/);
    // 通栏文字入口：桌面窄条不放字（v-if 门控），文案区分 软考/英语/扩展科目
    expect(SRC).toMatch(/v-if="isCompactLayout" class="lp-rail-label"/);
    expect(SRC).toMatch(/subject === '软考' \? '考试信息 · 学习清单 · 知识体系'/);
    expect(SRC).toMatch(/subject === '英语' \? `今日复习 · \$\{dueCount\} 词到期 · 口语跟读`/);
  });

  it('★ 紧凑判定用 900px 断点（与单列 CSS 同口径），且对 matchMedia 缺失环境安全', () => {
    expect(SRC).toContain("window.matchMedia?.('(max-width: 900px)')?.matches");
  });
});
