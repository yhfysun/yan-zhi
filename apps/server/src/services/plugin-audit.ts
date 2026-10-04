// 插件审计（plugin_storage 的 'audit' key）写入唯一实现（P4 收敛，2026-10-04）。
//
// ★ 为什么要单点：此前 5 套各自实现（ops-shell cap 500 / computer-use 同文件两份
//   cap 100 / templates 逐字复制 computer-use / sec-lab 又一套）——读改写裁剪逻辑
//   改 cap 或改字段时必漏。条目形状由调用方决定（各插件事件语义不同），这里只收
//   「load → push → 裁剪 → save」这一段横切逻辑。
// ★ storage 形状：与插件 ctx.storage 一致（get/set 两方法）。

export interface PluginAuditStorage {
  get<T>(key: string): Promise<T | undefined | null>;
  set(key: string, value: unknown): Promise<void>;
}

/** 追加一条审计并按 cap 裁剪；storage 不可用（未初始化）静默跳过（审计不阻断业务） */
export async function pushPluginAudit<T extends object>(
  storage: PluginAuditStorage | null | undefined,
  entry: T,
  cap = 100,
): Promise<void> {
  if (!storage) return;
  const list = (await storage.get<unknown[]>('audit')) || [];
  list.push(entry);
  await storage.set('audit', list.slice(-cap));
}
