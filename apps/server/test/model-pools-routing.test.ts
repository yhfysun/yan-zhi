import { describe, expect, it } from 'vitest';
import { parsePoolsJson } from '../src/services/model-pools.js';

describe('model-pools routing contract', () => {
  it('旧池没有 routing 时保持顺序优先语义', () => {
    expect(parsePoolsJson('{"llm":["m1","m2"]}')).toEqual({
      llm: ['m1', 'm2'],
    });
  });

  it('保留合法 routing，忽略未知值', () => {
    expect(parsePoolsJson('{"llm":["m1"],"routing":"health"}').routing).toBe('health');
    expect(parsePoolsJson('{"llm":["m1"],"routing":"priority"}').routing).toBe('priority');
    expect(parsePoolsJson('{"llm":["m1"],"routing":"random"}').routing).toBeUndefined();
  });
});
