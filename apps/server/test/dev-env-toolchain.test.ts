import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEV_ENV,
  DEV_ENV_TOOL_IDS,
  probeTool,
} from '../src/services/dev-env';

describe('programming toolchain detection', () => {
  it('detects Java, Python, Node, C, C++ and CMake as first-class tools', () => {
    for (const id of ['java', 'python', 'node', 'c', 'cpp', 'cmake'] as const) {
      expect(DEV_ENV_TOOL_IDS).toContain(id);
    }
    expect(DEFAULT_DEV_ENV).toMatchObject({
      cCompilerPath: '',
      cppCompilerPath: '',
      cmakePath: '',
    });
  });

  it('returns a stable missing-tool status instead of throwing', () => {
    const cfg = {
      ...DEFAULT_DEV_ENV,
      cCompilerPath: 'Z:/definitely-missing/gcc.exe',
    };
    const status = probeTool('c', cfg);
    expect(status.id).toBe('c');
    expect(typeof status.ok).toBe('boolean');
    if (status.ok) expect(status.version.length).toBeGreaterThan(0);
    else expect(status.error.length).toBeGreaterThan(5);
  });
});
