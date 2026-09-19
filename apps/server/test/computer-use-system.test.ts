// computer-use · 系统层单测：白名单护栏 / 取值校验 / 颜色换算 / DPI 缩放 /
// 夜间模式启发式 / PowerShell 脚本构造 / 各类输出解析器容错。
//
// ★ 本文件是 computer_os_settings 的**安全守门**：白名单是「只读只写自己维护的键」
//   这一设计的地基。任何人往里加条目都必须同步加用例，否则越权写入会静默上线。
import { describe, it, expect } from 'vitest';
import {
  OS_SETTINGS,
  SETTINGS_PAGES,
  BACKUP_KEEP,
  BROADCAST_AREAS,
  EFFECT_TEXT,
  findSetting,
  findSettingsPage,
  normalizeSettingValue,
  abgrFromRgb,
  rgbFromAbgr,
  toRegExePath,
  backupFileName,
  detectNightLight,
  dpiToScalePct,
  pctToAbsolute,
  parseRange,
  asArray,
  parseSystemInfo,
  parseMonitorList,
  parseWriteResult,
  parseMonitorSetResult,
  parseSettingValue,
  clampPct,
  buildOsSettingsReadScript,
  buildOsSettingsWriteScript,
  buildMonitorListScript,
  buildDdcSetScript,
  buildWmiBrightnessScript,
  buildOpenPageScript,
  SYSTEM_INFO_SCRIPT,
  MONITOR_CS,
  PS_HEAD,
} from '../src/plugins/computer-use-system';

// ---------- manifest 与实现的「零漂移」守门 ----------
//
// ★ 本组测试刻意**不 import computer-use.ts**：该模块 import 了 db.ts，而 db.ts 第 15 行
//   是模块级 `const db = new Database(DB_PATH)` —— 一导入就真开 SQLite，在 Node 22 下
//   直接 ABI 报错。改为读源码文本做比对，完全无副作用。
describe('computer-use manifest 与实现一致性', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const src = fs.readFileSync(path.resolve(__dirname, '../src/plugins/computer-use.ts'), 'utf8');

  /** manifest 的 contributes.tools 数组（截取 contributes 到 config 之间，避免抓到正文里的名字） */
  const declared = (() => {
    const block = src.slice(src.indexOf('contributes:'), src.indexOf('config: {'));
    return [...block.matchAll(/'(computer_[a-z_]+)'/g)].map((m) => m[1]);
  })();

  /** 源码里 ctx.registerTool({ name: '...' }) 的实际注册名 */
  const registered = [...src.matchAll(/name: '(computer_[a-z_]+)'/g)].map((m) => m[1]);

  it('★ 声明的工具与注册的工具完全一致（双向，漂移会导致管理器不挂载且不报错）', () => {
    expect(new Set(registered)).toEqual(new Set(declared));
  });

  it('★ 三个新工具已声明', () => {
    for (const t of ['computer_system_info', 'computer_os_settings', 'computer_monitor_control', 'computer_open_panel']) {
      expect(declared).toContain(t);
    }
  });

  it('注册名无重复（重复注册会静默覆盖）', () => {
    expect(new Set(registered).size).toBe(registered.length);
  });

  it('声明列表内无重复', () => {
    expect(new Set(declared).size).toBe(declared.length);
  });

  /**
   * 取某个工具注册块的源码。
   * 边界取「下一个 ctx.registerTool / 下一个 // ===== 分区注释」中更早者 ——
   * ★ 不能只用下一个 name: 'computer_，因为 requireConfirm 这个**共享 helper 的定义**
   *   正好夹在 system_info 与 uninstall_app 之间，会被误框进来造成假失败。
   */
  const toolBlock = (tool: string): string => {
    const start = src.indexOf(`name: '${tool}'`);
    if (start < 0) return '';
    const rest = src.slice(start);
    const bounds = [rest.indexOf('ctx.registerTool(', 1), rest.indexOf('// =====', 1), rest.indexOf('ctx.log(', 1)]
      .filter((i) => i > 0);
    return rest.slice(0, bounds.length ? Math.min(...bounds) : undefined);
  };

  it('★ 只读工具不走 requireConfirm（否则体验上会卡住一个纯体检）', () => {
    // system_info / open_panel 全程只读；os_settings 只在 write 分支要确认
    expect(toolBlock('computer_system_info')).not.toContain('requireConfirm');
    expect(toolBlock('computer_open_panel')).not.toContain('requireConfirm');
  });

  it('★ 写设置与调显示器必须过 requireConfirm', () => {
    expect(toolBlock('computer_os_settings')).toContain('requireConfirm');
    expect(toolBlock('computer_monitor_control')).toContain('requireConfirm');
  });

  it('插件描述提到了系统体检能力（用户能在插件页看到）', () => {
    // 取 manifest 里的 description 字段（不是文件头注释）
    const m = src.match(/id: 'computer-use'[\s\S]*?description:\s*([\s\S]*?),\n\s*permissions:/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/系统体检/);
  });
});

