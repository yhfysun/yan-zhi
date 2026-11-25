export interface ControlAppGrant {
  appId: string;
  displayName: string;
  allowed: boolean;
  updatedAt: number;
}

export type ControlAppPolicyData = Record<string, Record<string, ControlAppGrant>>;

function normalizeId(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export class ComputerControlAppPolicy {
  private data: ControlAppPolicyData;

  constructor(data: ControlAppPolicyData = {}) {
    this.data = {};
    for (const [deviceId, apps] of Object.entries(data || {})) {
      if (!apps || typeof apps !== 'object') continue;
      this.data[String(deviceId)] = {};
      for (const [appId, grant] of Object.entries(apps)) {
        if (!grant || grant.allowed !== true) continue;
        this.data[String(deviceId)][normalizeId(appId)] = {
          appId: normalizeId(appId),
          displayName: String(grant.displayName || appId),
          allowed: true,
          updatedAt: Number(grant.updatedAt) || 0,
        };
      }
    }
  }

  isAllowed(deviceId: string, appId: string): boolean {
    return this.data[String(deviceId)]?.[normalizeId(appId)]?.allowed === true;
  }

  approve(deviceId: string, appId: string, displayName: string, now = Date.now()): ControlAppGrant {
    const device = String(deviceId || 'local');
    const id = normalizeId(appId);
    if (!id) throw new Error('appId is required');
    const grant: ControlAppGrant = {
      appId: id,
      displayName: String(displayName || appId),
      allowed: true,
      updatedAt: now,
    };
    this.data[device] ||= {};
    this.data[device][id] = grant;
    return { ...grant };
  }

  revoke(deviceId: string, appId: string): boolean {
    const device = String(deviceId || 'local');
    const id = normalizeId(appId);
    if (!this.data[device]?.[id]) return false;
    delete this.data[device][id];
    return true;
  }

  list(deviceId: string): ControlAppGrant[] {
    return Object.values(this.data[String(deviceId || 'local')] || {})
      .map((grant) => ({ ...grant }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  toJSON(): ControlAppPolicyData {
    const out: ControlAppPolicyData = {};
    for (const [deviceId, apps] of Object.entries(this.data)) {
      out[deviceId] = {};
      for (const [appId, grant] of Object.entries(apps)) out[deviceId][appId] = { ...grant };
    }
    return out;
  }
}
