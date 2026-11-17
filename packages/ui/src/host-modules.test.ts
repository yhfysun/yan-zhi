import { describe, expect, it } from 'vitest';
import { HOST_MODULE_COUNT, HOST_MODULES } from './host-modules';

describe('plugin host module registry', () => {
  it('registers nested utility modules used by plugin frontends', () => {
    expect(HOST_MODULE_COUNT).toBeGreaterThan(20);
    expect(HOST_MODULES['utils/learning/score-render']).toBeTruthy();
  });
});
