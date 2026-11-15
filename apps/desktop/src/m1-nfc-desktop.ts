/**
 * 桌面端 M1 NFC 驱动注册（Electron）
 *
 * ★ 桌面机器没有内置 NFC 射频：真机能力 = 外接读卡器。
 *   主进程接入 PC/SC 读卡器（ACR122U / PN532，走 CCID APDU）或 Proxmark3 解码器后，
 *   由 preload 通过 `electronAPI.m1Nfc` 暴露同一组端口（capability/startSession/
 *   readCard/authenticate/readBlock/writeBlock），这里只做透传注册。
 *
 * ★ 没接硬件时保持「无驱动」：能力探测明确返回不可用与原因，
 *   课程实验台自动降级到教学模拟器 —— 绝不伪造「读卡成功」。
 *   ★ 有意不引入 node-pcsc / serialport 硬依赖：原生模块会让三份
 *     electron-builder yml 与 electron-rebuild 全部变脆，等读卡器联调时再挂。
 */
import { m1RegisterNfcDriver, type M1NfcDriver } from '@yan-zhi/shared';

type DesktopM1NfcBridge = {
  capability(): Promise<{ available: boolean; reason?: string }>;
  startSession(): Promise<void>;
  stopSession(): Promise<void>;
  readCard(): Promise<{ uid: string; bcc?: string; sak?: string; atqa?: string; sectorCount: number; reason?: string }>;
  authenticate(args: { sector: number; key: string; slot: string }): Promise<{ ok: boolean }>;
  readBlock(args: { sector: number; block: number; key: string; slot: string }): Promise<{ ok: boolean; data?: string; reason?: string }>;
  writeBlock(args: { blockIndex: number; data: string; key: string; slot: string }): Promise<{ ok: boolean; reason?: string }>;
};

export function registerDesktopM1NfcDriver(): void {
  const bridge = (window as unknown as { electronAPI?: { m1Nfc?: DesktopM1NfcBridge } }).electronAPI?.m1Nfc;
  if (!bridge) {
    m1RegisterNfcDriver(null);
    return;
  }

  const driver: M1NfcDriver = {
    id: 'desktop-reader',

    capability: async () => {
      const raw = await bridge.capability();
      return {
        available: raw.available === true,
        driverId: 'desktop-reader',
        reason: raw.available ? '' : (raw.reason || '未连接读卡器'),
      };
    },

    startSession: async () => { await bridge.startSession(); },
    stopSession: async () => { await bridge.stopSession(); },

    readCard: async () => {
      const raw = await bridge.readCard();
      if (raw.sectorCount <= 0) {
        throw new Error(raw.reason || '读卡器未返回卡片信息');
      }
      return {
        uid: String(raw.uid || '').toUpperCase(),
        bcc: String(raw.bcc || '').toUpperCase(),
        sak: String(raw.sak || '').toUpperCase(),
        atqa: String(raw.atqa || '').toUpperCase(),
        sectorCount: raw.sectorCount,
      };
    },

    authenticate: async (sector, key, slot) => {
      try {
        return (await bridge.authenticate({ sector, key, slot })).ok === true;
      } catch {
        return false;
      }
    },

    readBlock: async (sector, block, key, slot) => {
      try {
        const r = await bridge.readBlock({ sector, block, key, slot });
        return r.ok && r.data ? r.data.toUpperCase() : null;
      } catch {
        return null;
      }
    },

    writeBlock: async (blockIndex, data, key, slot) => {
      try {
        return await bridge.writeBlock({ blockIndex, data, key, slot });
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : '写入失败' };
      }
    },
  };

  m1RegisterNfcDriver(driver);
}
