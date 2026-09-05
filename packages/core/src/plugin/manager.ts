// 插件管理器
import type { PlatformAdapter } from '../platform/types';
import type { Disposable, Plugin, PluginManifest, PluginModule, PluginState, PluginSource, PluginStorage } from './types';
import { ExtensionRegistry } from './registry';
import { validateManifest } from './manifest';
import { loadPluginModule } from './loader';
import { createPluginContext } from './api';

interface PluginRow {
  id: string;
  manifest: string;
  state: string;
  config: string | null;
  source: string;
  error: string | null;
}

/**
 * 插件管理器：负责加载/启用/禁用/卸载，维护扩展点注册表，持久化到 DB。
 * 仅在后端（Node）运行；前端通过 HTTP API 读取聚合状态。
 */
export class PluginManager {
  readonly registry = new ExtensionRegistry();
  private plugins = new Map<string, Plugin>();
  private modules = new Map<string, PluginModule>();
  private entryPaths = new Map<string, string>();
  private listeners: Array<(event: string, id: string) => void> = [];
  private bus = new Map<string, Array<(...args: unknown[]) => void>>();

  constructor(private adapter: PlatformAdapter) {}

  /** 初始化：建表 + 从 DB 恢复 + 激活已启用插件 */
  async init(): Promise<void> {
    await this.ensureSchema();
    await this.loadFromDb();
  }

