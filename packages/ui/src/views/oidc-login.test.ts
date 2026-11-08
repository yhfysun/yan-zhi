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
      "SELECT * FROM oidc_login_session WHERE state_hash = ?", 'code_verifier',
    ]) {
      expect(OIDC_ROUTE, anchor).toContain(anchor);
    }
  });
});

describe('popup 通道（轻量壳 file:// / 移动端）', () => {
  const OIDC_ROUTE = readFileSync(resolve(__dirname, '../../../../apps/server/src/routes/oidc.ts'), 'utf8');

  it('登录入口用弹窗 + message 监听，且只信任后端源', () => {
    expect(LOGIN).toContain("window.open(`${API_BASE}/auth/oidc/login?popup=1`");
    expect(LOGIN).toContain("window.addEventListener('message', onMessage)");
    expect(LOGIN).toContain('event.origin !== backendOrigin');
    expect(LOGIN).toContain("data?.type !== 'oidc-token'");
    // 弹窗被拦时整页跳转兜底（Web 同域仍可走旧 302 处理）
    expect(LOGIN).toContain('window.location.href = `${API_BASE}/auth/oidc/login`;');
  });

  it('回调页渲染 postMessage + 自动关闭 + CSP（服务端锚点防误删）', () => {
    expect(OIDC_ROUTE).toContain('popupSuccessPage');
    expect(OIDC_ROUTE).toContain("postMessage");
    expect(OIDC_ROUTE).toContain('window.close()');
    expect(OIDC_ROUTE).toContain("script-src 'unsafe-inline'");
    expect(OIDC_ROUTE).toContain('INVALID_REDIRECT_TARGET');
    expect(OIDC_ROUTE).toContain('YZ_OIDC_POST_LOGIN_REDIRECT');
  });

  it('旧 302 查询处理保留（Web 同域兼容）', () => {
    expect(LOGIN).toContain("params.get('oidc_token')");
    expect(LOGIN).toContain('setToken(oidcToken)');
  });
});
