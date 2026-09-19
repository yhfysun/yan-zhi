#!/usr/bin/env node
/**
 * 版本档落地脚本（打包前置步骤）。
 *
 * 把「这个包是什么档」写成 `apps/desktop/edition.json`，供两条链路读取：
 *   1. `main.cjs` 拉起后端时注入 env（YZ_EDITION / YZ_DEFAULT_EDITION）→ 后端据此
 *      算 allowedModes，前端只消费接口返回的 modes；
 *   2. `electron-builder` 读同一份文件决定产物名后缀。
 *
 * 为什么不直接把 env 写进 yml：electron-builder 的 `env` 段只影响构建进程，不影响
 * **运行时** Electron 主进程拉起的后端 —— 后者由 main.cjs 自己 spawn，必须显式传。
 *
 * 用法：
 *   node scripts/set-edition.cjs lite
 *   node scripts/set-edition.cjs basic
 *   node scripts/set-edition.cjs pro
 */
const fs = require('fs');
const path = require('path');

const EDITIONS = ['lite', 'basic', 'pro'];

/** 各档默认携带的**预置授权码档位**。
 *
 *  ★ 注意与构建档不是同一个值：用户拍板「高级版全量包默认携带基础版授权码」，
 *    所以 pro 构建档带 basic 码 —— 开箱三模式，要用全量需换 pro 码。 */
const DEFAULT_EDITION = {
  lite: 'lite',
  basic: 'basic',
  pro: 'basic',
};

const LABEL = {
  lite: '阉割版',
  basic: '基础版',
  pro: '高级版',
};

const edition = process.argv[2];
if (!EDITIONS.includes(edition)) {
  console.error(`[set-edition] 用法: node scripts/set-edition.cjs <${EDITIONS.join('|')}>`);
  console.error(`[set-edition] 收到: ${edition === undefined ? '(空)' : edition}`);
  process.exit(1);
}

const outPath = path.join(__dirname, '..', 'edition.json');
const payload = {
  edition,
  /** 预置授权码档位（可被 YZ_DEFAULT_LICENSE 整码覆盖，见 apps/server/src/license.ts）。 */
  defaultEdition: DEFAULT_EDITION[edition],
  label: LABEL[edition],
  /** 产物名后缀，与 electron-builder.full.yml 的 artifactName 对应。 */
  artifactSuffix: `-${edition}`,
};

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');

const MODES = {
  lite: '仅办公模式',
  basic: '办公 + 工作流 + 开发',
  pro: '全部模式（办公/工作流/开发/运维/安全）',
};

console.log(`[set-edition] 已写入 ${path.relative(process.cwd(), outPath)}`);
console.log(`[set-edition] 构建档: ${edition}（${LABEL[edition]}）→ ${MODES[edition]}`);
console.log(`[set-edition] 预置码档: ${DEFAULT_EDITION[edition]}`);
console.log(`[set-edition] 产物后缀: -${edition}`);