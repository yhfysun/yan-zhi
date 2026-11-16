/**
 * M1 卡包 store —— 已复制卡片的本地资产化管理。
 *
 * ★ 隐私边界：只存 localStorage（本机 WebView 私有存储），不上传云端、不进后端数据库。
 *   保存的内容是读卡 dump（含扇区密钥），属于敏感数据 —— UI 上必须保留
 *   「自有或已授权卡」的一次性授权闸（persisted），删除操作即时生效。
 *
 * ★ 同 UID 覆盖：一张实体卡在卡包里只有一条记录（重复读同一张卡 = 更新）。
 */
import { defineStore } from 'pinia';
import type { M1Dump } from '@yan-zhi/shared';

export type M1WalletCard = {
  /** `${uid}-${savedAt}`，同 UID 覆盖后 id 会变 */
  id: string;
  name: string;
  uid: string;
  savedAt: number;
  /** real = 真机读卡；sim 预留（教学模拟 dump 不入库，见 M1NfcCopyLab 的保存按钮条件） */
  source: 'real' | 'sim';
  dump: M1Dump;
};

const LS_KEY = 'yz_m1_wallet_v1';
const LS_CONSENT_KEY = 'yz_m1_wallet_consent_v1';

/** id 序列号：同毫秒连存两张卡也不会撞 id */
let idSeq = 0;

function loadCards(): M1WalletCard[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const useM1WalletStore = defineStore('m1Wallet', {
  state: () => ({
    cards: loadCards() as M1WalletCard[],
  }),
  getters: {
    byId: (state) => (id: string) => state.cards.find((card) => card.id === id) || null,
  },
  actions: {
    persist() {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(this.cards));
      } catch {
        /* 存储满/不可写：静默失败，下次操作再试 */
      }
    },
    /** 保存 dump；同 UID 覆盖旧记录（一张实体卡一条）。返回这条记录。 */
    add(dump: M1Dump, opts: { name?: string; source?: M1WalletCard['source'] } = {}): M1WalletCard {
      const card: M1WalletCard = {
        id: `${dump.uid}-${Date.now()}-${(idSeq += 1).toString(36)}`,
        name: (opts.name || '').trim() || `门禁卡 ${dump.uid.slice(-4)}`,
        uid: dump.uid,
        savedAt: Date.now(),
        source: opts.source ?? 'real',
        // 深拷贝：卡包是资产快照，不能跟着试验台的可变引用漂移
        dump: JSON.parse(JSON.stringify(dump)) as M1Dump,
      };
      const existing = this.cards.findIndex((item) => item.uid === dump.uid);
      if (existing >= 0) this.cards.splice(existing, 1, card);
      else this.cards.unshift(card);
      this.persist();
      return card;
    },
    rename(id: string, name: string) {
      const card = this.cards.find((item) => item.id === id);
      const trimmed = name.trim();
      if (card && trimmed) {
        card.name = trimmed;
        this.persist();
      }
    },
    remove(id: string) {
      this.cards = this.cards.filter((item) => item.id !== id);
      this.persist();
    },
  },
});

/** 首次写卡前的「自有或已授权卡」授权：确认一次后持久化，之后写卡不再弹。 */
export function isWalletConsentAccepted(): boolean {
  try {
    return localStorage.getItem(LS_CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

export function acceptWalletConsent(): void {
  try {
    localStorage.setItem(LS_CONSENT_KEY, '1');
  } catch {
    /* 忽略 */
  }
}
