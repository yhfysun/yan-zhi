const test = require('node:test');
const assert = require('node:assert/strict');
const { createComputerControlBridge } = require('../computer-control-bridge.cjs');

function postJson(url, token, body) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-yz-control-token': token,
    },
    body: JSON.stringify(body),
  });
}

test('computer control bridge authenticates and forwards pulse operations', async (t) => {
  const calls = [];
  const bridge = createComputerControlBridge({
    controller: {
      async pulse(payload) {
        calls.push(['pulse', payload]);
        return { ok: true };
      },
      stop(sessionId) {
        calls.push(['stop', sessionId]);
        return { ok: true };
      },
    },
    logger: { log() {}, warn() {} },
  });
  t.after(() => bridge.close());
  const state = await bridge.start();
  const env = bridge.envForServer();
  assert.ok(env.YZ_COMPUTER_CONTROL_URL);
  assert.ok(env.YZ_COMPUTER_CONTROL_TOKEN);

  const response = await postJson(env.YZ_COMPUTER_CONTROL_URL, env.YZ_COMPUTER_CONTROL_TOKEN, {
    op: 'pulse',
    sessionId: 'conv-1',
    toolName: 'computer_type',
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(calls[0], ['pulse', {
    sessionId: 'conv-1',
    toolName: 'computer_type',
    phase: '',
  }]);
  await bridge.close();
  assert.deepEqual(bridge.envForServer(), {});
  assert.ok(state.port > 0);
});

test('computer control bridge hides endpoint details from invalid tokens', async (t) => {
  const bridge = createComputerControlBridge({
    controller: { pulse() {}, stop() {} },
    logger: { log() {}, warn() {} },
  });
  t.after(() => bridge.close());
  await bridge.start();
  const env = bridge.envForServer();
  const response = await postJson(env.YZ_COMPUTER_CONTROL_URL, 'wrong-token', {
    op: 'pulse',
    sessionId: 'conv-1',
  });
  assert.equal(response.status, 404);
  await bridge.close();
});

test('computer control bridge rejects unknown and malformed operations', async (t) => {
  const bridge = createComputerControlBridge({
    controller: { pulse() {}, stop() {} },
    logger: { log() {}, warn() {} },
  });
  t.after(() => bridge.close());
  await bridge.start();
  const env = bridge.envForServer();

  const unknown = await postJson(env.YZ_COMPUTER_CONTROL_URL, env.YZ_COMPUTER_CONTROL_TOKEN, {
    op: 'shell',
  });
  assert.equal(unknown.status, 400);

  const missingSession = await postJson(env.YZ_COMPUTER_CONTROL_URL, env.YZ_COMPUTER_CONTROL_TOKEN, {
    op: 'pulse',
  });
  assert.equal(missingSession.status, 400);
  await bridge.close();
});
