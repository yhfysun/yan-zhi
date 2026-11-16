/**
 * M1 NFC 真机驱动注册表与真机复制编排
 *
 * ★ 为什么要有这一层：课程模拟器跑在浏览器 WebView，真机能力在 Android 原生插件 /
 *   桌面 USB 读卡器里。两边都要走**同一套内核判定**，所以各端启动时把驱动注册到这里，
 *   UI 与编排只依赖 M1NfcDriver 接口，不 import 任何平台专有代码。
 *
 * ★ 「写入失败不伪造成功」由内核 m1WriteDump 统一处理：writer 返回 false 即可。
 *   本文件不自己拼成功/失败文案，结论一律取 m1CopyReason。
 */
import {
  M1_BLOCKS_PER_SECTOR,
  m1CopyReason,
  m1MakeBlankTarget,
  m1PlanWrite,
  m1ReadDump,
  m1RecoverSectorKeys,
  m1VerifyCopy,
  m1WriteDump,
  type M1CopyResult,
  type M1Dump,
  type M1Keybook,
  type M1KeySlot,
  type M1RecoverResult,
  type M1SectorKeyResult,
  type M1TargetKind,
} from './core';

export type M1NfcCapability = {
  available: boolean;
  driverId: string;
  /** 不可用时的具体原因，UI 据此提示并降级到课程模拟器 */
  reason: string;
};

export type M1RealCardMeta = {
  uid: string;
  bcc: string;
  sak: string;
  atqa: string;
  sectorCount: number;
};

export type M1WriteOutcome = { ok: boolean; reason?: string };

/**
 * 真机驱动端口。所有方法都在本机执行，卡数据只经内存传给 WebView，
 * 不落盘、不上传；实现方不得缓存卡内容到持久化存储。
 */
export type M1NfcDriver = {
  id: string;
  capability(): Promise<M1NfcCapability>;
  startSession(): Promise<void>;
  stopSession(): Promise<void>;
  readCard(): Promise<M1RealCardMeta>;
  /**
   * 换目标卡：移开源卡、等待新的目标空白卡贴上并重连。
   * ★ 不实现该方法的驱动只用于模拟器/单卡调试；真机驱动必须实现，
   *   否则写入会落在源卡自己身上。
   */
  awaitTargetCard?(): Promise<void>;
  authenticate(sector: number, key: string, slot: M1KeySlot): Promise<boolean>;
  readBlock(sector: number, block: number, key: string, slot: M1KeySlot): Promise<string | null>;
  writeBlock(
    blockIndex: number,
    data: string,
    key: string,
    slot: M1KeySlot,
  ): Promise<M1WriteOutcome>;
};

let registered: M1NfcDriver | null = null;

/** 各端 platform.ts 启动时调用；传 null 可注销（例如卸载插件）。 */
export function m1RegisterNfcDriver(driver: M1NfcDriver | null): void {
  registered = driver;
}

export function m1NfcDriver(): M1NfcDriver | null {
  return registered;
}

/** 无驱动时的统一能力结果，供 UI 降级使用。 */
export async function m1NfcCapability(): Promise<M1NfcCapability> {
  if (!registered) {
    return { available: false, driverId: 'none', reason: '当前平台没有 NFC 读卡器驱动，请使用课程模拟器' };
  }
  try {
    return await registered.capability();
  } catch (error) {
    return {
      available: false,
      driverId: registered.id,
      reason: error instanceof Error ? error.message : '读卡器能力探测失败',
    };
  }
}

/**
 * 真机复制：与课程模拟器共用 m1RecoverSectorKeys / m1ReadDump / m1PlanWrite /
 * m1WriteDump / m1VerifyCopy / m1CopyReason，只是把三个端口换成读卡器实现。
 */
export async function m1RunRealCopy(params: {
  driver: M1NfcDriver;
  keybook: M1Keybook;
  targetKind: M1TargetKind;
  maxAttempts?: number;
  onAttempt?: (attempt: number, sector: number, key: string, slot: M1KeySlot) => boolean | void;
  /**
   * 读完整卡后、写入前必须换目标卡。回调里应提示用户移开源卡、
   * 贴上目标空白卡，并调用 driver.awaitTargetCard() 等待新 tag 重连。
   */
  onNeedTargetCard?: () => Promise<void>;
}): Promise<M1CopyResult> {
  const { driver, keybook, targetKind } = params;
  await driver.startSession();
  try {
    const meta = await driver.readCard();

    const recovery = await m1RecoverSectorKeys(
      { sectorCount: meta.sectorCount },
      {
        keybook,
        maxAttempts: params.maxAttempts,
        onAttempt: params.onAttempt,
      },
      (sector, key, slot) => driver.authenticate(sector, key, slot),
    );

    const dump = await m1ReadDump(meta, recovery, async (sector, block, key, slot) => {
      const data = await driver.readBlock(sector, block, key, slot);
      if (!data) throw new Error(`扇区 ${sector} 块 ${block} 读取失败`);
      return data;
    });

    const plan = m1PlanWrite(dump, targetKind);
    // ★ 真机复制必须先换卡：源卡 dump 已在内存，接着要贴目标空白卡再写。
    //   不换卡会把源卡数据写回源卡本身（同一 tag），既无意义也可能破坏原卡。
    if (params.onNeedTargetCard) await params.onNeedTargetCard();
    const written = await m1WriteDump(dump, plan, async (index, data) => {
      const sector = Math.floor(index / M1_BLOCKS_PER_SECTOR);
      const hit = dump.keys[sector];
      if (!hit?.key || !hit.slot) return false;
      const outcome = await driver.writeBlock(index, data, hit.key, hit.slot);
      return outcome.ok;
    });

    const verify = m1VerifyCopy(dump, written);
    const reason = m1CopyReason(recovery, plan, verify);
    return {
      ok: verify.ok,
      reason,
      recovery,
      dump,
      plan,
      verify,
    };
  } finally {
    // 无论成功失败都释放连接，避免占住 NFC 前台服务
    await driver.stopSession().catch(() => undefined);
  }
}

