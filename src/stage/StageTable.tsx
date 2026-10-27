import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { CUES, parseProject } from '../model';
import type { Point, Project } from '../model';
import { createStageBridge, EDITOR_CHANNEL } from './protocol';
import LanPanel from './LanPanel';
import { onLanSnapshot, publishLanEvent } from './lan';

type EditorSync = { type: 'SYNC'; project: unknown };

/** Standalone simulated tabletop, mounted at ?table=1. */
export default function StageTable() {
  const [project, setProject] = useState<Project | null>(null);
  const [surfaceId, setSurfaceId] = useState('');
  const [last, setLast] = useState<Point | null>(null);
  const [connected, setConnected] = useState(false);
  const busRef = useRef<ReturnType<typeof createStageBridge> | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bus = createStageBridge();
    busRef.current = bus;
    const editor = new BroadcastChannel(EDITOR_CHANNEL);
    editor.onmessage = (event: MessageEvent<EditorSync>) => {
      const msg = event.data;
      if (!msg || msg.type !== 'SYNC') return;
      try {
        const parsed = parseProject(msg.project);
        setProject(parsed);
        setSurfaceId(current => parsed.surfaces.some(s => s.id === current)
          ? current : parsed.selectedId);
        setConnected(true);
      } catch { /* Reject invalid editor updates. */ }
    };
    editor.postMessage({ type: 'REQUEST' });
    return () => { editor.close(); bus.close(); busRef.current = null; };
  }, []);

  useEffect(() => onLanSnapshot(snapshot => {
    try {
      const parsed = parseProject(snapshot.project);
      setProject(parsed);
      setSurfaceId(current => parsed.surfaces.some(s => s.id === current)
        ? current : parsed.selectedId);
      setConnected(true);
    } catch { /* Ignore malformed network snapshots. */ }
  }), []);

  const chosen = project?.surfaces.find(s => s.id === surfaceId) ?? project?.surfaces[0];
  const targetId = chosen?.id ?? 'surface-1';
  function sendFocus(event: PointerEvent<HTMLDivElement>) {
    const r = event.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const point = {
      x: Math.min(1, Math.max(0, (event.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (event.clientY - r.top) / r.height)),
    };
    setLast(point);
    busRef.current?.publish({ kind: 'focus', surfaceId: targetId, point });
    publishLanEvent({ kind: 'focus', surfaceId: targetId, point });
  }
  return (
    <div className="table-root">
      <header className="table-header">
        <div><strong>ΦTABLE / PHISTAGE</strong><small>R5 · LAN Surface Input</small></div>
        <a className="table-link" href={window.location.pathname}>Back to Mapper</a>
      </header>
      <div className="table-panel">
        <div className="table-top">
          <div><h1>Touch the field</h1>
            <p>Pointer coordinates drive the selected calibrated projector surface.</p></div>
          <label className="table-choice">Target surface
            <select aria-label="Target projector surface" value={chosen?.id ?? ''}
              disabled={!project} onChange={e => setSurfaceId(e.target.value)}>
              {!project && <option value="">Awaiting editor</option>}
              {project?.surfaces.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="table-touch" role="application" aria-label="PhiTable touch surface"
          onPointerDown={event => {
            event.currentTarget.setPointerCapture(event.pointerId);
            sendFocus(event);
          }}
          onPointerMove={event => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) sendFocus(event);
          }}
          onPointerUp={event => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}>
          <div className="table-grid" />
          <div className="table-rings" />
          <div className="table-cross">Φ</div>
          {last && <div className="table-pointer"
            style={{ left: (last.x * 100) + '%', top: (last.y * 100) + '%' }} />}
          <span className="table-coordinate">{last
            ? 'X ' + Math.round(last.x * 100) + '% · Y ' + Math.round(last.y * 100) + '%'
            : 'TOUCH / DRAG TO PROJECT'}</span>
        </div>
        <div className="table-cues">
          <span>Send live scene cue</span>
          {CUES.map(cue => (
            <button key={cue.id} onClick={() => {
              busRef.current?.publish({ kind: 'cue', cue: cue.id });
              publishLanEvent({ kind: 'cue', cue: cue.id });
            }}>{cue.label}</button>
          ))}
        </div>
        <p className="table-notice" role="status">
          {connected ? 'Editor synchronized. Focus uses the selected surface warp.' :
            'Open the main PhiMapper editor in another tab, then its projector output.'}
          {' '}R5 additionally supports separate devices using the optional PhiCore LAN relay.
          XR spatial anchors are not included yet.
        </p>
        <LanPanel role="controller" />
      </div>
    </div>
  );
}
