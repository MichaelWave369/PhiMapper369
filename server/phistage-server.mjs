import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

const ROLE_NAMES = ['operator', 'controller', 'display'];
const CUES = ['chamber', 'portal', 'dream', 'gridline'];
const unit = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
const record = x => !!x && typeof x === 'object' && !Array.isArray(x);
const goodId = x => typeof x === 'string' && /^[\w-]{1,80}$/.test(x);
const goodRoom = x => typeof x === 'string' && /^[\w-]{1,40}$/.test(x);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json' };

export function validStageEvent(input) {
  if (!record(input) || input.protocol !== 'phistage' || input.version !== 1 ||
      !goodId(input.sender) || !Number.isSafeInteger(input.seq) || input.seq < 1 ||
      typeof input.sentAt !== 'number' || !Number.isFinite(input.sentAt) ||
      !record(input.payload)) return false;
  const p = input.payload;
  return p.kind === 'cue' ? CUES.includes(p.cue) :
    p.kind === 'focus' && goodId(p.surfaceId) &&
    record(p.point) && unit(p.point.x) && unit(p.point.y);
}

function sameSecret(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function send(client, message) {
  if (client.readyState === WebSocket.OPEN && client.bufferedAmount < 256_000) {
    client.send(JSON.stringify(message));
  }
}

export function createPhiStageServer({
  host = '127.0.0.1', port = 3690,
  distDir = resolve(fileURLToPath(new URL('../dist', import.meta.url))),
  tokens = {
    operator: randomBytes(24).toString('base64url'),
    controller: randomBytes(24).toString('base64url'),
    display: randomBytes(24).toString('base64url'),
  },
} = {}) {
  for (const role of ROLE_NAMES) {
    if (typeof tokens[role] !== 'string' || tokens[role].length < 24) {
      throw new Error('PhiStage requires separate >=24-character tokens for each role.');
    }
  }
  if (new Set(ROLE_NAMES.map(role => tokens[role])).size !== 3) {
    throw new Error('PhiStage role tokens must be different.');
  }
  const rooms = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 65_536,
    perMessageDeflate: false, clientTracking: true });

  function broadcast(room, message) {
    for (const client of room.clients) send(client, message);
  }
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/_phistage/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ service: 'phistage', version: 1, status: 'local' }));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405); res.end(); return;
    }
    let requested;
    try { requested = decodeURIComponent(pathname); }
    catch { res.writeHead(400); res.end(); return; }
    if (requested.includes('\0') || requested.split('/').includes('..')) {
      res.writeHead(400); res.end(); return;
    }
    const path = resolve(distDir, '.' + (requested === '/' ? '/index.html' : requested));
    const rel = relative(distDir, path);
    if (rel.startsWith('..') || rel.includes(sep + '..') || !MIME[extname(path)]) {
      res.writeHead(404); res.end(); return;
    }
    try {
      const info = await stat(path);
      if (!info.isFile()) throw new Error('not a file');
      const body = await readFile(path);
      res.writeHead(200, { 'Content-Type': MIME[extname(path)], 'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404); res.end('Build the app first: npm run build');
    }
  });

  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    const origin = req.headers.origin;
    let allowed = pathname === '/stage';
    if (origin) {
      try {
        const url = new URL(origin);
        allowed &&= ['http:', 'https:'].includes(url.protocol) &&
          url.host === req.headers.host;
      } catch { allowed = false; }
    }
    if (!allowed) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });

  wss.on('connection', ws => {
    let membership = null, seq = 0, intervalStart = Date.now(), count = 0;
    const clientId = 'lan-' + randomBytes(9).toString('hex');
    const joinTimer = setTimeout(() => { if (!membership) ws.close(1008, 'Join required'); }, 5000);
    ws.on('message', raw => {
      const now = Date.now();
      if (now - intervalStart >= 1000) { intervalStart = now; count = 0; }
      if (++count > 90) { ws.close(1008, 'Rate limit'); return; }
      let message;
      try { message = JSON.parse(raw.toString()); } catch { ws.close(1003, 'Invalid JSON'); return; }
      if (!record(message)) { ws.close(1003, 'Invalid packet'); return; }
      if (!membership) {
        if (message.type !== 'join' || !goodRoom(message.room) ||
            !ROLE_NAMES.includes(message.role) ||
            !sameSecret(message.token, tokens[message.role])) {
          ws.close(1008, 'Authorization rejected'); return;
        }
        if (!rooms.has(message.room)) {
          if (rooms.size >= 8) { ws.close(1008, 'Room limit'); return; }
          rooms.set(message.room, { clients: new Set(), snapshot: null, operator: null });
        }
        const room = rooms.get(message.room);
        if (room.clients.size >= 16 ||
            (message.role === 'operator' && room.operator)) {
          ws.close(1008, 'Room occupied'); return;
        }
        room.clients.add(ws);
        if (message.role === 'operator') room.operator = ws;
        membership = { roomName: message.room, role: message.role, room };
        clearTimeout(joinTimer);
        send(ws, { type: 'welcome', room: message.room, role: message.role, clientId });
        if (room.snapshot) send(ws, room.snapshot);
        return;
      }
      if (message.type === 'snapshot') {
        if (membership.role !== 'operator') { ws.close(1008, 'Forbidden'); return; }
        if (!record(message.project) || message.project.version !== 3 ||
            !Array.isArray(message.project.surfaces) ||
            message.project.surfaces.length < 1 || message.project.surfaces.length > 6 ||
            typeof message.blackout !== 'boolean') return;
        const snapshot = { type: 'snapshot', project: message.project,
          blackout: message.blackout, audioLevel: unit(message.audioLevel) ? message.audioLevel : 0 };
        membership.room.snapshot = snapshot;
        broadcast(membership.room, snapshot);
        return;
      }
      if (message.type !== 'event' || membership.role === 'display' ||
          !validStageEvent(message.packet) ||
          Math.abs(now - message.packet.sentAt) > 60_000 ||
          message.packet.seq <= seq) return;
      seq = message.packet.seq;
      const packet = { ...message.packet, sender: clientId };
      broadcast(membership.room, { type: 'event', packet });
    });
    ws.on('close', () => {
      clearTimeout(joinTimer);
      if (!membership) return;
      const room = membership.room;
      room.clients.delete(ws);
      if (room.operator === ws) room.operator = null;
      if (room.clients.size === 0) rooms.delete(membership.roomName);
    });
    ws.on('error', () => { /* Socket close cleans up membership. */ });
  });

  return {
    server, tokens,
    async listen() {
      await new Promise((ok, fail) => {
        server.once('error', fail);
        server.listen(port, host, () => { server.off('error', fail); ok(); });
      });
      return server.address();
    },
    async close() {
      for (const client of wss.clients) client.terminate();
      await new Promise(ok => wss.close(ok));
      await new Promise(ok => server.close(ok));
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.PHISTAGE_HOST || '127.0.0.1';
  const port = Number(process.env.PHISTAGE_PORT || 3690);
  const relay = createPhiStageServer({ host, port, tokens: {
    operator: process.env.PHISTAGE_OPERATOR_TOKEN || randomBytes(24).toString('base64url'),
    controller: process.env.PHISTAGE_CONTROLLER_TOKEN || randomBytes(24).toString('base64url'),
    display: process.env.PHISTAGE_DISPLAY_TOKEN || randomBytes(24).toString('base64url'),
  } });
  relay.listen().then(() => {
    console.log('PhiStage R5 server running at http://' + host + ':' + port);
    console.log('Use one room ID on all devices; keep these per-role keys private:');
    for (const role of ROLE_NAMES) console.log('  ' + role + ': ' + relay.tokens[role]);
    if (host !== '127.0.0.1' && host !== '::1') {
      console.warn('LAN mode is plain HTTP/WebSocket; only use on a trusted private network. Never port-forward.');
    }
  }).catch(error => { console.error(error); process.exitCode = 1; });
}
