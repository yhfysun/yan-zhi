// remote-control · 守门单测：授权码 / 配对判定 / 配对限流 / 输入黑名单 / 代理流解析。
//
// ★ 本文件是远控输入面的安全守门（与 computer-use-system.test.ts 同定位）：
//   「聊天里按不得的键，远控面板同样按不得」靠 cu-shared 共用黑名单；
//   授权码比对、白名单双因子、内网限制、配对限流的边界都在这里钉死，
//   任何人改判定逻辑必须同步改这里的用例，否则绕过面会静默上线。
// ★ 2026-10-26：远控**输入**不再按条数限流（滚轮/拖动是连续输入，几十秒就能把整场
//   会话烧成「静默只读」）；SlidingWindowLimiter 现在只服务配对频控。
import { describe, it, expect } from 'vitest';
import {
  createAgentStreamParser,
  generatePairCode,
  normalizePairCode,
  PAIR_CODE_CHARSET,
} from '../src/plugins/remote-control-agent';
import {
  SlidingWindowLimiter,
  assembleJpegDisplays,
  buildIceServers,
  evaluatePair,
  isPrivateRemoteAddr,
  isValidCustomCode,
  sanitizeRemoteFileName,
  validateDisplaySelect,
  validateInputMsg,
  type StoredPairCode,
  type WhitelistEntry,
} from '../src/plugins/remote-control';
import { DENIED_KEY_COMBOS } from '../src/plugins/cu-shared';

// ---------------------------------------------------------------------------
// 授权码
// ---------------------------------------------------------------------------
describe('pair code', () => {
  it('生成 xxxx-xxxx 形态，字符集不含易混字符', () => {
    const code = generatePairCode();
    expect(code).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(code).not.toMatch(/[01ilo]/);
  });

  it('注入确定随机源时输出可复现（每次位取自字符集）', () => {
    let seq = 0;
    const code = generatePairCode(() => {
      const v = [0, 0.5, 0.999, 0.25][seq % 4];
      seq += 1;
      return v;
    });
    expect(code).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
    for (const ch of code.replace('-', '')) {
      expect(PAIR_CODE_CHARSET).toContain(ch);
    }
  });

  it('归一化：去横线/空格/下划线并小写', () => {
    expect(normalizePairCode('AB cd-12_3I')).toBe('abcd123i');
  });

  it('自定义码校验：长度与字符集边界', () => {
    expect(isValidCustomCode('abcd-2345')).toBe(true);
    expect(isValidCustomCode('abc12')).toBe(false); // 过短
    expect(isValidCustomCode('a'.repeat(17))).toBe(false); // 过长
    expect(isValidCustomCode('abcd10lo')).toBe(false); // 含 0/1/l/o
  });
});

// ---------------------------------------------------------------------------
// 配对判定
// ---------------------------------------------------------------------------
const storedCode = (code: string): StoredPairCode => ({ mode: 'temp', current: code, updatedAt: 1 });
/** 限流测试统一用真实时钟附近的毫秒值（limiter 默认以 Date.now() 裁剪窗口） */
const t0 = Date.now();
const wlEntry = (over: Partial<WhitelistEntry> = {}): WhitelistEntry => ({
  deviceId: 'dev-1',
  deviceToken: 'tok-abc',
  name: '手机',
  addedAt: 1,
  lastUsedAt: 1,
  ...over,
});

const pairBase = {
  hasActiveGranted: false,
  stored: storedCode('abcd-1234'),
  whitelist: [] as WhitelistEntry[],
  remoteAddr: '192.168.1.50',
  allowExternalSubnet: false,
};

