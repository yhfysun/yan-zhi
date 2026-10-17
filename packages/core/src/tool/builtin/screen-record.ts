// screen_record 内置工具 —— 桌面端录屏（录制窗口画面为 mp4，演示视频原料）
// 注意：实际执行由 server 委托前端（tool:execute → 渲染层 electronAPI.screenRecord →
// 主进程 capturePage 定帧采样 + ffmpeg image2pipe 编码），此类仅提供 schema 注册。
// 产物路径由服务端统一解析到会话产物目录（deliverable），录完天然出现在文件面板。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class ScreenRecordTool implements BuiltInTool {
  name = 'screen_record';
  description =
    '桌面端录屏：把一个窗口的画面录制为 mp4 视频文件（落到当前任务的产物目录）。' +
    '两步用法：先 action="start" 开始录制（返回 recordId），需要停止时 action="stop" 并传 recordId。' +
    '典型用途：录制应用操作的演示视频。target="task:<conversationId>" 录某任务的独立执行窗口，' +
    'target="main" 录主窗口。仅桌面端可用；最长单段 10 分钟。';
  inputSchema = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['start', 'stop'],
        description: 'start = 开始录制（返回 recordId 与产物路径）；stop = 停止并落盘（返回文件路径与时长）。',
      },
      recordId: {
        type: 'string',
        description: 'action="stop" 时必填：start 返回的 recordId。',
      },
      target: {
        type: 'string',
        description: 'action="start" 时可选：`task:<conversationId>` 录该任务的独立执行窗口（需先用 app_open_window 弹出）；缺省录主窗口。',
      },
      outName: {
        type: 'string',
        description: 'action="start" 时可选：产物文件名（不含扩展名，非法字符自动替换）。缺省按时间戳命名。',
      },
      fps: {
        type: 'number',
        description: 'action="start" 时可选：采样帧率 5-30（默认 10）。演示视频 10-15 足够流畅。',
      },
    },
    required: ['action'],
  };

  async execute(_args: Record<string, unknown>): Promise<McpCallResult> {
    return {
      content: [{ type: 'text', text: 'screen_record intercepted by frontend.' }],
    };
  }
}
