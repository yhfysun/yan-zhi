/**
 * 真机驱动层单测：用假驱动证明「真机与模拟器共用同一套判定」。
 * 覆盖：注册表、能力降级、完整复制、块 0 写入失败不伪造成功、
 *       密钥恢复失败如实报扇区、异常时仍释放会话。
 */
import { describe, expect, it } from 'vitest';
import {
  m1AuthenticatorFromImage,
  m1MakeTeachingCard,
  m1NfcCapability,
  m1NfcDriver,
  m1RegisterNfcDriver,
  m1RunRealCopy,
  type M1CardImage,
  type M1NfcDriver,
} from './index';

const KEYBOOK = { useBuiltin: true, customKeys: [] };

function fakeDriver(card: M1CardImage, options: { failBlock0?: boolean; blindSectors?: number[] } = {}) {
  const state = { started: 0, stopped: 0 };
  const driver: M1NfcDriver = {
    id: 'fake-reader',
    capability: async () => ({ available: true, driverId: 'fake-reader', reason: '' }),
    startSession: async () => { state.started += 1; },
    stopSession: async () => { state.stopped += 1; },
    readCard: async () => ({
      uid: card.uid,
      bcc: card.bcc,
      sak: card.sak,
      atqa: card.atqa,
      sectorCount: card.sectorCount,
    }),
    authenticate: async (sector, key, slot) => {
      if (options.blindSectors?.includes(sector)) return false;
      return Boolean(await m1AuthenticatorFromImage(card)(sector, key, slot));
    },
    readBlock: async (sector, block, key, slot) => {
      const ok = await m1AuthenticatorFromImage(card)(sector, key, slot);
      return ok ? card.sectors[sector].blocks[block] : null;
    },
    writeBlock: async (index) =>
      options.failBlock0 && index === 0 ? { ok: false, reason: '普通卡块 0 不可写' } : { ok: true },
  };
  return { driver, state };
}

describe('驱动注册表与能力降级', () => {
  it('未注册驱动时能力探测明确不可用，UI 应降级到模拟器', async () => {
    m1RegisterNfcDriver(null);
    expect(m1NfcDriver()).toBeNull();
    const cap = await m1NfcCapability();
    expect(cap.available).toBe(false);
    expect(cap.reason).toContain('课程模拟器');
  });

  it('注册后可取回驱动并读到其能力', async () => {
    const { driver } = fakeDriver(m1MakeTeachingCard('default'));
    m1RegisterNfcDriver(driver);
    expect(m1NfcDriver()?.id).toBe('fake-reader');
    expect((await m1NfcCapability()).available).toBe(true);
    m1RegisterNfcDriver(null);
  });
});

describe('真机复制编排', () => {
  it('简单加密卡经真机驱动也能完整复制（与模拟器口径一致）', async () => {
    const { driver, state } = fakeDriver(m1MakeTeachingCard('weak'));
    const result = await m1RunRealCopy({ driver, keybook: KEYBOOK, targetKind: 'uid-writable' });
    expect(result.ok).toBe(true);
    expect(result.reason).toContain('复制完成');
    expect(result.recovery.recovered).toBe(16);
    expect(state.started).toBe(1);
    expect(state.stopped).toBe(1);
  });

  it('★ 块 0 写入失败时不伪造成功，结论说明目标卡不支持改写卡号', async () => {
    const { driver } = fakeDriver(m1MakeTeachingCard('default'), { failBlock0: true });
    const result = await m1RunRealCopy({ driver, keybook: KEYBOOK, targetKind: 'uid-writable' });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('块 0 写入失败');
    expect(result.dump.blocks[0]).not.toBeNull();
    expect(result.verify.mismatches.some((item) => item.block === 0)).toBe(true);
  });

  it('密钥恢复不了某扇区时，dump 缺块且复制失败', async () => {
    const { driver, state } = fakeDriver(m1MakeTeachingCard('default'), { blindSectors: [7, 8] });
    const result = await m1RunRealCopy({ driver, keybook: KEYBOOK, targetKind: 'uid-writable' });
    expect(result.ok).toBe(false);
    expect(result.recovery.unreadableSectors).toEqual([7, 8]);
    expect(result.dump.blocks[7 * 4]).toBe(null);
    expect(state.stopped).toBe(1);
  });

  it('驱动抛异常时仍会释放会话，不留住 NFC 前台服务', async () => {
    const { driver, state } = fakeDriver(m1MakeTeachingCard('default'));
    const broken: M1NfcDriver = {
      ...driver,
      readCard: async () => { throw new Error('卡片中途离开'); },
    };
    await expect(m1RunRealCopy({ driver: broken, keybook: KEYBOOK, targetKind: 'uid-writable' }))
      .rejects.toThrow('卡片中途离开');
    expect(state.stopped).toBe(1);
  });

  it('★ 换卡回调必须在写入之前触发：不换卡绝不允许开始写块', async () => {
    const { driver } = fakeDriver(m1MakeTeachingCard('default'));
    let writes = 0;
    let swaps = 0;
    const counting: M1NfcDriver = {
      ...driver,
      writeBlock: async (index, data, key, slot) => {
        writes += 1;
        return driver.writeBlock(index, data, key, slot);
      },
      awaitTargetCard: async () => { swaps += 1; },
    };
    const result = await m1RunRealCopy({
      driver: counting,
      keybook: KEYBOOK,
      targetKind: 'uid-writable',
      onNeedTargetCard: async () => {
        expect(writes).toBe(0);
        await counting.awaitTargetCard?.();
      },
    });
    expect(swaps).toBe(1);
    expect(writes).toBe(64);
    expect(result.ok).toBe(true);
  });

  it('★ 换卡被中止时不写任何块，并释放 NFC 会话', async () => {
    const { driver, state } = fakeDriver(m1MakeTeachingCard('default'));
    let writes = 0;
    const counting: M1NfcDriver = {
      ...driver,
      writeBlock: async (index, data, key, slot) => {
        writes += 1;
        return driver.writeBlock(index, data, key, slot);
      },
    };
    await expect(m1RunRealCopy({
      driver: counting,
      keybook: KEYBOOK,
      targetKind: 'uid-writable',
      onNeedTargetCard: async () => { throw new Error('用户中止换卡'); },
    })).rejects.toThrow('用户中止换卡');
    expect(writes).toBe(0);
    expect(state.stopped).toBe(1);
  });
});
