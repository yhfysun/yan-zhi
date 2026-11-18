import { describe, expect, it } from 'vitest';
import { sanitizeUserFacingError } from './user-facing-errors';

describe('用户可见错误', () => {
  it('隐藏模型平台内部 id', () => {
    expect(sanitizeUserFacingError('平台不存在或已删除（platformId: agents-guest）')).toBe(
      '当前模型平台已删除或不可用，请重新选择模型。',
    );
    expect(sanitizeUserFacingError('平台不存在或已删除: agents-guest')).toBe(
      '当前模型平台已删除或不可用，请重新选择模型。',
    );
  });

  it('保留普通业务提示', () => {
    expect(sanitizeUserFacingError('请先选择目标平台')).toBe('请先选择目标平台');
  });
});
