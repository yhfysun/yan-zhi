import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { collectRuntimeSpecifiers } = require('../scripts/lib/runtime-imports.cjs') as {
  collectRuntimeSpecifiers: (code: string, fileName?: string) => string[];
};

describe('移动端内嵌后端运行时依赖扫描', () => {
  it('识别静态导入、导出转发、动态导入与 require', () => {
    const code = [
      "import path from 'node:path';",
      "export { x } from '@scope/pkg/subpath';",
      "const reload = () => import('pinyin-pro');",
      "const legacy = require('express');",
    ].join('\n');

    expect(collectRuntimeSpecifiers(code)).toEqual([
      'node:path',
      '@scope/pkg/subpath',
      'pinyin-pro',
      'express',
    ]);
  });

  it('不把课程示例源码字符串误判为运行时依赖', () => {
    const code = [
      "const lesson = `import { useEffect } from 'react';",
      "await import('left-pad');",
      "require('vitest');`;",
      'const goExample = `"context"\\n\'fmt\'`;',
    ].join('\n');

    expect(collectRuntimeSpecifiers(code)).toEqual([]);
  });
});
