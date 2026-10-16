// 通用内置工具的「命令化」白名单（命令中枢，2026-10-17）。
//
// ★ 这里**只登记只读工具**。用户在命令面板里敲出来的一行不该能改文件 / 跑代码 ——
//   那类动作有各自的确认与审计链，不该被"敲一条命令"就轻松绕过。
// ★★ 但**别靠人记得**：本清单只是候选，真正对外暴露的还要再过一遍
//   `checkToolPermission('readonly', name)`（见 `readOnlyBuiltinCommands`）。
//   于是"以后谁顺手把一个写工具加进本清单"也不会漏出去。
//   这正是本项目反复踩过的坑（api_space_memory_append / api_message_send /
//   api_custom_tool_execute —— 三次"写着只读实则可写"），判据是**按实现判读写**。
import { checkToolPermission } from './tool-permission.js';

export interface BuiltinCommandTool {
  /** 内置工具名（与 ToolRegistry 里的 name 一致） */
  name: string;
  /** 一行说明（命令面板与 /help 用） */
  desc: string;
  /** 面板分组 */
  group: string;
  /** 位置参数名，**按顺序**对应命令行位置参数（与 CommandDef.params 同口径） */
  params?: string[];
}

/**
 * 只读候选清单（数组顺序 = 面板里的顺序）。
 * ★ 只放"读了就完事"的工具：读文件 / 列目录 / 检索 / 代码大纲 / 联网检索 / DNS。
 *   故意**不含** `http_request`（能发任意请求，等于对远端有副作用）与一切 `*_exec`。
 */
export const BUILTIN_COMMAND_TOOLS: BuiltinCommandTool[] = [
  { name: 'file_read', desc: '读取文件内容', group: 'READ', params: ['path'] },
  { name: 'file_list', desc: '列出目录内容', group: 'READ', params: ['path'] },
  { name: 'file_grep', desc: '按正则在工作目录内检索文件内容', group: 'READ', params: ['path', 'pattern'] },
  { name: 'file_to_markdown', desc: '把文件转成 Markdown 文本', group: 'READ', params: ['path'] },
  { name: 'code_outline', desc: '代码文件结构大纲（类 / 函数 / 组件）', group: 'CODE', params: ['path'] },
  { name: 'code_search', desc: '代码检索', group: 'CODE', params: ['query'] },
  { name: 'web_search', desc: '联网检索', group: 'NET', params: ['query'] },
  { name: 'dns_lookup', desc: 'DNS 解析（A / AAAA / MX / TXT / NS …）', group: 'NET', params: ['host'] },
];

/**
 * 只读过滤后的清单（对外暴露的那份）。
 * 候选里若混进写工具 / 不可判定来源 / 委派类，这里会被 `checkToolPermission` 摘掉。
 */
export function readOnlyBuiltinCommands(): BuiltinCommandTool[] {
  return BUILTIN_COMMAND_TOOLS.filter((t) => checkToolPermission('readonly', t.name).allowed);
}
