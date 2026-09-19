// computer-use · 系统设置层：只读体检 / 设置读写 / 显示硬件控制。
// ------------------------------------------------------------------
// 与 computer-use.ts 分离：本文件只放「可单测的纯逻辑 + PowerShell 脚本文本」，
// 不碰插件 ctx（不注册工具、不写库），所有副作用留在主模块。
//
// 设计取舍（重要，别改错方向）：
//   1) 只读体检（system_info）是地基：视觉模型不可用时，智能体仍能拿到客观参数再决策。
//   2) 设置读写（os_settings）走**自维护白名单**，不是任意注册表编辑器 —— 白名单外的
//      键一律拒绝。全部落在 HKCU（当前用户）下，因此**不需要管理员权限**，不会弹 UAC。
//   3) 写入前一律 `reg export` 备份到 DATA_DIR/registry-backups/，与 registry_delete 同机制。
//   4) 显示硬件控制（monitor_control）内屏走 WMI、外接屏走 DDC/CI；**只有亮度与对比度**。
//      色温/伽马/饱和度属显卡驱动私有接口，没有稳定脚本通道 —— 明确不承诺。
//
// 已知边界（写进工具描述，别对外说能改）：
//   - 夜间模式（Night Light）状态在 CloudStore 的二进制 blob 里，只能**启发式判断**，
//     无可靠写入通道 → 只读 + 引导打开 ms-settings:nightlight。
//   - 每显示器 DPI 缩放（PerMonitorSettings\DpiValue）**刻意不在白名单**：写错会让桌面
//     变得难以操作，且需注销才生效，恢复成本高。给人工路径即可。
//   - ICC 色彩配置文件关联：只读（列当前关联 + 可用配置文件），修改引导到颜色管理面板。

/** 生效方式：改完何时起作用 */
export type SettingEffect = 'immediate' | 'relogin' | 'restart';

/** 取值形态，决定校验与序列化方式 */
export type SettingKind = 'flag' | 'number' | 'color' | 'choice';

export interface OsSettingDef {
  /** 逻辑键名，工具入参用这个（如 theme.apps） */
  key: string;
  /** 中文标签，给用户看的 */
  label: string;
  /** 注册表路径，PowerShell PSDrive 形式（HKCU:\ 开头） */
  regPath: string;
  /** 值名（注册表 value name） */
  valueName: string;
  /** 注册表值类型 */
  regType: 'DWord' | 'String' | 'ExpandString';
  /** 取值形态 */
  kind: SettingKind;
  /** 生效方式 */
  effect: SettingEffect;
  /** 说明（写进工具返回值，让模型知道改了什么） */
  desc: string;
  /** kind=choice 时的取值表：值 → 含义 */
  enumMap?: Record<string, string>;
  /** kind=number 时的范围 */
  min?: number;
  max?: number;
}

const P_THEME = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';
const P_DWM = 'HKCU:\\Software\\Microsoft\\Windows\\DWM';
const P_HC = 'HKCU:\\Control Panel\\Accessibility\\HighContrast';
const P_CF = 'HKCU:\\Software\\Microsoft\\ColorFiltering';

/**
 * 设置白名单。**新增条目必须同时补 apps/server/test/computer-use-system.test.ts 的守卫用例。**
 * 全部 HKCU：免管理员、不弹 UAC、误改只影响当前用户。
 */
export const OS_SETTINGS: OsSettingDef[] = [
  {
    key: 'theme.apps',
    label: '应用明暗主题',
    regPath: P_THEME,
    valueName: 'AppsUseLightTheme',
    regType: 'DWord',
    kind: 'choice',
    enumMap: { '0': '深色', '1': '浅色' },
    effect: 'immediate',
    desc: '应用窗口的明暗模式（设置 → 个性化 → 颜色 → 选择模式）',
  },
  {
    key: 'theme.system',
    label: '系统明暗主题',
    regPath: P_THEME,
    valueName: 'SystemUsesLightTheme',
    regType: 'DWord',
    kind: 'choice',
    enumMap: { '0': '深色', '1': '浅色' },
    effect: 'immediate',
    desc: '任务栏/开始菜单等系统外壳的明暗模式',
  },
  {
    key: 'theme.transparency',
    label: '透明效果',
    regPath: P_THEME,
    valueName: 'EnableTransparency',
    regType: 'DWord',
    kind: 'flag',
    effect: 'immediate',
    desc: '窗口与任务栏的毛玻璃透明效果（关闭后界面更"实"，观感上更清晰）',
  },
  {
    key: 'dwm.accentOnTitleBars',
    label: '标题栏显示主题色',
    regPath: P_DWM,
    valueName: 'ColorPrevalence',
    regType: 'DWord',
    kind: 'flag',
    effect: 'immediate',
    desc: '是否把强调色画到标题栏与窗口边框上',
  },
  {
    key: 'dwm.accentColor',
    label: '强调色',
    regPath: P_DWM,
    valueName: 'AccentColor',
    regType: 'DWord',
    kind: 'color',
    effect: 'immediate',
    desc: '系统强调色。入参用 #RRGGBB，内部按 Windows 的 ABGR 序写入',
  },
  {
    key: 'a11y.highContrast',
    label: '高对比度',
    regPath: P_HC,
    valueName: 'Flags',
    regType: 'String',
    kind: 'choice',
    enumMap: { '126': '关闭', '127': '开启' },
    effect: 'relogin',
    desc: '高对比度主题开关。开启会大幅改变配色，通常用于视力辅助 —— 若用户抱怨"颜色不对"要确认是不是它被开了',
  },
  {
    key: 'a11y.colorFilterActive',
    label: '颜色滤镜开关',
    regPath: P_CF,
    valueName: 'Active',
    regType: 'DWord',
    kind: 'flag',
    effect: 'relogin',
    desc: '颜色滤镜总开关。**这是"整屏发灰/发黄/变色"的头号软件元凶**，开启后全屏都会偏色',
  },
  {
    key: 'a11y.colorFilterType',
    label: '颜色滤镜类型',
    regPath: P_CF,
    valueName: 'FilterType',
    regType: 'DWord',
    kind: 'choice',
    enumMap: {
      '0': '灰度',
      '1': '反色',
      '2': '灰度反色',
      '3': '红绿色盲（红弱）',
      '4': '红绿色盲（绿弱）',
      '5': '蓝黄色盲',
    },
    effect: 'relogin',
    desc: '颜色滤镜的具体类型，仅在颜色滤镜开启时起作用',
  },
];

