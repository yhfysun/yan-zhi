// 传统文化 · 主线课程汇总。内容按「一书一教程」分文件（用户拍板）：
//   lessons-mengxue-shici.ts —— 蒙学 1 课 + 诗词歌赋 6 课（3 讲义 + 3 精读）
//   lessons-sishu.ts         —— 四书四教程（一书一讲义 + 一精读）
//   lessons-wujing.ts        —— 五经五教程（一经一讲义 + 一精读）
// ★ 注释（Annotation 训诂）与注解（Interpretation 历代大家）分层见 types.ts；
//   全部人工预写，interpretations 只收确切注语原文，记不准一律 paraphrase=true 标「大意转述」。
import type { CultureLesson, CoupletLesson } from './types';
import { MENGXUE_SHICI_LESSONS } from './lessons-mengxue-shici';
import { SISHU_LESSONS } from './lessons-sishu';
import { WUJING_LESSONS } from './lessons-wujing';

export const CULTURE_LEVELS = ['蒙学·对韵', '诗词歌赋', '四书', '五经'] as const;

export const CULTURE_LESSONS: CultureLesson[] = [
  ...MENGXUE_SHICI_LESSONS,
  ...SISHU_LESSONS,
  ...WUJING_LESSONS,
];

export const CULTURE_COUPLET_LESSONS: CoupletLesson[] = [
  {
    id: 'clt_tian_di',
    title: '一字对 · 天',
    level: '蒙学·对韵',
    prompt: '天',
    promptTone: '平',
    expectPos: ['名'],
    expectTone: ['仄'],
    candidates: [
      { ch: '地', pos: '名', tone: '仄' },
      { ch: '海', pos: '名', tone: '仄' },
      { ch: '山', pos: '名', tone: '平' },
      { ch: '云', pos: '名', tone: '平' },
      { ch: '雨', pos: '名', tone: '仄' },
      { ch: '人', pos: '名', tone: '平' },
    ],
    sampleAnswer: '地',
    sampleWhy: '《笠翁对韵》开篇即「天对地」：天是平声，对面要仄声，「地」正合适。',
  },
  {
    id: 'clt_yu_feng',
    title: '一字对 · 雨',
    level: '蒙学·对韵',
    prompt: '雨',
    promptTone: '仄',
    expectPos: ['名'],
    expectTone: ['平'],
    candidates: [
      { ch: '风', pos: '名', tone: '平' },
      { ch: '霜', pos: '名', tone: '平' },
      { ch: '雪', pos: '名', tone: '仄' },
      { ch: '电', pos: '名', tone: '仄' },
      { ch: '雷', pos: '名', tone: '平' },
      { ch: '露', pos: '名', tone: '仄' },
    ],
    sampleAnswer: '风',
    sampleWhy: '「天对地，雨对风」——《笠翁对韵》原句：雨是仄声，对面要平声，「风」最工。',
  },
  {
    id: 'clt_haoyue_qingfeng',
    title: '二字对 · 皓月',
    level: '蒙学·对韵',
    prompt: '皓月',
    promptTone: '仄仄',
    expectPos: ['形', '名'],
    expectTone: ['平', '平'],
    candidates: [
      { ch: '清', pos: '形', tone: '平' },
      { ch: '风', pos: '名', tone: '平' },
      { ch: '淡', pos: '形', tone: '仄' },
      { ch: '云', pos: '名', tone: '平' },
      { ch: '冷', pos: '形', tone: '仄' },
      { ch: '雨', pos: '名', tone: '仄' },
    ],
    sampleAnswer: '清风',
    sampleWhy: '「皓」修饰「月」，「清」修饰「风」，形容词对形容词、名词对名词；仄仄对平平。',
  },
  {
    id: 'clt_baiyi_shanjin',
    title: '五字联 · 白日依山尽',
    level: '诗词歌赋',
    prompt: '白日依山尽',
    promptTone: '仄仄平平仄',
    expectPos: ['形', '名', '动', '名', '动'],
    expectTone: ['平', '平', '仄', '仄', '平'],
    candidates: [
      { ch: '黄', pos: '形', tone: '平' },
      { ch: '河', pos: '名', tone: '平' },
      { ch: '入', pos: '动', tone: '仄' },
      { ch: '海', pos: '名', tone: '仄' },
      { ch: '流', pos: '动', tone: '平' },
      { ch: '青', pos: '形', tone: '平' },
      { ch: '岭', pos: '名', tone: '仄' },
      { ch: '飞', pos: '动', tone: '平' },
      { ch: '岸', pos: '名', tone: '仄' },
      { ch: '落', pos: '动', tone: '仄' },
    ],
    sampleAnswer: '黄河入海流',
    sampleWhy: '原诗本就对仗：颜色对颜色（黄/白）、山河相对、动静相应，逐字平仄相反。',
  },
  {
    id: 'clt_fenglai_huaziwu',
    title: '五字联 · 风来花自舞',
    level: '诗词歌赋',
    prompt: '风来花自舞',
    promptTone: '平平平仄仄',
    expectPos: ['名', '动', '名', '副', '形'],
    expectTone: ['仄', '仄', '仄', '平', '平'],
    candidates: [
      { ch: '雪', pos: '名', tone: '仄' },
      { ch: '尽', pos: '动', tone: '仄' },
      { ch: '柳', pos: '名', tone: '仄' },
      { ch: '初', pos: '副', tone: '平' },
      { ch: '新', pos: '形', tone: '平' },
      { ch: '春', pos: '名', tone: '平' },
      { ch: '归', pos: '动', tone: '平' },
      { ch: '燕', pos: '名', tone: '仄' },
      { ch: '共', pos: '副', tone: '仄' },
      { ch: '语', pos: '动', tone: '仄' },
    ],
    sampleAnswer: '雪尽柳初新',
    sampleWhy: '仄仄仄平平正对平平平仄仄：雪对风、尽对来、柳对花，名词对名词、动词对动词。',
  },
];

export function getCultureLesson(id: string): CultureLesson | undefined {
  return CULTURE_LESSONS.find((l) => l.id === id);
}

export function getCultureCouplet(id: string): CoupletLesson | undefined {
  return CULTURE_COUPLET_LESSONS.find((l) => l.id === id);
}
