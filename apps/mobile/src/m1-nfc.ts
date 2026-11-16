/**
 * Android 真机 M1 NFC 驱动桥（Capacitor 本地插件 → shared 驱动注册表）
 *
 * ★ 平台降级：只有 Android 原生壳才注册驱动。iOS 的 Core NFC 不实现 Crypto1，
 *   浏览器/桌面 WebView 也没有 MIFARE Classic API —— 这些平台保持「无驱动」，
 *   UI 自动走课程模拟器，绝不假装能读真卡。
 *
 * ★ 机型降级：MifareClassic.get(tag) 为 null 时插件先走裸 NfcA 回退探测
 *   （认证/读/写指令直接透传，Crypto1 由芯片硬件执行），探测失败才返回
 *   mifareClassic=false；这里抛明确错误，由 UI 提示「该机型不支持」并退回模拟器。
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  M1_BLOCKS_PER_SECTOR,
  m1RegisterNfcDriver,
  type M1KeySlot,
  type M1NfcDriver,
  type M1RealCardMeta,
} from '@yan-zhi/shared';

type RawCapability = {
  nfcPresent: boolean;
  nfcEnabled: boolean;
  readerMode: boolean;
  mifareClassicKnown: boolean;
};

type RawCard = {
  uid: string;
  bcc?: string;
  sak?: string;
  atqa?: string;
  sectorCount?: number;
  blockCount?: number;
  mifareClassic: boolean;
  /** 裸 NfcA 回退模式：机型没暴露 MifareClassic tech 但芯片能跑 MIFARE 指令 */
  rawMode?: boolean;
  /** tag.getTechList()，机型兼容性排查用 */
  techList?: string;
  reason?: string;
};

type SectorArgs = { sector: number; key: string; slot: string };
type BlockArgs = SectorArgs & { block: number };
type WriteArgs = BlockArgs & { data: string };

type WaitArgs = { requireNew: string; timeoutMs: number };

interface M1NfcPluginBridge {
  getCapability(): Promise<RawCapability>;
  startSession(): Promise<{ active: boolean }>;
  stopSession(): Promise<{ active: boolean }>;
  /** 挂起等待贴卡；requireNew='true' 表示换目标卡，忽略当前 tag 等下一次发现 */
  waitForTag(args: WaitArgs): Promise<{ uid: string }>;
  readCard(): Promise<RawCard>;
  authenticateSector(args: SectorArgs): Promise<{ ok: boolean }>;
  readBlock(args: BlockArgs): Promise<{ ok: boolean; data?: string; reason?: string }>;
  writeBlock(args: WriteArgs): Promise<{ ok: boolean; reason?: string }>;
}

const M1Nfc = registerPlugin<M1NfcPluginBridge>('M1Nfc');

export function isAndroidM1NfcPlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function toMeta(raw: RawCard): M1RealCardMeta {
  if (!raw.mifareClassic) {
    throw new Error(raw.reason || '该机型不支持 MIFARE Classic，请使用课程模拟器');
  }
  return {
    uid: String(raw.uid || '').toUpperCase(),
    bcc: String(raw.bcc || '').toUpperCase(),
    sak: String(raw.sak || '').toUpperCase(),
    atqa: String(raw.atqa || '').toUpperCase(),
    sectorCount: raw.sectorCount || 16,
  };
}

/** 在移动端入口调用一次；非 Android 平台不注册驱动。 */
export function registerAndroidM1NfcDriver(): void {
  if (!isAndroidM1NfcPlatform()) return;

  const driver: M1NfcDriver = {
    id: 'android-nfc',

    capability: async () => {
      try {
        const raw = await M1Nfc.getCapability();
        if (!raw.nfcPresent) {
          return { available: false, driverId: 'android-nfc', reason: '该设备没有 NFC 硬件' };
        }
        if (!raw.nfcEnabled) {
          return { available: false, driverId: 'android-nfc', reason: '系统 NFC 开关未打开' };
        }
        return { available: true, driverId: 'android-nfc', reason: '' };
      } catch (error) {
        return {
          available: false,
          driverId: 'android-nfc',
          reason: error instanceof Error ? error.message : '读卡器能力探测失败',
        };
      }
    },

    startSession: async () => { await M1Nfc.startSession(); },
    stopSession: async () => { await M1Nfc.stopSession(); },

    readCard: async () => {
      // 点「开始」时卡还没贴上：插件把调用挂到 onTagDiscovered 再返回，
      // 不能立刻 readCard 吃 NO_TAG 让整个实验报错退出。
      await M1Nfc.waitForTag({ requireNew: 'false', timeoutMs: 60000 });
      return toMeta(await M1Nfc.readCard());
    },

    awaitTargetCard: async () => {
      // 源卡读完 → 移开 → 贴目标空白卡 → 插件重连新 tag
      await M1Nfc.waitForTag({ requireNew: 'true', timeoutMs: 60000 });
      const raw = await M1Nfc.readCard();
      if (!raw.mifareClassic) {
        throw new Error(raw.reason || '目标卡不支持 MIFARE Classic，复制已中止');
      }
    },

    authenticate: async (sector: number, key: string, slot: M1KeySlot) => {
      try {
        const result = await M1Nfc.authenticateSector({ sector, key, slot });
        return result.ok === true;
      } catch {
        // 认证失败不是异常：密码本要继续试下一个候选
        return false;
      }
    },

    readBlock: async (sector: number, block: number, key: string, slot: M1KeySlot) => {
      try {
        const result = await M1Nfc.readBlock({ sector, block, key, slot });
        return result.ok && result.data ? result.data.toUpperCase() : null;
      } catch {
        return null;
      }
    },

    writeBlock: async (blockIndex: number, data: string, key: string, slot: M1KeySlot) => {
      const sector = Math.floor(blockIndex / M1_BLOCKS_PER_SECTOR);
      const block = blockIndex % M1_BLOCKS_PER_SECTOR;
      try {
        return await M1Nfc.writeBlock({ sector, block, data, key, slot });
      } catch (error) {
        return {
          ok: false,
          reason: error instanceof Error ? error.message : '写入失败',
        };
      }
    },
  };

  m1RegisterNfcDriver(driver);
}

/** 供 UI 显示真机状态；不注册任何平台专有依赖。 */
export async function androidM1NfcStatus(): Promise<{ available: boolean; reason: string }> {
  if (!isAndroidM1NfcPlatform()) {
    return { available: false, reason: '当前平台不是 Android 原生壳' };
  }
  try {
    const raw = await M1Nfc.getCapability();
    return {
      available: raw.nfcPresent && raw.nfcEnabled,
      reason: !raw.nfcPresent ? '该设备没有 NFC 硬件' : raw.nfcEnabled ? '' : '系统 NFC 开关未打开',
    };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : '能力探测失败' };
  }
}