/** 逻辑键名 → 定义 */
export function findSetting(key: string): OsSettingDef | undefined {
  const k = String(key ?? '').trim().toLowerCase();
  return OS_SETTINGS.find((s) => s.key.toLowerCase() === k);
}

/** 校验并归一化写入值。返回注册表实际要写的值。非法输入抛错（错误信息直接给模型看） */
export function normalizeSettingValue(
  def: OsSettingDef,
  raw: unknown,
): { regValue: number | string; display: string; regType: OsSettingDef['regType'] } {
  const s = raw === null || raw === undefined ? '' : String(raw).trim();
  if (!s) throw new Error(`参数 value 不能为空（${def.label} 需要 ${describeKind(def)}）`);

  if (def.kind === 'flag') {
    const truthy = ['1', 'true', 'on', 'yes', '开', '开启', '启用'];
    const falsy = ['0', 'false', 'off', 'no', '关', '关闭', '停用'];
    const low = s.toLowerCase();
    if (truthy.includes(low)) return { regValue: 1, display: '开启', regType: def.regType };
    if (falsy.includes(low)) return { regValue: 0, display: '关闭', regType: def.regType };
    throw new Error(`${def.label} 只接受开启/关闭（1/0、on/off），收到「${s}」`);
  }

  if (def.kind === 'choice') {
    const map = def.enumMap ?? {};
    if (!(s in map)) {
      const opts = Object.entries(map).map(([v, t]) => `${v}=${t}`).join(' / ');
      throw new Error(`${def.label} 取值必须是 ${opts}，收到「${s}」`);
    }
    return { regValue: Number(s), display: map[s], regType: def.regType };
  }

  if (def.kind === 'number') {
    const n = Number(s);
    if (!Number.isFinite(n)) throw new Error(`${def.label} 需要数字，收到「${s}」`);
    const i = Math.round(n);
    if (def.min !== undefined && i < def.min) throw new Error(`${def.label} 不能小于 ${def.min}`);
    if (def.max !== undefined && i > def.max) throw new Error(`${def.label} 不能大于 ${def.max}`);
    return { regValue: i, display: String(i), regType: def.regType };
  }

  // color：#RRGGBB / RRGGBB / #RGB
  const hex = s.replace(/^#/, '');
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
    throw new Error(`${def.label} 需要 #RRGGBB 格式的颜色，收到「${s}」`);
  }
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return { regValue: abgrFromRgb(r, g, b), display: `#${full.toUpperCase()}`, regType: def.regType };
}

function describeKind(def: OsSettingDef): string {
  if (def.kind === 'color') return '#RRGGBB 颜色';
  if (def.kind === 'number') return `数字（${def.min ?? 0}~${def.max ?? '不限'}）`;
  return '取值';
}

