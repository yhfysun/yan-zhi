// @yan-zhi/shared - 全局共享类型与工具
export * from './types/index';
export * from './utils/index';

// 内置模型价格参考表（纯数据，与厂商目录同层）
// ★ P0 必备：没有价格数据 ⇒ 费用恒 ¥0 ⇒ 阈值永不触发（见 model-pricing-presets.ts 文件头）
export * from './model-pricing-presets';

// 内置模型厂商目录（纯数据，与价格表同层；页面宫格与服务端 from-preset 共用）
export * from './model-providers';
