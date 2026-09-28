import type { ToolDefinition } from '../../types';
import type { ApiModuleName } from './index';

export function registerToolTools(m: Map<ApiModuleName, ToolDefinition[]>) {
  m.set('tool', [
    { name: 'api_custom_tool_list', description: '列出所有自定义工具', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'api_custom_tool_get', description: '获取自定义工具详情', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    {
      name: 'api_custom_tool_create',
      description:
        '创建自定义工具（可挂载后调用）。**用它可以给自己"造工具"**：需要某个能力但手头没有现成工具时，写一段代码做成工具、挂到会话上再调用。' +
        'runtime 支持两种：`node`（node:vm 沙箱，**屏蔽 require/process/异步**，只能纯计算与数据转换）与 ' +
        '`python`（真 Python 子进程，**有完整标准库**，可读写文件、发网络请求、用第三方包）。' +
        '★ 需要文件/网络/第三方库时**必须选 python**（node 沙箱做不到）。' +
        'dependencies 声明第三方包（node→npm 名，python→pip 名），首次执行时按需安装。' +
        '★ 创建后还需挂载才能被调用：api_conversation_setup({customToolIds:[id]}) 挂到当前会话（推荐，不污染智能体），或用 api_agent_mount 挂到智能体。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '工具名（建议英文小写下划线）' },
          description: { type: 'string', description: '工具用途说明（模型据此决定何时调用，写清楚）' },
          inputSchema: { type: 'object', description: '该工具的入参 JSON Schema，形如 {"type":"object","properties":{...},"required":[...]}' },
          entry: { type: 'string', description: '入口函数名。node：代码里定义的同名函数（如 main）；python：约定名为 main 的函数，代码从 os.environ["YZ_PY_ARGS"]（base64 JSON）取参、print 输出结果' },
          code: { type: 'string', description: '工具代码。node 例：function main(input){ return input.x * 2 }' },
          runtime: { type: 'string', enum: ['node', 'python'], description: '执行运行时。默认 node（沙箱，无 IO）；需要文件/网络/第三方库时传 python' },
          dependencies: { type: 'array', items: { type: 'string' }, description: '第三方依赖包名（node→npm、python→pip），首次执行时按需安装。不写则只用运行环境已有能力' },
          timeout: { type: 'number', description: '超时毫秒（默认 30000）' },
        },
        required: ['name', 'inputSchema', 'entry', 'code'],
      },
    },
    { name: 'api_custom_tool_update', description: '更新自定义工具（可改 code / description / runtime / dependencies）', inputSchema: { type: 'object', properties: { id: { type: 'string' }, code: { type: 'string' }, description: { type: 'string' }, runtime: { type: 'string', enum: ['node', 'python'] }, dependencies: { type: 'array', items: { type: 'string' } } }, required: ['id'] } },
    { name: 'api_custom_tool_delete', description: '删除自定义工具', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'api_custom_tool_toggle', description: '启用/禁用自定义工具', inputSchema: { type: 'object', properties: { id: { type: 'string' }, enabled: { type: 'boolean' } }, required: ['id', 'enabled'] } },
    { name: 'api_builtin_tool_list', description: '列出所有内置工具', inputSchema: { type: 'object', properties: {}, required: [] } },
    {
      name: 'api_custom_tool_execute',
      description:
        '立即执行一个已启用的自定义工具（无需先挂载，便于造完就试跑）。' +
        'node 运行时在 node:vm 沙箱内（无 IO）；python 运行时会启动真 Python 子进程（可读写文件/联网）。' +
        '若该工具声明了 dependencies，**首次执行时会自动安装依赖**（安装结果会回显在返回里）。' +
        'args 需符合该工具的 inputSchema，可先用 api_custom_tool_get 查看定义。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '自定义工具 id' },
          args: { type: 'object', description: '传给工具的参数对象' },
        },
        required: ['id'],
      },
    },
    {
      name: 'api_tool_ocr',
      description: '对图片做 OCR 文字识别（截图、扫描件、图片中的表格等）。传 path 读取本地图片文件，或传 image（base64）直接在内存中识别',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '本地图片文件绝对路径' },
          image: { type: 'string', description: '可选，图片内容的 base64 编码（与 path 二选一，优先用 image）' },
          lang: { type: 'string', description: '可选，识别语言，默认 chi_sim+eng（中英文）' },
        },
        required: [],
      },
    },
    {
      name: 'api_tool_install',
      description: '从已配置的远程商城源安装一个工具到本地。需先通过 api_marketplace_sources 拿到 remoteSourceId',
      inputSchema: {
        type: 'object',
        properties: {
          remoteSourceId: { type: 'string', description: '远程商城源 id' },
          toolId: { type: 'string', description: '远程工具 id' },
        },
        required: ['remoteSourceId', 'toolId'],
      },
    },
  ]);
}
