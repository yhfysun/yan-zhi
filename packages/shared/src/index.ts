// @yan-zhi/shared - 全局共享类型与工具
export * from './types/index';
export * from './utils/index';
export * from './execution';
export * from './page-assets/types';
export * from './page-assets/validate';
export * from './page-assets/builtins';
export * from './page-assets/runtime';
export * from './page-agent';
export * from './automation/types';
export * from './automation/validate';
export * from './learning/v2';
export * from './learning/v2-library';
export type * from './learning/v2-types';

// 内置模型价格参考表（纯数据，与厂商目录同层）
// ★ P0 必备：没有价格数据 ⇒ 费用恒 ¥0 ⇒ 阈值永不触发（见 model-pricing-presets.ts 文件头）
export * from './model-pricing-presets';

// 内置模型厂商目录（纯数据，与价格表同层；页面宫格与服务端 from-preset 共用）
export * from './model-providers';

// 周易测算纯函数库（纯函数、离线、seed 伪随机；断语只查白名单规则表）
export * from './zhouyi/index';

// M1 门禁卡 NFC 复制教学内核（模拟器与真机适配层共用同一份判定）
// ★ 导出名统一 m1/M1 前缀，避免与 utils/* 的同名导出经 export * 静默覆盖
export * from './m1-nfc/index';

// 记录中心：笔记/日记/账本/进货出货/时间与任务计划的模板和字典协议。
export * from './notes/index';

// 资讯中心：公开 RSS、应用内正文与证券行情共用同一套接口类型。
export * from './news/types';
