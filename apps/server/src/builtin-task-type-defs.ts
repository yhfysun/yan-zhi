// 内置任务类型定义（纯数据模块，**不 import db**）。
//
// ★ 与 builtin-scene-defs.ts 的关键差异：**这里不复制一份，直接 re-export shared 的 TASK_TYPES**。
//   场景那套是「前端 scenes.ts ↔ 后端 builtin-scene-defs.ts」两份手写数据（靠测试守键集合一致），
//   任务类型不重蹈覆辙 —— shared 的 TASK_TYPES 既是前端首屏兜底，又是后端种子来源，
//   单一数据源，改一处两边同时生效，不存在漂移。
//
// 为什么单独一个文件（与 builtin-office-agents.ts / builtin-scene-defs.ts 同一理由）：
//   db.ts 一旦被 import 就会打开 SQLite 并跑全套 seed；把定义抽成纯常量后，
//   路由层与测试可以直接 import 本模块拿到内置 key 集合，不必碰数据库。
export { TASK_TYPES as builtinTaskTypeDefs } from '@yan-zhi/shared';
// 库行 ⇄ 规格对象的映射同样只有一处（shared 里），后端注入与前端渲染共用，避免列名漂移
export { taskTypeToRow, taskTypeFromRow } from '@yan-zhi/shared';