  private async ensureSchema(): Promise<void> {
    // 表已由 schema.ts initSchema 创建，此处幂等保证
    const db = this.adapter.db;
    await db.exec(`CREATE TABLE IF NOT EXISTS plugin (
      id TEXT PRIMARY KEY, manifest TEXT NOT NULL, state TEXT NOT NULL,
      config TEXT, version TEXT NOT NULL, source TEXT NOT NULL, error TEXT,
      installed_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
    await db.exec(`CREATE TABLE IF NOT EXISTS plugin_storage (
      plugin_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT,
      PRIMARY KEY (plugin_id, key))`);
  }

  private async loadFromDb(): Promise<void> {
    let rows: PluginRow[] = [];
    try {
      rows = await this.adapter.db.query<PluginRow>(
        'SELECT id, manifest, state, config, source, error FROM plugin',
      );
    } catch {
      return;
    }
    for (const r of rows) {
      try {
        const manifest = JSON.parse(r.manifest) as PluginManifest;
        const config = r.config ? JSON.parse(r.config) : {};
        const plugin: Plugin = {
          manifest,
          state: r.state as PluginState,
          config,
          source: r.source as PluginSource,
          disposables: [],
          error: r.error || undefined,
        };
        this.plugins.set(r.id, plugin);
        if (plugin.state === 'enabled') await this.activate(plugin);
      } catch (e) {
        console.warn(`[plugin] ${r.id} 恢复失败`, e);
      }
    }
  }

  list(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  get(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  /** 注册内置插件（manifest + 入口模块或路径），持久化并按需激活 */
  async registerBuiltin(
    manifest: PluginManifest,
    moduleOrPath: PluginModule | string,
    enabled = true,
  ): Promise<void> {
    validateManifest(manifest);
    // loadFromDb 已从 DB 恢复过该插件：保留用户启停状态与配置（enabled 仅在首次注册时生效），
    // 仅同步 manifest/入口模块并补完整激活——早期恢复激活时无入口模块，工具/后端路由未注册
    if (this.plugins.has(manifest.id)) {
      const existing = this.plugins.get(manifest.id)!;
      existing.manifest = manifest;
      await this.rebindAndReactivate(manifest.id, moduleOrPath);
      return;
    }
    const plugin: Plugin = {
      manifest,
      state: 'disabled',
      config: {},
      source: 'builtin',
      disposables: [],
    };
    this.plugins.set(manifest.id, plugin);
    if (typeof moduleOrPath === 'string') {
      this.entryPaths.set(manifest.id, moduleOrPath);
    } else {
      this.modules.set(manifest.id, moduleOrPath);
    }
    await this.upsertDb(plugin);
    if (enabled) await this.enable(manifest.id);
  }

  /** 重启恢复场景：为已从 DB 恢复的插件补绑入口模块，enabled 状态则重新完整激活 */
  async rebindAndReactivate(id: string, moduleOrPath: PluginModule | string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`插件不存在: ${id}`);
    if (typeof moduleOrPath === 'string') {
      this.entryPaths.set(id, moduleOrPath);
    } else {
      this.modules.set(id, moduleOrPath);
    }
    if (plugin.state === 'enabled') {
      await this.upsertDb(plugin); // 同步 manifest（版本升级场景）
      await this.disable(id); // 清掉早期无模块激活的半成品（dispose contributes）
      await this.enable(id); // 带入口模块完整激活（工具/后端路由注册 + emit enabled）
    } else {
      await this.upsertDb(plugin);
    }
  }

  /** 注册已安装的第三方插件（manifest + 入口路径），持久化并按需激活 */
  async registerInstalled(
    manifest: PluginManifest,
    entryPath: string,
    enabled = true,
  ): Promise<void> {
    validateManifest(manifest);
    if (this.plugins.has(manifest.id)) {
      throw new Error(`插件已存在: ${manifest.id}（请先卸载再安装）`);
    }
    const plugin: Plugin = {
      manifest,
      state: 'disabled',
      config: {},
      source: 'installed',
      disposables: [],
    };
    this.plugins.set(manifest.id, plugin);
    this.entryPaths.set(manifest.id, entryPath);
    await this.upsertDb(plugin);
    if (enabled) await this.enable(manifest.id);
  }

  async enable(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`插件不存在: ${id}`);
    if (plugin.state === 'enabled') return;
    await this.activate(plugin);
    await this.updateDbState(plugin);
    this.emit('enabled', id);
  }

  async disable(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`插件不存在: ${id}`);
    if (plugin.state !== 'enabled') return;
    await this.deactivate(plugin);
    plugin.state = 'disabled';
    await this.updateDbState(plugin);
    this.emit('disabled', id);
  }

  async setConfig(id: string, config: Record<string, unknown>): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`插件不存在: ${id}`);
    plugin.config = config;
    await this.adapter.db.exec('UPDATE plugin SET config=?, updated_at=? WHERE id=?', [
      JSON.stringify(config),
      Date.now(),
      id,
    ]);
  }

  async uninstall(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) return;
    await this.disable(id);
    await this.adapter.db.exec('DELETE FROM plugin_storage WHERE plugin_id=?', [id]);
    await this.adapter.db.exec('DELETE FROM plugin WHERE id=?', [id]);
    this.plugins.delete(id);
    this.modules.delete(id);
    this.entryPaths.delete(id);
    this.emit('uninstalled', id);
  }

  private async activate(plugin: Plugin): Promise<void> {
    const id = plugin.manifest.id;
    try {
      // 1. 声明式前端扩展点
      plugin.disposables.push(this.registry.addContributes(id, plugin.manifest.contributes || {}));

      // 2. 后端入口模块
      let mod = this.modules.get(id);
      if (!mod) {
        const entry = this.entryPaths.get(id);
        if (entry) {
          mod = await loadPluginModule(entry);
          this.modules.set(id, mod);
        }
      }
      if (mod) {
        const ctx = createPluginContext({
          pluginId: id,
          manifest: plugin.manifest,
          adapter: this.adapter,
          config: plugin.config,
          registry: this.registry,
          storage: this.makeStorage(id),
          emit: (e, p) => this.emitBus(`${id}:${e}`, p),
          on: (e, h) => this.onBus(`${id}:${e}`, h),
        });
        await mod.activate(ctx);
      }
      plugin.state = 'enabled';
      plugin.error = undefined;
    } catch (e) {
      plugin.state = 'error';
      plugin.error = (e as Error).message;
      console.error(`[plugin] ${id} 激活失败`, e);
    }
  }

  private async deactivate(plugin: Plugin): Promise<void> {
    const id = plugin.manifest.id;
    const mod = this.modules.get(id);
    try {
      await mod?.deactivate?.();
    } catch (e) {
      console.warn(`[plugin] ${id} deactivate 失败`, e);
    }
    for (const d of plugin.disposables) {
      try {
        d.dispose();
      } catch {}
    }
    plugin.disposables = [];
    this.registry.removeByPlugin(id);
  }

  /** 订阅生命周期事件 */
  on(event: 'enabled' | 'disabled' | 'installed' | 'uninstalled', cb: (id: string) => void): Disposable {
    const wrapped = (ev: string, id: string) => {
      if (ev === event) cb(id);
    };
    this.listeners.push(wrapped);
    return {
      dispose: () => {
        const i = this.listeners.indexOf(wrapped);
        if (i >= 0) this.listeners.splice(i, 1);
      },
    };
  }

  private emit(event: string, id: string): void {
    for (const l of this.listeners) l(event, id);
  }
  private emitBus(event: string, payload?: unknown): void {
    for (const h of this.bus.get(event) || []) h(payload);
  }
  private onBus(event: string, handler: (...args: unknown[]) => void): Disposable {
    if (!this.bus.has(event)) this.bus.set(event, []);
    this.bus.get(event)!.push(handler);
    return {
      dispose: () => {
        const arr = this.bus.get(event);
        if (arr) {
          const i = arr.indexOf(handler);
          if (i >= 0) arr.splice(i, 1);
        }
      },
    };
  }

  private makeStorage(pluginId: string): PluginStorage {
    const db = this.adapter.db;
    return {
      get: async <T>(key: string): Promise<T | undefined> => {
        const rows = await db.query<{ value: string }>(
          'SELECT value FROM plugin_storage WHERE plugin_id=? AND key=?',
          [pluginId, key],
        );
        if (!rows[0]?.value) return undefined;
        try {
          return JSON.parse(rows[0].value) as T;
        } catch {
          return undefined;
        }
      },
      set: async (key, value) => {
        await db.exec('INSERT OR REPLACE INTO plugin_storage (plugin_id,key,value) VALUES (?,?,?)', [
          pluginId,
          key,
          JSON.stringify(value),
        ]);
      },
      delete: async (key) => {
        await db.exec('DELETE FROM plugin_storage WHERE plugin_id=? AND key=?', [pluginId, key]);
      },
    };
  }

  private async upsertDb(plugin: Plugin): Promise<void> {
    const now = Date.now();
    await this.adapter.db.exec(
      `INSERT OR REPLACE INTO plugin (id,manifest,state,config,version,source,error,installed_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        plugin.manifest.id,
        JSON.stringify(plugin.manifest),
        plugin.state,
        JSON.stringify(plugin.config),
        plugin.manifest.version,
        plugin.source,
        plugin.error || null,
        now,
        now,
      ],
    );
  }

  private async updateDbState(plugin: Plugin): Promise<void> {
    await this.adapter.db.exec('UPDATE plugin SET state=?, error=?, updated_at=? WHERE id=?', [
      plugin.state,
      plugin.error || null,
      Date.now(),
      plugin.manifest.id,
    ]);
  }
}