/**
 * 卡包写卡：把保存的 dump 直接写入贴上的目标卡（M1CardWallet 简化链路）。
 *
 * ★ 与 m1RunRealCopy 的差别：没有「读源卡」步骤 —— 首个贴上来的 tag 就是目标卡，
 *   所以**不需要** onNeedTargetCard/awaitTargetCard 换卡编排。
 * ★ 防呆（high 风险）：贴上来的 tag UID 与 dump.uid 相同 = 用户把源卡又贴上来了，
 *   必须拒绝写入，否则会把源卡内容原样写回源卡自己身上。
 * ★ 结论仍走 m1CopyReason 唯一出口：用 dump.keys 合成 recovery（卡包写卡没有恢复过程）。
 */
export async function m1WriteSavedCard(params: {
  driver: M1NfcDriver;
  dump: M1Dump;
  targetKind?: M1TargetKind;
  onStage?: (stage: 'waiting-tag' | 'writing' | 'verifying') => void;
}): Promise<M1CopyResult> {
  const { driver, dump } = params;
  const targetKind = params.targetKind ?? 'uid-writable';
  await driver.startSession();
  try {
    params.onStage?.('waiting-tag');
    // readCard 挂起等贴卡并完成连接（含裸 NfcA 回退），复用真机同一条链路
    const meta = await driver.readCard();
    if (meta.uid.toUpperCase() === dump.uid.toUpperCase()) {
      throw new Error('贴上来的是源卡自己（UID 相同）。请移开源卡，贴目标空白卡');
    }
    params.onStage?.('writing');
    const plan = m1PlanWrite(dump, targetKind);
    const written = await m1WriteDump(dump, plan, async (index, data) => {
      const sector = Math.floor(index / M1_BLOCKS_PER_SECTOR);
      const hit = dump.keys[sector];
      if (!hit?.key || !hit.slot) return false;
      const outcome = await driver.writeBlock(index, data, hit.key, hit.slot);
      return outcome.ok;
    });
    params.onStage?.('verifying');
    const verify = m1VerifyCopy(dump, written);
    const recovery = m1RecoveryFromDump(dump);
    const reason = m1CopyReason(recovery, plan, verify);
    return { ok: verify.ok, reason, recovery, dump, plan, verify };
  } finally {
    await driver.stopSession().catch(() => undefined);
  }
}

/** 从保存的 dump 合成密钥恢复结果：密钥已在 dump.keys 里，无需真的跑恢复。 */
export function m1RecoveryFromDump(dump: M1Dump): M1RecoverResult {
  const sectors: M1SectorKeyResult[] = dump.keys.map((hit, index) => ({
    sector: index,
    key: hit.key,
    slot: hit.slot,
    attempts: 0,
    hitBy: null,
    hitLabel: null,
  }));
  const unreadableSectors = sectors
    .filter((item) => item.key === null)
    .map((item) => item.sector);
  return {
    sectors,
    totalAttempts: 0,
    capped: false,
    recovered: sectors.length - unreadableSectors.length,
    unreadableSectors,
  };
}

/**
 * 卡包读卡：贴卡 → 密钥恢复 → 整卡 dump，**只读不写**（M1CardWallet 内闭环用）。
 *
 * ★ 与 m1RunRealCopy 的差别：没有写入段，也不需要换目标卡 —— 读完直接落卡包。
 * ★ 密钥恢复/读块全走内核（m1RecoverSectorKeys / m1ReadDump），判定只有一份；
 *   默认密码本只用内置公开默认值，卡包场景没有自定义密码本输入。
 */
export async function m1ReadCardDump(params: {
  driver: M1NfcDriver;
  keybook?: M1Keybook;
  maxAttempts?: number;
  onAttempt?: (attempt: number, sector: number, key: string, slot: M1KeySlot) => boolean | void;
}): Promise<{ recovery: M1RecoverResult; dump: M1Dump }> {
  const { driver } = params;
  await driver.startSession();
  try {
    const meta = await driver.readCard();
    const recovery = await m1RecoverSectorKeys(
      { sectorCount: meta.sectorCount },
      {
        keybook: params.keybook ?? { useBuiltin: true, customKeys: [] },
        maxAttempts: params.maxAttempts,
        onAttempt: params.onAttempt,
      },
      (sector, key, slot) => driver.authenticate(sector, key, slot),
    );
    const dump = await m1ReadDump(meta, recovery, async (sector, block, key, slot) => {
      const data = await driver.readBlock(sector, block, key, slot);
      if (!data) throw new Error(`扇区 ${sector} 块 ${block} 读取失败`);
      return data;
    });
    return { recovery, dump };
  } finally {
    await driver.stopSession().catch(() => undefined);
  }
}

/** 目标卡初始镜像（教学展示用，不含真实卡号）。 */
export function m1BlankTargetOf(kind: M1TargetKind) {
  return m1MakeBlankTarget(kind);
}