// ---------- 白名单护栏（安全核心） ----------

describe('OS_SETTINGS 白名单护栏', () => {
  it('键名唯一', () => {
    const keys = OS_SETTINGS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('全部位于 HKCU: 下（免管理员、不弹 UAC、误改只影响当前用户）', () => {
    for (const s of OS_SETTINGS) {
      expect(s.regPath.startsWith('HKCU:\\')).toBe(true);
    }
  });

  it('不含 HKLM: 条目（改动会影响全机，需管理员）', () => {
    for (const s of OS_SETTINGS) {
      expect(s.regPath.startsWith('HKLM:')).toBe(false);
    }
  });

  it('★ 不含每显示器 DPI 缩放（PerMonitorSettings 写错会让桌面难以操作且需注销）', () => {
    for (const s of OS_SETTINGS) {
      expect(s.regPath).not.toContain('PerMonitorSettings');
      expect(s.valueName).not.toBe('DpiValue');
    }
  });

  it('不含 Run/RunOnce 等自启动项（防被做成持久化后门）', () => {
    for (const s of OS_SETTINGS) {
      expect(s.regPath.toLowerCase()).not.toContain('\\run');
      expect(s.regPath.toLowerCase()).not.toContain('runonce');
    }
  });

  it('每条都有中文标签、说明与生效方式', () => {
    for (const s of OS_SETTINGS) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.desc.length).toBeGreaterThan(0);
      expect(['immediate', 'relogin', 'restart']).toContain(s.effect);
    }
  });

  it('choice 类必须给 enumMap，flag/color 类不得给', () => {
    for (const s of OS_SETTINGS) {
      if (s.kind === 'choice') expect(Object.keys(s.enumMap ?? {}).length).toBeGreaterThan(0);
      else expect(s.enumMap).toBeUndefined();
    }
  });

  it('覆盖用户关心的关键项：明暗主题 / 颜色滤镜 / 高对比度', () => {
    const keys = OS_SETTINGS.map((s) => s.key);
    expect(keys).toContain('theme.apps');
    expect(keys).toContain('theme.system');
    expect(keys).toContain('a11y.colorFilterActive');
    expect(keys).toContain('a11y.colorFilterType');
    expect(keys).toContain('a11y.highContrast');
  });
});

describe('findSetting 查找', () => {
  it('命中已定义项', () => {
    expect(findSetting('theme.apps')?.valueName).toBe('AppsUseLightTheme');
  });

  it('大小写不敏感', () => {
    expect(findSetting('THEME.APPS')?.key).toBe('theme.apps');
  });

  it('未知项返回 undefined（调用方据此拒绝写入）', () => {
    expect(findSetting('system.something')).toBeUndefined();
    expect(findSetting('')).toBeUndefined();
  });

  it('★ 拒绝白名单外的危险路径（即使用户直接编 key 名）', () => {
    for (const evil of ['HKLM:\\SYSTEM\\CurrentControlSet', '..\\..\\Run', 'theme.apps;rm -rf']) {
      expect(findSetting(evil)).toBeUndefined();
    }
  });
});

// ---------- 取值校验 ----------

