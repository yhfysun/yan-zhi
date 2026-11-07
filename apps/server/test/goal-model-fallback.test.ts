import { describe, expect, it } from 'vitest';
import { selectGoalFallbackCandidate } from '../src/services/goal-model-fallback.js';

describe('goal model fallback', () => {
  it('selects the first untried candidate other than the current model', () => {
    const candidates = [
      { platformId: 'p1', modelId: 'm1' },
      { platformId: 'p2', modelId: 'm2' },
      { platformId: 'p3', modelId: 'm3' },
    ];
    expect(selectGoalFallbackCandidate(
      candidates,
      { platformId: 'p1', modelId: 'm1' },
      new Set(['m1']),
    )).toEqual({ platformId: 'p2', modelId: 'm2' });
  });

  it('returns null after all candidates have failed', () => {
    expect(selectGoalFallbackCandidate(
      [{ platformId: 'p1', modelId: 'm1' }],
      { platformId: 'p1', modelId: 'm1' },
      new Set(['m1']),
    )).toBeNull();
  });
});
