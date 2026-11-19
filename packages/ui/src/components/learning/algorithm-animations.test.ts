import { describe, expect, it } from 'vitest';
import { ALGORITHM_ANIMATION_SCENES } from './algorithm-animations';

function scene(id: string) {
  const value = ALGORITHM_ANIMATION_SCENES.find((item) => item.id === id);
  if (!value) throw new Error(`Missing animation scene: ${id}`);
  return value;
}

describe('algorithm animation content', () => {
  it('publishes ten distinct, complete and story-led scenes', () => {
    expect(ALGORITHM_ANIMATION_SCENES).toHaveLength(10);
    expect(new Set(ALGORITHM_ANIMATION_SCENES.map((item) => item.id)).size).toBe(10);
    for (const item of ALGORITHM_ANIMATION_SCENES) {
      expect(item.story.length).toBeGreaterThan(10);
      expect(item.question.length).toBeGreaterThan(10);
      expect(item.complexity).not.toBe('');
      expect(item.code).not.toBe('');
      expect(item.steps.length).toBeGreaterThanOrEqual(6);
      for (const step of item.steps) {
        expect(step.title).not.toBe('');
        expect(step.narration).not.toBe('');
        expect(step.invariant).not.toBe('');
      }
    }
  });

  it('finishes each algorithm in a verifiably correct state', () => {
    const bubble = scene('bubble-sort').steps.at(-1)?.frame;
    expect(bubble?.values).toEqual([1, 2, 4, 5, 8]);
    expect(bubble?.done).toEqual([0, 1, 2, 3, 4]);

    const binary = scene('binary-search').steps.at(-1)?.frame;
    expect(binary?.found).toBe(true);
    expect(binary?.values?.[binary.mid || 0]).toBe(23);

    const heap = scene('max-heap').steps.at(-1)?.frame;
    expect(heap?.values?.[0]).toBe(35);

    const graph = scene('graph-bfs').steps.at(-1)?.frame;
    expect(graph?.visited).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(graph?.frontier).toEqual([]);

    const editDistance = scene('edit-distance').steps.at(-1)?.frame;
    expect(editDistance?.matrix?.at(-1)?.at(-1)).toBe(3);

    const window = scene('sliding-window').steps.at(-1)?.frame;
    expect(window?.bestLength).toBe(3);
  });
});