describe('normalizeSettingValue 取值校验', () => {
  const themeApps = findSetting('theme.apps')!;
  const transparency = findSetting('theme.transparency')!;
  const colorFilter = findSetting('a11y.colorFilterType')!;
  const highContrast = findSetting('a11y.highContrast')!;
  const accent = findSetting('dwm.accentColor')!;

  it('choice：接受合法数字并翻译成中文', () => {
    expect(normalizeSettingValue(themeApps, '1')).toMatchObject({ regValue: 1, display: '浅色' });
    expect(normalizeSettingValue(themeApps, '0')).toMatchObject({ regValue: 0, display: '深色' });
  });

  it('★ choice：拒绝枚举外的值（防写入垃圾数据）', () => {
    expect(() => normalizeSettingValue(themeApps, '2')).toThrow(/取值必须是/);
    expect(() => normalizeSettingValue(colorFilter, '99')).toThrow(/取值必须是/);
  });

  it('flag：接受多种真/假写法', () => {
    for (const t of ['1', 'true', 'on', 'yes', '开', '开启']) {
      expect(normalizeSettingValue(transparency, t).regValue).toBe(1);
    }
    for (const f of ['0', 'false', 'off', 'no', '关', '关闭']) {
      expect(normalizeSettingValue(transparency, f).regValue).toBe(0);
    }
  });

  it('flag：拒绝含糊值', () => {
    expect(() => normalizeSettingValue(transparency, '也许')).toThrow(/只接受开启\/关闭/);
  });

  it('color：接受 #RRGGBB 与简写 #RGB，写入 ABGR', () => {
    const six = normalizeSettingValue(accent, '#336699');
    expect(six.display).toBe('#336699');
    expect(six.regValue).toBe(abgrFromRgb(0x33, 0x66, 0x99));
    const three = normalizeSettingValue(accent, '#369');
    expect(three.display).toBe('#336699');
  });

  it('★ color：拒绝非法颜色（防注入非数字值）', () => {
    for (const bad of ['red', '#12345', '#GGGGGG', 'rgb(1,2,3)', '']) {
      expect(() => normalizeSettingValue(accent, bad)).toThrow();
    }
  });

  it('空值一律拒绝', () => {
    expect(() => normalizeSettingValue(themeApps, '')).toThrow(/不能为空/);
    expect(() => normalizeSettingValue(themeApps, null)).toThrow(/不能为空/);
    expect(() => normalizeSettingValue(themeApps, undefined)).toThrow(/不能为空/);
  });

  it('高对比度用 String 类型（Windows 存的是字符串 "126"/"127"）', () => {
    expect(highContrast.regType).toBe('String');
    expect(normalizeSettingValue(highContrast, '127')).toMatchObject({ regValue: 127, display: '开启' });
    expect(normalizeSettingValue(highContrast, '126')).toMatchObject({ regValue: 126, display: '关闭' });
  });

  it('number 类：超范围被拒（当前白名单无 number 项，直接构造验证通用逻辑）', () => {
    const def = { ...themeApps, kind: 'number' as const, enumMap: undefined, min: 10, max: 20 };
    expect(normalizeSettingValue(def, '15').regValue).toBe(15);
    expect(() => normalizeSettingValue(def, '9')).toThrow(/不能小于/);
    expect(() => normalizeSettingValue(def, '21')).toThrow(/不能大于/);
    expect(() => normalizeSettingValue(def, 'abc')).toThrow(/需要数字/);
  });
});

// ---------- 颜色换算 ----------

describe('颜色换算', () => {
  it('abgrFromRgb 高位填充 0xFF（不透明）', () => {
    expect(abgrFromRgb(0, 0, 0)).toBe(0xff000000);
    expect(abgrFromRgb(255, 255, 255)).toBe(0xffffffff);
  });

  it('Windows 默认强调色 #0078D4 往返一致', () => {
    const v = abgrFromRgb(0x00, 0x78, 0xd4);
    expect(rgbFromAbgr(v)).toBe('#0078D4');
  });

  it('往返对全色域采样成立', () => {
    for (const [r, g, b] of [[1, 2, 3], [17, 34, 51], [200, 100, 50], [255, 0, 128]]) {
      expect(rgbFromAbgr(abgrFromRgb(r, g, b))).toBe(
        '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase(),
      );
    }
  });

  it('rgbFromAbgr 对超范围输入做无符号收敛（不发生负数）', () => {
    expect(rgbFromAbgr(-1)).toBe('#FFFFFF');
  });
});

// ---------- 注册表路径与备份名 ----------

describe('注册表路径与备份文件名', () => {
  it('PSDrive 路径转 reg.exe 路径', () => {
    expect(toRegExePath('HKCU:\\Software\\X')).toBe('HKCU\\Software\\X');
    expect(toRegExePath('HKLM:\\SOFTWARE\\Y')).toBe('HKLM\\SOFTWARE\\Y');
  });

  it('备份文件名不含非法字符且可读', () => {
    const n = backupFileName('HKCU:\\Software\\Microsoft\\Windows\\ColorFiltering', 'Active', 1700000000000);
    expect(n).not.toMatch(/[:\\/]/);
    expect(n).toContain('1700000000000');
    expect(n.endsWith('.reg')).toBe(true);
  });

  it('超长路径被截断（避免超过文件名长度上限）', () => {
    const long = 'HKCU:\\' + 'A'.repeat(300);
    expect(backupFileName(long, 'V', 1).length).toBeLessThan(140);
  });
});

