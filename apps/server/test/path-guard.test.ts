/**
 * 文件工具越界守卫（path-guard）单测。
 *
 * 钉死四条硬约定（每条都对应一个"已经踩过或极易踩"的坑）：
 *   1. **产物目录必须算允许根** —— 产物根 = 空间目录 > 工作目录 > 数据根，
 *      不等于工作目录；漏掉它 → file_write 写自己的产物被拦 → 生成全挂（最坏误伤）。
 *   2. **只抽显式给出的路径** —— 未给路径时 resolveToolPath('') 返回工作目录根，
 *      若也参与判定就等于"每次调用都判一次"，且语义是错的。
 *   3. **相对路径先按工作目录解析再判** —— 否则 "02-work/x.md" 会被判越界（误拦）。
 *   4. **Windows 大小写不敏感** —— C:/Proj 与 c:/proj 是同一处，不归一化会误判越界。
 *
 * 另覆盖：命令类工具（cmd_exec/python_exec）走"整条命令授权"、一次列全部越界项、
 * 授权白名单父目录粒度、无允许根时的保守行为。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import {
  checkPathAccess,
  collectPathArgs,
  isWithinRoot,
  normalizeForCompare,
  allowedRootsFor,
  authorizeDir,
  getAuthorizedDirs,
  isCommandAuthorized,
  authorizeCommand,
  clearAuthorization,
  resetAllAuthorizations,
  COMMAND_TOOLS,
} from '../src/services/path-guard';

const WS = process.platform === 'win32' ? 'C:\\proj\\demo' : '/proj/demo';
const OUTSIDE = process.platform === 'win32' ? 'C:\\other\\project' : '/other/project';
const join = (...p: string[]) => p.join(path.sep);

beforeEach(() => {
  resetAllAuthorizations();
});

describe('isWithinRoot —— 与项目既有 4 处校验同判据', () => {
  it('根自身算在内（startsWith(r+sep) 会漏掉，导致 file_list {path:"."} 被误拦）', () => {
    expect(isWithinRoot(WS, WS)).toBe(true);
  });

  it('子路径算在内', () => {
    expect(isWithinRoot(join(WS, 'src', 'a.ts'), WS)).toBe(true);
  });

  it('兄弟目录（前缀相同但不是子路径）算越界 —— 必须比到分隔符', () => {
    const sibling = WS + '-backup';
    expect(isWithinRoot(sibling, WS)).toBe(false);
  });

  it('父目录算越界', () => {
    expect(isWithinRoot(path.dirname(WS), WS)).toBe(false);
  });

  it('Windows 大小写不敏感（否则用户明明在授权目录里却被弹窗）', () => {
    const upper = WS.toUpperCase();
    const lower = WS.toLowerCase();
    if (upper === lower) return; // POSIX 上跳过
    expect(isWithinRoot(join(upper, 'a.ts'), lower)).toBe(true);
    expect(isWithinRoot(join(lower, 'a.ts'), upper)).toBe(true);
  });

  it('空值不 crash 且不通过', () => {
    expect(isWithinRoot('', WS)).toBe(false);
    expect(isWithinRoot(WS, '')).toBe(false);
  });
});

describe('normalizeForCompare', () => {
  it('去尾分隔符（"C:/proj/" 与 "C:/proj" 是同一处）', () => {
    expect(normalizeForCompare(WS + path.sep)).toBe(normalizeForCompare(WS));
  });

  it('绝对化相对路径', () => {
    const rel = 'a/b';
    expect(normalizeForCompare(rel)).toBe(normalizeForCompare(path.resolve(rel)));
  });
});

describe('collectPathArgs —— 按声明表抽，只抽显式给出', () => {
  it('file_read 抽 path（read）', () => {
    const items = collectPathArgs('file_read', { path: 'a.md' }, WS);
    expect(items).toHaveLength(1);
    expect(items[0].action).toBe('read');
    // ★ 用归一化比对而不是字面比：core 的 resolveToolPath 统一用 `/` 拼接
    //   （joinPath 注释："统一用 /，Windows 下 fs 也接受"），Windows 上会得到
    //   `C:\proj\demo/a.md` 这种**混合分隔符**。本模块的判定全走 normalizeForCompare，
    //   所以混合分隔符不影响正确性 —— 这里钉的是"解析到了同一位置"，不是分隔符风格。
    expect(normalizeForCompare(items[0].absPath)).toBe(normalizeForCompare(join(WS, 'a.md')));
  });

  it('file_write 抽 path（write）', () => {
    const items = collectPathArgs('file_write', { path: 'a.md', content: 'x' }, WS);
    expect(items[0].action).toBe('write');
  });

  it('★ 只给 file_name 不给 path → 不抽（常规写入不需要授权）', () => {
    const items = collectPathArgs('file_write', { content: 'x', file_name: 'a.md' }, WS);
    expect(items).toHaveLength(0);
  });

  it('★ 空串 / 纯空白 → 不抽（"没给路径"不该弹窗）', () => {
    expect(collectPathArgs('file_read', { path: '' }, WS)).toHaveLength(0);
    expect(collectPathArgs('file_read', { path: '   ' }, WS)).toHaveLength(0);
  });

  it('★ doyz 的 out 是写、其余是读 —— 漏掉 out 就是"写越界静默放行"', () => {
    const items = collectPathArgs('doyz', { file: 'a.doyz', out: 'C:/x/a.docx' }, WS);
    const byField = Object.fromEntries(items.map((i) => [i.rawPath, i.action]));
    expect(byField['a.doyz']).toBe('read');
    expect(byField['C:/x/a.docx']).toBe('write');
  });

  it('★ 相对路径先按工作目录解析（否则 "02-work/x.md" 会被误判越界）', () => {
    const items = collectPathArgs('file_read', { path: '02-work/x.md' }, WS);
    expect(normalizeForCompare(items[0].absPath)).toBe(normalizeForCompare(join(WS, '02-work', 'x.md')));
    // 解析后必须在允许根内（否则就是误拦）
    expect(isWithinRoot(items[0].absPath, WS)).toBe(true);
  });

  it('未登记的工具 → 不抽（不碰文件系统的不该被判）', () => {
    expect(collectPathArgs('js_exec', { code: 'return 1' }, WS)).toHaveLength(0);
    expect(collectPathArgs('ask_user', { question: 'q' }, WS)).toHaveLength(0);
  });

  it('★ media_edit 的 6 个路径字段全都要抽（漏一个 = 那条 op 静默越界）', () => {
    const items = collectPathArgs('media_edit', {
      video: join(OUTSIDE, 'a.mp4'),
      video2: join(OUTSIDE, 'b.mp4'),
      media: join(OUTSIDE, 'c.mp3'),
      image: join(OUTSIDE, 'd.png'),
      overlay: join(OUTSIDE, 'e.png'),
      audio: join(OUTSIDE, 'f.mp3'),
    }, WS);
    expect(items).toHaveLength(6);
    expect(items.every((i) => i.action === 'read')).toBe(true);
  });

  it('media_edit 只给 video 时只抽一个（未给的字段不参与）', () => {
    const items = collectPathArgs('media_edit', { op: 'trim', video: 'a.mp4' }, WS);
    expect(items).toHaveLength(1);
    expect(items[0].absPath).toContain('a.mp4');
  });

  it('★ api_tool_ocr 传 path 要抽；只传 image(base64) 不抽', () => {
    expect(collectPathArgs('api_tool_ocr', { path: join(OUTSIDE, 'x.png') }, WS)).toHaveLength(1);
    expect(collectPathArgs('api_tool_ocr', { image: 'AAAA' }, WS)).toHaveLength(0);
  });

  it('media_edit 读越界文件 → need-auth', () => {
    const v = checkPathAccess({
      toolName: 'media_edit',
      args: { op: 'trim', video: join(OUTSIDE, 'a.mp4') },
      workspaceDir: WS,
      allowedRoots: [WS],
    });
    expect(v.kind).toBe('need-auth');
  });
});

describe('checkPathAccess —— 判定', () => {
  const NO_DIRS: string[] = [];

  it('工作目录内 → allow', () => {
    const v = checkPathAccess({
      toolName: 'file_read', args: { path: 'a.md' }, workspaceDir: WS, allowedRoots: [WS],
    });
    expect(v.kind).toBe('allow');
  });

  it('★ 产物目录（≠工作目录）必须放行 —— 最坏误伤就是拦自己的产物', () => {
    const artifactRoot = process.platform === 'win32' ? 'C:\\data\\artifacts' : '/data/artifacts';
    const artifactDir = join(artifactRoot, '.yan-zhi', 'tasks', 'conv1', 'deliverables');
    const v = checkPathAccess({
      toolName: 'file_write',
      args: { path: join(artifactDir, 'r.md') },
      workspaceDir: WS,
      allowedRoots: [WS, artifactDir],
    });
    expect(v.kind).toBe('allow');
  });

  it('越界读 → need-auth，且 action 是 read（文案会更轻）', () => {
    const v = checkPathAccess({
      toolName: 'file_read',
      args: { path: join(OUTSIDE, 'secret.md') },
      workspaceDir: WS,
      allowedRoots: [WS],
    });
    expect(v.kind).toBe('need-auth');
    if (v.kind === 'need-auth') {
      expect(v.items).toHaveLength(1);
      expect(v.items[0].action).toBe('read');
    }
  });

  it('越界写 → need-auth', () => {
    const v = checkPathAccess({
      toolName: 'file_write',
      args: { path: join(OUTSIDE, 'x.md'), content: 'x' },
      workspaceDir: WS,
      allowedRoots: [WS],
    });
    expect(v.kind).toBe('need-auth');
  });

  it('★ 一次列全部越界项（同批多路径，逐个弹是体验灾难）', () => {
    const v = checkPathAccess({
      toolName: 'doyz',
      args: { file: join(OUTSIDE, 'a.doyz'), out: join(OUTSIDE, 'b.docx') },
      workspaceDir: WS,
      allowedRoots: [WS],
    });
    expect(v.kind).toBe('need-auth');
    if (v.kind === 'need-auth') expect(v.items).toHaveLength(2);
  });

  it('★ 一部分在内一部分在外 → 只列越界的那部分', () => {
    const v = checkPathAccess({
      toolName: 'doyz',
      args: { file: 'inside.doyz', out: join(OUTSIDE, 'b.docx') },
      workspaceDir: WS,
      allowedRoots: [WS],
    });
    expect(v.kind).toBe('need-auth');
    if (v.kind === 'need-auth') {
      expect(v.items).toHaveLength(1);
      expect(v.items[0].rawPath).toBe(join(OUTSIDE, 'b.docx'));
    }
  });

  it('会话已授权目录 → 并入允许根后放行', () => {
    const v = checkPathAccess({
      toolName: 'file_read',
      args: { path: join(OUTSIDE, 'x.md') },
      workspaceDir: WS,
      allowedRoots: [WS],
      authorizedDirs: [OUTSIDE],
    });
    expect(v.kind).toBe('allow');
  });

  it('不碰路径的工具 → allow（不打扰）', () => {
    const v = checkPathAccess({
      toolName: 'js_exec', args: { code: 'return 1' }, workspaceDir: WS, allowedRoots: [WS],
    });
    expect(v.kind).toBe('allow');
  });

  it('★ 无任何允许根 → 保守报 need-auth（不默认放行）', () => {
    const v = checkPathAccess({
      toolName: 'file_read', args: { path: 'a.md' }, workspaceDir: WS, allowedRoots: [],
    });
    // 无根时 collectPathArgs 仍抽出路径（相对路径已解析），roots 为空 → 保守 need-auth
    expect(v.kind).toBe('need-auth');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ★★★ 无工作目录 + 相对路径 —— 2026-10-08 实测缺陷（会话接口 500 同源的连带问题）
  //
  // 背景：`resolveToolPath` 在**无工作目录**时会把相对路径**原样返回**
  //   （fs-walk.ts:67 的"旧行为"分支）。于是这里 `absPath` 就是 `"a.md"` 这种相对串，
  //   与任何绝对根比较都"不在内" → 判定越界 → need-auth。
  // 后果（实测）：纯聊天会话（无工作目录）里模型调 file_read 会被要求授权；
  //   有前端时是无意义的骚扰弹窗，**无前端时永久挂起**
  //   （`PATH_AUTH_TIMEOUT_MS = 0` = 不超时，`react-loop.test.ts` 因此 8s 超时卡死）。
  //
  // 判据：**相对路径不是"越界"，而是"以工作目录为基准"**。
  //   没有工作目录时它无处可去 —— 这是"缺少配置"（应由调用方按策略拒绝/提示），
  //   不是"访问了外面的世界"，不该走授权流程。要求用户在弹窗里授权一个
  //   相对路径（"2026年值得入手的手机推荐"）本身也说不通。
  // ══════════════════════════════════════════════════════════════════════════
  it('★★ 无工作目录 + 相对路径 → 不得 need-auth（相对路径不是越界，是缺配置）', () => {
    const v = checkPathAccess({
      toolName: 'file_read',
      args: { path: 'some-relative-name' },
      workspaceDir: null,
      allowedRoots: [],
    });
    expect(v.kind).not.toBe('need-auth');
  });

  it('★★ 无工作目录 + 绝对路径 → 仍须 need-auth（真正的越界不能放行）', () => {
    const abs = process.platform === 'win32' ? 'C:\\Windows\\system.ini' : '/etc/passwd';
    const v = checkPathAccess({
      toolName: 'file_read',
      args: { path: abs },
      workspaceDir: null,
      allowedRoots: [],
    });
    expect(v.kind).toBe('need-auth');
  });

  it('无允许根 + 未给路径 → allow（没路径可判）', () => {
    const v = checkPathAccess({
      toolName: 'file_write', args: { content: 'x', file_name: 'a.md' }, workspaceDir: WS, allowedRoots: [],
    });
    expect(v.kind).toBe('allow');
  });
});

describe('命令类工具：路径抽不到 → 整条命令授权', () => {
  it('cmd_exec 与 python_exec 都在 COMMAND_TOOLS', () => {
    expect(COMMAND_TOOLS.has('cmd_exec')).toBe(true);
    expect(COMMAND_TOOLS.has('python_exec')).toBe(true);
  });

  it('cmd_exec → need-auth，rawPath 是「命令 + 参数」给人过目', () => {
    const v = checkPathAccess({
      toolName: 'cmd_exec',
      args: { command: 'python', args: ['C:/outside/x.py'] },
      workspaceDir: WS,
      allowedRoots: [WS],
    });
    expect(v.kind).toBe('need-auth');
    if (v.kind === 'need-auth') {
      expect(v.items[0].toolName).toBe('cmd_exec');
      expect(v.items[0].rawPath).toContain('C:/outside/x.py');
    }
  });

  it('python_exec → need-auth，rawPath 是代码片段', () => {
    const v = checkPathAccess({
      toolName: 'python_exec',
      args: { code: 'open("C:/outside/x")' },
      workspaceDir: WS,
      allowedRoots: [WS],
    });
    expect(v.kind).toBe('need-auth');
    if (v.kind === 'need-auth') expect(v.items[0].rawPath).toContain('outside');
  });

  it('★ 命令授权与路径授权是两套状态（授权 cmd 不等于授权某目录）', () => {
    expect(isCommandAuthorized('c1')).toBe(false);
    authorizeCommand('c1');
    expect(isCommandAuthorized('c1')).toBe(true);
    // 命令授权不会顺手往目录白名单里加东西
    expect(getAuthorizedDirs('c1')).toEqual([]);
  });
});

describe('allowedRootsFor —— 允许根的**唯一定义处**', () => {
  it('工作目录在内', () => {
    const roots = allowedRootsFor(WS, null);
    expect(roots.some((r) => normalizeForCompare(r) === normalizeForCompare(WS))).toBe(true);
  });

  it('★ 带 conversationId 时产物根进入允许根（会话产物可能不在工作目录下）', () => {
    const roots = allowedRootsFor(WS, 'conv_x_no_such');
    // 会话不存在时 resolveArtifactDirFor 退回"按日期 + 未命名任务"，root 仍会给出
    expect(roots.length).toBeGreaterThanOrEqual(1);
    // 至少包含工作目录
    expect(roots.some((r) => normalizeForCompare(r) === normalizeForCompare(WS))).toBe(true);
  });

  it('去重（同一根不重复出现）', () => {
    const roots = allowedRootsFor(WS, null);
    const norm = roots.map(normalizeForCompare);
    expect(new Set(norm).size).toBe(norm.length);
  });

  it('去尾分隔符（避免 "C:/proj/" 与 "C:/proj" 被当两个根）', () => {
    const roots = allowedRootsFor(WS + path.sep, null);
    expect(roots.every((r) => !/[\\/]$/.test(r))).toBe(true);
  });

  it('★ 工作目录为空时不给空根（空根会让 isWithinRoot 恒 false）', () => {
    const roots = allowedRootsFor('', null);
    expect(roots.every((r) => r.trim().length > 0)).toBe(true);
  });
});

describe('会话级授权状态', () => {
  it('authorizeDir 存**父目录**粒度过（允许一次 → 同目录后续不再问）', () => {
    const target = join(OUTSIDE, 'sub', 'deep', 'a.md');
    const dir = authorizeDir('c1', target);
    expect(dir).toBe(join(OUTSIDE, 'sub', 'deep'));

    const v = checkPathAccess({
      toolName: 'file_read',
      args: { path: join(OUTSIDE, 'sub', 'deep', 'b.md') },
      workspaceDir: WS,
      allowedRoots: [WS],
      authorizedDirs: getAuthorizedDirs('c1'),
    });
    expect(v.kind).toBe('allow');
  });

  it('父目录授权不覆盖兄弟目录（边界不外扩）', () => {
    authorizeDir('c1', join(OUTSIDE, 'sub', 'a.md'));
    const v = checkPathAccess({
      toolName: 'file_read',
      args: { path: join(OUTSIDE, 'sibling', 'b.md') },
      workspaceDir: WS,
      allowedRoots: [WS],
      authorizedDirs: getAuthorizedDirs('c1'),
    });
    expect(v.kind).toBe('need-auth');
  });

  it('会话隔离：c1 的授权不影响 c2', () => {
    authorizeDir('c1', join(OUTSIDE, 'x.md'));
    expect(getAuthorizedDirs('c2')).toEqual([]);
  });

  it('clearAuthorization 清干净（含命令授权）', () => {
    authorizeDir('c1', join(OUTSIDE, 'x.md'));
    authorizeCommand('c1');
    clearAuthorization('c1');
    expect(getAuthorizedDirs('c1')).toEqual([]);
    expect(isCommandAuthorized('c1')).toBe(false);
  });
});
// ─────────────── 危险命令护栏（2026-10-03 P1）───────────────
// 守住的语义：破坏性命令必须命中（每次单独授权的依据）；
// 高频正当命令绝不误伤（否则弹窗骚扰会让用户麻痹）。
import { checkDangerousCommand } from '../src/services/path-guard.js';

describe('checkDangerousCommand 危险命令判定', () => {
  const risky: Array<[string, string]> = [
    ['rm -rf /', '递归删除'],
    ['rm -rf build', '递归删除'],
    ['rd /s /q build', '递归删除目录'],
    ['del /s /q *.log', '批量删除'],
    ['Remove-Item -Recurse -Force dist', 'PowerShell 递归删除'],
    ['format C:', '格式化'],
    ['dd if=/dev/zero of=/dev/sda', '磁盘级写入'],
    ['shutdown /s', '关机'],
    ['git push --force origin main', '强制推送'],
    ['git push -f', '强制推送'],
    ['git reset --hard HEAD~3', '丢弃全部未提交改动'],
    ['git clean -fd', '删除未跟踪文件'],
    ['chmod -R 777 /', '递归修改文件权限'],
    ['taskkill /f /im node.exe', '强制结束进程'],
    ['reg add HKLM\\Software\\x /v y', '写注册表'],
    ['npm publish', '发布'],
    ["shutil.rmtree('build')", 'Python 内递归删除'],
    ['DROP TABLE users', '删库'],
  ];

  it.each(risky)('危险命令命中：%s（%s）', (cmd) => {
    const hit = checkDangerousCommand(cmd);
    expect(hit, cmd).not.toBeNull();
    expect(hit!.why.length).toBeGreaterThan(0);
  });

  it.each([
    'npm test',
    'npm run build',
    'pnpm vitest run test/path-guard.test.ts',
    'git status',
    'git push origin main',
    'git push --force-with-lease origin main',
    // 已知误报类（设计取舍）：破坏性模式出现在引号内容里（如提交信息提到 rm -rf）会触发
    // 确认弹窗 —— 判定只多弹一次确认不拦截，误报成本低、漏报风险高，宁可误报。不放本组。
    'tsc --noEmit',
    'node scripts/build-python-runtime.mjs',
    'python test.py',
    'dir',
    'echo hello',
    '',
  ])('正当命令不误伤：%s', (cmd) => {
    expect(checkDangerousCommand(cmd)).toBeNull();
  });
});
