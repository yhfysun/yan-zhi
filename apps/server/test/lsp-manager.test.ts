// P2-5 tsserver 接入测试。
//
// 两部分：
//   A. 位置解析（纯函数）：列号/符号/首标识符三种定位、超界、CJK 行（UTF-16 码元口径）、无标识符；
//   B. 真实集成：临时项目里造 re-export 链（index.ts 转出 impl.ts 的实现），
//      走 tsserverDefinition 精确跳转 —— 这正是 P2-5 的验收标准（AST 启发式在此场景
//      会停在转发行，tsserver 必须命中实现行）。tsserver 不可用时 skip（环境降级不假红）。
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  resolveTsserverPosition, findTsserverScript, tsserverDefinition, shutdownLspServers, lspServerStats,
} from '../src/services/lsp-manager.js';

describe('A. resolveTsserverPosition（纯函数）', () => {
  const content = ['const a = 1;', 'function resolveToolPath(p) { return p; }', '// 中文注释：处理路径', '  const x = resolveToolPath(y);'].join('\n');

  it('显式 column 优先（1-based 原样透传，超长收尾到行尾+1）', () => {
    expect(resolveTsserverPosition(content, 1, 7)).toEqual({ offset: 7, lineText: 'const a = 1;' });
    const r = resolveTsserverPosition(content, 1, 999);
    expect('offset' in r && r.offset).toBe('const a = 1;'.length + 1);
  });

  it('symbol 定位：行内首次出现（列号 = 下标 + 1）', () => {
    const r = resolveTsserverPosition(content, 4, null, 'resolveToolPath');
    expect(r).toEqual({ offset: '  const x = '.length + 1, lineText: '  const x = resolveToolPath(y);' });
  });

  it('symbol 不在该行 → 明确报错（引导补 column 或核对行号）', () => {
    const r = resolveTsserverPosition(content, 1, null, 'resolveToolPath');
    expect('error' in r && r.error).toContain('该行未找到符号');
  });

  it('无 symbol/column → 行内第一个标识符（跳过缩进）', () => {
    const r = resolveTsserverPosition(content, 4);
    expect('offset' in r && r.offset).toBe(3); // 两个空格后 "const" 的 c
  });

  it('行号超界 / 纯空行无标识符 → 报错不抛异常', () => {
    expect('error' in resolveTsserverPosition(content, 99)).toBe(true);
    expect('error' in resolveTsserverPosition('', 1)).toBe(true);
  });

  it('CJK 行：offset 是 UTF-16 码元口径（= JS 下标 + 1），不是"视觉列号"', () => {
    const line = 'const 路径 = 处理(resolveToolPath);';
    const r = resolveTsserverPosition(line, 1, null, 'resolveToolPath');
    expect(r).toEqual({ offset: line.indexOf('resolveToolPath') + 1, lineText: line });
  });
});

describe('B0. 故障熔断（假 tsserver 启动即退出）', () => {
  afterAll(() => shutdownLspServers());

  it('意外退出自动重启一次，再失败熔断；熔断后调用不再 spawn，返回引导文案', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-lsp-bad-'));
    try {
      const lib = path.join(root, 'node_modules', 'typescript', 'lib');
      fs.mkdirSync(lib, { recursive: true });
      fs.writeFileSync(path.join(lib, 'tsserver.js'), 'process.exit(1);\n', 'utf-8');
      const file = path.join(root, 'a.ts');
      fs.writeFileSync(file, 'const a = 1;\n', 'utf-8');

      const first = await tsserverDefinition(root, file, 1, 1);
      expect(first.ok).toBe(false); // 进程起不来必然失败，且不挂到 20s 超时

      // 第一次退出 → 自动重启 → 再失败 → 熔断（等 broken 标记落地）
      for (let i = 0; i < 50 && !lspServerStats().some((s) => s.root === root && s.broken); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(lspServerStats().some((s) => s.root === root && s.broken)).toBe(true);

      const second = await tsserverDefinition(root, file, 1, 1);
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error).toContain('熔断');
    } finally {
      shutdownLspServers();
      try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* 清理失败不影响断言 */ }
    }
  }, 30_000);
});

describe('B. tsserver 集成（真实子进程 + re-export 链）', () => {
  const tsserverScript = findTsserverScript(path.resolve(__dirname, '..', '..', '..'));
  const maybe = tsserverScript ? it : it.skip;

  afterAll(() => shutdownLspServers());

  maybe('re-export 符号的定义跳转命中实现文件（AST 启发式会停在转发行）', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-lsp-'));
    try {
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { target: 'ES2020', module: 'ESNext', moduleResolution: 'node', strict: false },
        include: ['src'],
      }), 'utf-8');
      fs.writeFileSync(path.join(root, 'src', 'impl.ts'), [
        '// 实现文件：tsserver 必须命中这里',
        'export function resolveToolPath(p: string): string {',
        '  return p + "/resolved";',
        '}',
      ].join('\n'), 'utf-8');
      fs.writeFileSync(path.join(root, 'src', 'index.ts'), [
        "export { resolveToolPath } from './impl';",
      ].join('\n'), 'utf-8');

      const entry = path.join(root, 'src', 'index.ts');
      const content = fs.readFileSync(entry, 'utf-8');
      const pos = resolveTsserverPosition(content, 1, null, 'resolveToolPath');
      expect('offset' in pos).toBe(true);
      if (!('offset' in pos)) return;

      const r = await tsserverDefinition(root, entry, 1, pos.offset);
      expect(r.ok, `tsserver 调用失败：${!r.ok ? r.error : ''}`).toBe(true);
      if (!r.ok) return;
      expect(r.defs.length).toBeGreaterThan(0);
      const hit = r.defs[0];
      expect(hit.file.replace(/\\/g, '/')).toContain('src/impl.ts');
      expect(hit.preview).toContain('export function resolveToolPath');
      // 会话内单例：再查一次不应新起进程
      const before = lspServerStats().length;
      await tsserverDefinition(root, entry, 1, pos.offset);
      expect(lspServerStats().length).toBe(before);
    } finally {
      shutdownLspServers();
      try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* 清理失败不影响断言 */ }
    }
  }, 60_000);
});

describe('C. 接线守卫（源码扫描：五个触点缺一即失效）', () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

  it('白名单/分发/path-guard 读守卫/只读安全集/默认暴露/工具定义 全部接线', () => {
    const executor = read('../src/mcp/api-tool-executor.ts');
    expect(executor).toContain("'api_code_definition'"); // SUPPORTED_API_TOOLS：不在 → 配置层直接过滤
    expect(executor).toMatch(/case 'api_code_definition':/); // 注册了无 case → 调用返回「未实现的 API 工具」

    // path-guard：file 参数按“读”守卫；漏接 → 工作目录外的文件也能被读取定位
    expect(read('../src/services/path-guard.ts')).toMatch(
      /api_code_definition:\s*\[\{\s*field:\s*'file',\s*action:\s*'read'\s*\}\]/,
    );
    // 只读安全集：漏接 → 只读档会话里工具不可见
    expect(read('../src/tool-permission.ts')).toContain("'api_code_definition'");
    // 默认暴露（未挂载专属 api 工具链的智能体）
    expect(read('../src/llm-task-manager.ts')).toContain("'api_code_definition'");
    // core 侧工具定义（名称/入参 schema）
    expect(read('../../../packages/core/src/tool/builtin/api-tools/workspace.ts')).toMatch(
      /name:\s*'api_code_definition'/,
    );
  });
});