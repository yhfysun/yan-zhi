// 源码扫描引擎：遍历 → 规则 → 依赖 → 归一。
//
// 只读：不执行被测代码、不联网、不改文件（唯一的写是编排层落作业）。
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ScanContext, ScanFinding, ScanResult, Scanner } from '../types.js';
import { fingerprintOf } from '../types.js';
import { rulesForExt, type RuleFile } from './rules.js';
import { auditDependencies, DEP_SNAPSHOT_DATE } from './deps.js';

const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.py', '.java', '.go', '.php', '.rb', '.cs',
  '.kt', '.swift', '.sql', '.yml', '.yaml', '.json', '.html', '.htm', '.sh', '.ps1', '.env',
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'release', 'coverage', 'vendor', '.cache', '.next', 'out',
  'resources', '.turbo', '.output', 'unpackage', 'runtime', 'logs',
]);

/** 目录名匹配：node_modules.stale-* / dist-release-* / yanzhi-dist-release 都是构建残留 */
function skipDir(name: string): boolean {
  if (name.startsWith('.')) return true;
  if (name.startsWith('node_modules')) return true;
  if (name.startsWith('dist-release') || name.startsWith('yanzhi-dist-release')) return true;
  return SKIP_DIRS.has(name);
}

/** 文件级排除：类型声明、压缩产物、地图文件都不是可审计源码 */
function skipFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.d.ts') || lower.endsWith('.min.js') || lower.endsWith('.map');
}

/** 构建出来的前端包（与源码同仓但已打包），扫它只会得到"压缩代码里的 eval" */
function isBuiltBundle(rel: string): boolean {
  if (/(^|\/)assets\/(public|nodejs)\//.test(rel)) return true;
  if (/(^|\/)plugins\/builtin\/[^/]+\/frontend\/index[0-9]*\.(mjs|js)$/.test(rel)) return true;
  return false;
}

const PROFILE_FILES: Record<string, number> = { quick: 800, standard: 2000, deep: 4000 };

interface WalkResult {
  files: string[];
  truncated: boolean;
}

async function walk(root: string, maxFiles: number, ctx: ScanContext): Promise<WalkResult> {
  const files: string[] = [];
  let truncated = false;

  const visit = async (dir: string): Promise<void> => {
    if (files.length >= maxFiles || ctx.aborted()) { truncated = true; return; }
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (files.length >= maxFiles || ctx.aborted()) { truncated = true; return; }
      if (e.isDirectory()) {
        if (skipDir(e.name)) continue;
        await visit(path.join(dir, e.name));
      } else {
        if (skipFile(e.name)) continue;
        const relToRoot = path.relative(root, path.join(dir, e.name)).split(path.sep).join('/');
        if (isBuiltBundle(relToRoot)) continue;
        const ext = path.extname(e.name).toLowerCase();
        if (TEXT_EXT.has(ext) || e.name === '.env' || e.name === '.env.local') files.push(path.join(dir, e.name));
      }
    }
  };
  await visit(root);
  return { files, truncated };
}

/** `.env` 在仓库里且没有被 .gitignore 忽略，才是真风险 */
async function envGitignoreCheck(root: string): Promise<ScanFinding | null> {
  const envExists = await fs.stat(path.join(root, '.env')).then((s) => s.isFile()).catch(() => false);
  if (!envExists) return null;
  const ignore = await fs.readFile(path.join(root, '.gitignore'), 'utf8').catch(() => '');
  const ignored = ignore.split(/\r?\n/).some((l) => /^\.env(\.\*|$)/.test(l.trim()));
  if (ignored) return null;
  const location = '.env';
  return {
    ruleId: 'env-not-ignored',
    title: '.env 未被 .gitignore 忽略',
    severity: 'high',
    detail: '仓库根目录存在 .env，且 .gitignore 没有忽略它；一旦提交，里面的凭据会进入版本历史。',
    remediation: '在 .gitignore 加入 .env / .env.*，并改用 .env.example 共享键名。',
    evidence: '.env present, not ignored',
    location,
    fingerprint: fingerprintOf('env-not-ignored', location, ''),
  };
}