// ---------- 夜间模式启发式 ----------

describe('detectNightLight 夜间模式判断', () => {
  it('从 blob 中识别「开」', () => {
    expect(detectNightLight('430000001000d00a02000000')).toBe(true);
  });

  it('从 blob 中识别「关」', () => {
    expect(detectNightLight('430000001000d00a00000000')).toBe(false);
  });

  it('★ 找不到特征一律返回 null（未知），绝不猜', () => {
    expect(detectNightLight('')).toBeNull();
    expect(detectNightLight('deadbeef')).toBeNull();
    expect(detectNightLight('43000000')).toBeNull();
  });

  it('容错：带空格/大写/换行的十六进制串也能解析', () => {
    expect(detectNightLight('43 00 00 00 10 00 D0 0A 02 00')).toBe(true);
    expect(detectNightLight('43000000\n1000d00a02')).toBe(true);
  });

  it('特征后跟非 02/00 时返回未知', () => {
    expect(detectNightLight('430000001000d00a0700')).toBeNull();
  });
});

// ---------- DPI 与缩放 ----------

describe('dpiToScalePct 缩放换算', () => {
  it('常见缩放档位换算正确', () => {
    expect(dpiToScalePct(96)).toBe(100);
    expect(dpiToScalePct(120)).toBe(125);
    expect(dpiToScalePct(144)).toBe(150);
    expect(dpiToScalePct(192)).toBe(200);
  });

  it('非法/缺失输入返回 0（表示未知，而不是 100%）', () => {
    expect(dpiToScalePct(0)).toBe(0);
    expect(dpiToScalePct(-1)).toBe(0);
    expect(dpiToScalePct(NaN)).toBe(0);
  });
});

describe('pctToAbsolute / parseRange 显示器量程', () => {
  it('百分比映射到设备量程端点', () => {
    expect(pctToAbsolute(0, 0, 100)).toBe(0);
    expect(pctToAbsolute(100, 0, 100)).toBe(100);
    expect(pctToAbsolute(50, 0, 100)).toBe(50);
  });

  it('非 0~100 量程也能正确映射', () => {
    expect(pctToAbsolute(50, 20, 80)).toBe(50);
    expect(pctToAbsolute(100, 20, 80)).toBe(80);
    expect(pctToAbsolute(0, 20, 80)).toBe(20);
  });

  it('越界百分比被收敛到 0~100', () => {
    expect(pctToAbsolute(-50, 0, 100)).toBe(0);
    expect(pctToAbsolute(999, 0, 100)).toBe(100);
  });

  it('量程非法时返回下限（不抛异常，保证工具仍能返回结果）', () => {
    expect(pctToAbsolute(50, 80, 20)).toBe(80);
    expect(pctToAbsolute(50, NaN, NaN)).toBe(0);
  });

  it('parseRange 解析 "min,cur,max"', () => {
    expect(parseRange('0,50,100')).toEqual({ min: 0, cur: 50, max: 100 });
    expect(parseRange('  1, 2, 3 ')).toEqual({ min: 1, cur: 2, max: 3 });
  });

  it('parseRange 对空串/缺项返回 null（表示不支持该能力）', () => {
    expect(parseRange('')).toBeNull();
    expect(parseRange('0,50')).toBeNull();
    expect(parseRange('a,b,c')).toBeNull();
  });
});

describe('clampPct 百分比收敛', () => {
  it('收敛到 0~100 整数', () => {
    expect(clampPct(0)).toBe(0);
    expect(clampPct(100)).toBe(100);
    expect(clampPct(55.6)).toBe(56);
    expect(clampPct(-10)).toBe(0);
    expect(clampPct(200)).toBe(100);
  });

  it('非数字被拒', () => {
    expect(() => clampPct('亮')).toThrow(/必须是数字/);
  });
});

// ---------- 输出解析容错 ----------

describe('asArray 单元素归一', () => {
  it('null/undefined → 空数组', () => {
    expect(asArray(null)).toEqual([]);
    expect(asArray(undefined)).toEqual([]);
  });

  it('单对象 → 单元素数组（PowerShell ConvertTo-Json 在单元素时会退化成对象）', () => {
    expect(asArray({ a: 1 })).toEqual([{ a: 1 }]);
  });

  it('数组原样返回', () => {
    expect(asArray([1, 2])).toEqual([1, 2]);
  });
});

