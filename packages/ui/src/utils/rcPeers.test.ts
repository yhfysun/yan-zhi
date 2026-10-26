/**
 * 「已保存的被控端」守门测试（2026-10-26，用户要求「授权码也要记录啊，还有多个能下拉选择」）。
 *
 * 纯函数真跑；接线部分用源码锚点（同 lanIp / shortcut-governance 手法），
 * 锚点对**剥注释后的 `<script setup>`** 做，避免被说明注释里的错写法绊成假红。
 *
 * ===== 变异测试记录 =====
 *  mK RemoteControl.vue：pair() 里去掉 rememberPeer → 变红 ✓（授权码又回到"每次重敲"）
 *  mL RemoteControl.vue：挂载时 `!form.code` 条件写回来 → 变红 ✓
 *      （记住授权码后，扫到的新码会被旧码顶掉，扫码/邀请链接静默不配对）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  normalizeRcHost,
  parseRcPeers,
  upsertRcPeer,
  removeRcPeer,
  peerLabel,
  RC_PEERS_MAX,
  type RcPeer,
} from './rcPeers';

const ROOT = resolve(__dirname, '../../../..');
const REMOTE = readFileSync(resolve(ROOT, 'packages/ui/src/views/RemoteControl.vue'), 'utf8');
/** 只取 <script setup> 并剥注释：注释里会写出错写法（`!form.code`），不剥会假红 */
function scriptOf(sfc: string): string {
  const m = sfc.match(/<script setup[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('SFC 缺 <script setup> 块');
  return m[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const A = 'http://192.168.10.222:3001';
const B = 'http://172.18.160.1:3001';

function peers(...items: RcPeer[]): RcPeer[] {
  return items;
}

describe('normalizeRcHost（同一台机器不该存成两条）', () => {
  it('去首尾空白与尾部斜杠', () => {
    expect(normalizeRcHost('  http://192.168.1.5:3001/  ')).toBe('http://192.168.1.5:3001');
    expect(normalizeRcHost('http://h:3001///')).toBe('http://h:3001');
  });

  it('非字符串/空值一律变空串，不抛异常', () => {
    expect(normalizeRcHost(null)).toBe('');
    expect(normalizeRcHost(undefined)).toBe('');
    expect(normalizeRcHost(123)).toBe('123');
  });
});

describe('parseRcPeers（本地数据必须宽容）', () => {
  it('脏数据当空清单，不炸', () => {
    expect(parseRcPeers(null)).toEqual([]);
    expect(parseRcPeers({ host: A })).toEqual([]);
    expect(parseRcPeers([null, 1, 'x', {}])).toEqual([]);
  });

  it('按地址去重（大小写不敏感），保留第一条', () => {
    const out = parseRcPeers([
      { host: A, code: 'aaaa-bbbb', lastUsed: 2 },
      { host: 'HTTP://192.168.10.222:3001', code: 'zzzz', lastUsed: 9 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].code).toBe('aaaa-bbbb');
  });

  it('★ 旧版 rc:lastHost 会迁移成一条（只带地址，没有码）', () => {
    expect(parseRcPeers(null, A)).toEqual([{ host: A, code: '', lastUsed: 0 }]);
    // 新清单里已有同一地址时不重复插
    const list = [{ host: A, code: 'abcd', lastUsed: 5 }];
    expect(parseRcPeers(list, A)).toHaveLength(1);
  });

  it('最近用的排最前，超出上限截断', () => {
    const out = parseRcPeers([
      { host: 'http://a:1', lastUsed: 1 },
      { host: 'http://b:1', lastUsed: 3 },
    ]);
    expect(out.map((x) => x.host)).toEqual(['http://b:1', 'http://a:1']);
    const many = Array.from({ length: RC_PEERS_MAX + 4 }, (_, i) => ({ host: `http://h${i}:1`, lastUsed: i }));
    expect(parseRcPeers(many)).toHaveLength(RC_PEERS_MAX);
    expect(parseRcPeers(many)[0].host).toBe(`http://h${RC_PEERS_MAX + 3}:1`);
  });
});

describe('upsertRcPeer（记录 = 地址 + 授权码成对）', () => {
  it('新地址插到最前，并带上授权码', () => {
    const out = upsertRcPeer(peers({ host: A, code: 'old1', lastUsed: 1 }), B, 'new1', 2);
    expect(out.map((x) => x.host)).toEqual([B, A]);
    expect(out[0].code).toBe('new1');
  });

  it('★ 同一地址换码：就地更新并提到最前（不是新增一条）', () => {
    const out = upsertRcPeer(
      peers({ host: A, code: 'old1', lastUsed: 1 }, { host: B, code: 'b', lastUsed: 5 }),
      `${A}/`, 'fresh', 9,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ host: A, code: 'fresh', lastUsed: 9 });
  });

  it('这次没填码时保留旧码（只改地址形态不该把码抹掉）', () => {
    const out = upsertRcPeer(peers({ host: A, code: 'keep', lastUsed: 1 }), A, '', 4);
    expect(out[0].code).toBe('keep');
    expect(out[0].lastUsed).toBe(4);
  });

  it('空地址不记；超出上限截断', () => {
    expect(upsertRcPeer([], '   ', 'x', 1)).toEqual([]);
    let list: RcPeer[] = [];
    for (let i = 0; i < RC_PEERS_MAX + 3; i++) list = upsertRcPeer(list, `http://h${i}:1`, `c${i}`, i + 1);
    expect(list).toHaveLength(RC_PEERS_MAX);
    expect(list[0].host).toBe(`http://h${RC_PEERS_MAX + 2}:1`);
  });

  it('不改原数组（不可变）', () => {
    const original = peers({ host: A, code: 'a', lastUsed: 1 });
    upsertRcPeer(original, B, 'b', 2);
    expect(original).toHaveLength(1);
  });
});

describe('removeRcPeer / peerLabel', () => {
  it('按地址删除，大小写与尾斜杠不敏感', () => {
    const out = removeRcPeer(peers({ host: A, code: 'a', lastUsed: 1 }, { host: B, code: '', lastUsed: 0 }), `${A}/`);
    expect(out.map((x) => x.host)).toEqual([B]);
  });

  it('★ 下拉文案去协议前缀、标出已存码，但绝不显示码值', () => {
    expect(peerLabel({ host: A, code: 'secret-code', lastUsed: 0 })).toBe('192.168.10.222:3001（已存授权码）');
    expect(peerLabel({ host: B, code: '', lastUsed: 0 })).toBe('172.18.160.1:3001');
    expect(peerLabel({ host: A, code: 'secret-code', lastUsed: 0 })).not.toContain('secret-code');
    expect(peerLabel({ host: 'https://x:1', code: '', lastUsed: 0 })).toBe('x:1');
  });
});

describe('RemoteControl.vue 接线契约（源码锚点）', () => {
  const CODE = scriptOf(REMOTE);

  it('★ 配对成功即记录（地址 + 授权码），不是只记地址', () => {
    const pairIdx = CODE.indexOf('async function pair(');
    expect(pairIdx, '未找到 pair()').toBeGreaterThan(0);
    expect(CODE.slice(pairIdx), '★ pair() 里没有 rememberPeer ⇒ 授权码不会被记住')
      .toMatch(/rememberPeer\(base\)/);
    expect(CODE, '★ rememberPeer 必须把 form.code 一起存').toMatch(
      /upsertRcPeer\(peers\.value, host, form\.code, Date\.now\(\)\)/,
    );
  });

  it('★ 挂载时恢复最近一台的地址和授权码（含旧 rc:lastHost 迁移）', () => {
    expect(CODE).toMatch(/readPeers\(\);\s*\n\s*const lastPeer = peers\.value\[0\]/);
    expect(CODE).toMatch(/if \(lastPeer\.code\) form\.code = lastPeer\.code/);
    expect(CODE).toMatch(/parseRcPeers\(raw, localStorage\.getItem\(RC_LAST_HOST_KEY\) \|\| ''\)/);
  });

  it('★ ?code= 直达优先于记住的旧码（扫码/邀请链接不能被旧码顶掉）', () => {
    const qrIdx = CODE.indexOf('route?.query?.code');
    expect(qrIdx, '未找到 ?code= 直达逻辑').toBeGreaterThan(0);
    const tail = CODE.slice(qrIdx, qrIdx + 400);
    expect(tail, '★ 条件里又出现 !form.code：记住授权码后扫码会静默不配对').not.toMatch(/!form\.code/);
    expect(tail).toMatch(/form\.code = qc;\s*\n\s*void pair\(\);/);
  });

  it('★ 控制页有「已保存的被控端」下拉，选一个自动填地址和授权码', () => {
    expect(REMOTE).toMatch(/v-if="peers\.length" :value="currentPeerHost"/);
    expect(REMOTE).toMatch(/v-for="p in peers" :key="p\.host" :value="p\.host">\{\{ peerLabel\(p\) \}\}/);
    expect(CODE).toMatch(/function pickPeer\(e: Event\)[\s\S]*?form\.host = p\.host[\s\S]*?form\.code = p\.code/);
  });
});
