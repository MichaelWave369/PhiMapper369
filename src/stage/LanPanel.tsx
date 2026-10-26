import { useEffect, useState } from 'react';
import type { LanRole } from './lan';
import { connectLan, disconnectLan, getLanStatus, onLanStatus } from './lan';

export default function LanPanel({ role }: { role: LanRole }) {
  const [endpoint, setEndpoint] = useState(() =>
    (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/stage');
  const [room, setRoom] = useState('table-1');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState(getLanStatus);
  useEffect(() => onLanStatus(setStatus), []);
  const active = status.connected && status.role === role;
  return (
    <section className="lan-panel" aria-label="PhiCore LAN connection">
      <div className="lan-title">ΦCORE LAN RELAY · {role.toUpperCase()}</div>
      <p>Optional. Share a room over a trusted local network. Tokens remain in memory only.</p>
      <div className="lan-fields">
        <label>Relay WebSocket URL
          <input value={endpoint} onChange={e => setEndpoint(e.target.value)}
            autoComplete="off" spellCheck={false} aria-label="Relay WebSocket URL" />
        </label>
        <label>Room
          <input value={room} onChange={e => setRoom(e.target.value)}
            maxLength={40} aria-label="Relay room" autoComplete="off" />
        </label>
        <label>{role} key
          <input type="password" value={token} onChange={e => setToken(e.target.value)}
            aria-label={role + ' key'} autoComplete="off" />
        </label>
      </div>
      <div className="lan-actions">
        <button onClick={() => { connectLan(endpoint.trim(), room.trim(), role, token); setToken(''); }}>
          Connect as {role}</button>
        <button onClick={disconnectLan} disabled={!status.role}>Disconnect</button>
      </div>
      <small role="status" className={active ? 'lan-ok' : ''}>{status.message}</small>
      <p className="lan-warning">For ws:// on LAN, open the app from the PhiStage local HTTP server.
        Do not port-forward the relay. R5 has no encryption unless TLS is provided by a trusted proxy.</p>
    </section>
  );
}
