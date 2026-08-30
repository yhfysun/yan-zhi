import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerPluginTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('plugin', [
    {
      name: 'api_plugin_list',
      description: '列出所有已安装的插件：manifest（id/名称/版本/声明的权限）、运行状态、错误与当前配置',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'api_plugin_get',
      description: '查看单个插件的详情（manifest / 状态 / 配置 / 来源）',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: '插件 id' } },
        required: ['id'],
      },
    },
    {
      name: 'api_plugin_enable',
      description: '启用插件',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'api_plugin_disable',
      description: '停用插件（不卸载，配置保留）',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'api_plugin_set_config',
      description: '设置插件的配置项（整体覆盖该插件的 config 对象）。可先用 api_plugin_get 查看现有配置',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '插件 id' },
          config: { type: 'object', description: '配置对象，键值对由该插件的 manifest 定义' },
        },
        required: ['id', 'config'],
      },
    },
    {
      name: 'api_plugin_uninstall',
      description: '卸载插件（会移除插件及其配置）',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  ]);
}
