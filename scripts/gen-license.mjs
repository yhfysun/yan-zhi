#!/usr/bin/env node
/**
 * 授权码生成脚本（本地专用，不进应用构建）
 *
 * 用法：
 *   node scripts/gen-license.mjs --expire 2025-12-31
 *   node scripts/gen-license.mjs --days 30
 *   node scripts/gen-license.mjs --days 365 --machine-id 8F3A1C9D2E5B7046
 *   node scripts/gen-license.mjs --forever
 *   node scripts/gen-license.mjs --machine-id 8F3A1C9D2E5B7046
 *
 * 参数：
 *   --expire YYYY-MM-DD   授权到期日（含当天，到当天 23:59:59 失效）
 *   --days N              从今天起 N 天有效
 *   --forever             永不过期（expireAt 设为 null）
 *   --machine-id XXXXXXXX  绑定机器标识（16 位十六进制，授权页「机器标识」直接复制）。
 *                          推荐用它替代 --mac：换网卡/插 USB 网卡都不会失效。
 *   --mac XX:XX:XX:XX:XX:XX  绑定指定 MAC（仅用于给老客户端发码；不填则所有机器可用）
 *
 * 私钥位置：scripts/license-private-key.pem（不进 git）
 * 公钥位置：apps/server/src/license-public-key.pem（嵌后端，进 git）
 *
 * 授权码格式：base64url(payloadJson) + "." + base64url(sha256签名)
 * payload.machineId 优先于 payload.mac：新码用机器标识，老码（只有 mac）继续有效。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRIVATE_KEY_PATH = path.join(__dirname, 'license-private-key.pem');

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function parseArgs(argv) {
  const args = { expire: null, days: null, forever: false, mac: null, machineId: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--expire') args.expire = argv[++i];
    else if (a === '--days') args.days = Number(argv[++i]);
    else if (a === '--forever') args.forever = true;
    else if (a === '--mac') args.mac = argv[++i];
    else if (a === '--machine-id') args.machineId = argv[++i];
  }
  return args;
}

function computeExpireAt(args) {
  if (args.forever) return null;
  if (args.expire) {
    const d = new Date(args.expire + 'T23:59:59');
    if (isNaN(d.getTime())) throw new Error(`无效的日期: ${args.expire}，格式应为 YYYY-MM-DD`);
    return d.toISOString();
  }
  if (args.days) {
    const d = new Date();
    d.setDate(d.getDate() + args.days);
    d.setHours(23, 59, 59, 0);
    return d.toISOString();
  }
  throw new Error('请指定授权时长：--expire YYYY-MM-DD / --days N / --forever');
}

function main() {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error('未找到私钥文件: ' + PRIVATE_KEY_PATH);
    console.error('请先运行: node -e "const c=require(\'crypto\');const {publicKey,privateKey}=c.generateKeyPairSync(\'rsa\',{modulusLength:2048,publicKeyEncoding:{type:\'spki\',format:\'pem\'},privateKeyEncoding:{type:\'pkcs8\',format:\'pem\'}});require(\'fs\').writeFileSync(\'scripts/license-private-key.pem\',privateKey);require(\'fs\').writeFileSync(\'apps/server/src/license-public-key.pem\',publicKey);"');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const expireAt = computeExpireAt(args);
  const mac = args.mac ? args.mac.toUpperCase() : null;
  const machineId = args.machineId ? args.machineId.trim().toUpperCase() : null;

  if (mac && !/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) {
    console.error('MAC 地址格式应为 XX:XX:XX:XX:XX:XX');
    process.exit(1);
  }
  if (machineId && !/^[0-9A-F]{16}$/.test(machineId)) {
    console.error('机器标识格式应为 16 位十六进制（如 8F3A1C9D2E5B7046），可直接从授权页复制');
    process.exit(1);
  }
  if (mac && machineId) {
    console.error('--mac 与 --machine-id 只能二选一：machineId 优先，同时给会让人误以为两个都生效');
    process.exit(1);
  }

  const payload = JSON.stringify({ expireAt, mac, machineId });
  const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  const sign = crypto.createSign('sha256');
  sign.update(payload);
  sign.end();
  const signature = sign.sign(privateKey);

  const code = base64url(Buffer.from(payload, 'utf8')) + '.' + base64url(signature);

  console.log('================ 授权码 ================');
  console.log(code);
  console.log('========================================');
  console.log('过期时间: ' + (expireAt ? new Date(expireAt).toLocaleString('zh-CN') : '永不过期'));
  console.log('绑定机器: ' + (machineId || mac || '不限制（所有机器可用）'));
  if (machineId) console.log('绑定方式: 机器标识（抗网卡变动）');
  else if (mac) console.log('绑定方式: 网卡 MAC（老口径，换网卡会失效）');
}

main();