describe('parseSystemInfo 容错', () => {
  it('完整 JSON 正常解析', () => {
    const info = parseSystemInfo(
      JSON.stringify({
        os: { caption: 'Windows 11', build: '22631' },
        computer: { model: 'X', totalMemGB: 16 },
        gpus: [{ name: 'Intel' }],
        monitors: [{ manufacturer: 'SHP', name: 'LQ156T1JW05' }],
        dpi: [{ device: '\\\\.\\DISPLAY1', resolution: '2560x1440', width: 2560, height: 1440, primary: true, dpi: 144 }],
        systemDpi: 144,
        theme: { exists: true, appsLight: 1, systemLight: 1, transparency: 0 },
        dwm: { exists: true, colorPrevalence: 0, accentColor: 4292114432 },
        highContrast: { exists: true, flags: '126' },
        colorFilter: { exists: false },
        nightLight: { present: false, blobHex: '', blobBytes: 0 },
        icc: { associations: [], profiles: ['sRGB Color Space Profile.icm'] },
      }),
    );
    expect(info.os?.caption).toBe('Windows 11');
    expect(info.gpus).toHaveLength(1);
    expect(info.monitors[0].name).toBe('LQ156T1JW05');
    expect(info.screens[0]).toMatchObject({ width: 2560, height: 1440, dpi: 144, scalePct: 150, primary: true });
    expect(info.dwm.accentHex).toBe('#0078D4');
    expect(info.highContrast.enabled).toBe(false);
  });

  it('★ 空输出不抛异常（缺数据也要返回可用结构）', () => {
    const info = parseSystemInfo('');
    expect(info.gpus).toEqual([]);
    expect(info.screens).toEqual([]);
    expect(info.os).toBeNull();
    expect(info.theme.exists).toBe(false);
    expect(info.highContrast.enabled).toBeNull();
  });

  it('★ 坏 JSON 不抛异常', () => {
    expect(() => parseSystemInfo('{ 这不是 json')).not.toThrow();
    expect(parseSystemInfo('{ 这不是 json').gpus).toEqual([]);
  });

  it('单元素数组退化成对象时仍能解析（asArray 归一）', () => {
    const info = parseSystemInfo(JSON.stringify({ gpus: { name: 'OnlyOne' }, dpi: { device: 'D1', dpi: 96 } }));
    expect(info.gpus).toEqual([{ name: 'OnlyOne' }]);
    expect(info.screens).toHaveLength(1);
    expect(info.screens[0].scalePct).toBe(100);
  });

  it('高对比度 flags 为 null 时 enabled 为 null（未知，不等于关闭）', () => {
    const info = parseSystemInfo(JSON.stringify({ highContrast: { exists: true, flags: null } }));
    expect(info.highContrast.enabled).toBeNull();
  });

  it('夜间模式由 blob 推导', () => {
    const on = parseSystemInfo(JSON.stringify({ nightLight: { present: true, blobHex: '430000001000d00a02', blobBytes: 10 } }));
    expect(on.nightLight.enabled).toBe(true);
  });
});

describe('parseMonitorList 容错', () => {
  it('正常解析 DDC 与 WMI', () => {
    const ml = parseMonitorList(
      JSON.stringify({
        ddc: [{ index: 0, description: 'DELL U2720Q', brightness: '0,50,100', contrast: '0,75,100' }],
        wmiAvailable: true,
        wmi: [{ instance: 'DISPLAY\\SHP1574', current: 93 }],
      }),
    );
    expect(ml.ddc[0].brightness).toEqual({ min: 0, cur: 50, max: 100 });
    expect(ml.ddc[0].contrast).toEqual({ min: 0, cur: 75, max: 100 });
    expect(ml.wmiAvailable).toBe(true);
    expect(ml.wmi[0].current).toBe(93);
  });

  it('不支持的显示器 brightness/contrast 为 null', () => {
    const ml = parseMonitorList(JSON.stringify({ ddc: [{ index: 0, description: 'Generic', brightness: '', contrast: '' }] }));
    expect(ml.ddc[0].brightness).toBeNull();
    expect(ml.ddc[0].contrast).toBeNull();
  });

  it('空输出不抛异常', () => {
    const ml = parseMonitorList('');
    expect(ml.ddc).toEqual([]);
    expect(ml.wmiAvailable).toBe(false);
  });
});

