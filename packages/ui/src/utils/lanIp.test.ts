/**
 * 本机 IP 管理守门测试（2026-10-17，用户报障「连接地址怎么都是 localhost」）。
 *
 * 覆盖 utils/lanIp.ts 的三条纯函数口径 + Settings.vue 的接线契约：
 *   ① 响应解析 —— 修掉"apiFetch 已单层解包、调用方又多解一层"导致 lanIps 恒空的 bug；
 *   ② 虚拟网卡判定与排序 —— vEthernet(Hyper-V) 不能当默认对外 IP；
 *   ③ 默认 IP 选定 —— 用户显式选的优先，失效（换网）自动回落，不指向幽灵地址。
 *   ④ 三个带 IP 的链接（Web 服务地址 / 商城连接地址 / 短信上报地址）必须同源供数。
 *
 * ②③ 是真跑纯函数（不依赖 Electron / 组件挂载）；①的接线用源码锚点（同 shortcut-governance 手法）。
 * ★ 锚点断言对**剥注释后的 `<script setup>` 块**做 —— 修复说明注释里就写着错写法
 *   （`data.data`），直接对全文做负向断言会被自己的注释绊到假红。
 *
 * ===== 变异测试记录 =====
 *  mF Settings.vue：webServiceUrl 绕过 preferredLanIp 改用 window.location.hostname → 变红 ✓
 *      （计数断言抓到：3 处变 2 处）
 *  mG Settings.vue：webServiceUrl 的返回值多加 `/api` 后缀（退化成又一个 API 地址）  → 变红 ✓
 *      （正则断言抓到，与 mF 走的是不同断言 —— 两层守卫各自独立有效）
 *  ⚠️ 实操教训：mF/mG 之间**忘了还原**，G 叠在 F 上跑，报错信息是 F 的 ⇒ 变异必须
 *     从干净基线逐个跑，否则"变红"可能来自上一个变异，自欺欺人。
 *  ⚠️ 实操教训 2：还原别用 `git checkout --`（会连本轮未提交改动一起丢，本次真丢过一次），
 *     用 `cp 备份文件` 还原。
 */
import { describe, it, expect } from 'vitest';
import {
  isVirtualNic,
  sortLanIps,
  pickDefaultLanIp,
  parseNetworkIpResponse,
  type LanIp,
} from './lanIp';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 本文件在 packages/ui/src/utils/ → 上溯 4 层到仓库根（packages/ui/src/utils → src → ui → packages → root）
const ROOT = resolve(__dirname, '../../../..');
const SETTINGS = readFileSync(resolve(ROOT, 'packages/ui/src/views/Settings.vue'), 'utf8');
const DIALOG = readFileSync(resolve(ROOT, 'packages/ui/src/components/SettingsDialog.vue'), 'utf8');

/**
 * 只取 <script setup> 块并剥掉注释。
 *
 * ★ 为什么必须剥：修复说明本身就要在注释里写出错写法（`data.data`）——
 *   若直接对全文做"不得出现 data.data"的负向断言，注释会让测试假红，
 *   久而久之大家就会把断言改弱或删掉。剥注释后断言的是**代码**，与注释文案解耦。
 */
