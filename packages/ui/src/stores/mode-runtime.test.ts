// 模式插件运行时装载（P4 第二层）：插件贡献的新模式并进模式表，且受授权档收敛。
//
// 钉住的契约：
//   1) 新 key 进入 allModeDefs / visibleModeDefs / modeRoute（下拉与路由都靠它）；
//   2) 同名 key 以构建期表为准（内置模式不被插件元数据改写）；
//   3) 插件卸载/停用（传空）后模式立即不可用；
//   4) 授权清单不含它时同样隐藏 —— 运行时模式不绕过授权收敛。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  setRuntimeModeDefs,
  setLicensedModes,
  isModeBuilt,
  allModeDefs,
  visibleModeDefs,
  modeRoute,
  type ModeDef,
} from './mode';

const REPORT: ModeDef = {
  key: 'report',
  label: '报表模式',
  icon: 'DataLine',
  desc: '运行时插件贡献',
  route: '/report',
  pluginId: 'report-mode',
};

describe('模式插件运行时装载', () => {
  beforeEach(() => {
    setRuntimeModeDefs([]);
    setLicensedModes(null);
  });

  it('新 key 并入模式表：可用、可路由、进可见列表', () => {
    expect(setRuntimeModeDefs([REPORT])).toEqual(['report']);
    expect(isModeBuilt('report')).toBe(true);
    expect(modeRoute('report')).toBe('/report');
    expect(allModeDefs.value.map((d) => d.key)).toContain('report');
    expect(visibleModeDefs.value.map((d) => d.key)).toContain('report');
  });

  it('同名 key 以构建期定义为准（不被插件元数据覆盖）', () => {
    setRuntimeModeDefs([{ ...REPORT, key: 'dev', route: '/hijacked' }]);
    expect(modeRoute('dev')).toBe('/code');
    expect(allModeDefs.value.filter((d) => d.key === 'dev')).toHaveLength(1);
  });

  it('插件停用/卸载（空清单）后模式立即不可用', () => {
    setRuntimeModeDefs([REPORT]);
    setRuntimeModeDefs([]);
    expect(isModeBuilt('report')).toBe(false);
    expect(visibleModeDefs.value.map((d) => d.key)).not.toContain('report');
  });

  it('授权收敛对运行时模式同样生效', () => {
    setRuntimeModeDefs([REPORT]);
    setLicensedModes(['office']);
    expect(visibleModeDefs.value.map((d) => d.key)).not.toContain('report');
    setLicensedModes(null);
    expect(visibleModeDefs.value.map((d) => d.key)).toContain('report');
  });

  it('缺 route 的贡献被丢弃（不注册空壳模式）', () => {
    expect(setRuntimeModeDefs([{ ...REPORT, route: '' }])).toEqual([]);
    expect(isModeBuilt('report')).toBe(false);
  });
});