describe('parseWriteResult 容错', () => {
  it('解析成功行（含回读值 / 备份路径 / 广播区域）', () => {
    const r = parseWriteResult('OK|0|C:\\bk\\x.reg|ImmersiveColorSet,Accessibility');
    expect(r.ok).toBe(true);
    expect(r.value).toBe('0');
    expect(r.backup).toBe('C:\\bk\\x.reg');
    expect(r.broadcast).toEqual(['ImmersiveColorSet', 'Accessibility']);
  });

  it('首次创建无备份时 backup 为 undefined', () => {
    const r = parseWriteResult('OK|1||ImmersiveColorSet');
    expect(r.ok).toBe(true);
    expect(r.backup).toBeUndefined();
  });

  it('★ 备份失败必须是失败（不能当成写入成功）', () => {
    const r = parseWriteResult('BACKUP_FAILED');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/备份导出失败/);
  });

  it('写入失败透出原始错误', () => {
    const r = parseWriteResult('WRITE_FAILED:拒绝访问');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('拒绝访问');
  });

  it('无法解析的输出按失败处理（不静默当成成功）', () => {
    const r = parseWriteResult('一些奇怪输出');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/无法解析/);
  });
});

describe('parseMonitorSetResult 容错', () => {
  it('解析字段化结果（亮度 + 对比度）', () => {
    const r = parseMonitorSetResult('brightness\tOK:75:100\ncontrast\tOK:50:100');
    expect(r.ok).toBe(true);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ field: 'brightness', ok: true });
    expect(r.lines[0].value).toContain('75%');
  });

  it('解析无字段名的内屏 WMI 单值', () => {
    const r = parseMonitorSetResult('OK:60:100');
    expect(r.lines[0]).toMatchObject({ field: 'brightness', ok: true });
  });

  it('★ 不支持的显示器返回失败而非假成功', () => {
    const r = parseMonitorSetResult('brightness\tERR:该显示器不支持读取亮度');
    expect(r.lines[0].ok).toBe(false);
    expect(r.ok).toBe(false);
    expect(r.lines[0].error).toContain('不支持');
  });

  it('越界/整体错误也能解析', () => {
    const r = parseMonitorSetResult('ERR:序号越界（共 1 台）');
    expect(r.ok).toBe(false);
    expect(r.lines[0].error).toContain('越界');
  });

  it('空输出返回空结果且不抛异常', () => {
    const r = parseMonitorSetResult('');
    expect(r.lines).toEqual([]);
    expect(r.ok).toBe(false);
  });
});

describe('parseSettingValue 清洗', () => {
  it('去掉注册表 String 类型带的一层引号', () => {
    expect(parseSettingValue('"126"')).toBe('126');
    expect(parseSettingValue('126')).toBe('126');
  });

  it('数字原样保留', () => {
    expect(parseSettingValue(1)).toBe(1);
  });

  it('null/undefined → null（表示未设置）', () => {
    expect(parseSettingValue(null)).toBeNull();
    expect(parseSettingValue(undefined)).toBeNull();
  });

  it('★ 文档化：PowerShell 空值会以空字符串回来（"" 与 null 不同，调用方须自行判空）', () => {
    // 实测：Set-ItemProperty -Value $null 之后回读得到的是 '' 而非 null。
    // 这个区别很危险 —— '' 会被 describeSettingValue 当成「已设置」，
    // 进而允许把空值再写回去。写脚本侧的硬拦（buildOsSettingsWriteScript）是最终防线。
    expect(parseSettingValue('')).toBe('');
    expect(parseSettingValue('""')).toBe('');
  });
});

// ---------- PowerShell 脚本构造 ----------

