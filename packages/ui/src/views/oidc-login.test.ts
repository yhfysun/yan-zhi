/**
 * Task 6 UI 契约测试：OIDC 登录入口接线。
 *
 * ★ 纯文本契约（node 环境无 DOM），与 agentPicker.test.ts 同风格。
 *   后端全部安全校验由 apps/server/test/auth-oidc.test.ts 的 25 个真跑用例覆盖；
 *   这里钉住前端**接线**：回调令牌真的落到本地、入口真的受 enabled 控制、
 *   内置账号登录路径没被改掉。静态断言抓不住"后端做好了但登录页没入口"。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LOGIN = readFileSync(resolve(__dirname, 'Login.vue'), 'utf8');
const CSS = readFileSync(resolve(__dirname, 'login-auth.css'), 'utf8');
const SERVER_INDEX = readFileSync(resolve(__dirname, '../../../../apps/server/src/index.ts'), 'utf8');
const OIDC_ROUTE = readFileSync(resolve(__dirname, '../../../../apps/server/src/routes/oidc.ts'), 'utf8');

describe('OIDC 登录入口', () => {
  it('回调携带 oidc_token 时写入本地令牌并刷新页面', () => {
    expect(LOGIN).toContain("params.get('oidc_token')");
    expect(LOGIN).toContain('setToken(oidcToken)');
    expect(LOGIN).toContain('window.location.replace');
  });

  it('入口仅在服务端启用时出现，登录后走 /auth/oidc/login', () => {
    expect(LOGIN).toContain('v-if="step !== \'changePwd\' && oidcEnabled"');
    expect(LOGIN).toContain("api.get<{ enabled: boolean }>('/auth/oidc/config')");
    expect(LOGIN).toContain('`${API_BASE}/auth/oidc/login`');
    expect(CSS).toContain('.oidc-btn');
  });

  it('内置账号登录路径保持不变', () => {
    expect(LOGIN).toContain('@submit.prevent="submit"');
    expect(LOGIN).toContain('authStore.login(username.value, password.value)');
    expect(LOGIN).toContain('if (!authStore.statusLoaded) await authStore.fetchStatus();');
  });
});

describe('服务端接线守卫', () => {
  it('/api/auth/oidc 必须先于 /api/auth 注册', () => {
    const oidcMount = SERVER_INDEX.indexOf("app.use('/api/auth/oidc'");
    const authMount = SERVER_INDEX.indexOf("app.use('/api/auth'");
    expect(oidcMount).toBeGreaterThan(-1);
    expect(authMount).toBeGreaterThan(oidcMount);
  });

  it('OIDC 模块的关键安全校验都在（测试真跑覆盖，锚点防误删）', () => {
    for (const anchor of [
      "header?.alg !== 'RS256'", 'INVALID_ID_TOKEN_SIGNATURE', 'INVALID_NONCE',
      'INVALID_ISSUER', 'INVALID_AUDIENCE', 'ID_TOKEN_EXPIRED', 'INVALID_ISSUED_AT',
      'UNKNOWN_SIGNING_KEY', 'JWKS_UNREACHABLE', 'TOKEN_EXCHANGE_FAILED',
      "state_hash = ? AND status = 'pending'", 'code_verifier',
    ]) {
      expect(OIDC_ROUTE, anchor).toContain(anchor);
    }
  });
});
