// 管理后台 API（/api/admin 下）：用户 / 组织 / 角色 / 权限
// 仅 multi 模式 + admin 权限点可调；路由守卫已挡住无权用户进入管理页。
import { api } from './client';

export interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  created_at: number;
  orgs: { id: string; name: string }[];
  roles: { id: string; name: string }[];
  permissions: string[];
  /** 额度（元，null/缺省 = 不限）与已用成本（2026-11-01 用户额度闸） */
  quota_cost_cny?: number | null;
  usedCost?: number;
}
export interface AdminOrg { id: string; name: string; parent_id: string | null; sort_order: number; user_count?: number; role_ids?: string[] }
export interface AdminRole { id: string; name: string; parent_id: string | null; is_system: number; remark: string | null; permission_count?: number }
export interface RoleBinding { role_id: string; permission_id: string }
export interface PermissionDef { id: string; name: string; parent: string | null }

export const adminApi = {
  async users() {
    const r = await api.get<{ users: AdminUser[] }>('/admin/users');
    return 'data' in r ? r.data.users : null;
  },
  async createUser(body: { username: string; password: string; email?: string; orgIds?: string[]; roleIds?: string[] }) {
    return api.post('/admin/users', body);
  },
  async updateUser(id: string, body: { email?: string; password?: string; orgIds?: string[]; roleIds?: string[] }) {
    return api.patch(`/admin/users/${id}`, body);
  },
  async deleteUser(id: string) {
    return api.delete(`/admin/users/${id}`);
  },

  async orgs() {
    const r = await api.get<{ orgs: AdminOrg[] }>('/admin/orgs');
    return 'data' in r ? r.data.orgs : null;
  },
  async createOrg(body: { name: string; parentId?: string | null; sortOrder?: number }) {
    return api.post('/admin/orgs', body);
  },
  async updateOrg(id: string, body: { name?: string; parentId?: string | null; sortOrder?: number }) {
    return api.patch(`/admin/orgs/${id}`, body);
  },
  async deleteOrg(id: string) {
    return api.delete(`/admin/orgs/${id}`);
  },
  async setOrgRoles(id: string, roleIds: string[]) {
    return api.put(`/admin/orgs/${id}/roles`, { roleIds });
  },

  async roles() {
    const r = await api.get<{ roles: AdminRole[]; bindings: RoleBinding[] }>('/admin/roles');
    return 'data' in r ? r.data : null;
  },
  async createRole(body: { name: string; parentId?: string | null; remark?: string; permissionIds?: string[] }) {
    return api.post('/admin/roles', body);
  },
  async updateRole(id: string, body: { name?: string; parentId?: string | null; remark?: string; permissionIds?: string[] }) {
    return api.patch(`/admin/roles/${id}`, body);
  },
  async deleteRole(id: string) {
    return api.delete(`/admin/roles/${id}`);
  },

  async permissions() {
    const r = await api.get<{ permissions: PermissionDef[] }>('/admin/permissions');
    return 'data' in r ? r.data.permissions : null;
  },
};
