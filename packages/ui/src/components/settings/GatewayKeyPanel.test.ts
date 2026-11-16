import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, 'GatewayKeyPanel.vue'), 'utf8');
const settings = readFileSync(path.resolve(here, '../../views/Settings.vue'), 'utf8');
const settingsDialog = readFileSync(path.resolve(here, '../SettingsDialog.vue'), 'utf8');
const settingsDrawer = readFileSync(path.resolve(here, '../SettingsDrawer.vue'), 'utf8');

describe('GatewayKeyPanel', () => {
  it('密钥只创建时显示一次，不写 localStorage', () => {
    expect(source).toContain('明文只显示这一次');
    expect(source).toContain("api.post<GatewayKeyItem & { key: string }>('/gateway-keys'");
    expect(source).not.toContain('localStorage');
  });

  it('支持启停与撤销，列表读取今日用量', () => {
    expect(source).toMatch(/api\.patch<GatewayKeyItem>/);
    expect(source).toMatch(/api\.delete/);
    expect(source).toContain('usageToday');
  });

  it('支持编辑名称、模型范围、限额、RPM 和有效期', () => {
    expect(source).toContain('openEdit');
    expect(source).toContain('Pencil');
    expect(source).toContain('expiresAt');
    expect(source).toContain('dailyCostLimitCny');
    expect(source).toContain('allowedModels');
  });

  it('设置页提供本地网关入口，并支持移动端服务分组', () => {
    expect(settings).toContain('GatewayKeyPanel');
    expect(settings).toContain('name="gateway"');
    expect(settings).toContain("name: 'gateway', label: '本地网关'");
  });

  it('桌面设置弹窗与移动设置抽屉都提供本地网关入口', () => {
    expect(settingsDialog).toContain("key: 'gateway'");
    expect(settingsDialog).toContain("pane: 'gateway'");
    expect(settingsDrawer).toContain("section: 'gateway'");
    expect(settingsDrawer).toMatch(/gateway:\s*defineAsyncComponent/);
  });
});