function scriptOf(sfc: string): string {
  const m = sfc.match(/<script setup[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('SFC 缺 <script setup> 块');
  return m[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}
const SETTINGS_CODE = scriptOf(SETTINGS);

/** 复刻本机真实形态（2026-10-17 curl /api/network/ip 实测）：Hyper-V 虚拟交换机排在 WLAN 前面 */
const REAL: LanIp[] = [
  { name: 'vEthernet (hyper)', address: '192.168.137.1' },
  { name: 'WLAN', address: '192.168.5.53' },
  { name: 'vEthernet (Default Switch)', address: '172.24.224.1' },
];

describe('parseNetworkIpResponse（★ 恒空 bug 的根因）', () => {
  it('★ apiFetch 单层解包后的形态 { data: [...], port } 能解析出清单', () => {
    // 这就是线上真实形态：后端返回 {data,port}，apiFetch 解包后 r = { data: [...], port }
    const r = { data: REAL, port: 3001 };
    const { ips, port } = parseNetworkIpResponse(r);
    expect(ips.map((x) => x.address)).toEqual(['192.168.137.1', '192.168.5.53', '172.24.224.1']);
    expect(port).toBe(3001);
  });

  it('★ 后端原始形态 { data: { data: [...], port } } 也能解析（直连/测试兜底）', () => {
    const { ips, port } = parseNetworkIpResponse({ data: { data: REAL, port: 3001 } });
    expect(ips).toHaveLength(3);
    expect(port).toBe(3001);
  });

  it('裸数组形态直接可用', () => {
    expect(parseNetworkIpResponse(REAL).ips).toHaveLength(3);
  });

  it('空/异常输入不抛，返回空清单', () => {
    expect(parseNetworkIpResponse(null).ips).toEqual([]);
    expect(parseNetworkIpResponse(undefined).ips).toEqual([]);
    expect(parseNetworkIpResponse({}).ips).toEqual([]);
    expect(parseNetworkIpResponse({ data: 'not-array' }).ips).toEqual([]);
    expect(parseNetworkIpResponse({ data: [null, 1, {}] }).ips).toEqual([]);
  });

  it('port 非法时回落 undefined（不把 0/NaN 当端口）', () => {
    expect(parseNetworkIpResponse({ data: REAL, port: 0 }).port).toBeUndefined();
    expect(parseNetworkIpResponse({ data: REAL, port: 'x' }).port).toBeUndefined();
    expect(parseNetworkIpResponse({ data: REAL }).port).toBeUndefined();
  });
});

describe('isVirtualNic（虚拟网卡判定）', () => {
  it('★ Hyper-V 虚拟交换机（本机真实踩坑项）', () => {
    expect(isVirtualNic('vEthernet (hyper)')).toBe(true);
    expect(isVirtualNic('vEthernet (Default Switch)')).toBe(true);
  });

  it('VMware / VirtualBox / WSL / Docker / VPN 虚拟网卡', () => {
    expect(isVirtualNic('VMware Network Adapter VMnet8')).toBe(true);
    expect(isVirtualNic('VirtualBox Host-Only Network')).toBe(true);
    expect(isVirtualNic('WSL')).toBe(true);
    expect(isVirtualNic('DockerNAT')).toBe(true);
    expect(isVirtualNic('OpenVPN TAP-Windows Adapter')).toBe(true);
    expect(isVirtualNic('Tailscale')).toBe(true);
    expect(isVirtualNic('WireGuard Tunnel')).toBe(true);
  });

  it('★ 物理网卡不得误判（含 wireless/ethernet 关键词的）', () => {
    expect(isVirtualNic('WLAN')).toBe(false);
    expect(isVirtualNic('Wi-Fi')).toBe(false);
    expect(isVirtualNic('以太网')).toBe(false);
    expect(isVirtualNic('Ethernet')).toBe(false);
    expect(isVirtualNic('Intel(R) Wireless-AC 9560 160MHz')).toBe(false);
    expect(isVirtualNic('Realtek PCIe GbE Family Controller')).toBe(false);
    expect(isVirtualNic('eth0')).toBe(false);
    expect(isVirtualNic('')).toBe(false);
  });
});

describe('sortLanIps（排序即贯通）', () => {
  it('★ 默认 IP 置顶（哪怕它是虚拟网卡 —— 用户显式选择要尊重）', () => {
    const out = sortLanIps(REAL, '172.24.224.1');
    expect(out[0].address).toBe('172.24.224.1');
  });

  it('★ 未指定默认时物理网卡排前、虚拟网卡沉底', () => {
    const out = sortLanIps(REAL, '');
    // 组内按 IPv4 数字序：虚拟组里 172.24.224.1 < 192.168.137.1（不是字符串序）
    expect(out.map((x) => x.address)).toEqual(['192.168.5.53', '172.24.224.1', '192.168.137.1']);
  });

  it('同优先级内按 IPv4 数字序稳定（192.168.5.53 先于 192.168.137.1）', () => {
    const list: LanIp[] = [
      { name: '以太网 2', address: '192.168.137.9' },
      { name: '以太网', address: '192.168.5.53' },
    ];
    expect(sortLanIps(list, '').map((x) => x.address)).toEqual(['192.168.5.53', '192.168.137.9']);
  });

  it('不修改入参（sort 原地排序会污染调用方 ref）', () => {
    const input = REAL.slice();
    sortLanIps(input, '192.168.5.53');
    expect(input.map((x) => x.address)).toEqual(['192.168.137.1', '192.168.5.53', '172.24.224.1']);
  });

  it('空清单安全', () => {
    expect(sortLanIps([], 'x')).toEqual([]);
  });
});

describe('pickDefaultLanIp（默认 IP 选定）', () => {
  it('★ 用户显式选的地址优先', () => {
    expect(pickDefaultLanIp(REAL, '192.168.137.1')).toBe('192.168.137.1');
  });

  it('★ 换网后旧地址失效 → 自动回落第一个物理网卡，不指向幽灵地址', () => {
    expect(pickDefaultLanIp(REAL, '10.0.0.7')).toBe('192.168.5.53');
  });

  it('未选 → 第一个物理网卡', () => {
    expect(pickDefaultLanIp(REAL, '')).toBe('192.168.5.53');
    expect(pickDefaultLanIp(REAL, '   ')).toBe('192.168.5.53');
  });

  it('全是虚拟网卡的极端场景仍给一个地址（比 localhost 强）', () => {
    const allVirtual: LanIp[] = [{ name: 'vEthernet (hyper)', address: '192.168.137.1' }];
    expect(pickDefaultLanIp(allVirtual, '')).toBe('192.168.137.1');
  });

  it('空清单 → 空串（调用方据此走"未检测到"提示）', () => {
    expect(pickDefaultLanIp([], '')).toBe('');
  });
});

describe('Settings.vue 接线契约（源码锚点）', () => {
  it('★ loadLanIps 走 parseNetworkIpResponse，不再手写 data.data 多层解包', () => {
    expect(SETTINGS_CODE).toMatch(/const \{ ips, port \} = parseNetworkIpResponse\(r\)/);
    // 老 bug 的判据：`Array.isArray(data.data)` 这种多解一层的写法必须绝迹（剥注释后判代码）
    expect(SETTINGS_CODE).not.toMatch(/Array\.isArray\(data\.data\)/);
    expect(SETTINGS_CODE).not.toMatch(/data\.data\.map/);
  });

  it('★ scanLanNodes 同样只解一层（data.nodes，不是 data.data.nodes）', () => {
    expect(SETTINGS_CODE).toMatch(/Array\.isArray\(data\?\.nodes\) \? data\.nodes : \[\]/);
    expect(SETTINGS_CODE).not.toMatch(/data\.data\.nodes/);
  });

  it('★ 连接地址/上报地址/Web 服务地址统一走 preferredLanIp 单一真相源', () => {
    expect(SETTINGS_CODE).toMatch(/const preferredLanIp = computed\(\(\) =>\s*pickDefaultLanIp\(lanIps\.value, settingsStore\.settings\.defaultLanIp\)/);
    // 三处带 IP 的链接都必须由 preferredLanIp 供数（不允许各写一套 host 解析）
    const urlCount = (SETTINGS_CODE.match(/const host = preferredLanIp\.value/g) || []).length;
    expect(urlCount, `★ 带 IP 的链接应有 3 处走 preferredLanIp（实测 ${urlCount}）`).toBe(3);
    // Web 服务地址必须是"默认 IP + 端口"、不带路径后缀（与另两个只差后缀）
    expect(SETTINGS_CODE).toMatch(/const webServiceUrl = computed\(\(\) => \{[\s\S]*?const host = preferredLanIp\.value[\s\S]*?return `http:\/\/\$\{host\}:\$\{lanPort\.value\}`;/);
  });

  it('★ 默认 IP 写入 settings.defaultLanIp，且提供"恢复自动"入口', () => {
    expect(SETTINGS_CODE).toMatch(/settingsStore\.update\(\{ defaultLanIp: v \|\| '' \}\)/);
    expect(SETTINGS_CODE).toMatch(/hasManualLanIp/);
    expect(SETTINGS).toMatch(/恢复自动/);
  });

  it('★ 新分区已注册：本机 IP（localip）+ 快捷键（shortcuts）', () => {
    expect(SETTINGS).toMatch(/name="localip"/);
    expect(SETTINGS).toMatch(/name="shortcuts"/);
    // 快捷键行必须真的搬出了「通用」pane（通用 pane 内不得再出现截图/急停 SettingRow）
    const generalPane = SETTINGS.slice(
      SETTINGS.indexOf('name="general"'),
      SETTINGS.indexOf('name="shortcuts"'),
    );
    expect(generalPane, '★ 截图快捷键仍留在通用分区').not.toMatch(/label="截图快捷键"/);
    expect(generalPane, '★ 急停快捷键仍留在通用分区').not.toMatch(/label="AI 急停快捷键"/);
    // 快捷键分区内四项齐全
    const shortcutsPane = SETTINGS.slice(
      SETTINGS.indexOf('name="shortcuts"'),
      SETTINGS.indexOf('name="skin"'),
    );
    for (const label of ['截图快捷键', '截图隐藏本应用', 'AI 急停快捷键', '聊天发送键']) {
      expect(shortcutsPane, `★ 快捷键分区缺「${label}」`).toMatch(new RegExp(`label="${label}"`));
    }
  });

  it('★ SettingsDialog 左导航有独立「快捷键」与「本机 IP」菜单项', () => {
    expect(DIALOG).toMatch(/\{ key: 'shortcuts', label: '快捷键', icon: Key, pane: 'shortcuts' \}/);
    expect(DIALOG).toMatch(/\{ key: 'localip', label: '本机 IP', icon: Connection, pane: 'localip' \}/);
  });
});
