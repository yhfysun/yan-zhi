#!/usr/bin/env node
'use strict';

/**
 * 网络安全教程用的本地文件上传靶场。
 *
 * 只监听 127.0.0.1，所有数据保存在内存中，进程退出即清空。
 * --insecure 故意保留越权读取、公开对象和宽松文件校验，仅用于教学复现。
 * --secure   按教程中的控制措施执行，用于对照验证修复效果。
 */

const crypto = require('node:crypto');
const http = require('node:http');
const { URL } = require('node:url');

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4317;
const MAX_BODY_BYTES = 1024 * 1024;
const SECURE_MAX_CONTENT_BYTES = 256 * 1024;
const ALLOWED_TYPES = new Map([
  ['.txt', 'text/plain'],
  ['.md', 'text/markdown'],
]);

function readFlag(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

const mode = process.argv.includes('--secure')
  ? 'secure'
  : process.argv.includes('--insecure')
    ? 'insecure'
    : '';

if (!mode) {
  console.error('用法: node apps/server/scripts/security-upload-lab.cjs --insecure|--secure [--port 4317]');
  process.exit(1);
}

const requestedPort = Number(readFlag('--port') || DEFAULT_PORT);
if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
  console.error('端口必须是 0-65535 之间的整数');
  process.exit(1);
}

const sessions = new Map();
const files = new Map();

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        const error = new Error('请求体过大');
        error.statusCode = 413;
        reject(error);
        return;
      }
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        const error = new Error('请求体必须是合法 JSON');
        error.statusCode = 400;
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function currentUser(req) {
  const header = String(req.headers.authorization || '');
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? sessions.get(match[1]) || '' : '';
}

function validateUpload(filename, contentType, content) {
  const lowerName = filename.toLowerCase();
  const dot = lowerName.lastIndexOf('.');
  const extension = dot >= 0 ? lowerName.slice(dot) : '';
  const expectedType = ALLOWED_TYPES.get(extension);

  if (!expectedType) return { status: 415, message: '只允许 .txt 和 .md 文件' };
  if (String(contentType).toLowerCase() !== expectedType) {
    return { status: 415, message: `扩展名 ${extension} 必须使用 ${expectedType}` };
  }
  if (Buffer.byteLength(content, 'utf8') > SECURE_MAX_CONTENT_BYTES) {
    return { status: 413, message: '文件内容超过 256 KB' };
  }
  if (/<\s*script\b|<[^>]+on\w+\s*=/i.test(content)) {
    return { status: 415, message: '检测到可执行 HTML 内容' };
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${HOST}`);
    const path = url.pathname;

    if (req.method === 'GET' && path === '/health') {
      sendJson(res, 200, {
        ok: true,
        mode,
        lab: 'security-upload',
        users: ['alice', 'bob'],
      });
      return;
    }

    if (req.method === 'POST' && path === '/login') {
      const body = await readJson(req);
      const user = String(body.user || '');
      if (user !== 'alice' && user !== 'bob') {
        sendJson(res, 400, { error: 'user 只能是 alice 或 bob' });
        return;
      }
      const token = crypto.randomBytes(18).toString('hex');
      sessions.set(token, user);
      sendJson(res, 200, { user, token });
      return;
    }

    if (req.method === 'POST' && path === '/upload') {
      const user = currentUser(req);
      if (!user) {
        sendJson(res, 401, { error: '缺少有效 Bearer token' });
        return;
      }

      const body = await readJson(req);
      const filename = String(body.filename || '');
      const contentType = String(body.contentType || '');
      const content = String(body.content || '');
      if (!filename || !contentType) {
        sendJson(res, 400, { error: 'filename 和 contentType 必填' });
        return;
      }

      if (mode === 'secure') {
        const invalid = validateUpload(filename, contentType, content);
        if (invalid) {
          sendJson(res, invalid.status, { error: invalid.message });
          return;
        }
      }

      const id = crypto.randomUUID();
      const item = {
        id,
        owner: user,
        filename,
        contentType,
        content,
        checksum: crypto.createHash('sha256').update(content).digest('hex'),
      };
      files.set(id, item);
      sendJson(res, 201, {
        ...item,
        publicUrl: mode === 'insecure' ? `/objects/${id}` : null,
      });
      return;
    }

    const publicMatch = /^\/objects\/([^/]+)$/.exec(path);
    if (req.method === 'GET' && publicMatch) {
      const item = files.get(publicMatch[1]);
      if (!item) {
        sendJson(res, 404, { error: '对象不存在' });
        return;
      }
      if (mode === 'secure') {
        sendJson(res, 403, { error: '对象存储桶为私有，必须通过 API 获取短时签名 URL' });
        return;
      }
      res.writeHead(200, {
        'Content-Type': item.contentType,
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(item.content);
      return;
    }

    const fileMatch = /^\/files\/([^/]+)$/.exec(path);
    if (req.method === 'GET' && fileMatch) {
      const item = files.get(fileMatch[1]);
      if (!item) {
        sendJson(res, 404, { error: '文件不存在' });
        return;
      }

      if (mode === 'secure') {
        const user = currentUser(req);
        if (!user) {
          sendJson(res, 401, { error: '缺少有效 Bearer token' });
          return;
        }
        if (item.owner !== user) {
          // 统一返回 404，避免向其他租户确认对象是否存在。
          sendJson(res, 404, { error: '文件不存在' });
          return;
        }
        res.writeHead(200, {
          'Content-Type': item.contentType,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(item.filename)}"`,
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(item.content);
        return;
      }

      sendJson(res, 200, item);
      return;
    }

    sendJson(res, 404, { error: '接口不存在' });
  } catch (error) {
    const statusCode = Number(error && error.statusCode) || 500;
    sendJson(res, statusCode, { error: error instanceof Error ? error.message : '服务器错误' });
  }
});

server.listen(requestedPort, HOST, () => {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : requestedPort;
  console.log(`[security-upload-lab] mode=${mode} http://${HOST}:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
