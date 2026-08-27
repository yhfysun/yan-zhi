import { v4 as uuid } from 'uuid';
import { db } from '../db.js';

export interface PeerRegistration {
  nodeId: string;
  name: string;
  baseUrl: string;
  kind?: string;
  capabilities?: string[];
  authToken?: string;
}

export interface PeerMessageInput {
  fromPeerId: string;
  toPeerId: string;
  content?: string;
  file?: unknown;
  senderName?: string;
}

function now() {
  return Date.now();
}

function rowToPeer(r: any) {
  return {
    id: r.id,
    nodeId: r.node_id,
    name: r.name,
    baseUrl: r.base_url,
    kind: r.kind,
    capabilities: r.capabilities_json ? safeParse(r.capabilities_json, []) : [],
    status: !!r.status,
    lastSeenAt: r.last_seen_at,
    createdAt: r.created_at,
  };
}

function rowToMessage(r: any) {
  return {
    id: r.id,
    fromPeerId: r.from_peer_id,
    toPeerId: r.to_peer_id,
    senderName: r.sender_name,
    content: r.content,
    file: r.file_json ? safeParse(r.file_json, null) : null,
    direction: r.direction,
    createdAt: r.created_at,
  };
}

function safeParse(value: string | null | undefined, fallback: unknown) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function upsertPeer(input: PeerRegistration, userId?: string) {
  if (!input.nodeId || !input.name || !input.baseUrl) {
    throw new Error('nodeId, name, baseUrl 为必填项');
  }
  const existing = db.prepare('SELECT id FROM chat_peer WHERE node_id = ?').get(input.nodeId) as any;
  const ts = now();
  if (existing) {
    db.prepare(
      `UPDATE chat_peer SET
        user_id = COALESCE(?, user_id),
        name = ?,
        base_url = ?,
        kind = ?,
        capabilities_json = ?,
        auth_token = ?,
        status = 1,
        last_seen_at = ?
       WHERE node_id = ?`,
    ).run(
      userId || null,
      input.name,
      input.baseUrl,
      input.kind || 'client',
      JSON.stringify(input.capabilities || []),
      input.authToken || null,
      ts,
      input.nodeId,
    );
    const row = db.prepare('SELECT * FROM chat_peer WHERE node_id = ?').get(input.nodeId);
    return rowToPeer(row);
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO chat_peer
      (id, user_id, node_id, name, base_url, kind, capabilities_json, auth_token, status, last_seen_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    id,
    userId || null,
    input.nodeId,
    input.name,
    input.baseUrl,
    input.kind || 'client',
    JSON.stringify(input.capabilities || []),
    input.authToken || null,
    ts,
    ts,
  );
  const row = db.prepare('SELECT * FROM chat_peer WHERE id = ?').get(id);
  return rowToPeer(row);
}

export function listPeers() {
  const rows = db.prepare(
    'SELECT * FROM chat_peer WHERE status = 1 ORDER BY last_seen_at DESC',
  ).all();
  return (rows as any[]).map(rowToPeer);
}

export function pingPeer(nodeId: string) {
  const r = db.prepare('UPDATE chat_peer SET status = 1, last_seen_at = ? WHERE node_id = ?').run(now(), nodeId);
  if (r.changes === 0) {
    throw new Error('节点不存在，请先注册');
  }
  return rowToPeer(db.prepare('SELECT * FROM chat_peer WHERE node_id = ?').get(nodeId));
}

export function sendPeerMessage(input: PeerMessageInput) {
  if (!input.fromPeerId || !input.toPeerId) {
    throw new Error('fromPeerId 和 toPeerId 为必填项');
  }
  const from = db.prepare('SELECT * FROM chat_peer WHERE node_id = ?').get(input.fromPeerId) as any;
  if (!from) {
    throw new Error(`发送节点未注册: ${input.fromPeerId}`);
  }
  const to = db.prepare('SELECT * FROM chat_peer WHERE node_id = ?').get(input.toPeerId) as any;
  if (!to) {
    throw new Error(`目标节点不存在: ${input.toPeerId}`);
  }
  const id = uuid();
  const ts = now();
  db.prepare(
    `INSERT INTO chat_message
      (id, from_peer_id, to_peer_id, sender_name, content, file_json, direction, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'incoming', ?)`,
  ).run(
    id,
    input.fromPeerId,
    input.toPeerId,
    input.senderName || from.name,
    input.content || null,
    input.file ? JSON.stringify(input.file) : null,
    ts,
  );
  return rowToMessage(db.prepare('SELECT * FROM chat_message WHERE id = ?').get(id));
}

export function pollPeerMessages(peerId: string, since = 0, limit = 100) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const safeSince = Math.max(Number(since) || 0, 0);
  const rows = db.prepare(
    `SELECT * FROM chat_message
     WHERE (to_peer_id = ? OR from_peer_id = ?) AND created_at > ?
     ORDER BY created_at ASC
     LIMIT ?`,
  ).all(peerId, peerId, safeSince, safeLimit);
  return (rows as any[]).map((row) => ({
    ...rowToMessage(row),
    direction: row.to_peer_id === peerId ? 'incoming' : 'outgoing',
  }));
}
