'use strict';

const http = require('http');
const crypto = require('crypto');

const BRIDGE_PATH = '/v1/computer-control/overlay';
const TOKEN_HEADER = 'x-yz-control-token';
const MAX_BODY_BYTES = 64 * 1024;

function createComputerControlBridge(options = {}) {
  const controller = options.controller;
  const logger = options.logger || console;
  if (!controller || typeof controller.pulse !== 'function' || typeof controller.stop !== 'function') {
    throw new Error('computer control bridge requires overlay controller');
  }

  let server = null;
  let readyPromise = null;
  let state = { url: '', token: '', port: 0 };

  function deny(res) {
    try {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
    } catch { /* response already closed */ }
  }

  function json(res, status, body) {
    const payload = Buffer.from(JSON.stringify(body));
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(payload.length),
      'cache-control': 'no-store',
    });
    res.end(payload);
  }

  function tokenMatches(raw) {
    const got = Array.isArray(raw) ? raw[0] : raw;
    if (typeof got !== 'string' || got.length !== state.token.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(got, 'utf8'), Buffer.from(state.token, 'utf8'));
    } catch {
      return false;
    }
  }

  function start() {
    if (readyPromise) return readyPromise;
    state.token = crypto.randomBytes(32).toString('hex');
    server = http.createServer((req, res) => {
      if (req.method !== 'POST' || req.url !== BRIDGE_PATH) return deny(res);
      if (!tokenMatches(req.headers[TOKEN_HEADER])) return deny(res);
      if (!String(req.headers['content-type'] || '').includes('application/json')) {
        return json(res, 415, { error: 'content-type must be application/json' });
      }

      let size = 0;
      const chunks = [];
      let rejected = false;
      req.on('data', (chunk) => {
        if (rejected) return;
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          rejected = true;
          json(res, 413, { error: 'body too large' });
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (rejected) return;
        void (async () => {
          let body;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          } catch {
            return json(res, 400, { error: 'invalid json' });
          }
          const op = String(body?.op || '');
          const sessionId = String(body?.sessionId || '').trim().slice(0, 120);
          if (!['pulse', 'stop'].includes(op)) return json(res, 400, { error: 'invalid operation' });
          if (!sessionId) return json(res, 400, { error: 'missing sessionId' });

          try {
            const result = op === 'pulse'
              ? await controller.pulse({
                sessionId,
                toolName: String(body?.toolName || '').slice(0, 120),
                phase: String(body?.phase || '').slice(0, 32),
                ...(typeof body?.preview === 'boolean' ? { preview: body.preview } : {}),
                ...(typeof body?.paused === 'boolean' ? { paused: body.paused } : {}),
                ...(body?.cursor && Number.isFinite(Number(body.cursor.x)) && Number.isFinite(Number(body.cursor.y))
                  ? { cursor: { x: Number(body.cursor.x), y: Number(body.cursor.y) } }
                  : {}),
                ...(body?.click === true ? { click: true } : {}),
              })
              : controller.stop(sessionId);
            return json(res, 200, result || { ok: true });
          } catch (err) {
            logger.warn?.('[computer-control-bridge] operation failed:', err?.message || err);
            return json(res, 500, { error: String(err?.message || err) });
          }
        })();
      });
      req.on('error', () => {
        try { res.destroy(); } catch { /* ignore */ }
      });
    });
    server.on('error', (err) => logger.warn?.('[computer-control-bridge] server error:', err?.message || err));
    readyPromise = new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        state = { url: `http://127.0.0.1:${port}${BRIDGE_PATH}`, token: state.token, port };
        logger.log?.('[computer-control-bridge] started (loopback only)');
        resolve({ ...state });
      });
      server.once('error', () => resolve({ ...state }));
    });
    return readyPromise;
  }

  function envForServer() {
    if (!state.url || !state.token) return {};
    return {
      YZ_COMPUTER_CONTROL_URL: state.url,
      YZ_COMPUTER_CONTROL_TOKEN: state.token,
    };
  }

  async function close() {
    const current = server;
    server = null;
    readyPromise = null;
    if (current) {
      try { current.close(); } catch { /* ignore */ }
      try { current.closeAllConnections?.(); } catch { /* ignore */ }
    }
    state = { url: '', token: '', port: 0 };
  }

  return {
    start,
    close,
    envForServer,
    getState: () => ({ ...state }),
  };
}

module.exports = {
  createComputerControlBridge,
  BRIDGE_PATH,
  TOKEN_HEADER,
  MAX_BODY_BYTES,
};
