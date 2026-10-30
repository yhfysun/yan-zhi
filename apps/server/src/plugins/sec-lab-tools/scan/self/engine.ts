// 自有资产体检引擎（P4，kind='self'）。
//
// ★ 一次覆盖「源码 + 运行时」：路径资产跑源码规则 + Electron 结构审计，
//   本机在听的服务再补一轮运行时探测；URL 资产只跑运行时探测。
// ★ 委托而不是复制：源码规则仍由 source 引擎执行，阶段名与它对齐，
//   不在这里重写遍历/规则调度（两套实现必然漂移）。
import type { ScanContext, ScanFinding, ScanResult, Scanner } from '../types.js';
import { createSourceScanner } from '../source/engine.js';
import { httpRequest } from '../http.js';
import { auditElectronConfig } from './electron.js';
import { auditRuntime } from './runtime.js';
import { SELF_PORTS, findRepoRoot } from './assets.js';

const SOURCE_STAGES = ['发现文件', '规则扫描', '依赖核对'];

async function liveOrigins(timeoutMs: number): Promise<string[]> {
  const out: string[] = [];
  for (const port of SELF_PORTS) {
    const origin = `http://127.0.0.1:${port}`;
    const res = await httpRequest(`${origin}/api/health`, { timeoutMs: Math.min(timeoutMs, 1500), maxBytes: 4_000 });
    if (res.status >= 200 && res.status < 300) out.push(origin);
  }
  return out;
}

export function createSelfScanner(): Scanner {
  return {
    id: 'self',
    kinds: ['self'],
    stages: ['资产识别', ...SOURCE_STAGES, 'Electron 配置', '运行时探测', '汇总'],

    async run(ctx: ScanContext): Promise<ScanResult> {
      const isUrl = /^https?:\/\//i.test(ctx.target);
      const findings: ScanFinding[] = [];
      const notes: string[] = [];
      const raw: Record<string, unknown> = { target: ctx.target };

      ctx.beginStage('资产识别');
      let repoRoot: string | null = null;
      let origins: string[] = [];
      if (isUrl) {
        origins = [ctx.target.replace(/\/$/, '')];
      } else {
        repoRoot = (await findRepoRoot(ctx.target)) || ctx.target;
        origins = await liveOrigins(ctx.limits.maxDurationMs);
        raw.repoRoot = repoRoot;
        raw.origins = origins;
      }
      ctx.endStage('资产识别',
        isUrl ? '运行时资产' : `源码资产${origins.length ? ` + ${origins.length} 个在听服务` : '（没有服务在听）'}`);

      if (repoRoot) {
        ctx.beginStage('Electron 配置');
        const e = await auditElectronConfig(repoRoot);
        findings.push(...e.findings);
        notes.push(...e.notes);
        raw.electronFiles = e.files;
        ctx.endStage('Electron 配置', e.files.length ? `${e.files.length} 个入口，${e.findings.length} 条` : '未找到 Electron 入口');

        // 委托源码引擎：它自己会 beginStage('发现文件'/'规则扫描'/'依赖核对')
        try {
          const src = await createSourceScanner().run(ctx);
          findings.push(...src.findings);
          notes.push(...(src.summary ? src.summary.split('\n').filter(Boolean) : []).slice(0, 8));
        } catch (e) {
          notes.push(`源码规则扫描失败：${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (origins.length) {
        ctx.beginStage('运行时探测');
        for (const origin of origins) {
          const r = await auditRuntime(origin, Math.min(ctx.limits.maxDurationMs, 8000));
          findings.push(...r.findings);
          notes.push(...r.notes);
        }
        ctx.endStage('运行时探测', `${origins.length} 个服务：${findings.filter((f) => f.ruleId.startsWith('self-runtime')).length} 条`);
      } else if (!isUrl) {
        ctx.beginStage('运行时探测');
        ctx.endStage('运行时探测', '没有本机服务在听（3001/5173/3000）');
      }

      ctx.beginStage('汇总');
      const bySeverity = findings.reduce<Record<string, number>>((acc, f) => {
        acc[f.severity] = (acc[f.severity] || 0) + 1;
        return acc;
      }, {});
      const sevText = Object.entries(bySeverity).map(([k, v]) => `${k} ${v}`).join('，');
      const summary = [
        `自有资产体检：${isUrl ? '运行时' : '源码 + 运行时'}`,
        raw.electronFiles ? `Electron 入口：${(raw.electronFiles as string[]).join('、')}` : '',
        origins.length ? `探测的本地服务：${origins.join('、')}` : '',
        `发现 ${findings.length} 条${sevText ? `（${sevText}）` : ''}`,
        ...notes.slice(0, 10),
      ].filter(Boolean).join('\n');
      ctx.endStage('汇总');

      return { findings, summary, raw };
    },
  };
}
