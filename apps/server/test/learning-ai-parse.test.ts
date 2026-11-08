// LLM 输出解析回归（learning/ai.ts 的 extractJsonArray + learning/extract.ts 的 parseCorrections）。
// 为什么值得测：这两个解析器吃的是**模型自由文本**——围栏、废话、缺字段、wrong===right
// 都会出现；解析坏掉会让「AI 收词」与「错误本自动抽取」静默失效。
import { describe, it, expect } from 'vitest';
import { extractJsonArray } from '../src/learning/ai';
import { parseCorrections } from '../src/learning/extract';

describe('extractJsonArray（AI 收词解析）', () => {
  it('裸 JSON 数组直接解析', () => {
    const r = extractJsonArray('[{"word":"resume","gloss":"n. 简历"}]');
    expect(r).toEqual([{ word: 'resume', gloss: 'n. 简历' }]);
  });

  it('容忍 ```json 围栏与前后废话', () => {
    const r = extractJsonArray('好的，以下是收词结果：\n```json\n[{"word":"deadline","gloss":"n. 截止日期"}]\n```\n希望有帮助');
    expect(r).toHaveLength(1);
  });

  it('取最后一个 ]（数组里含字符串数组时不被提前截断）', () => {
    const r = extractJsonArray('[{"word":"a","tags":["x","y"]}] 后缀文字');
    expect(r).toHaveLength(1);
  });

  it('垃圾输入返回 null（上层报「AI 返回格式异常」，不抛裸错）', () => {
    expect(extractJsonArray('抱歉我无法处理')).toBeNull();
    expect(extractJsonArray('')).toBeNull();
    expect(extractJsonArray('[{"broken":')).toBeNull();
    expect(extractJsonArray('{"not":"an array"}')).toBeNull();
  });
});

describe('parseCorrections（错误本抽取解析）', () => {
  it('正常抽取：wrong/right/reason/grammarPoint 全保留', () => {
    const raw = '[{"wrong":"I have seen him yesterday","right":"I saw him yesterday","reason":"过去时间点用过去时","grammarPoint":"g_past_simple"}]';
    const r = parseCorrections(raw);
    expect(r).toEqual([{ wrong: 'I have seen him yesterday', right: 'I saw him yesterday', reason: '过去时间点用过去时', grammarPoint: 'g_past_simple' }]);
  });

  it('grammar_point 蛇形命名也能吃（模型两种写法都可能出现）', () => {
    const r = parseCorrections('[{"wrong":"a","right":"b","grammar_point":"g_articles"}]');
    expect(r[0].grammarPoint).toBe('g_articles');
  });

  it('★ wrong === right 或缺字段的项静默丢弃（没有错可纠的不入错误本）', () => {
    const r = parseCorrections('[{"wrong":"same","right":"same"},{"wrong":"","right":"b"},{"wrong":"c","right":"d"}]');
    expect(r).toEqual([{ wrong: 'c', right: 'd', reason: undefined, grammarPoint: undefined }]);
  });

  it('没有纠错时 [] 合法；垃圾输入返回空数组', () => {
    expect(parseCorrections('[]')).toEqual([]);
    expect(parseCorrections('这段对话没有错误')).toEqual([]);
    expect(parseCorrections('[{oops]')).toEqual([]);
  });

  it('围栏 + 前后废话照常解析', () => {
    const r = parseCorrections('抽取结果如下：\n```json\n[{"wrong":"x","right":"y"}]\n```');
    expect(r).toHaveLength(1);
  });
});
