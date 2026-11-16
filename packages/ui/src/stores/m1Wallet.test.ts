// @vitest-environment jsdom
/**
 * M1 卡包 store 单测：本地持久化、同 UID 覆盖、改名/删除。
 * ★ 隐私边界钉死：数据只进 localStorage，绝无网络调用（本测试不 mock fetch，
 *   若实现误加网络请求，jsdom 下会直接报错变红）。
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  acceptWalletConsent,
  isWalletConsentAccepted,
  useM1WalletStore,
} from './m1Wallet';
import type { M1Dump } from '@yan-zhi/shared';

function fakeDump(uid: string): M1Dump {
  return {
    uid,
    bcc: '00',
    sak: '08',
    atqa: '0004',
    sectorCount: 16,
    blocks: Array.from({ length: 64 }, () => '00'.repeat(16)),
    keys: Array.from({ length: 16 }, () => ({ key: 'FFFFFFFFFFFF', slot: 'A' as const })),
  };
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('M1 卡包 store', () => {
  it('add 入库并写 localStorage，缺省命名为「门禁卡 + UID 尾 4 位」', () => {
    const store = useM1WalletStore();
    const card = store.add(fakeDump('08CE2194'));
    expect(store.cards).toHaveLength(1);
    expect(card.name).toBe('门禁卡 2194');
    expect(card.source).toBe('real');
    const raw = JSON.parse(localStorage.getItem('yz_m1_wallet_v1') || '[]');
    expect(raw).toHaveLength(1);
    expect(raw[0].uid).toBe('08CE2194');
  });

  it('★ 同 UID 覆盖：一张实体卡只有一条记录，dump 是深拷贝快照', () => {
    const store = useM1WalletStore();
    store.add(fakeDump('08CE2194'));
    const dumpObj = fakeDump('08CE2194');
    store.add(dumpObj, { name: '公司门禁' });
    expect(store.cards).toHaveLength(1);
    expect(store.cards[0].name).toBe('公司门禁');
    // 改外部 dump 引用不影响卡包快照
    dumpObj.uid = 'TAMPERED';
    expect(store.cards[0].dump.uid).toBe('08CE2194');
  });

  it('rename 与 remove 即时生效并持久化', () => {
    const store = useM1WalletStore();
    const card = store.add(fakeDump('08CE2194'));
    store.rename(card.id, '我家单元门');
    expect(store.cards[0].name).toBe('我家单元门');
    expect(JSON.parse(localStorage.getItem('yz_m1_wallet_v1') || '[]')[0].name).toBe('我家单元门');
    store.rename(card.id, '   ');
    expect(store.cards[0].name).toBe('我家单元门'); // 空白名不生效
    store.remove(card.id);
    expect(store.cards).toHaveLength(0);
    expect(localStorage.getItem('yz_m1_wallet_v1')).toBe('[]');
  });

  it('启动时从 localStorage 恢复已有卡包', () => {
    localStorage.setItem('yz_m1_wallet_v1', JSON.stringify([{
      id: '08CE2194-1', name: '旧记录', uid: '08CE2194', savedAt: 1, source: 'real', dump: fakeDump('08CE2194'),
    }]));
    setActivePinia(createPinia());
    const store = useM1WalletStore();
    expect(store.cards).toHaveLength(1);
    expect(store.cards[0].name).toBe('旧记录');
  });

  it('写卡授权闸：确认一次后持久化', () => {
    expect(isWalletConsentAccepted()).toBe(false);
    acceptWalletConsent();
    expect(isWalletConsentAccepted()).toBe(true);
  });
});
