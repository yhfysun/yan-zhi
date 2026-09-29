// 按文件名后缀推断 MIME 类型。
//
// 为什么单独一个模块（而不是留在 llm-task-manager 里）：
//   登记 conversation_file 的副作用已抽成钩子（services/artifact-hooks.ts），
//   而 workflow 交付路径也要用同一个推断 —— 两边各留一份必然漂移
//   （表现为「同一种文件，对话里登记的 mime 与工作流交付的不一致」）。
export function guessMime(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
    mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
    pdf: 'application/pdf', json: 'application/json', csv: 'text/csv',
    md: 'text/markdown', txt: 'text/plain', html: 'text/html', srt: 'application/x-subrip',
    // 办公文档（file_to_markdown / doyz 产出常见）
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  return map[ext] || 'application/octet-stream';
}