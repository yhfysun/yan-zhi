// 周易内容包校验（learning/zhouyi/，docs/周易课程方案-2026-11-15.md §2.6 / §9）。
// 核心钉子：
// ① 行级 100%：每条原文行「注释 + 注解」都必非空（用户拍板，两步都不允许空态占位）；
// ② 防编造：interpretations paraphrase=false 必须是逐字引文并带注疏层级；无古人注语时用
//    kind='今按' + school='本教程编者按' 兜底，绝不冒充古人注语；
// ③ term 必命中原文（防注释错位，对人工内容同样有效）。
import { describe, it, expect } from 'vitest';
import {
  ZHOUYI_TRACKS, ZHOUYI_COURSES, ZHOUYI_LESSONS, getZhouyiLesson,
  ZHOUYI_TERMS, ZHOUYI_BIBLIOGRAPHY, ZHOUYI_DISCLAIMER,
} from '../src/learning/zhouyi/curriculum';
import type { ZhouyiLesson, ZhouyiLine } from '../src/learning/zhouyi/types';

const BANNED_KEYS = ['origin', 'assisted', 'generated', 'ai', 'llm', 'aiSource', 'generatedBy'];

function checkLine(lesson: ZhouyiLesson, line: ZhouyiLine, v: (cond: boolean, msg: string) => void): void {
  const where = `${lesson.id}/${line.id}`;
  // ★ 行级 100%：两个都得有
  v(line.annotations.length >= 1, `${where} 注释为空（行级 100% 要求）`);
  v(line.interpretations.length >= 1, `${where} 注解为空（行级 100% 要求）`);
  for (const a of line.annotations) {
    v(line.text.includes(a.term), `${where} 注释「${a.term}」不在原文中`);
    v(a.gloss.trim().length > 0, `${where} 注释 gloss 为空`);
  }
  for (const itp of line.interpretations) {
    v(itp.school.trim().length > 0, `${where} 注解缺 school`);
    v(itp.dynasty.trim().length > 0, `${where} 注解缺 dynasty`);
    v(itp.text.trim().length > 0, `${where} 注解缺 text`);
    v(itp.plain.trim().length > 0, `${where} 注解缺 plain`);
    if (itp.kind === '今按') {
      v(itp.dynasty === '今', `${where} 今按必须 dynasty=今`);
      v(itp.school.includes('编者按'), `${where} 今按必须标编者按，不冒充古人注语`);
    }
    // 注解不许拿注释充数：同一行的注语文本不得与任何注释 gloss 完全相同
    v(!line.annotations.some((a) => a.gloss === itp.text), `${where} 注解与注释完全相同（串层）`);
  }
}

function checkLesson(lesson: ZhouyiLesson, v: (cond: boolean, msg: string) => void): void {
  v(lesson.title.trim().length > 0, `${lesson.id} 缺标题`);
  v(lesson.goal.trim().length > 0, `${lesson.id} 缺目标`);
  v(lesson.minutes > 0, `${lesson.id} 分钟非法`);
  v(lesson.source.trim().length > 0, `${lesson.id} 缺底本 source`);
  v(lesson.sources.length >= 1, `${lesson.id} 缺参考书目`);
  v(lesson.plainSummary.length === 3 && lesson.plainSummary.every((s) => s.trim().length > 0), `${lesson.id} plainSummary 必须 3 句`);
  v(lesson.structure.length >= 1, `${lesson.id} 缺脉络`);
  for (const s of lesson.structure) {
    v(s.lineIndex >= 0 && s.lineIndex < lesson.lines.length, `${lesson.id} 脉络 lineIndex 越界`);
  }
  v(!lesson.steps.includes('recite' as never), `${lesson.id} 周易课不含诵读步（中文诵读走 useZhSpeech，由前端在 annotate 步提供）`);
  for (const line of lesson.lines) checkLine(lesson, line, v);
  if (lesson.quickCheck) {
    v(lesson.quickCheck.options.includes(lesson.quickCheck.answer), `${lesson.id} 自测答案不在选项中`);
    v(lesson.quickCheck.explanation.trim().length > 0, `${lesson.id} 自测缺解析`);
  }
  if (lesson.track === 'T5' || lesson.track === 'T6') {
    v((lesson.stance ?? '').trim().length > 0, `${lesson.id} 术数课缺 stance（文献与辨伪定位）`);
  }
  // 禁止 LLM 生成来源键
  const walk = (o: unknown): void => {
    if (o && typeof o === 'object') {
      for (const k of Object.keys(o as Record<string, unknown>)) {
        v(!BANNED_KEYS.includes(k), `${lesson.id} 出现禁用键 ${k}`);
        walk((o as Record<string, unknown>)[k]);
      }
    }
  };
  walk(lesson);
}