async function summarizeScan(
  findings: ScanFinding[], scanned: number, total: number, truncated: boolean, profile: string,
): Promise<string> {
  const byRule = new Map<string, number>();
  for (const f of findings) byRule.set(f.ruleId, (byRule.get(f.ruleId) || 0) + 1);
  const top = [...byRule.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k, v]) => `${k}×${v}`).join('、');
  return `源码扫描（${profile}）：扫描 ${scanned}/${total} 个文件${truncated ? '（已达上限，结果不完整）' : ''}，命中 ${findings.length} 处` +
    (top ? `。主要规则：${top}` : '') +
    '\n★ 规则扫描会有误报；每条都要人工确认后再进报告（可用 finding 状态机标 fp）。';
}

export function createSourceScanner(): Scanner {
  return {
    id: 'source',
    kinds: ['source'],
    stages: ['发现文件', '规则扫描', '依赖核对', '汇总'],

    async run(ctx: ScanContext): Promise<ScanResult> {
      const root = path.resolve(ctx.target);
      const stat = await fs.stat(root).catch(() => null);
      if (!stat) throw new Error(`路径不存在：${root}`);
      if (!stat.isDirectory()) throw new Error(`源码扫描需要一个目录：${root}`);

      const maxFiles = Math.min(PROFILE_FILES[ctx.profile] || 800, ctx.limits.maxFiles);

      ctx.beginStage('发现文件');
      const { files, truncated } = await walk(root, maxFiles, ctx);
      ctx.endStage('发现文件', `${files.length} 个候选文件`);

      ctx.beginStage('规则扫描');
      const findings: ScanFinding[] = [];
      let scanned = 0;
      for (const file of files) {
        if (ctx.aborted()) break;
        const st = await fs.stat(file).catch(() => null);
        if (!st || st.size > ctx.limits.maxBytes) continue;
        const text = await fs.readFile(file, 'utf8').catch(() => null);
        if (text === null) continue;
        const rel = path.relative(root, file).split(path.sep).join('/');
        const ext = path.extname(file).toLowerCase();
        const ruleFile: RuleFile = { rel, ext, text, lines: text.split(/\r?\n/) };
        scanned++;
        for (const rule of rulesForExt(ext)) {
          for (const h of rule.scan(ruleFile)) {
            const location = `${rel}:${h.line}`;
            findings.push({
              ruleId: rule.id,
              title: `${rule.title}${rule.cwe ? `（${rule.cwe}）` : ''}`,
              severity: rule.severity,
              detail: `${rule.why}\n证据：${h.evidence}`,
              remediation: rule.fix,
              evidence: h.evidence,
              location,
              fingerprint: fingerprintOf(rule.id, location, h.evidence),
            });
            if (findings.length >= ctx.limits.maxFindings) break;
          }
          if (findings.length >= ctx.limits.maxFindings) break;
        }
        if (findings.length >= ctx.limits.maxFindings) break;
      }
      const envFinding = await envGitignoreCheck(root);
      if (envFinding) findings.push(envFinding);
      ctx.endStage('规则扫描', `${scanned} 个文件，${findings.length} 处命中`);

      ctx.beginStage('依赖核对');
      let depNote = '已跳过（quick 剖面）';
      if (ctx.profile !== 'quick' && !ctx.aborted()) {
        const dep = await auditDependencies(root);
        findings.push(...dep.findings.slice(0, Math.max(0, ctx.limits.maxFindings - findings.length)));
        depNote = `${dep.packages} 个依赖 / ${dep.manifests.length} 个清单，命中 ${dep.findings.length} 条`;
      }
      ctx.endStage('依赖核对', depNote);

      ctx.beginStage('汇总');
      const summary = await summarizeScan(findings, scanned, files.length, truncated, ctx.profile) +
        `\n依赖快照：${DEP_SNAPSHOT_DATE}（离线快照，非实时漏洞库）`;
      ctx.endStage('汇总');

      return {
        findings,
        summary,
        artifacts: [],
        raw: { root, scanned, files: files.length, truncated, depNote },
      };
    },
  };
}