/** #RRGGBB → Windows 强调色用的 ABGR 32 位整数（高位 0xFF 不透明） */
export function abgrFromRgb(r: number, g: number, b: number): number {
  return (((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0);
}

/** ABGR 整数 → #RRGGBB（读回来给人看） */
export function rgbFromAbgr(v: number): string {
  const n = Number(v) >>> 0;
  const r = n & 0xff;
  const g = (n >>> 8) & 0xff;
  const b = (n >>> 16) & 0xff;
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** 注册表路径 → reg.exe 认的形式（PSDrive 冒号换成反斜杠） */
export function toRegExePath(regPath: string): string {
  return regPath.replace(/^HK(CU|LM|CR|U):\\/i, (_m, h: string) => `HK${h.toUpperCase()}\\`);
}

/** 备份文件名（去掉盘符与反斜杠，只留可读片段） */
export function backupFileName(regPath: string, valueName: string, stamp: number): string {
  const safe = `${regPath}_${valueName || 'default'}`.replace(/[^A-Za-z0-9_.-]+/g, '_').slice(-100);
  return `${safe}-${stamp}.reg`;
}

// ---------- 夜间模式启发式 ----------

/**
 * 从 CloudStore 的 bluelightreductionstate 二进制 blob 判断夜间模式开关。
 *
 * ★ 这是**启发式**，不是官方接口：Windows 没有公开 API 读夜间模式状态，
 *   只能解析这个私有 blob。找不到特征序列一律返回 null（未知），**绝不猜**。
 *   特征：blob 中出现 `10 00 D0 0A` 后紧跟 02（开）/ 00（关）。
 */
export function detectNightLight(hex: string): boolean | null {
  const h = String(hex ?? '').replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (h.length < 12) return null;
  const idx = h.indexOf('1000d00a');
  if (idx < 0) return null;
  const stateHex = h.slice(idx + 8, idx + 10);
  if (stateHex === '02') return true;
  if (stateHex === '00') return false;
  return null;
}

// ---------- 生效方式文案 ----------

export const EFFECT_TEXT: Record<SettingEffect, string> = {
  immediate: '立即生效（无需注销或重启）',
  relogin: '需注销并重新登录后生效',
  restart: '需重启后生效',
};

/**
 * 写入后要广播的窗口消息区域。
 * Windows 缓存主题/颜色设置，改注册表后必须广播 WM_SETTINGCHANGE 才会重新读取，
 * 否则「注册表已改但界面没变」，会被误判成写入失败。
 */
export const BROADCAST_AREAS = [
  'ImmersiveColorSet',   // 明暗主题 / 强调色
  'WindowMetrics',
  'Accessibility',        // 高对比度 / 颜色滤镜
  'Desktop',
];

/** 百分比收敛到 0~100 整数 */
export function clampPct(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`百分比必须是数字，收到「${String(v)}」`);
  return Math.min(100, Math.max(0, Math.round(n)));
}

// ---------- 显示器 / 缩放 ----------

/** dpi → 缩放百分比（96 = 100%） */
export function dpiToScalePct(dpi: number): number {
  const n = Number(dpi);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round((n / 96) * 100);
}

/** 百分比 → 设备绝对量程值（与 C# SetPercent 内的公式保持一致，测试钉死） */
export function pctToAbsolute(pct: number, min: number, max: number): number {
  const p = Math.min(100, Math.max(0, Number(pct)));
  const lo = Number(min);
  const hi = Number(max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return Math.round(lo || 0);
  return Math.round(lo + ((hi - lo) * p) / 100);
}

/** 解析一行 "min,cur,max"（DDC 返回的量程），空串=该能力不支持 */
export function parseRange(s: string): { min: number; cur: number; max: number } | null {
  const parts = String(s ?? '').trim().split(',').map((x) => Number(x.trim()));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return { min: parts[0], cur: parts[1], max: parts[2] };
}

// ---------- ms-settings 页面白名单 ----------
// 脚本改不了的项（色温/伽马/ICC/夜间模式）就打开对应页面让用户点，比干说"你自己找"强。

export interface SettingsPage {
  key: string;
  label: string;
  /** ms-settings 协议地址，或要启动的可执行/命令 */
  uri?: string;
  cmd?: { file: string; args: string[] };
}

export const SETTINGS_PAGES: SettingsPage[] = [
  { key: 'display', label: '显示（分辨率/缩放/多屏）', uri: 'ms-settings:display' },
  { key: 'nightlight', label: '夜间模式（色温）', uri: 'ms-settings:nightlight' },
  { key: 'colorfilter', label: '颜色滤镜', uri: 'ms-settings:easeofaccess-colorfilter' },
  { key: 'highcontrast', label: '高对比度', uri: 'ms-settings:easeofaccess-highcontrast' },
  { key: 'advanceddisplay', label: '高级显示（刷新率/色彩格式/HDR）', uri: 'ms-settings:display-advanced' },
  { key: 'graphics', label: '图形设置（GPU 偏好）', uri: 'ms-settings:display-advancedgraphics' },
  { key: 'personalization', label: '个性化 / 颜色与主题', uri: 'ms-settings:personalization' },
  {
    key: 'colormanagement',
    label: '颜色管理（ICC 色彩配置文件）',
    cmd: { file: 'control.exe', args: ['/name', 'Microsoft.ColorManagement'] },
  },
];

export function findSettingsPage(key: string): SettingsPage | undefined {
  const k = String(key ?? '').trim().toLowerCase();
  return SETTINGS_PAGES.find((p) => p.key === k);
}

// ---------- PowerShell 脚本构造 ----------

/** 公共头（与主模块 PS_BASE 的前两行一致，但本层脚本不需要 Win32 输入模拟那段） */
export const PS_HEAD = `$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}`;

/** 系统信息脚本：一次拿全，输出单个 JSON 对象 */
export const SYSTEM_INFO_SCRIPT = `${PS_HEAD}
$out = [ordered]@{}

try {
  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  $out.os = [ordered]@{
    caption     = $os.Caption
    version     = $os.Version
    build       = $os.BuildNumber
    arch        = $os.OSArchitecture
    installDate = if ($os.InstallDate) { $os.InstallDate.ToString('yyyy-MM-dd') } else { $null }
    lastBoot    = if ($os.LastBootUpTime) { $os.LastBootUpTime.ToString('yyyy-MM-dd HH:mm:ss') } else { $null }
    uptimeHours = if ($os.LastBootUpTime) { [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours, 1) } else { $null }
  }
} catch { $out.os = $null }

try {
  $cs = Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
  $out.computer = [ordered]@{
    manufacturer = $cs.Manufacturer
    model        = $cs.Model
    totalMemGB   = if ($cs.TotalPhysicalMemory) { [math]::Round($cs.TotalPhysicalMemory / 1GB, 1) } else { $null }
  }
} catch { $out.computer = $null }

try {
  $out.gpus = @(Get-CimInstance Win32_VideoController -ErrorAction Stop | ForEach-Object {
    [ordered]@{
      name         = $_.Name
      driverVersion= $_.DriverVersion
      driverDate   = if ($_.DriverDate) { ([datetime]$_.DriverDate).ToString('yyyy-MM-dd') } else { $null }
      resolution   = if ($_.CurrentHorizontalResolution) { "$($_.CurrentHorizontalResolution)x$($_.CurrentVerticalResolution)" } else { $null }
      refreshRate  = $_.CurrentRefreshRate
      bitsPerPixel = $_.CurrentBitsPerPixel
    }
  })
} catch { $out.gpus = @() }

# 显示器面板型号（EDID）：厂商码 + 产品码 + 用户友好名
try {
  $out.monitors = @(Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorID -ErrorAction Stop | ForEach-Object {
    $mf = -join @($_.ManufacturerName | Where-Object { $_ -gt 0 } | ForEach-Object { [char]$_ })
    $pc = -join @($_.ProductCodeID    | Where-Object { $_ -gt 0 } | ForEach-Object { [char]$_ })
    $fn = -join @($_.UserFriendlyName | Where-Object { $_ -gt 0 } | ForEach-Object { [char]$_ })
    $sn = -join @($_.SerialNumberID   | Where-Object { $_ -gt 0 } | ForEach-Object { [char]$_ })
    [ordered]@{
      instance     = $_.InstanceName
      manufacturer = $mf
      productCode  = $pc
      name         = $fn
      serial       = $sn
      year         = $_.YearOfManufacture
      active       = $_.Active
    }
  })
} catch { $out.monitors = @() }

# 每显示器 DPI（shcore GetDpiForMonitor，权威值；失败则 dpi 为 0）
# ★ 必须先声明进程 DPI 感知：默认 DPI-unaware 进程拿到的 RECT 是**虚拟化后的逻辑尺寸**
#   （实测本机 2560x1440 @150% 会被报成 1707x960），且 GetDpiForMonitor 只会返回进程自身的 96。
#   不调 SetProcessDpiAwareness 就等于「缩放永远显示 100%」—— 恰恰是用户最常抱怨的那一项。
try {
  Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class YZSYS {
  public delegate bool MonEnum(IntPtr h, IntPtr hdc, ref RECT r, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct MONITORINFOEX {
    public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szDevice;
  }
  [DllImport("user32.dll")] public static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonEnum cb, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool GetMonitorInfo(IntPtr h, ref MONITORINFOEX mi);
  [DllImport("shcore.dll")] public static extern int GetDpiForMonitor(IntPtr h, int type, out uint x, out uint y);
  [DllImport("shcore.dll")] public static extern int SetProcessDpiAwareness(int value);
  [DllImport("user32.dll")] public static extern uint GetDpiForSystem();
  static int awareTried = 0;
  public static void EnsureAware() {
    if (awareTried != 0) return;
    awareTried = 1;
    try { SetProcessDpiAwareness(2); } catch { }
    if (GetDpiForSystem() == 96) {
      try { SetProcessDpiAwareness(1); } catch { }
    }
  }
  public static string Dump() {
    EnsureAware();
    var sb = new StringBuilder();
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, delegate(IntPtr h, IntPtr hdc, ref RECT r, IntPtr l) {
      var mi = new MONITORINFOEX();
      mi.cbSize = Marshal.SizeOf(typeof(MONITORINFOEX));
      if (GetMonitorInfo(h, ref mi)) {
        uint dx = 0, dy = 0;
        int hr = GetDpiForMonitor(h, 0, out dx, out dy);
        sb.Append(mi.szDevice).Append((char)9)
          .Append(mi.rcMonitor.R - mi.rcMonitor.L).Append('x').Append(mi.rcMonitor.B - mi.rcMonitor.T).Append((char)9)
          .Append(((mi.dwFlags & 1) == 1) ? "primary" : "secondary").Append((char)9)
          .Append(hr == 0 ? dx.ToString() : "0").Append('\\n');
      }
      return true;
    }, IntPtr.Zero);
    return sb.ToString();
  }
  public static uint SysDpi() {
    try { return GetDpiForSystem(); } catch { return 0; }
  }
}
'@ -ErrorAction Stop
  $out.dpi = @()
  foreach ($ln in ([YZSYS]::Dump() -split "\`n")) {
    if (-not $ln.Trim()) { continue }
    $p = $ln.Split([char]9)
    $d = 0; [void][int]::TryParse($p[3], [ref]$d)
    $w = 0; $h = 0
    # ★ 用 Split 而非 -match：正则里的反斜杠在 JS 模板串中会被吞掉，
    #   之前就是这里让宽高恒为 0（正则字符类被吃掉后匹配不上）。
    if ($p[1] -like '*x*') {
      $wh = $p[1].Split('x')
      $w = 0; $h = 0
      [void][int]::TryParse($wh[0], [ref]$w)
      [void][int]::TryParse($wh[1], [ref]$h)
    }
    $out.dpi += [ordered]@{ device = $p[0]; resolution = $p[1]; width = $w; height = $h; primary = ($p[2] -eq 'primary'); dpi = $d }
  }
  $out.systemDpi = [YZSYS]::SysDpi()
} catch { $out.dpi = @(); $out.systemDpi = 0 }

# 主题 / 强调色 / 高对比度
$out.theme = [ordered]@{ exists = $false; appsLight = $null; systemLight = $null; transparency = $null }
try {
  $p = '${P_THEME}'
  if (Test-Path -LiteralPath $p) {
    $v = Get-ItemProperty -LiteralPath $p -ErrorAction SilentlyContinue
    $out.theme.exists = $true
    $out.theme.appsLight = $v.AppsUseLightTheme
    $out.theme.systemLight = $v.SystemUsesLightTheme
    $out.theme.transparency = $v.EnableTransparency
  }
} catch {}

$out.dwm = [ordered]@{ exists = $false; colorPrevalence = $null; accentColor = $null }
try {
  $p = '${P_DWM}'
  if (Test-Path -LiteralPath $p) {
    $v = Get-ItemProperty -LiteralPath $p -ErrorAction SilentlyContinue
    $out.dwm.exists = $true
    $out.dwm.colorPrevalence = $v.ColorPrevalence
    $out.dwm.accentColor = $v.AccentColor
  }
} catch {}

$out.highContrast = [ordered]@{ exists = $false; flags = $null }
try {
  $p = '${P_HC}'
  if (Test-Path -LiteralPath $p) {
    $v = Get-ItemProperty -LiteralPath $p -ErrorAction SilentlyContinue
    $out.highContrast.exists = $true
    $out.highContrast.flags = [string]$v.Flags
  }
} catch {}

$out.colorFilter = [ordered]@{ exists = $false; active = $null; filterType = $null }
try {
  $p = '${P_CF}'
  if (Test-Path -LiteralPath $p) {
    $v = Get-ItemProperty -LiteralPath $p -ErrorAction SilentlyContinue
    $out.colorFilter.exists = $true
    $out.colorFilter.active = $v.Active
    $out.colorFilter.filterType = $v.FilterType
  }
} catch {}

# 夜间模式：私有 blob，只取原始字节由上层启发式判断
$out.nightLight = [ordered]@{ present = $false; blobHex = ''; blobBytes = 0 }
try {
  $nl = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CloudStore\\Store\\DefaultAccount\\Current\\default$windows.data.bluelightreduction.bluelightreductionstate\\windows.data.bluelightreduction.bluelightreductionstate'
  if (Test-Path -LiteralPath $nl) {
    $b = (Get-ItemProperty -LiteralPath $nl -ErrorAction SilentlyContinue).'(default)'
    if ($b -is [byte[]]) {
      $out.nightLight.present = $true
      $out.nightLight.blobBytes = $b.Length
      $out.nightLight.blobHex = (($b | ForEach-Object { $_.ToString('x2') }) -join '')
    }
  }
} catch {}

# ICC 色彩配置文件：当前关联（只读）+ 已安装配置文件
$out.icc = [ordered]@{ associations = @(); profiles = @() }
try {
  $icm = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ICM\\ProfileAssociations\\Display'
  if (Test-Path -LiteralPath $icm) {
    foreach ($sub in (Get-ChildItem -LiteralPath $icm -ErrorAction SilentlyContinue)) {
      $pv = Get-ItemProperty -LiteralPath $sub.PSPath -ErrorAction SilentlyContinue
      foreach ($prop in ($pv.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' })) {
        $out.icc.associations += [ordered]@{ device = $sub.PSChildName; slot = $prop.Name; profile = [string]$prop.Value }
      }
    }
  }
} catch {}
try {
  $dir = Join-Path $env:WINDIR 'System32\\spool\\drivers\\color'
  if (Test-Path -LiteralPath $dir) {
    $out.icc.profiles = @(Get-ChildItem -LiteralPath $dir -ErrorAction SilentlyContinue |
      Where-Object { $_.Extension -in '.icc', '.icm' } | Select-Object -ExpandProperty Name)
  }
} catch {}

$out | ConvertTo-Json -Depth 6 -Compress`;

/** 读设置：specs 为 {key,regPath,valueName} 数组，base64(JSON) 传入 */
export function buildOsSettingsReadScript(specs: Array<{ key: string; regPath: string; valueName: string }>): string {
  const payload = b64(JSON.stringify(specs));
  return `${PS_HEAD}
$specs = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json
$res = @()
foreach ($s in @($specs)) {
  $exists = $false
  $val = $null
  $err = $null
  try {
    if (Test-Path -LiteralPath $s.regPath) {
      $item = Get-ItemProperty -LiteralPath $s.regPath -ErrorAction SilentlyContinue
      if ($item) {
        $name = if ($s.valueName) { $s.valueName } else { '(default)' }
        $prop = $item.PSObject.Properties | Where-Object { $_.Name -eq $name } | Select-Object -First 1
        if ($prop) { $exists = $true; $val = $prop.Value }
      }
    }
  } catch { $err = $_.Exception.Message }
  $res += [ordered]@{ key = $s.key; exists = $exists; value = $val; error = $err }
}
$res | ConvertTo-Json -Depth 4 -Compress`;
}

/**
 * 写设置：单条，base64(JSON) 传参；含 export 备份 + 广播生效。
 *
 * ★ 必须在此处（而非只在上层）拒绝空值：本函数是导出的，绕过 normalizeSettingValue 直接调用时，
 *   若 value 为 null/undefined，PowerShell 侧 `Set-ItemProperty -Value $null` 对 DWord 会
 *   **静默写成 0**（而不是报错）—— 实测已把「浅色主题」写成「深色」。
 *   这类错误既不报错又改变用户系统状态，必须在构造脚本前硬拦。
 */
export function buildOsSettingsWriteScript(payload: {
  regPath: string;
  valueName: string;
  regType: string;
  value: number | string;
  backupFile: string;
  broadcast: string[];
}): string {
  const { value } = payload;
  if (value === null || value === undefined || String(value).trim() === '') {
    throw new Error(
      `拒绝构造写入脚本：value 为空（${payload.regPath}\\${payload.valueName}）。` +
        '空值会被 PowerShell 静默写成 0，必须在调用前取得真实值',
    );
  }
  if (value !== null && typeof value !== 'number' && typeof value !== 'string') {
    throw new Error(`拒绝构造写入脚本：value 类型非法（${typeof value}）`);
  }
  const p = b64(JSON.stringify(payload));
  return `${PS_HEAD}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class YZBC {
  [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
  public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out IntPtr lpdwResult);
  public static void Note(string area) {
    IntPtr r;
    try { SendMessageTimeout(new IntPtr(0xffff), 0x001A, IntPtr.Zero, area, 0x0002, 3000, out r); } catch {}
  }
}
'@ -ErrorAction SilentlyContinue

$cfg = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${p}')) | ConvertFrom-Json
$k = $cfg.regPath
$name = if ($cfg.valueName) { $cfg.valueName } else { '(default)' }

# ---- 1) 备份（键存在才导；不存在＝首次创建，无需备份）----
$backedUp = $false
if (Test-Path -LiteralPath $k) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $cfg.backupFile) | Out-Null
  $kReg = $k.Replace('HKLM:\\', 'HKLM\\').Replace('HKCU:\\', 'HKCU\\')
  reg.exe export "$kReg" "$($cfg.backupFile)" /y | Out-Null
  $backedUp = Test-Path -LiteralPath $cfg.backupFile
  if (-not $backedUp) { Write-Output 'BACKUP_FAILED'; exit 1 }
}

# ---- 2) 写入（键不存在先建）----
if (-not (Test-Path -LiteralPath $k)) { New-Item -Path $k -Force | Out-Null }
$writeErr = $null
try {
  Set-ItemProperty -LiteralPath $k -Name $name -Value $cfg.value -Type $cfg.regType -Force -ErrorAction Stop
} catch { $writeErr = $_.Exception.Message }
if ($writeErr) { Write-Output ('WRITE_FAILED:' + $writeErr); exit 2 }

# ---- 3) 回读确认（写没写进去以回读为准，不信 Set 的返回值）----
$after = $null
try {
  $after = (Get-ItemProperty -LiteralPath $k -Name $name -ErrorAction Stop).$name
} catch {}

# ---- 4) 广播让桌面/外壳重新读取 ----
$areas = @()
foreach ($a in @($cfg.broadcast)) { if ($a) { [YZBC]::Note([string]$a); $areas += [string]$a } }

Write-Output ('OK|' + $after + '|' + ($(if ($backedUp) { $cfg.backupFile } else { '' })) + '|' + ($areas -join ','))`;
}

/**
 * 显示器枚举脚本（DDC/CI + WMI 内屏亮度）。
 * 做成函数而非常量：MONITOR_CS 是 const，常量初始化时引用它会触发 TDZ。
 */
export function buildMonitorListScript(): string {
  return `${PS_HEAD}
${MONITOR_CS}

$ddcRaw = ''
try { $ddcRaw = [YZMON]::List() } catch { $ddcRaw = '' }
$ddc = @()
foreach ($ln in ($ddcRaw -split "\`n")) {
  if (-not $ln.Trim()) { continue }
  $p = $ln.Split([char]9)
  $ddc += [ordered]@{ index = [int]$p[0]; description = $p[1]; brightness = $p[2]; contrast = $p[3] }
}

# WMI 内屏亮度（笔记本内置屏通常走这条，不走 DDC/CI）
$wmi = @()
$wmiAvailable = $false
try {
  $mb = Get-CimInstance -Namespace root\\WMI -ClassName WmiMonitorBrightness -ErrorAction Stop
  if ($mb) {
    $wmiAvailable = $true
    $wmi = @($mb | ForEach-Object { [ordered]@{ instance = $_.InstanceName; current = $_.CurrentBrightness; levels = @($_.Level) } })
  }
} catch { $wmiAvailable = $false }

[ordered]@{ ddc = $ddc; wmiAvailable = $wmiAvailable; wmi = $wmi } | ConvertTo-Json -Depth 4 -Compress`;
}

/** DDC/CI 的 C# 定义（enum + 读写），list 与 set 共用同一份 */
export const MONITOR_CS = `Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class YZMON {
  public delegate bool MonEnum(IntPtr h, IntPtr hdc, ref RECT r, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct PHYSICAL_MONITOR {
    public IntPtr hPhysicalMonitor;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string szPhysicalMonitorDescription;
  }
  [DllImport("user32.dll")] public static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonEnum cb, IntPtr l);
  [DllImport("dxva2.dll", SetLastError = true)] public static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr h, out uint n);
  [DllImport("dxva2.dll", SetLastError = true)] public static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr h, uint n, [Out] PHYSICAL_MONITOR[] arr);
  [DllImport("dxva2.dll", SetLastError = true)] public static extern bool DestroyPhysicalMonitor(IntPtr h);
  [DllImport("dxva2.dll", SetLastError = true)] public static extern bool GetMonitorBrightness(IntPtr h, out uint mn, out uint cur, out uint mx);
  [DllImport("dxva2.dll", SetLastError = true)] public static extern bool SetMonitorBrightness(IntPtr h, uint v);
  [DllImport("dxva2.dll", SetLastError = true)] public static extern bool GetMonitorContrast(IntPtr h, out uint mn, out uint cur, out uint mx);
  [DllImport("dxva2.dll", SetLastError = true)] public static extern bool SetMonitorContrast(IntPtr h, uint v);

  public static List<PHYSICAL_MONITOR> Collect() {
    var list = new List<PHYSICAL_MONITOR>();
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, delegate(IntPtr h, IntPtr hdc, ref RECT r, IntPtr l) {
      uint n = 0;
      if (!GetNumberOfPhysicalMonitorsFromHMONITOR(h, out n) || n == 0) return true;
      var arr = new PHYSICAL_MONITOR[(int)n];
      if (!GetPhysicalMonitorsFromHMONITOR(h, n, arr)) return true;
      foreach (var pm in arr) list.Add(pm);
      return true;
    }, IntPtr.Zero);
    return list;
  }
  static string Range(bool bright, IntPtr h) {
    uint mn = 0, cur = 0, mx = 0;
    bool ok = bright ? GetMonitorBrightness(h, out mn, out cur, out mx)
                     : GetMonitorContrast(h, out mn, out cur, out mx);
    if (!ok) return "";
    return mn + "," + cur + "," + mx;
  }
  public static string List() {
    var sb = new StringBuilder();
    var list = Collect();
    int i = 0;
    foreach (var pm in list) {
      if (pm.hPhysicalMonitor == IntPtr.Zero) continue;
      sb.Append(i).Append((char)9).Append(pm.szPhysicalMonitorDescription).Append((char)9)
        .Append(Range(true, pm.hPhysicalMonitor)).Append((char)9)
        .Append(Range(false, pm.hPhysicalMonitor)).Append('\\n');
      i++;
    }
    foreach (var pm in list) { try { DestroyPhysicalMonitor(pm.hPhysicalMonitor); } catch {} }
    return sb.ToString();
  }
  static string Apply(bool bright, IntPtr h, int pct) {
    uint mn = 0, cur = 0, mx = 0;
    bool ok = bright ? GetMonitorBrightness(h, out mn, out cur, out mx)
                     : GetMonitorContrast(h, out mn, out cur, out mx);
    if (!ok) return "ERR:该显示器不支持读取" + (bright ? "亮度" : "对比度");
    if (mx <= mn) return "ERR:量程无效";
    uint abs = (uint)Math.Round(mn + (mx - mn) * Math.Min(100, Math.Max(0, pct)) / 100.0);
    ok = bright ? SetMonitorBrightness(h, abs) : SetMonitorContrast(h, abs);
    if (!ok) return "ERR:写入被显示器拒绝（该屏可能不支持 DDC/CI 调整）";
    uint mn2 = 0, cur2 = 0, mx2 = 0;
    ok = bright ? GetMonitorBrightness(h, out mn2, out cur2, out mx2)
                : GetMonitorContrast(h, out mn2, out cur2, out mx2);
    return "OK:" + (ok ? cur2.ToString() : abs.ToString()) + ":" + mx.ToString();
  }
  public static string SetPercent(int idx, int pctB, int pctC) {
    var list = Collect();
    if (idx < 0 || idx >= list.Count) {
      foreach (var pm0 in list) { try { DestroyPhysicalMonitor(pm0.hPhysicalMonitor); } catch {} }
      return "ERR:序号越界（共 " + list.Count + " 台）";
    }
    var pm = list[idx];
    var sb = new StringBuilder();
    if (pctB >= 0) sb.Append("brightness").Append((char)9).Append(Apply(true, pm.hPhysicalMonitor, pctB)).Append('\\n');
    if (pctC >= 0) sb.Append("contrast").Append((char)9).Append(Apply(false, pm.hPhysicalMonitor, pctC)).Append('\\n');
    foreach (var pm0 in list) { try { DestroyPhysicalMonitor(pm0.hPhysicalMonitor); } catch {} }
    return sb.ToString();
  }
}
'@ -ErrorAction SilentlyContinue`;

/** DDC/CI 写入脚本：idx 为目标序号，pctB/pctC 为 -1 表示不改该项 */
export function buildDdcSetScript(idx: number, pctB: number | null, pctC: number | null): string {
  const i = Math.max(0, Math.round(Number(idx)));
  const b = pctB === null ? -1 : Math.min(100, Math.max(0, Math.round(Number(pctB))));
  const c = pctC === null ? -1 : Math.min(100, Math.max(0, Math.round(Number(pctC))));
  return `${PS_HEAD}
${MONITOR_CS}
try { Write-Output ([YZMON]::SetPercent(${i}, ${b}, ${c})) } catch { Write-Output ('ERR:' + $_.Exception.Message) }`;
}

/** 内屏亮度写入（WMI）：Timeout 参数固定 1（立即返回） */
export function buildWmiBrightnessScript(pct: number): string {
  const p = Math.min(100, Math.max(0, Math.round(Number(pct))));
  return `${PS_HEAD}
try {
  $m = Get-CimInstance -Namespace root\\WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop
  if (-not $m) { Write-Output 'ERR:本机不支持 WMI 亮度控制（非笔记本内屏或驱动未暴露）'; exit 0 }
  $m.WmiSetBrightness(1, ${p}) | Out-Null
  Start-Sleep -Milliseconds 250
  $now = (Get-CimInstance -Namespace root\\WMI -ClassName WmiMonitorBrightness).CurrentBrightness
  Write-Output ('OK:' + $now + ':100')
} catch {
  Write-Output ('ERR:' + $_.Exception.Message)
}`;
}

/** 打开 ms-settings 页面 / 控制面板小程序 */
export const OPEN_PAGE_SCRIPT = `${PS_HEAD}
$target = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__TARGET__'))
$file   = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__FILE__'))
$argsJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__ARGS__'))
try {
  if ($argsJson) {
    $a = @(($argsJson | ConvertFrom-Json))
    Start-Process -FilePath $file -ArgumentList $a | Out-Null
  } elseif ($file) {
    Start-Process -FilePath $file | Out-Null
  } else {
    Start-Process $target | Out-Null
  }
  Write-Output 'OK'
} catch {
  Write-Output ('ERR:' + $_.Exception.Message)
}`;

/** 构造打开页面脚本（三个参数分别 base64，避免引号/中文问题） */
export function buildOpenPageScript(page: SettingsPage): string {
  const target = page.uri ?? '';
  const file = page.cmd?.file ?? '';
  const args = page.cmd ? JSON.stringify(page.cmd.args) : '';
  return OPEN_PAGE_SCRIPT
    .replace('__TARGET__', b64(target))
    .replace('__FILE__', b64(file))
    .replace('__ARGS__', b64(args));
}

function b64(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64');
}

// ---------- 输出解析（PS 输出 → 结构化对象，容错优先） ----------

/** PowerShell ConvertTo-Json 单元素时给对象不给数组 → 统一包成数组 */
export function asArray<T>(v: unknown): T[] {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? (v as T[]) : [v as T];
}

export interface SystemInfo {
  os: {
    caption?: string; version?: string; build?: string; arch?: string;
    installDate?: string; lastBoot?: string; uptimeHours?: number;
  } | null;
  computer: { manufacturer?: string; model?: string; totalMemGB?: number } | null;
  gpus: Array<{ name?: string; driverVersion?: string; driverDate?: string; resolution?: string; refreshRate?: number; bitsPerPixel?: number }>;
  monitors: Array<{ instance?: string; manufacturer?: string; productCode?: string; name?: string; serial?: string; year?: number; active?: boolean }>;
  screens: Array<{ device?: string; resolution?: string; width?: number; height?: number; primary?: boolean; dpi?: number; scalePct?: number }>;
  systemDpi: number;
  theme: { exists: boolean; appsLight: number | null; systemLight: number | null; transparency: number | null };
  dwm: { exists: boolean; colorPrevalence: number | null; accentColor: number | null; accentHex: string | null };
  highContrast: { exists: boolean; flags: string | null; enabled: boolean | null };
  colorFilter: { exists: boolean; active: number | null; filterType: number | null };
  nightLight: { present: boolean; blobBytes: number; enabled: boolean | null };
  icc: { associations: Array<{ device?: string; slot?: string; profile?: string }>; profiles: string[] };
}

/** 解析体检脚本输出；坏数据不抛错，尽量返回残缺但可用的结构 */
export function parseSystemInfo(stdout: string): SystemInfo {
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(stdout ?? '').trim() || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>;
  } catch { /* 解析失败按空对象处理，下面全给默认值 */ }

  const theme = (raw.theme ?? {}) as Record<string, unknown>;
  const dwm = (raw.dwm ?? {}) as Record<string, unknown>;
  const hc = (raw.highContrast ?? {}) as Record<string, unknown>;
  const cf = (raw.colorFilter ?? {}) as Record<string, unknown>;
  const nl = (raw.nightLight ?? {}) as Record<string, unknown>;
  const icc = (raw.icc ?? {}) as Record<string, unknown>;

  const accentRaw = dwm.accentColor === null || dwm.accentColor === undefined ? null : Number(dwm.accentColor);
  const hcFlags = hc.flags === null || hc.flags === undefined ? null : String(hc.flags);
  const nlEnabled = detectNightLight(String(nl.blobHex ?? ''));

  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const str = (v: unknown): string | undefined => (v === null || v === undefined || v === '' ? undefined : String(v));

  return {
    os: raw.os ? (raw.os as SystemInfo['os']) : null,
    computer: raw.computer ? (raw.computer as SystemInfo['computer']) : null,
    gpus: asArray<SystemInfo['gpus'][number]>(raw.gpus),
    monitors: asArray<SystemInfo['monitors'][number]>(raw.monitors),
    screens: asArray<{ device?: string; resolution?: string; width?: number; height?: number; primary?: boolean; dpi?: number }>(raw.dpi).map((s) => {
      const dpi = Number(s.dpi) || 0;
      return { ...s, dpi, scalePct: dpiToScalePct(dpi) };
    }),
    systemDpi: Number(raw.systemDpi) || 0,
    theme: {
      exists: !!theme.exists,
      appsLight: num(theme.appsLight),
      systemLight: num(theme.systemLight),
      transparency: num(theme.transparency),
    },
    dwm: {
      exists: !!dwm.exists,
      colorPrevalence: num(dwm.colorPrevalence),
      accentColor: accentRaw,
      accentHex: accentRaw === null ? null : rgbFromAbgr(accentRaw),
    },
    highContrast: { exists: !!hc.exists, flags: hcFlags, enabled: hcFlags === null ? null : hcFlags === '127' },
    colorFilter: { exists: !!cf.exists, active: num(cf.active), filterType: num(cf.filterType) },
    nightLight: {
      present: !!nl.present,
      blobBytes: Number(nl.blobBytes) || 0,
      enabled: nlEnabled,
    },
    icc: {
      associations: asArray<{ device?: string; slot?: string; profile?: string }>(icc.associations),
      profiles: Array.isArray(icc.profiles) ? (icc.profiles as string[]).map(String) : [],
    },
  };
}

export interface MonitorEntry {
  index: number;
  description: string;
  brightness: { min: number; cur: number; max: number } | null;
  contrast: { min: number; cur: number; max: number } | null;
}

export interface MonitorList {
  ddc: MonitorEntry[];
  wmiAvailable: boolean;
  wmi: Array<{ instance?: string; current?: number }>;
}

export function parseMonitorList(stdout: string): MonitorList {
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(stdout ?? '').trim() || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>;
  } catch { /* 空列表兜底 */ }

  return {
    ddc: asArray<Record<string, unknown>>(raw.ddc).map((d) => ({
      index: Number(d.index) || 0,
      description: String(d.description ?? ''),
      brightness: parseRange(String(d.brightness ?? '')),
      contrast: parseRange(String(d.contrast ?? '')),
    })),
    wmiAvailable: !!raw.wmiAvailable,
    wmi: asArray<{ instance?: string; current?: number }>(raw.wmi),
  };
}

/** 解析 "OK|回读值|备份文件|广播区域" 或 "WRITE_FAILED:xx" / "BACKUP_FAILED" */
export function parseWriteResult(stdout: string): { ok: boolean; value?: string; backup?: string; broadcast?: string[]; error?: string } {
  const s = String(stdout ?? '').trim();
  if (s.includes('BACKUP_FAILED')) return { ok: false, error: '写入前备份导出失败，已中止（未改动注册表）' };
  if (s.includes('WRITE_FAILED:')) return { ok: false, error: s.slice(s.indexOf('WRITE_FAILED:') + 'WRITE_FAILED:'.length).trim() };
  const line = s.split(/\r?\n/).find((l) => l.startsWith('OK|'));
  if (!line) return { ok: false, error: `设置工具输出无法解析: ${s.slice(0, 200)}` };
  const [, value = '', backup = '', broadcast = ''] = line.split('|');
  return {
    ok: true,
    value,
    backup: backup || undefined,
    broadcast: broadcast ? broadcast.split(',').filter(Boolean) : [],
  };
}

/** 清洗注册表回读值：String/ExpandString 类型常带一层引号（如 Flags 的 "126"） */
export function parseSettingValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const s = String(v);
  const m = s.match(/^"(.*)"$/s);
  return m ? m[1] : s;
}