describe('周易课程目录（48 门全建）', () => {
  it('8 条路径；48 门课 id 唯一；P0 14 门 ready 且每条路径至少 1 门可用', () => {
    expect(ZHOUYI_TRACKS).toHaveLength(8);
    expect(ZHOUYI_COURSES).toHaveLength(48);
    expect(new Set(ZHOUYI_COURSES.map((c) => c.id)).size).toBe(48);
    const ready = ZHOUYI_COURSES.filter((c) => c.ready);
    expect(ready.length).toBeGreaterThanOrEqual(14);
    for (const t of ZHOUYI_TRACKS) {
      expect(ready.some((c) => c.track === t.id), `${t.id} 无可用课`).toBe(true);
    }
  });

  it('ready 课程与内容一一对应（看着全、点进去空 = 红灯）', () => {
    const contentIds = new Set(ZHOUYI_LESSONS.map((l) => l.id));
    for (const c of ZHOUYI_COURSES.filter((x) => x.ready)) {
      expect(contentIds.has(c.id), `${c.id} ready=true 但无内容`).toBe(true);
    }
    for (const l of ZHOUYI_LESSONS) {
      const meta = ZHOUYI_COURSES.find((c) => c.id === l.id);
      expect(meta, `${l.id} 内容存在但目录未注册`).toBeTruthy();
      expect(meta!.ready, `${l.id} 有内容但目录标 ready=false`).toBe(true);
    }
    expect(getZhouyiLesson('zy_non_exist')).toBeUndefined();
  });
});

describe('★ 行级 100%：注释与注解两个都得有', () => {
  it('每门课、每行原文都通过行级校验', () => {
    expect(ZHOUYI_LESSONS.length).toBeGreaterThanOrEqual(14);
    for (const lesson of ZHOUYI_LESSONS) {
      checkLesson(lesson, (cond, msg) => expect(cond, msg).toBe(true));
    }
  });

  it('每门精读课 ≥1 条逐字原注（paraphrase !== true）；转述必须显式标注', () => {
    for (const lesson of ZHOUYI_LESSONS.filter((l) => l.kind === 'read')) {
      const verbatim = lesson.lines.flatMap((l) => l.interpretations).filter((i) => i.paraphrase !== true);
      expect(verbatim.length, `${lesson.id} 无逐字原注`).toBeGreaterThanOrEqual(1);
    }
    for (const lesson of ZHOUYI_LESSONS) {
      for (const i of lesson.lines.flatMap((l) => l.interpretations)) {
        if (i.paraphrase === true) {
          expect(i.plain.length, `${lesson.id} 转述缺 plain`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('术语索引与参考书目', () => {
  it('术语 ≥20 条且字段齐全；书目 ≥10 条且 license 合法', () => {
    expect(ZHOUYI_TERMS.length).toBeGreaterThanOrEqual(20);
    for (const t of ZHOUYI_TERMS) {
      expect(t.term.length).toBeGreaterThan(0);
      expect(t.definition.length).toBeGreaterThan(3);
    }
    expect(ZHOUYI_BIBLIOGRAPHY.length).toBeGreaterThanOrEqual(10);
    for (const b of ZHOUYI_BIBLIOGRAPHY) {
      expect(['公版', '仅书目']).toContain(b.license);
      expect(b.title.length).toBeGreaterThan(0);
    }
  });

  it('内容立场声明非空（实践台与课程共用同一文案，唯一出口）', () => {
    expect(ZHOUYI_DISCLAIMER).toContain('教学演示');
    expect(ZHOUYI_DISCLAIMER).toContain('不构成任何现实建议');
  });
});
