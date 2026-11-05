import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

const SPEC_SCHEMA = {
  type: 'object',
  description: 'PageAssetSpec。必须包含 id/title/platform/scope/status/version/capabilities/match/operations。',
};

export function registerPageAssetTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('page-asset', [
    {
      name: 'api_page_asset_list',
      description: '列出当前用户可见的页面资产。默认只返回 active；includeDrafts=true 时返回草稿用于维护。',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          platform: { type: 'string' },
          capability: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'active', 'deprecated'] },
          includeDrafts: { type: 'boolean' },
          page: { type: 'number' },
          pageSize: { type: 'number' },
        },
      },
    },
    {
      name: 'api_page_asset_get',
      description: '按资产 id、唯一标题或唯一 capability 读取完整 PageAsset 契约。',
      inputSchema: {
        type: 'object',
        properties: {
          assetId: { type: 'string' },
        },
        required: ['assetId'],
      },
    },
    {
      name: 'api_page_asset_resolve',
      description: '按公共 capability、平台或当前 URL 解析可用页面资产。跨平台 skill 应先用它选择平台适配器。',
      inputSchema: {
        type: 'object',
        properties: {
          capability: { type: 'string' },
          platform: { type: 'string' },
          url: { type: 'string' },
        },
      },
    },
    {
      name: 'api_page_asset_create_draft',
      description: '创建或更新用户自己的页面资产草稿。active 版本保持在线；若资产已存在且属于自己，传 expectedVersion 会生成下一版工作草稿。内置或他人资产不可改。',
      inputSchema: {
        type: 'object',
        properties: {
          spec: SPEC_SCHEMA,
          expectedVersion: { type: 'number', description: '已存在资产创建下一版草稿时必填' },
          changeSummary: { type: 'string' },
        },
        required: ['spec'],
      },
    },
    {
      name: 'api_page_asset_update_draft',
      description: '更新用户自己的页面资产草稿。必须传 expectedVersion，避免并发覆盖。',
      inputSchema: {
        type: 'object',
        properties: {
          assetId: { type: 'string' },
          spec: SPEC_SCHEMA,
          expectedVersion: { type: 'number' },
          changeSummary: { type: 'string' },
        },
        required: ['assetId', 'spec', 'expectedVersion'],
      },
    },
    {
      name: 'api_page_asset_validate',
      description: '校验页面资产当前版本的 schema、路由、能力和 operation 结构。',
      inputSchema: {
        type: 'object',
        properties: { assetId: { type: 'string' } },
        required: ['assetId'],
      },
    },
    {
      name: 'api_page_asset_activate',
      description: '激活用户自己的页面资产草稿。激活会生成新版本；需要用户明确授权后调用。',
      inputSchema: {
        type: 'object',
        properties: {
          assetId: { type: 'string' },
          expectedVersion: { type: 'number' },
          changeSummary: { type: 'string' },
        },
        required: ['assetId', 'expectedVersion'],
      },
    },
    {
      name: 'api_page_asset_archive',
      description: '停用用户自己的页面资产，保留历史版本。不会物理删除。',
      inputSchema: {
        type: 'object',
        properties: { assetId: { type: 'string' } },
        required: ['assetId'],
      },
    },
    {
      name: 'api_page_asset_versions',
      description: '列出一个可见页面资产的历史版本、契约哈希和变更摘要。',
      inputSchema: {
        type: 'object',
        properties: { assetId: { type: 'string' } },
        required: ['assetId'],
      },
    },
    {
      name: 'api_page_asset_probe',
      description: '只读探测页面资产：校验 operation 输入、当前 URL 是否匹配、确认策略和 recipe 参数映射，不执行任何页面动作。',
      inputSchema: {
        type: 'object',
        properties: {
          assetId: { type: 'string' },
          operationId: { type: 'string' },
          params: { type: 'object' },
          url: { type: 'string', description: '可选当前页面 URL，用于校验 host/route 是否匹配' },
        },
        required: ['assetId'],
      },
    },
    {
      name: 'api_page_asset_rollback',
      description: '把历史资产版本恢复成新的 draft 版本。不会直接覆盖 active 资产，仍需 validate + activate。',
      inputSchema: {
        type: 'object',
        properties: {
          assetId: { type: 'string' },
          targetVersion: { type: 'number' },
        },
        required: ['assetId', 'targetVersion'],
      },
    },
  ]);
}
