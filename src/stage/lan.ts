import type { Project } from '../model';
import { parseStagePacket } from './protocol';
import type { StagePacket, StagePayload } from './protocol';

export type LanRole = 'operator' | 'controller' | 'display';
export type LanStatus = {
  connected: boolean;
  role: LanRole | null;
  room: string;
  message: string;
};
export type LanSnapshot = { project: unknown; blackout: boolean; audioLevel: number };
let status: LanStatus = { connected: false, role: null,
  room: '', message: 'LAN disconnected (local R4 still works).' };
let socket: WebSocket | null = null;
let sequence = 0;
const sender = 'browser-' + Math.random().toString(36).slice(2);
const statusListeners = new Set<(s: LanStatus) => void>();
const eventListeners = new Set<(p: StagePacket) => void>();
const snapshotListeners = new Set<(s: LanSnapshot) => void>();

function update(next: LanStatus) {
  status = next;
  for (const f of statusListeners) f(status);
}
export function getLanStatus() { return status; }
export function onLanStatus(f: (s: LanStatus) => void) {
  statusListeners.add(f);
  f(status);
  return () => { statusListeners.delete(f); };
}
export function onLanEvent(f: (p: StagePacket) => void) {
  eventListeners.add(f);
  return () => { eventListeners.delete(f); };
}
export function onLanSnapshot(f: (s: LanSnapshot) => void) {
  snapshotListeners.add(f);
  return () => { snapshotListeners.delete(f); };
}
export function disconnectLan() {
  const prior = socket;
  socket = null;
  prior?.close();
  update({ connected: false, role: null, room: '',
    message: 'Disconnected. Local browser tabs still communicate.' });
}
export function connectLan(url: string, room: string, role: LanRole, token: string) {
  disconnectLan();
  try {
    const dest = new URL(url);
    if (!['ws:', 'wss:'].includes(dest.protocol) || dest.pathname !== '/stage' ||
        dest.username || dest.password || dest.search || dest.hash) {
      throw new Error('Use a ws:// or wss:// address ending in /stage.');
    }
    if (location.protocol === 'https:' && dest.protocol !== 'wss:') {
      throw new Error('HTTPS pages require wss://. Open the PhiStage locally hosted page for ws:// LAN.');
    }
    if (!/^[\w-]{1,40}$/.test(room) || token.length < 24) {
      throw new Error('Use a room ID and the complete role-specific key from your PhiCore terminal.');
    }
    const ws = new WebSocket(dest.href);
    socket = ws;
    update({ connected: false, role, room, message: 'Connecting to PhiCore…' });
    ws.onopen = () => {
      if (socket !== ws) return;
      ws.send(JSON.stringify({ type: 'join', room, role, token }));
    };
    ws.onmessage = event => {
      if (socket !== ws) return;
      let msg: unknown;
      try { msg = JSON.parse(event.data as string); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      const data = msg as Record<string, unknown>;
      if (data.type === 'welcome' && data.room === room && data.role === role) {
        update({ connected: true, role, room, message: 'Connected to PhiCore room ' + room });
      } else if (data.type === 'event') {
        const packet = parseStagePacket(data.packet);
        if (packet) for (const f of eventListeners) f(packet);
      } else if (data.type === 'snapshot' && data.blackout !== undefined) {
        const snapshot: LanSnapshot = {
          project: data.project, blackout: data.blackout === true,
          audioLevel: typeof data.audioLevel === 'number' && Number.isFinite(data.audioLevel)
            ? Math.max(0, Math.min(1, data.audioLevel)) : 0,
        };
        for (const f of snapshotListeners) f(snapshot);
      }
    };
    ws.onerror = () => {
      if (socket === ws) update({ ...status, connected: false,
        message: 'Could not connect. Check the address and trusted LAN.' });
    };
    ws.onclose = event => {
      if (socket !== ws) return;
      socket = null;
      update({ connected: false, role: null, room,
        message: event.code === 1008 ? 'Denied. Check role key, room availability or message policy.'
          : 'PhiCore connection closed. Local mode remains available.' });
    };
  } catch (error) {
    update({ connected: false, role: null, room,
      message: error instanceof Error ? error.message : 'Invalid connection.' });
  }
}
export function publishLanEvent(payload: StagePayload) {
  if (!socket || socket.readyState !== WebSocket.OPEN || !status.connected ||
      status.role === 'display') return;
  const packet: StagePacket = {
    protocol: 'phistage', version: 1, sender, seq: ++sequence,
    sentAt: Date.now(), payload,
  };
  socket.send(JSON.stringify({ type: 'event', packet }));
}
export function publishLanSnapshot(project: Project, blackout: boolean, audioLevel: number) {
  if (!socket || socket.readyState !== WebSocket.OPEN || !status.connected ||
      status.role !== 'operator') return;
  socket.send(JSON.stringify({ type: 'snapshot', project, blackout, audioLevel }));
}
