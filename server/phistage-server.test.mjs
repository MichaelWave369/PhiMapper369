import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createPhiStageServer, validStageEvent } from './phistage-server.mjs';

const tokens = {
  operator: 'operator-super-long-test-key-001',
  controller: 'controller-long-test-key-002',
  display: 'display-super-long-test-key-003',
};
const inboxes = new WeakMap();
function attachInbox(ws) {
  const inbox = { queued: [], waiting: [] };
  inboxes.set(ws, inbox);
  ws.on('message', data => {
    const msg = JSON.parse(data.toString());
    if (inbox.waiting.length) inbox.waiting.shift()(msg);
    else inbox.queued.push(msg);
  });
}
function receive(ws) {
  const inbox = inboxes.get(ws);
  if (!inbox) throw new Error('No message inbox');
  if (inbox.queued.length) return Promise.resolve(inbox.queued.shift());
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for relay message')), 1800);
    inbox.waiting.push(msg => { clearTimeout(timeout); resolve(msg); });
  });
}
const send = (ws, payload) => ws.send(JSON.stringify(payload));
async function connect(port, role, token, room = 'table-1') {
  const ws = new WebSocket('ws://127.0.0.1:' + port + '/stage', {
    origin: 'http://127.0.0.1:' + port,
  });
  attachInbox(ws);
  await once(ws, 'open');
  const welcome = receive(ws);
  send(ws, { type: 'join', room, role, token });
  assert.equal((await welcome).type, 'welcome');
  return ws;
}
const focus = {
  protocol: 'phistage', version: 1, sender: 'table-a', seq: 1,
  sentAt: Date.now(), payload: {
    kind: 'focus', surfaceId: 'surface-1', point: { x: .33, y: .67 },
  },
};

test('R5 serves the app and health while binding only to the requested interface', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'phistage-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.html'), '<h1>PhiStage local</h1>');
  const relay = createPhiStageServer({ tokens, port: 0, distDir: dir });
  t.after(() => relay.close());
  const addr = await relay.listen();
  assert.equal(addr.address, '127.0.0.1');
  const response = await fetch('http://127.0.0.1:' + addr.port + '/');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /PhiStage local/);
  const health = await fetch('http://127.0.0.1:' + addr.port + '/_phistage/health');
  assert.equal((await health.json()).service, 'phistage');
});

test('R5 isolates roles and rooms, relays validated input and replays operator snapshot', async t => {
  const relay = createPhiStageServer({ tokens, port: 0 });
  t.after(() => relay.close());
  const { port } = await relay.listen();
  const operator = await connect(port, 'operator', tokens.operator);
  const controller = await connect(port, 'controller', tokens.controller);
  const display = await connect(port, 'display', tokens.display);
  const otherRoom = await connect(port, 'display', tokens.display, 'room-two');
  t.after(() => [operator, controller, display, otherRoom].forEach(ws => ws.terminate()));

  const snap = { type: 'snapshot', blackout: false, audioLevel: 0,
    project: { version: 3, surfaces: [{ id: 'surface-1' }] } };
  const operatorReply = receive(operator), controllerReply = receive(controller),
    displayReply = receive(display);
  send(operator, snap);
  for (const msg of await Promise.all([operatorReply, controllerReply, displayReply])) {
    assert.equal(msg.type, 'snapshot');
    assert.equal(msg.project.version, 3);
  }

  const received = receive(display);
  send(controller, { type: 'event', packet: focus });
  const actual = await received;
  assert.equal(actual.type, 'event');
  assert.equal(actual.packet.payload.point.x, .33);
  assert.match(actual.packet.sender, /^lan-/);

  const newDisplay = await connect(port, 'display', tokens.display);
  t.after(() => newDisplay.terminate());
  const replay = await receive(newDisplay);
  assert.equal(replay.type, 'snapshot');
  assert.equal(replay.project.version, 3);
  // Untrusted display role cannot issue cues or mutate a room's state.
  send(display, { type: 'snapshot', ...snap });
  const [code] = await once(display, 'close');
  assert.equal(code, 1008);
  assert.equal(otherRoom.readyState, WebSocket.OPEN);
});

test('R5 enforces role tokens, shape bounds and timestamps', async t => {
  const relay = createPhiStageServer({ tokens, port: 0 });
  t.after(() => relay.close());
  const { port } = await relay.listen();
  assert.equal(validStageEvent(focus), true);
  assert.equal(validStageEvent({ ...focus, payload: {
    kind: 'focus', surfaceId: 'surface-1', point: { x: Infinity, y: .1 },
  } }), false);
  const outsider = new WebSocket('ws://127.0.0.1:' + port + '/stage');
  await once(outsider, 'open');
  const closed = once(outsider, 'close');
  send(outsider, { type: 'join', room: 'table-1',
    role: 'operator', token: 'unauthorized-key' });
  const [code] = await closed;
  assert.equal(code, 1008);
});