describe('PowerShell 脚本构造', () => {
  /** 提取脚本里所有 base64 载荷（按 FromBase64String 定位，避免误抓 'Continue' 之类的普通字符串） */
  const payloads = (s: string): string[] =>
    [...s.matchAll(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/g)].map((m) =>
      Buffer.from(m[1], 'base64').toString('utf8'),
    );

  it('★ 反斜杠路径正确传递（模板串里 \\ 双写，运行时应为单个反斜杠）', () => {
    // 这些路径若被吃掉反斜杠会直接找不到 WMI 命名空间 / 驱动器目录
    for (const s of [SYSTEM_INFO_SCRIPT, MONITOR_CS, buildMonitorListScript()]) {
      expect(s).not.toContain('rootwmi');
      expect(s).not.toContain('rootwmi2');
    }
    expect(SYSTEM_INFO_SCRIPT).toContain('root\\wmi');
    expect(SYSTEM_INFO_SCRIPT).toContain('System32\\spool\\drivers\\color');
    expect(SYSTEM_INFO_SCRIPT).toContain('HKCU:\\Software\\Microsoft\\Windows');
  });

  it('★ 不含被吞掉反斜杠的正则痕迹（曾把 \\d 吃成 d 导致宽高恒为 0）', () => {
    // 原 bug 的形态：'^(d+)x(d+)$' —— 正则字符类里的反斜杠消失后仍能通过语法检查，只会静默匹配失败
    for (const s of [SYSTEM_INFO_SCRIPT, buildMonitorListScript()]) {
      expect(s).not.toMatch(/\^\(d\+\)/);
      expect(s).not.toMatch(/\[d\+\]/);
    }
    // DPI 宽高解析已改用 Split，不再依赖正则
    expect(SYSTEM_INFO_SCRIPT).toContain("$p[1].Split('x')");
  });

  it('系统体检脚本包含所有关键采集段落', () => {
    for (const key of [
      'Win32_OperatingSystem',
      'Win32_ComputerSystem',
      'Win32_VideoController',
      'WmiMonitorID',
      'GetDpiForMonitor',
      'Themes\\Personalize',
      'ColorFiltering',
      'HighContrast',
      'bluelightreductionstate',
      'ProfileAssociations',
    ]) {
      expect(SYSTEM_INFO_SCRIPT).toContain(key);
    }
  });

  it('★ 系统体检脚本声明 DPI 感知（否则缩放永远显示 100%）', () => {
    expect(SYSTEM_INFO_SCRIPT).toContain('SetProcessDpiAwareness');
  });

  it('DDC/CI 的 C# 定义覆盖读写亮度与对比度四个入口', () => {
    for (const fn of ['GetMonitorBrightness', 'SetMonitorBrightness', 'GetMonitorContrast', 'SetMonitorContrast']) {
      expect(MONITOR_CS).toContain(fn);
    }
  });

  it('显示器控制含 WMI 内屏亮度通道（笔记本不走 DDC）', () => {
    expect(buildMonitorListScript()).toContain('WmiMonitorBrightness');
    expect(buildWmiBrightnessScript(50)).toContain('WmiMonitorBrightnessMethods');
  });

  it('写设置脚本包含备份、写入、回读、广播四步', () => {
    const s = buildOsSettingsWriteScript({
      regPath: 'HKCU:\\Software\\X',
      valueName: 'V',
      regType: 'DWord',
      value: 1,
      backupFile: 'C:/bk/x.reg',
      broadcast: ['ImmersiveColorSet'],
    });
    expect(s).toContain('reg.exe export');
    expect(s).toContain('Set-ItemProperty');
    expect(s).toContain('Get-ItemProperty');
    expect(s).toContain('SendMessageTimeout');
    expect(s).toContain('BACKUP_FAILED');
    expect(s).toContain('WRITE_FAILED');
  });

  it('★ 写入前先备份：export 出现在 Set-ItemProperty 之前', () => {
    const s = buildOsSettingsWriteScript({
      regPath: 'HKCU:\\Software\\X', valueName: 'V', regType: 'DWord', value: 1,
      backupFile: 'C:/bk/x.reg', broadcast: [],
    });
    expect(s.indexOf('reg.exe export')).toBeLessThan(s.indexOf('Set-ItemProperty'));
  });

  it('★★ 空值必须被拒绝（PowerShell 会把 -Value $null 对 DWord 静默写成 0 —— 实测踩过）', () => {
    const base = {
      regPath: 'HKCU:\\Software\\X', valueName: 'V', regType: 'DWord',
      backupFile: 'C:/bk/x.reg', broadcast: [],
    };
    for (const bad of [null, undefined, '']) {
      expect(() => buildOsSettingsWriteScript({ ...base, value: bad as unknown as number })).toThrow(/拒绝构造写入脚本/);
    }
    // 合法值（含 0 与空字符串以外的一切）正常放行
    expect(buildOsSettingsWriteScript({ ...base, value: 0 })).toContain('Set-ItemProperty');
    expect(buildOsSettingsWriteScript({ ...base, value: '126', regType: 'String' })).toContain('Set-ItemProperty');
  });

  it('读设置脚本按传入的键集生成（不硬编码全量）', () => {
    const s = buildOsSettingsReadScript([{ key: 'k1', regPath: 'HKCU:\\A', valueName: 'V1' }]);
    expect(s).toContain('ConvertFrom-Json');
    const decoded = payloads(s);
    expect(decoded.join('')).toContain('k1');
    expect(decoded.join('')).not.toContain('theme.apps');
  });

  it('中文/引号参数走 base64，不直接拼进脚本（防注入与乱码）', () => {
    const tricky = '含 中文"引号\'混合';
    const s = buildOsSettingsReadScript([{ key: tricky, regPath: 'HKCU:\\A', valueName: 'V' }]);
    // 原文不得直接出现在脚本里（否则会被 PowerShell 当字符串语法解析）
    expect(s).not.toContain('中文');
    expect(s).not.toContain(tricky);
    // base64 解码后应是等价 JSON，且引号经 JSON 转义被正确保留
    const specs = JSON.parse(payloads(s).find((p) => p.startsWith('['))!) as Array<{ key: string }>;
    expect(specs[0].key).toBe(tricky);
  });

  it('DDC 写入脚本：未指定的项传 -1 表示不改', () => {
    const s = buildDdcSetScript(2, 70, null);
    expect(s).toContain('SetPercent(2, 70, -1)');
  });

  it('DDC 写入脚本：百分比越界被收敛', () => {
    expect(buildDdcSetScript(0, 200, -50)).toContain('SetPercent(0, 100, 0)');
  });

  it('WMI 亮度脚本写入目标值并回读', () => {
    const s = buildWmiBrightnessScript(45);
    expect(s).toContain('WmiSetBrightness(1, 45)');
    expect(s).toContain('WmiMonitorBrightness');
  });

  it('WMI 亮度脚本对越界值收敛', () => {
    expect(buildWmiBrightnessScript(999)).toContain('WmiSetBrightness(1, 100)');
    expect(buildWmiBrightnessScript(-5)).toContain('WmiSetBrightness(1, 0)');
  });

  it('打开页面脚本：ms-settings 走 uri，控制面板走 exe + 参数', () => {
    const ms = buildOpenPageScript(findSettingsPage('nightlight')!);
    expect(ms).toContain('Start-Process');
    expect(payloads(ms)).toContain('ms-settings:nightlight');

    const cpl = buildOpenPageScript(findSettingsPage('colormanagement')!);
    const parts = payloads(cpl);
    expect(parts).toContain('control.exe');
    expect(parts.join('|')).toContain('Microsoft.ColorManagement');
  });

  it('所有脚本都带公共头（输出编码 UTF-8，防中文乱码）', () => {
    for (const s of [SYSTEM_INFO_SCRIPT, buildMonitorListScript(), buildWmiBrightnessScript(50), buildDdcSetScript(0, 50, null)]) {
      expect(s.startsWith(PS_HEAD)).toBe(true);
    }
  });
});

