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

/* ============================ 卡包写卡（m1WriteSavedCard） ============================ */

import {
  m1ReadCardDump,
  m1ReadDump,
  m1RecoverSectorKeys,
  m1WriteSavedCard,
} from './index';

/** 从教学卡读出一份完整 dump（密钥恢复 + 读块全走内核，与试验台同口径） */
async function dumpOf(card: M1CardImage, blindSectors: number[] = []) {
  const recovery = await m1RecoverSectorKeys(card, { keybook: KEYBOOK }, async (sector, key, slot) => {
    if (blindSectors.includes(sector)) return false;
    return Boolean(await m1AuthenticatorFromImage(card)(sector, key, slot));
  });
  return m1ReadDump(card, recovery, async (sector, block, key, slot) => {
    const ok = await m1AuthenticatorFromImage(card)(sector, key, slot);
    if (!ok) throw new Error(`扇区 ${sector} 读取失败`);
    return card.sectors[sector].blocks[block];
  });
}

/** 目标卡假驱动：readCard 返回目标卡元数据，writeBlock 写进内存 */
function fakeTargetDriver(targetUid: string) {
  const state = { started: 0, stopped: 0, writes: [] as number[] };
  const driver: M1NfcDriver = {
    id: 'fake-target',
    capability: async () => ({ available: true, driverId: 'fake-target', reason: '' }),
    startSession: async () => { state.started += 1; },
    stopSession: async () => { state.stopped += 1; },
    readCard: async () => ({ uid: targetUid, bcc: '', sak: '08', atqa: '0004', sectorCount: 16 }),
    authenticate: async () => true,
    readBlock: async () => null,
    writeBlock: async (index) => { state.writes.push(index); return { ok: true }; },
  };
  return { driver, state };
}

describe('卡包写卡编排', () => {
  it('保存的完整 dump 可直接写入贴上的目标卡（无换卡步骤），结论走 m1CopyReason', async () => {
    const card = m1MakeTeachingCard('weak');
    const dump = await dumpOf(card);
    const { driver, state } = fakeTargetDriver('11223344');
    const result = await m1WriteSavedCard({ driver, dump });
    expect(result.ok).toBe(true);
    expect(result.reason).toContain('复制完成');
    expect(state.writes.length).toBe(64);
    expect(state.started).toBe(1);
    expect(state.stopped).toBe(1);
  });

  it('★ 贴上来的卡与保存卡 UID 相同 = 源卡自己，必须拒写（防把源卡写回自身）', async () => {
    const card = m1MakeTeachingCard('weak');
    const dump = await dumpOf(card);
    const { driver, state } = fakeTargetDriver(card.uid);
    await expect(m1WriteSavedCard({ driver, dump })).rejects.toThrow('源卡');
    expect(state.writes.length).toBe(0);
    expect(state.stopped).toBe(1);
  });

  it('dump 有未恢复扇区时结论如实报「dump 不完整」，且缺块不写', async () => {
    const card = m1MakeTeachingCard('default');
    const dump = await dumpOf(card, [7, 8]);
    const { driver, state } = fakeTargetDriver('11223344');
    const result = await m1WriteSavedCard({ driver, dump });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('dump 不完整');
    expect(result.recovery.unreadableSectors).toEqual([7, 8]);
    // 缺块扇区（28-35 块）绝不允许写入半成品
    expect(state.writes.every((index) => index < 28 || index > 35)).toBe(true);
  });
});

describe('卡包读卡编排（m1ReadCardDump）', () => {
  it('★ 只读不写：贴卡 → 自动解密 → 整卡 dump，会话正常释放', async () => {
    const card = m1MakeTeachingCard('weak');
    const { driver, state } = fakeDriver(card);
    const { recovery, dump } = await m1ReadCardDump({ driver });
    expect(recovery.recovered).toBe(16);
    expect(recovery.unreadableSectors).toEqual([]);
    expect(dump.blocks.every((b) => b !== null)).toBe(true);
    expect(state.started).toBe(1);
    expect(state.stopped).toBe(1);
  });

  it('★ 解密失败的扇区如实上报，补密钥重试后能全部解出（卡包「解密失败才要用户介入」）', async () => {
    // 7/8 扇区改成密码本外的自定义密钥：默认密码本解不出 → 用户补密钥后整卡重读成功
    const card = m1MakeTeachingCard('default');
    const customKey = '001122334455';
    for (const sector of [7, 8]) {
      card.sectors[sector].keyA = customKey;
      card.sectors[sector].keyB = customKey;
    }
    const { driver } = fakeDriver(card);
    const first = await m1ReadCardDump({ driver });
    expect(first.recovery.unreadableSectors).toEqual([7, 8]);
    // 用户补上 7/8 扇区的真实密钥后重试（整卡重读，自定义密钥进密码本）
    const second = await m1ReadCardDump({ driver, keybook: { useBuiltin: true, customKeys: [customKey] } });
    expect(second.recovery.unreadableSectors).toEqual([]);
    expect(second.recovery.recovered).toBe(16);
  });
});
