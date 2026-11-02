/**
 * 运维巡检中心 UI 契约：
 *   ① 运维控制台有独立巡检页；
 *   ② 配置、立即巡检、告警确认均走 ops-shell API；
 *   ③ 页面持续展示事件状态与最新指标，不把告警静默吞掉。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONSOLE = readFileSync(resolve(__dirname, 'OpsConsole.vue'), 'utf8');
const MONITOR = readFileSync(resolve(__dirname, '../../components/ops/OpsMonitorCenter.vue'), 'utf8');

describe('OpsMonitorCenter', () => {
  it('接到运维控制台的「巡检」页签', () => {
    expect(CONSOLE).toContain("label=\"巡检\"");
    expect(CONSOLE).toContain('<OpsMonitorCenter');
    expect(CONSOLE).toContain("from '../../components/ops/OpsMonitorCenter.vue'");
  });

  it('配置、手动采样与告警确认都走 ops-shell API', () => {
    expect(MONITOR).toContain('/plugin/ops-shell/monitor/overview');
    expect(MONITOR).toContain('/monitor/config/');
    expect(MONITOR).toContain('/monitor/run');
    expect(MONITOR).toContain('/monitor/alerts/');
    expect(MONITOR).toContain('/ack');
  });

  it('常驻巡检配置包含间隔、负载、内存、磁盘阈值与启停', () => {
    expect(MONITOR).toContain('intervalSec');
    expect(MONITOR).toContain('loadPct');
    expect(MONITOR).toContain('memPct');
    expect(MONITOR).toContain('diskPct');
    expect(MONITOR).toContain('监听端口');
    expect(MONITOR).toContain('HTTP 检查');
    expect(MONITOR).toContain('el-switch');
  });
});
