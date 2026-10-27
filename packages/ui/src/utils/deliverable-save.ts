// 交付物落盘（Word / Excel 等二进制产物共用的唯一通道）
//
// 桌面端：写进当前会话的交付目录，并登记到文件管理（与服务端同一套目录规则）
// 浏览器/移动端：直接触发下载
//
// 抽出来是因为 Word 导出和 Excel 导出需要完全相同的平台分支；各自复制一份会漂移。

import { ElMessage } from 'element-plus';
import { api as apiClient } from '../api/client';
import { toWindowsPath } from './file-open';

export interface DeliverableKind {
  /** 写入文件登记的 MIME */
  mimeType: string;
  /** 成功提示里的类别名，如「Word」「Excel」 */
  label: string;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function downloadBytes(bytes: Uint8Array, name: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** 保存交付物；返回是否成功（失败时已提示用户）
 *  ★ messageId：导出入口若知道"是哪条助手消息导出的"就带上（2026-10-27）——
 *    交付卡片按 messageId 精确挂到对应轮次；不带只能按创建时间归轮。 */
export async function saveDeliverableBytes(
  bytes: Uint8Array,
  name: string,
  kind: DeliverableKind,
  opts?: { messageId?: string },
): Promise<boolean> {
  const { getPlatformAdapter } = await import('@yan-zhi/core');
  const adapter = getPlatformAdapter();
  const { useChatStore } = await import('../stores/chat');
  const chatStore = useChatStore();
  const convId = chatStore.currentConvId || '';

  let dir = '';
  if (convId) {
    try {
      const r = await apiClient.get<{ dir?: string; relDir?: string }>(
        `/conversations/${convId}/artifact-dir?category=deliverable&ensure=1`,
      );
      if ('data' in r && r.data) {
        dir = ((adapter.platform === 'desktop' ? r.data.dir : r.data.relDir) || '');
      }
    } catch { /* 走兜底目录 */ }
  }
  if (!dir) dir = 'workspace';
  // 登记进 conversation_file 的路径必须是原生分隔符，否则资源管理器定位会静默失败
  const full = toWindowsPath(`${dir}/${name}`);

  if (adapter.platform !== 'desktop') {
    downloadBytes(bytes, name, kind.mimeType);
    ElMessage.success('已开始下载 ' + name);
    return true;
  }

  try {
    // 接口的 ensure=1 已建好目录；接口不可用时兜底自建，避免写入因父目录缺失失败
    try {
      if (!(await adapter.fs.exists(dir))) await adapter.fs.mkdir(dir);
    } catch { /* 已存在或无 mkdir 能力 */ }
    await adapter.fs.writeFileBase64(full, bytesToBase64(bytes));
  } catch (e: any) {
    ElMessage.error('导出失败: ' + (e?.message || e));
    return false;
  }
  if (convId) {
    try {
      const { useFileStore } = await import('../stores/file');
      await useFileStore().registerFile({
        conversationId: convId,
        name,
        path: full,
        category: 'deliverable',
        mimeType: kind.mimeType,
        size: bytes.length,
        source: 'agent',
        messageId: opts?.messageId,
      });
    } catch { /* 登记失败不影响导出结果 */ }
  }
  ElMessage.success(`已导出 ${kind.label}：` + full);
  return true;
}

/** 文件名净化：去掉 Windows/macOS 不允许的字符，空则回退 */
export function safeFileName(raw: string, fallback: string): string {
  const base = String(raw || '').replace(/[\\/:*?"<>|]/g, '').trim();
  return base || fallback;
}
