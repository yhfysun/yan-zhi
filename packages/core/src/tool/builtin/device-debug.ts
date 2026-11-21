// device_* 真机调试工具家族 —— 调用服务端 /api/device-debug（adb forward + CDP 直连真机 WebView）
//
// ★ 为什么是独立家族（不挂 browser_ 前缀）：browser_* 被硬过滤成 pageAgent 专属
//   （llm-task-manager buildToolsForBackend 的 agentId 过滤），真机调试要给编码助手 /
//   测试助手 / 任意自建智能体用 —— 独立命名避开该过滤，走通用 builtin_tool_ids 挂载，
//   谁用谁挂。底层 CDP 连接管理、adb 发现、forward 回收都在服务端 device-debug.ts。
//
// 调试闭环对标 Trae/Codex 的 chrome://inspect 链路：
//   device_webview_list 发现 → device_console_read 看报错 → device_eval 取页面状态。
// 与 browser_get_debug_state（本机 Playwright/壳内页面）互补，作用域是真机上的 WebView。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';
import { toolError } from '../result';
import { capToolOutput } from './output-cap';

/** 调用真机调试 API（与 browser/index.ts 的 callBrowserApi 同一 URL 口径：前端相对路径，Node 绝对路径） */
async function callDeviceApi(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch { /* Node 环境（服务端进程内执行）无 localStorage */ }
  const baseUrl = typeof window !== 'undefined' ? '' : `http://127.0.0.1:${process.env.PORT || 3001}`;
  const res = await fetch(baseUrl + '/api/device-debug' + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || json.error) {
    throw new Error(json.error || `请求失败 (${res.status})`);
  }
  return json.data ?? json;
}

/** 把服务端返回的 devices 结构渲染成模型可读的清单文本（targetKey 是后续两个工具的入参） */
function renderWebviews(data: { devices?: Array<any>; adb?: string }): string {
  const devices = data?.devices || [];
  if (devices.length === 0) {
    return [
      '未发现任何已连接的 Android 设备。排查提示：',
      '1. 手机 USB 连接后需在开发者选项里开启「USB 调试」并允许授权弹窗；',
      '2. 确认 `adb devices` 能列出设备（状态须为 device，不能是 unauthorized/offline）；',
      '3. WebView 调试要求 App 开启 setWebContentsDebuggingEnabled(true)（debug 包默认开启）。',
    ].join('\n');
  }
  const lines: string[] = [];
  let totalTargets = 0;
  for (const dev of devices) {
    const sockets = dev.sockets || [];
    const webviewCount = sockets.reduce((n: number, s: any) => n + (s.targets?.length || 0), 0);
    lines.push(`设备 ${dev.serial}${dev.model ? `（${dev.model}）` : ''}${webviewCount === 0 ? '：无可调试 WebView' : ''}`);
    for (const s of sockets) {
      for (const t of s.targets || []) {
        totalTargets++;
        lines.push(`  · ${t.title}`);
        lines.push(`    URL: ${t.url || '(about:blank)'}`);
        lines.push(`    targetKey: ${t.targetKey}${t.attached ? '（console 已在持续采集）' : ''}`);
      }
    }
  }
  if (totalTargets === 0) {
    lines.push('');
    lines.push('设备在线但没有可调试的 DevTools socket：目标 App 的 WebView 未开调试（setWebContentsDebuggingEnabled），');
    lines.push('或没有 WebView 正在运行 —— 先在手机上打开目标 App 的对应页面再重试。');
  } else {
    lines.push('');
    lines.push('后续：用 targetKey 调 device_console_read 看 console 报错 / device_eval 在页面里执行 JS。');
    lines.push('console 只在挂接后才开始采集：先调本工具建立挂接，再复现问题，然后 device_console_read 读取。');
  }
  return capToolOutput(lines.join('\n'));
}

// ═══════════════════════ 工具类 ═══════════════════════

/** 枚举真机与可调试 WebView（读，无副作用） */
export class DeviceWebviewListTool implements BuiltInTool {
  name = 'device_webview_list';
  description = '枚举通过 USB/无线连接的 Android 真机及其**可调试的 WebView 页面**（CDP DevTools socket 自动发现 + adb forward）。返回每台设备的页面标题、URL 与 targetKey —— targetKey 是 device_console_read / device_eval 的必填入参。真机调试第一步：手机上打开目标 App 的 WebView 页面后调用本工具；之后 console 会在后台持续采集，用 device_console_read 读取报错。仅桌面端可用（需要 adb，内置兜底）。';

  inputSchema = {
    type: 'object',
    properties: {},
    additionalProperties: false,
  };