/** 注册表备份保留份数上限（超出按文件名时间戳删最旧的） */
export const BACKUP_KEEP = 200;

/** 解析 "OK:当前值:上限" 或 "ERR:原因"（显示器写入） */
export function parseMonitorSetResult(stdout: string): { ok: boolean; lines: Array<{ field: string; ok: boolean; value?: string; error?: string }> } {
  const out: Array<{ field: string; ok: boolean; value?: string; error?: string }> = [];
  for (const raw of String(stdout ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const tab = line.indexOf('\t');
    if (tab < 0) {
      // 无字段名（内屏 WMI 单值返回 / 整体错误）
      if (line.startsWith('ERR:')) out.push({ field: 'brightness', ok: false, error: line.slice(4).trim() });
      else if (line.startsWith('OK:')) out.push({ field: 'brightness', ok: true, value: line.split(':')[1] });
      continue;
    }
    const field = line.slice(0, tab).trim();
    const rest = line.slice(tab + 1).trim();
    if (rest.startsWith('ERR:')) out.push({ field, ok: false, error: rest.slice(4).trim() });
    else if (rest.startsWith('OK:')) {
      const [, cur, max] = rest.split(':');
      out.push({
        field,
        ok: true,
        value: max && Number(max) > 0 ? `${Math.round((Number(cur) / Number(max)) * 100)}%（设备值 ${cur}/${max}）` : String(cur ?? ''),
      });
    }
  }
  return { ok: out.length > 0 && out.some((o) => o.ok), lines: out };
}