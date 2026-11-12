import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../../../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

describe('learning character stage layout', () => {
  it('keeps a 3D character inside the stage instead of scaling the canvas container like a 2D sprite', () => {
    const stage = read('packages/ui/src/components/learning/LearnStage.vue');
    expect(stage).toContain("return { width: '100%', height: '100%' }");
    expect(stage).not.toContain('Math.round(190 * s)');
    expect(stage).not.toContain('Math.round(280 * s)');
  });

  it('clips the coach stage and frames VRM height after user scale changes', () => {
    const learning = read('packages/ui/src/views/Learning.vue');
    const pet3d = read('packages/ui/src/components/pet/Pet3D.vue');
    expect(learning).toMatch(/\.lp-coach-stage\s*\{[^}]*overflow:\s*hidden/);
    expect(pet3d).toContain('frameVrm(next.height * props.scale)');
    expect(pet3d).toContain('frameVrm(loaded.height * s)');
  });

  it('does not render the 2D fallback on top of a loading 3D avatar', () => {
    const stage = read('packages/ui/src/components/learning/LearnStage.vue');
    expect(stage).not.toContain("vrmLoadState.value !== 'ready'");
    expect(stage).toContain("vrmLoadState.value === 'error'");
  });
});
