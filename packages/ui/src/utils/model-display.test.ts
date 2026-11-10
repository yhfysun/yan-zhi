import { describe, expect, it } from 'vitest';
import { resolveModelDisplayName } from './model-display';

const MODELS = [
  { id: 'internal-uuid-1', modelId: 'text-embedding-v4', alias: '通义向量' },
  { id: 'internal-uuid-2', modelId: 'gpt-4o-mini', alias: '' },
];

describe('resolveModelDisplayName', () => {
  it('会话引用内部模型 id 时优先显示别名', () => {
    expect(resolveModelDisplayName(MODELS, 'internal-uuid-1')).toBe('通义向量');
  });

  it('别名为空时显示平台模型 ID，而不是内部 UUID', () => {
    expect(resolveModelDisplayName(MODELS, 'internal-uuid-2')).toBe('gpt-4o-mini');
  });

  it('会话已经保存平台模型 ID 时也能反查别名', () => {
    expect(resolveModelDisplayName(MODELS, 'text-embedding-v4')).toBe('通义向量');
  });

  it('模型已删除时回退原始引用，空引用不占位', () => {
    expect(resolveModelDisplayName(MODELS, 'unknown-model')).toBe('unknown-model');
    expect(resolveModelDisplayName(MODELS, '')).toBe('');
  });
});
