// 项目树 / 标签页的文件图标与配色。复用聊天输入区 @ 引用那套配色，代码类按语言再细分。
import type { Component } from 'vue';
import {
  Document, Folder, Files, Tickets, Memo, Box, VideoCamera, Headset, Picture,
} from '@element-plus/icons-vue';

export interface FileMeta { icon: Component; color: string }

const GROUP_META: Record<string, FileMeta> = {
  image: { icon: Picture, color: '#22c55e' },
  code: { icon: Document, color: '#3b82f6' },
  data: { icon: Tickets, color: '#10b981' },
  doc: { icon: Memo, color: '#f59e0b' },
  archive: { icon: Box, color: '#8b5cf6' },
  video: { icon: VideoCamera, color: '#ef4444' },
  audio: { icon: Headset, color: '#ec4899' },
  other: { icon: Files, color: '#94a3b8' },
};

/** 按语言着色，让 Java/Python/TS 在项目树里一眼可分 */
const LANG_COLOR: Record<string, string> = {
  java: '#e76f00', kotlin: '#a97bff', py: '#3572a5', python: '#3572a5',
  ts: '#3178c6', tsx: '#3178c6', js: '#f1e05a', jsx: '#f1e05a',
  vue: '#41b883', go: '#00add8', rs: '#dea584', cpp: '#f34b7d', c: '#555555',
  css: '#563d7c', scss: '#c6538c', html: '#e34c26', json: '#8bc9ff',
  yaml: '#cb171e', yml: '#cb171e', sql: '#e38c00', sh: '#89e051',
  md: '#9aa5b1', xml: '#f0a30a', gradle: '#02303a', properties: '#6b7280',
};

const EXT_GROUP: Record<string, string> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image', ico: 'image',
  csv: 'data', xlsx: 'data', xls: 'data', tsv: 'data',
  md: 'doc', txt: 'doc', pdf: 'doc', doc: 'doc', docx: 'doc', ppt: 'doc', pptx: 'doc', rtf: 'doc', log: 'doc',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive', bz2: 'archive', jar: 'archive', war: 'archive',
  mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video',
  mp3: 'audio', wav: 'audio', flac: 'audio', ogg: 'audio', m4a: 'audio',
};

export const FolderIcon = Folder;

export function fileMeta(name: string, isDir = false): FileMeta {
  if (isDir) return { icon: Folder, color: '#e0a458' };
  const base = (name || '').toLowerCase();
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1) : base;
  const group = EXT_GROUP[ext];
  if (group) return GROUP_META[group];
  const color = LANG_COLOR[ext];
  return { icon: Document, color: color || GROUP_META.other.color };
}