  async execute(_args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callDeviceApi('/webviews', 'GET');
      return { content: [{ type: 'text', text: renderWebviews(data) }] };
    } catch (e: unknown) {
      return toolError(`真机 WebView 枚举失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/** 读真机 WebView 的 console / 异常 / 浏览器日志缓冲 */
export class DeviceConsoleReadTool implements BuiltInTool {
  name = 'device_console_read';
  description = '读取真机 WebView 页面的 console 输出（log/warn/error/exception/浏览器网络报错）。★ CDP 只采集**挂接后**的事件：先 device_webview_list 建立挂接 → 在手机上复现问题 → 再调本工具。常配 waitMs=2000 等一小段日志涌入。只读，不改页面状态。';

  inputSchema = {
    type: 'object',
    properties: {
      targetKey: {
        type: 'string',
        description: 'device_webview_list 返回的 targetKey（<设备序列号>|<socket>|<targetId>）',
      },
      lines: {
        type: 'number',
        description: '返回最近 N 条（默认 100，上限 800）',
      },
      waitMs: {
        type: 'number',
        description: '读取前等待的毫秒数（0~10000），给新日志涌入留时间。刚挂接后建议传 2000',
      },
      clear: {
        type: 'boolean',
        description: 'true=读后清空缓冲（配合复现流程分段采集）',
      },
    },
    required: ['targetKey'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const targetKey = args.targetKey as string;
    if (!targetKey || typeof targetKey !== 'string') return toolError('Error: targetKey is required（先调 device_webview_list 获取）');
    try {
      const data = await callDeviceApi('/console', 'POST', {
        targetKey,
        lines: args.lines as number | undefined,
        waitMs: args.waitMs as number | undefined,
        clear: args.clear as boolean | undefined,
      });
      const entries: Array<any> = data?.entries || [];
      if (entries.length === 0) {
        const hint = (data?.waitMs || 0) > 0
          ? ''
          : '（提示：可传 waitMs=2000 等待日志涌入；或先在手机上操作触发日志再读）';
        return { content: [{ type: 'text', text: `缓冲为空，暂无 console 输出${hint}` }] };
      }
      const lines = entries.map((e) => `[${e.ts}] [${e.level}] ${e.text}${e.url ? `\n    at ${e.url}` : ''}`);
      const tail = data?.clear === true ? '' : `\n（缓冲共 ${data?.total ?? entries.length} 条；传 clear=true 可读后清空）`;
      return { content: [{ type: 'text', text: capToolOutput(lines.join('\n')) + tail }] };
    } catch (e: unknown) {
      return toolError(`读取真机 console 失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/** 在真机 WebView 页面里执行 JS（写操作，readonly 会话拦截） */
export class DeviceEvalTool implements BuiltInTool {
  name = 'device_eval';
  description = '在真机 WebView 页面里执行任意 JavaScript（Runtime.evaluate，自动 await Promise 并按值返回结果）。用于取页面状态、验证修复、定位 DOM/运行时报错。★ 会改变页面状态，按写操作管控；表达式里的 async/await 直接可用（用 return 包裹结果）。定位报错优先用 device_console_read，本工具用于主动探查。';

  inputSchema = {
    type: 'object',
    properties: {
      targetKey: {
        type: 'string',
        description: 'device_webview_list 返回的 targetKey（<设备序列号>|<socket>|<targetId>）',
      },
      expression: {
        type: 'string',
        description: '要执行的 JavaScript 表达式（如 `return document.title`、`return location.href`、`return document.querySelector("#app").innerHTML.length`）',
      },
      timeoutMs: {
        type: 'number',
        description: '超时毫秒数（默认 10000，上限 60000）',
      },
    },
    required: ['targetKey', 'expression'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    const targetKey = args.targetKey as string;
    const expression = args.expression as string;
    if (!targetKey || typeof targetKey !== 'string') return toolError('Error: targetKey is required（先调 device_webview_list 获取）');
    if (!expression || !String(expression).trim()) return toolError('Error: expression is required');
    try {
      const data = await callDeviceApi('/eval', 'POST', {
        targetKey,
        expression,
        timeoutMs: args.timeoutMs as number | undefined,
      });
      if (data?.wasThrown) {
        return toolError(`页面内执行抛错: ${data.exception}`);
      }
      let text: string;
      const value = data?.value;
      if (value === undefined) text = '(undefined)';
      else if (typeof value === 'string') text = value;
      else {
        try { text = JSON.stringify(value, null, 2); } catch { text = String(value); }
      }
      return { content: [{ type: 'text', text: capToolOutput(text) }] };
    } catch (e: unknown) {
      return toolError(`真机 WebView eval 失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

export const DeviceDebugToolClasses = [
  DeviceWebviewListTool,
  DeviceConsoleReadTool,
  DeviceEvalTool,
];
