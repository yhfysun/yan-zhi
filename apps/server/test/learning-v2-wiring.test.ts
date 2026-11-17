import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { learningModeManifest } from '../src/plugins/learning-mode.js';

describe('Learning V2 wiring', () => {
  it('registers the new learning route without removing the legacy entry', () => {
    const routes = learningModeManifest.contributes?.routes || [];
    expect(routes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/learning', component: 'views/Learning.vue' }),
      expect.objectContaining({ path: '/learning-v2', component: 'views/LearningV2.vue' }),
    ]));
    expect(learningModeManifest.contributes?.mode).toEqual(expect.objectContaining({
      key: 'learning',
      route: '/learning-v2',
    }));
  });

  it('includes LearningV2 in the generated plugin view loaders', () => {
    const generated = readFileSync(resolve(__dirname, '../../../packages/ui/src/generated/build-modes.ts'), 'utf8');
    expect(generated).toContain('"views/LearningV2.vue"');
  });

  it('bundles LearningV2 in the learning plugin frontend catalog', () => {
    const catalog = JSON.parse(
      readFileSync(resolve(__dirname, '../../../build/plugins.catalog.json'), 'utf8'),
    ) as { plugins: Record<string, { frontendViews?: string[] }> };
    expect(catalog.plugins['learning-mode']?.frontendViews).toContain('views/LearningV2.vue');
  });
});