// ---------- 设置页面白名单 ----------

describe('SETTINGS_PAGES 页面白名单', () => {
  it('键名唯一', () => {
    const keys = SETTINGS_PAGES.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('每项要么有 ms-settings uri，要么有 exe 命令（不能都没有）', () => {
    for (const p of SETTINGS_PAGES) {
      expect(!!p.uri || !!p.cmd).toBe(true);
    }
  });

  it('ms-settings 地址格式合法（防拼错导致打开失败）', () => {
    for (const p of SETTINGS_PAGES) {
      if (p.uri) expect(p.uri).toMatch(/^ms-settings:[a-z-]+$/);
    }
  });

  it('覆盖用户关心的页面：显示 / 夜间模式 / 颜色滤镜 / 颜色管理', () => {
    const keys = SETTINGS_PAGES.map((p) => p.key);
    for (const k of ['display', 'nightlight', 'colorfilter', 'colormanagement', 'advanceddisplay']) {
      expect(keys).toContain(k);
    }
  });

  it('findSettingsPage 大小写不敏感，未知返回 undefined', () => {
    expect(findSettingsPage('DISPLAY')?.key).toBe('display');
    expect(findSettingsPage('nope')).toBeUndefined();
  });
});

// ---------- 常量 ----------

describe('常量口径', () => {
  it('生效方式文案齐全', () => {
    for (const e of ['immediate', 'relogin', 'restart'] as const) {
      expect(EFFECT_TEXT[e].length).toBeGreaterThan(0);
    }
  });

  it('广播区域包含主题与辅助功能类（否则改了不生效）', () => {
    expect(BROADCAST_AREAS).toContain('ImmersiveColorSet');
    expect(BROADCAST_AREAS).toContain('Accessibility');
  });

  it('备份保留上限为正整数', () => {
    expect(Number.isInteger(BACKUP_KEEP)).toBe(true);
    expect(BACKUP_KEEP).toBeGreaterThan(0);
  });
});