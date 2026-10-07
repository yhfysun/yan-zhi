// 短信验证码中继 · 纯函数 + 服务单测。
//
// 为什么值得测：
//   · extractVerificationCode 是**唯一**的验证码提取定义处（原生 Java 侧是同口径副本），
//     提取规则一旦漂移，会出现"明明收到短信却报验证码为空"这类静默失败；
//   · verifyPairToken 是上报接口的**唯一**鉴权闸门 —— 它若 fail-open（拿不到基准就放行），
//     同网任意设备都能往节点灌数据；
//   · TTL / 去重 / 最新一条的语义直接决定 UI 显示的是不是"当前有效的那条码"。
//
// ★ 手法：db 用临时目录 + 真实 sqlite 驱动（同 context-view-layering.test.ts），
//   让 record/list/getLatest/PairToken 走真表，确保实现改坏时测试真会红。

import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  const os = require('node:os') as typeof import('node:os');
  const path = require('node:path') as typeof import('node:path');
  const fs = require('node:fs') as typeof import('node:fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-vcode-'));
  process.env.DATA_DIR = dir;
  (globalThis as any).__YZ_VCODE_TMP__ = dir;
});

const {
  extractVerificationCode,
  recordVerificationCode,
  getLatestVerificationCode,
  listVerificationCodes,
  clearVerificationCodes,
  getOrCreatePairToken,
  resetPairToken,
  verifyPairToken,
} = await import('../src/services/verification-codes.js');
const { db } = await import('../src/db.js');

describe('extractVerificationCode · 验证码提取（关键词优先）', () => {
  it('中文「验证码是 NNNNNN」命中', () => {
    expect(extractVerificationCode('【某某】您的验证码是 123456，5分钟内有效')).toBe('123456');
  });

  it('中文全角冒号 + 短码命中', () => {
    expect(extractVerificationCode('验证码：9876')).toBe('9876');
  });

  it('英文 verification code 命中', () => {
    expect(extractVerificationCode('Your verification code: 9876')).toBe('9876');
  });

  it('英文 OTP 命中', () => {
    expect(extractVerificationCode('Your OTP is 556677')).toBe('556677');
  });

  it('无数字 → 空串（不硬凑）', () => {
    expect(extractVerificationCode('您的订单已发货')).toBe('');
  });

  it('空输入 → 空串', () => {
    expect(extractVerificationCode('')).toBe('');
  });
});

describe('extractVerificationCode · 兜底规则（不误提手机号）', () => {
  it('关键词缺失时取独立 4-8 位数字', () => {
    expect(extractVerificationCode('请使用 4321 完成登录')).toBe('4321');
  });

  it('★ 手机号（11 位）不得被当验证码', () => {
    expect(extractVerificationCode('联系电话 13800138000')).toBe('');
  });

  it('★ 关键词旁的手机号也不误提', () => {
    expect(extractVerificationCode('客服 13800138000 验证码见下条')).not.toBe('13800138000');
  });
});

describe('recordVerificationCode · 落库 / 去重 / TTL', () => {
  it('body 里能提出码时落库并读回', () => {
    const rec = recordVerificationCode({ userId: 'guest', body: '【测】验证码 482913，请勿泄露', sender: '10690' });
    expect(rec.code).toBe('482913');
    const latest = getLatestVerificationCode('guest');
    expect(latest?.code).toBe('482913');
    expect(latest!.remainingMs).toBeGreaterThan(0);
  });

  it('显式 code 优先于 body 提取', () => {
    const rec = recordVerificationCode({ userId: 'guest', code: '111222', body: '验证码 999888' });
    expect(rec.code).toBe('111222');
  });

  it('★ 同 user+code+body 在有效期内重复上报只留一条（防 ROM 重复广播）', () => {
    clearVerificationCodes('guest');
    recordVerificationCode({ userId: 'guest', body: '验证码 700001' });
    recordVerificationCode({ userId: 'guest', body: '验证码 700001' });
    const n = listVerificationCodes('guest', 50).filter((x) => x.code === '700001').length;
    expect(n).toBe(1);
  });

  it('既无 code 又提不出码 → 抛错（不落空记录）', () => {
    expect(() => recordVerificationCode({ userId: 'guest', body: '无数字文本' })).toThrow();
  });

  it('★ 过期条目不进 latest / list（TTL 由读取侧过滤）', () => {
    clearVerificationCodes('guest');
    // ttl 下限被夹到 10s，用极小 ttl 后手动改库把 expires_at 拨到过去，最直接
    const rec = recordVerificationCode({ userId: 'guest', body: '验证码 600001', ttlMs: 10000 });
    db.prepare('UPDATE verification_code SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, rec.id);
    expect(getLatestVerificationCode('guest')).toBeNull();
    expect(listVerificationCodes('guest', 50).some((x) => x.code === '600001')).toBe(false);
  });

  it('clear 清空当前用户全部记录', () => {
    recordVerificationCode({ userId: 'guest', body: '验证码 500001' });
    const removed = clearVerificationCodes('guest');
    expect(removed).toBeGreaterThan(0);
    expect(listVerificationCodes('guest', 50).length).toBe(0);
  });
});

describe('配对令牌 · 上报接口的唯一鉴权闸门', () => {
  it('默认生成非空令牌且稳定（重复取同值）', () => {
    const t1 = getOrCreatePairToken();
    const t2 = getOrCreatePairToken();
    expect(t1.length).toBeGreaterThanOrEqual(8);
    expect(t1).toBe(t2);
  });

  it('reset 后旧令牌立即失效、新令牌通过', () => {
    const old = getOrCreatePairToken();
    const next = resetPairToken();
    expect(next).not.toBe(old);
    expect(verifyPairToken(old)).toBe(false);
    expect(verifyPairToken(next)).toBe(true);
  });

  it('★ fail-closed：空 / 错 / 长度不符一律拒绝', () => {
    const t = getOrCreatePairToken();
    expect(verifyPairToken('')).toBe(false);
    expect(verifyPairToken(null)).toBe(false);
    expect(verifyPairToken(undefined)).toBe(false);
    expect(verifyPairToken(t + 'x')).toBe(false);
    expect(verifyPairToken(t.slice(0, -1))).toBe(false);
  });
});