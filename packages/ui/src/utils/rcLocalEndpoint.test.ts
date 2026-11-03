import { describe, expect, it } from 'vitest';
import { resolveRcHostEndpoint, rcHostWsUrl } from './rcLocalEndpoint';

describe('轻量壳本机远控端点', () => {
  it('本机能力服务可用时，host 信令必须走壳 origin 而不是远程 API_BASE', () => {
    const endpoint = resolveRcHostEndpoint('http://10.0.0.8:3001/api', {
      ok: true,
      baseUrl: 'http://192.168.1.20:3001/',
      hostKey: 'local-key',
    });
    expect(endpoint).toEqual({
      apiBase: 'http://192.168.1.20:3001/api',
      hostKey: 'local-key',
      isLocal: true,
    });
  });

  it('普通完整桌面端没有本机能力服务时，保持原有 API_BASE', () => {
    const endpoint = resolveRcHostEndpoint('http://127.0.0.1:3001/api', { ok: false });
    expect(endpoint).toEqual({
      apiBase: 'http://127.0.0.1:3001/api',
      hostKey: '',
      isLocal: false,
    });
  });

  it('WebSocket 从同一 origin 派生，避免 http 页面再误连远程后端', () => {
    expect(rcHostWsUrl(
      'http://192.168.1.20:3001/api',
      '/plugin/remote-control/session/ws?role=host',
    )).toBe('ws://192.168.1.20:3001/api/plugin/remote-control/session/ws?role=host');
  });
});