describe('evaluatePair', () => {
  it('正确授权码 → pending（等被控端确认）', () => {
    const r = evaluatePair({ ...pairBase, code: 'ABCD-1234', deviceId: 'dev-1' });
    expect(r).toMatchObject({ ok: true, status: 'pending' });
  });

  it('错误授权码 → 拒绝', () => {
    const r = evaluatePair({ ...pairBase, code: 'zzzz-9999', deviceId: 'dev-1' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('授权码不正确');
  });

  it('白名单双因子匹配（deviceId + deviceToken）→ 免确认 granted', () => {
    const r = evaluatePair({
      ...pairBase,
      code: '',
      deviceId: 'dev-1',
      deviceToken: 'tok-abc',
      whitelist: [wlEntry()],
    });
    expect(r).toMatchObject({ ok: true, status: 'granted', trusted: true });
  });

  it('deviceId 对但 deviceToken 错 → 不放行（回退到授权码比对）', () => {
    const r = evaluatePair({
      ...pairBase,
      code: 'zzzz-9999',
      deviceId: 'dev-1',
      deviceToken: 'tok-forged',
      whitelist: [wlEntry()],
    });
    expect(r.ok).toBe(false);
  });

  it('已有活动会话（独占）→ 拒绝，白名单也一样', () => {
    const r = evaluatePair({
      ...pairBase,
      code: '',
      deviceId: 'dev-1',
      deviceToken: 'tok-abc',
      whitelist: [wlEntry()],
      hasActiveGranted: true,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('独占');
  });

  it('公网来源默认拒绝；配置放开后按授权码正常判定', () => {
    const pub = { ...pairBase, remoteAddr: '8.8.8.8' };
    expect(evaluatePair({ ...pub, code: 'abcd-1234', deviceId: 'dev-1' }).ok).toBe(false);
    expect(
      evaluatePair({ ...pub, allowExternalSubnet: true, code: 'abcd-1234', deviceId: 'dev-1' }).ok,
    ).toBe(true);
  });

  it('缺少 deviceId → 拒绝', () => {
    expect(evaluatePair({ ...pairBase, code: 'abcd-1234', deviceId: '' }).ok).toBe(false);
  });
});

describe('isPrivateRemoteAddr', () => {
  it('放行：loopback / IPv4-mapped / RFC1918 / IPv6 本地', () => {
    for (const a of ['127.0.0.1', '::1', '::ffff:10.0.0.5', '10.1.2.3', '192.168.50.4', '172.16.0.1', '172.31.255.255', 'fd00::5', 'fe80::1']) {
      expect(isPrivateRemoteAddr(a), a).toBe(true);
    }
  });
  it('拒绝：公网与 172 边界外', () => {
    for (const a of ['8.8.8.8', '172.15.0.1', '172.32.0.1', '11.0.0.1', '193.168.1.1']) {
      expect(isPrivateRemoteAddr(a), a).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 输入限流
// ---------------------------------------------------------------------------
describe('SlidingWindowLimiter', () => {
  it('cap 内放行，超限拒绝', () => {
    const l = new SlidingWindowLimiter(3, 60_000);
    expect(l.hit(t0)).toBe(true);
    expect(l.hit(t0 + 1)).toBe(true);
    expect(l.hit(t0 + 2)).toBe(true);
    expect(l.hit(t0 + 3)).toBe(false);
    expect(l.count).toBe(3);
  });
  it('窗口滑出后恢复', () => {
    const l = new SlidingWindowLimiter(2, 60_000);
    l.hit(t0 - 120_000);
    l.hit(t0 - 119_000);
    expect(l.allow(t0)).toBe(true); // 两条都已滑出 60s 窗口
    expect(l.hit(t0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 输入消息护栏
// ---------------------------------------------------------------------------
describe('validateInputMsg', () => {
  it('click / move / down / up 生成对应代理指令', () => {
    expect(validateInputMsg({ action: 'click', x: 100.4, y: 50.6, button: 'right' })).toMatchObject({
      ok: true,
      agentOp: { op: 'click', x: 100, y: 51, button: 'right', double: false },
    });
    expect(validateInputMsg({ action: 'move', x: 1, y: 2 })).toMatchObject({ ok: true, agentOp: { op: 'move', x: 1, y: 2 } });
    expect(validateInputMsg({ action: 'down', x: 1, y: 2 })).toMatchObject({ ok: true, agentOp: { op: 'down' } });
    expect(validateInputMsg({ action: 'up', x: 1, y: 2 })).toMatchObject({ ok: true, agentOp: { op: 'up' } });
  });

  it('wheel 夹取 delta 范围', () => {
    expect(validateInputMsg({ action: 'wheel', x: 0, y: 0, delta: 99999 })).toMatchObject({
      ok: true,
      agentOp: { op: 'wheel', delta: 2000 },
    });
  });

  it('危险组合键黑名单：alt+f4 拒绝（与 computer-use 共用一份黑名单）', () => {
    expect(DENIED_KEY_COMBOS.has('alt+f4')).toBe(true);
    const r = validateInputMsg({ action: 'key', keys: ['alt', 'f4'] });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('黑名单');
  });

  it('Win 键组合拒绝', () => {
    expect(validateInputMsg({ action: 'key', keys: ['win', 'r'] }).ok).toBe(false);
  });

  it('普通组合键放行', () => {
    expect(validateInputMsg({ action: 'key', keys: ['ctrl', 'c'] })).toMatchObject({
      ok: true,
      agentOp: { op: 'key', keys: ['ctrl', 'c'] },
    });
  });

  it('type 长度限制', () => {
    expect(validateInputMsg({ action: 'type', text: '你好' })).toMatchObject({ ok: true, agentOp: { op: 'type', text: '你好' } });
    expect(validateInputMsg({ action: 'type', text: 'a'.repeat(4001) }).ok).toBe(false);
  });

  it('未知 action / 非法坐标拒绝', () => {
    expect(validateInputMsg({ action: 'format', x: 0, y: 0 }).ok).toBe(false);
    expect(validateInputMsg({ action: 'click', x: 'NaN?', y: 0 }).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 文件名清洗（远控文件收发的防穿越守门）
// ---------------------------------------------------------------------------
describe('sanitizeRemoteFileName', () => {
  it('取 basename，路径分隔符与穿越尝试全部剥掉', () => {
    expect(sanitizeRemoteFileName('report.docx')).toBe('report.docx');
    expect(sanitizeRemoteFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeRemoteFileName('C:\\Windows\\evil.exe')).toBe('evil.exe');
    expect(sanitizeRemoteFileName('a/b/c.txt')).toBe('c.txt');
  });
  it('非法字符替换为下划线', () => {
    expect(sanitizeRemoteFileName('a<b>:c?.txt')).toBe('a_b__c_.txt');
  });
  it('空/纯点回退为时间戳名，Windows 保留名加前缀', () => {
    expect(sanitizeRemoteFileName('')).toMatch(/^file-\d+$/);
    expect(sanitizeRemoteFileName('..')).toMatch(/^file-\d+$/);
    expect(sanitizeRemoteFileName('CON')).toMatch(/^_CON$/i);
    expect(sanitizeRemoteFileName('com1.txt')).toMatch(/^_com1\.txt$/i);
  });
  it('超长名截断但保留扩展名尾部', () => {
    const long = `${'a'.repeat(200)}.txt`;
    expect(sanitizeRemoteFileName(long).length).toBeLessThanOrEqual(120);
  });
});

// ---------------------------------------------------------------------------
// 代理进程流解析（B 帧 + T 事件混排）
// ---------------------------------------------------------------------------
describe('createAgentStreamParser', () => {
  const enc = (s: string): Buffer => Buffer.from(s, 'utf8');
  const frame = (payload: Buffer): Buffer => Buffer.concat([enc(`B${payload.length}\n`), payload]);

  it('解析文本事件', () => {
    const p = createAgentStreamParser();
    const { events, frames } = p.push(enc('T{"i":1,"ok":true}\n'));
    expect(events).toEqual([{ i: 1, ok: true }]);
    expect(frames).toEqual([]);
  });

  it('二进制帧内含 \\n 与 "T"/"B" 字节不误切', () => {
    const p = createAgentStreamParser();
    const payload = Buffer.from([0x54, 0x0a, 0x42, 0xff, 0x0a]); // "T\nB\xff\n" 当作帧体
    const { events, frames } = p.push(frame(payload));
    expect(frames).toHaveLength(1);
    expect(frames[0].equals(payload)).toBe(true);
    expect(events).toEqual([]);
  });

  it('帧跨 chunk 到达时按长度重组', () => {
    const p = createAgentStreamParser();
    const payload = Buffer.from([1, 2, 3, 4, 5]);
    const whole = frame(payload);
    const a = p.push(whole.slice(0, 4));
    expect(a.frames).toHaveLength(0);
    const b = p.push(whole.slice(4));
    expect(b.frames).toHaveLength(1);
    expect(b.frames[0].equals(payload)).toBe(true);
  });

  it('事件与帧混排 + 坏头跳过不阻塞', () => {
    const p = createAgentStreamParser();
    const junk = enc('GARBAGE\n');
    const evt = enc('T{"i":2,"ok":false,"error":"x"}\n');
    const { events, frames } = p.push(Buffer.concat([junk, frame(Buffer.from([9])), evt]));
    expect(frames).toHaveLength(1);
    expect(events).toEqual([{ i: 2, ok: false, error: 'x' }]);
  });
});

// ---------------------------------------------------------------------------
// 多显示器选择（采集源）
// ---------------------------------------------------------------------------
describe('display select', () => {
  it('display.select 校验：合法 id 通过（Electron 数字 id / virtual / 设备形 id）', () => {
    expect(validateDisplaySelect({ displayId: '123456789' })).toEqual({ ok: true, displayId: '123456789' });
    expect(validateDisplaySelect({ displayId: 'virtual' })).toEqual({ ok: true, displayId: 'virtual' });
    expect(validateDisplaySelect({ displayId: ' dev-1.2-3 ' })).toEqual({ ok: true, displayId: 'dev-1.2-3' });
  });

  it('display.select 校验：缺失/超长/特殊字符拒绝', () => {
    expect(validateDisplaySelect({}).ok).toBe(false);
    expect(validateDisplaySelect({ displayId: '' }).ok).toBe(false);
    expect(validateDisplaySelect({ displayId: 'x'.repeat(65) }).ok).toBe(false);
    expect(validateDisplaySelect({ displayId: '../../etc' }).ok).toBe(false);
    expect(validateDisplaySelect({ displayId: 'a b' }).ok).toBe(false);
    expect(validateDisplaySelect({ displayId: 'a\nb' }).ok).toBe(false);
  });

  it('JPEG 显示器清单：代理条目映射 + 末尾补「整个桌面」+ 当前项还原', () => {
    const { list, current } = assembleJpegDisplays(
      [
        { id: '0', label: '显示器 1', primary: true, x: 0, y: 0, w: 2560, h: 1440 },
        { id: '1', label: '显示器 2', primary: false, x: -1920, y: 0, w: 1920, h: 1080 },
      ],
      { id: 'virtual', label: '整个桌面', x: -1920, y: 0, w: 4480, h: 1440 },
      1,
    );
    expect(list.map((d) => d.id)).toEqual(['0', '1', 'virtual']);
    expect(list[1]).toMatchObject({ x: -1920, w: 1920, primary: false });
    expect(list[2]).toMatchObject({ id: 'virtual', label: '整个桌面', w: 4480 });
    expect(current).toBe('1');
  });

  it('JPEG 显示器清单：当前为整个桌面时 current=virtual；坏条目（无宽高）被丢弃', () => {
    const { list, current } = assembleJpegDisplays(
      [{ id: '0', w: 0, h: 0 }, { id: '1', w: 100, h: 50 }],
      { w: 100, h: 50 },
      -1,
    );
    expect(list.map((d) => d.id)).toEqual(['1', 'virtual']);
    expect(current).toBe('virtual');
  });

  it('JPEG 显示器清单：代理枚举不可用（空输入）时列表为空但不抛错', () => {
    const { list, current } = assembleJpegDisplays(null, null, -1);
    expect(list).toEqual([]);
    expect(current).toBe('virtual');
  });
});

// ---------------------------------------------------------------------------
// 跨公网 ICE 配置（STUN 打洞 + 可选 TURN 中继）
// ---------------------------------------------------------------------------
describe('buildIceServers', () => {
  it('STUN 逗号/空白分隔解析为单条目数组；局域网无配置时为空（纯直连）', () => {
    const r = buildIceServers({ stunUrls: 'stun:stun.qq.com:3478, stun:stun.l.google.com:19302' });
    expect(r.iceServers).toEqual([{ urls: ['stun:stun.qq.com:3478', 'stun:stun.l.google.com:19302'] }]);
    expect(r.hasRelay).toBe(false);
    expect(buildIceServers({}).iceServers).toEqual([]);
  });

  it('TURN 三件套齐全才启用中继；缺用户名/凭证整体丢弃（缺凭证的 turn 只会让 ICE 空转）', () => {
    const ok = buildIceServers({ turnUrl: 'turn:relay.example.com:3478', turnUsername: 'u1', turnCredential: 'p1' });
    expect(ok.hasRelay).toBe(true);
    expect(ok.iceServers).toEqual([{ urls: ['turn:relay.example.com:3478'], username: 'u1', credential: 'p1' }]);
    expect(buildIceServers({ turnUrl: 'turn:r.example.com', turnUsername: '', turnCredential: 'p' }).hasRelay).toBe(false);
    expect(buildIceServers({ turnUrl: 'turn:r.example.com', turnUsername: 'u', turnCredential: '' }).iceServers).toEqual([]);
  });

  it('非法 URL（错误协议/坏字符）丢弃，不塞给 ICE；stun/turn 条数封顶', () => {
    const r = buildIceServers({
      stunUrls: 'http://evil.com, stun:ok.example.com, javascript:alert(1), stun:ok2.example.com',
      turnUrl: 'turns://secure.example.com:5349?transport=tcp, turn:also.example.com, turn:third.example.com',
      turnUsername: 'u',
      turnCredential: 'p',
    });
    expect(r.iceServers[0].urls).toEqual(['stun:ok.example.com', 'stun:ok2.example.com']);
    expect(r.iceServers[1].urls).toEqual(['turns://secure.example.com:5349?transport=tcp', 'turn:also.example.com']);
    expect(r.hasRelay).toBe(true);
    const many = buildIceServers({ stunUrls: ['stun:a.com', 'stun:b.com', 'stun:c.com', 'stun:d.com', 'stun:e.com'].join(',') });
    expect(many.iceServers[0].urls).toHaveLength(4);
  });
});
