import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent, PointerEvent } from 'react';
import WarpCanvas from './render/WarpCanvas';
import type { Corners, MediaKind, Point, Project, VisualMode } from './model';
import {
  constrain, defaultProject, downloadProject, parseProject, readStoredProject, saveStoredProject,
} from './model';

const PROJECTOR = new URLSearchParams(window.location.search).has('projector');
const CHANNEL = 'phimapper369-r1-live';
const PRESETS = [
  { name: 'Full HD 1920 × 1080', width: 1920, height: 1080 },
  { name: 'HD 1280 × 720', width: 1280, height: 720 },
  { name: 'XGA 1024 × 768', width: 1024, height: 768 },
  { name: '4K 3840 × 2160', width: 3840, height: 2160 },
];
const MODES: { key: VisualMode; label: string; description: string }[] = [
  { key: 'demo', label: 'Φ Engine', description: 'Living geometry' },
  { key: 'grid', label: 'Calibration', description: 'Grid + crosshairs' },
  { key: 'checker', label: 'Checker', description: 'Contrast pattern' },
  { key: 'media', label: 'My media', description: 'Photo or video' },
];
const NAMES = ['TOP LEFT', 'TOP RIGHT', 'BOTTOM RIGHT', 'BOTTOM LEFT'];

type SyncMessage = {
  type: 'SYNC';
  project: Project;
  mediaUrl: string | null;
  mediaKind: MediaKind;
};
type RequestMessage = { type: 'REQUEST' };
type ChannelMessage = SyncMessage | RequestMessage;

export default function App() {
  const [project, setProject] = useState<Project>(readStoredProject);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<MediaKind>(null);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [showReference, setShowReference] = useState(true);
  const [status, setStatus] = useState('Ready for first light.');
  const stageRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const mediaOwnedRef = useRef<string | null>(null);
  const referenceOwnedRef = useRef<string | null>(null);
  const snapshotRef = useRef({ project, mediaUrl, mediaKind });

  useEffect(() => {
    snapshotRef.current = { project, mediaUrl, mediaKind };
    if (!PROJECTOR) {
      saveStoredProject(project);
      channelRef.current?.postMessage({ type: 'SYNC', project, mediaUrl, mediaKind } satisfies SyncMessage);
    }
  }, [project, mediaUrl, mediaKind]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      if (PROJECTOR && msg.type === 'SYNC') {
        try {
          setProject(parseProject(msg.project));
          setMediaUrl(typeof msg.mediaUrl === 'string' ? msg.mediaUrl : null);
          setMediaKind(msg.mediaKind === 'image' || msg.mediaKind === 'video' ? msg.mediaKind : null);
        } catch { /* Reject malformed cross-window messages. */ }
      }
      if (!PROJECTOR && msg.type === 'REQUEST') {
        channel.postMessage({ type: 'SYNC', ...snapshotRef.current } satisfies SyncMessage);
      }
    };
    if (PROJECTOR) channel.postMessage({ type: 'REQUEST' } satisfies RequestMessage);
    return () => { channel.close(); channelRef.current = null; };
  }, []);

  useEffect(() => () => {
    if (mediaOwnedRef.current) URL.revokeObjectURL(mediaOwnedRef.current);
    if (referenceOwnedRef.current) URL.revokeObjectURL(referenceOwnedRef.current);
  }, []);

  function patch(patchFields: Partial<Project>) {
    setProject(prev => ({ ...prev, ...patchFields }));
  }

  function movePoint(index: number, point: Point) {
    setProject(prev => ({
      ...prev,
      corners: prev.corners.map((p, i) => i === index
        ? { x: constrain(point.x, 0, 1), y: constrain(point.y, 0, 1) }
        : p) as Corners,
    }));
  }

  function moveFromPointer(event: PointerEvent<HTMLButtonElement>, index: number) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    movePoint(index, {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    });
  }

  function onHandleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.shiftKey ? 0.01 : 0.002;
    const delta: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    if (!(event.key in delta)) return;
    event.preventDefault();
    const d = delta[event.key];
    const p = project.corners[index];
    movePoint(index, { x: p.x + d.x, y: p.y + d.y });
  }

  function setSource(event: ChangeEvent<HTMLInputElement>, reference: boolean) {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const kind: MediaKind = file.type.startsWith('image/') ? 'image' :
      file.type.startsWith('video/') ? 'video' : null;
    if (!kind || (reference && kind !== 'image')) {
      setStatus('Select a valid image or video file.');
      return;
    }
    const url = URL.createObjectURL(file);
    if (reference) {
      if (referenceOwnedRef.current) URL.revokeObjectURL(referenceOwnedRef.current);
      referenceOwnedRef.current = url;
      setReferenceUrl(url);
      setShowReference(true);
      setStatus('Reference photo loaded. Align the four corners to your target surface.');
    } else {
      if (mediaOwnedRef.current) URL.revokeObjectURL(mediaOwnedRef.current);
      mediaOwnedRef.current = url;
      setMediaUrl(url);
      setMediaKind(kind);
      patch({ mediaName: file.name, mode: 'media' });
      setStatus(file.name + ' loaded locally. Your file is not uploaded.');
    }
  }

  async function importProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      const data = parseProject(JSON.parse(await file.text()) as unknown);
      setProject(data);
      setMediaUrl(null);
      setMediaKind(null);
      if (mediaOwnedRef.current) URL.revokeObjectURL(mediaOwnedRef.current);
      mediaOwnedRef.current = null;
      setStatus('Project imported. Reattach media if it was used in the original session.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Unable to read project file.');
    }
  }

  function openOutput() {
    const url = new URL(window.location.href);
    url.searchParams.set('projector', '1');
    const win = window.open(url.toString(), 'PhiMapperProjector', 'popup=yes,width=1280,height=720');
    if (!win) {
      setStatus('The projector window was blocked. Allow popups for this site and retry.');
      return;
    }
    win.focus();
    setStatus('Projector window opened. Move it to the second screen and press F to fullscreen.');
  }

  useEffect(() => {
    if (!PROJECTOR) return;
    const keyboard = (event: globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() === 'f' && !event.repeat) {
        event.preventDefault();
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
        else document.exitFullscreen().catch(() => {});
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, []);

  if (PROJECTOR) {
    return (
      <div className="projector-root">
        <WarpCanvas
          className="projector-canvas"
          corners={project.corners}
          mode={project.mode}
          opacity={project.opacity}
          mediaUrl={mediaUrl}
          mediaKind={mediaKind}
          muted={true}
        />
        <div className="projector-toolbar">
          <span>ΦMapper · Output {project.width} × {project.height}</span>
          <button onClick={() => {
            if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
            else document.exitFullscreen().catch(() => {});
          }}>Fullscreen (F)</button>
        </div>
      </div>
    );
  }

  const polygon = project.corners.map(p => `${p.x * 1000},${p.y * 562.5}`).join(' ');

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">Φ</div>
          <div><strong>PhiMapper<span>369</span></strong><small>SPATIAL PROJECTION STUDIO</small></div>
        </div>
        <div className="header-right">
          <span className="release">R1 · FIRST LIGHT</span>
          <a className="header-link" href="https://github.com/MichaelWave369/PhiMapper369"
            target="_blank" rel="noreferrer">GitHub ↗</a>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="Mapping controls">
          <div className="sidebar-heading">
            <div className="eyebrow">SESSION 001</div>
            <h1>Mapping Studio</h1>
            <p>Shape light to fit the physical world.</p>
          </div>

          <section className="panel">
            <div className="panel-title"><span className="step">01</span> PROJECT</div>
            <label className="field-label" htmlFor="project-name">Project name</label>
            <input id="project-name" className="text-input" maxLength={80} value={project.name}
              onChange={e => patch({ name: e.target.value })} />
            <div className="button-grid">
              <button className="secondary-button" onClick={() => {
                downloadProject(project);
                setStatus('Project exported as .phimap.json (media is not embedded).');
              }}>↓ Export JSON</button>
              <label className="secondary-button file-button">↑ Import JSON
                <input type="file" accept=".json,.phimap.json,application/json"
                  onChange={importProject} />
              </label>
            </div>
          </section>

          <section className="panel">
            <div className="panel-title"><span className="step">02</span> CONTENT SOURCE</div>
            <div className="mode-grid">
              {MODES.map(item => (
                <button key={item.key}
                  className={`mode-button ${project.mode === item.key ? 'active' : ''}`}
                  onClick={() => patch({ mode: item.key })}>
                  <span>{item.label}</span><small>{item.description}</small>
                </button>
              ))}
            </div>
            <label className="secondary-button upload file-button">＋ Load video or image
              <input type="file" accept="image/*,video/*" onChange={e => setSource(e, false)} />
            </label>
            <div className="media-filename">{project.mediaName ||
              'No media loaded · Procedural demo is available'}</div>
            {mediaKind === 'video' && (
              <label className="check-row">
                <input type="checkbox" checked={project.muted}
                  onChange={e => patch({ muted: e.target.checked })} />
                Mute video in editor
              </label>
            )}
            <small className="help-text">Projector output is always muted in R1. Uploaded files stay on your device.</small>
          </section>

          <section className="panel">
            <div className="panel-title"><span className="step">03</span> SURFACE ALIGNMENT</div>
            <label className="secondary-button file-button upload">▧ Load reference photo
              <input type="file" accept="image/*" onChange={e => setSource(e, true)} />
            </label>
            {referenceUrl && (
              <label className="check-row">
                <input type="checkbox" checked={showReference}
                  onChange={e => setShowReference(e.target.checked)} />
                Show reference overlay
              </label>
            )}
            <div className="point-label">Drag the numbered corners to the matching physical surface.</div>
            <div className="coords">
              {project.corners.map((p, i) => (
                <div className="coord" key={i}><span>{i + 1} · {NAMES[i]}</span>
                  <strong>{Math.round(p.x * 100)}% / {Math.round(p.y * 100)}%</strong></div>
              ))}
            </div>
            <button className="text-button" onClick={() => patch({ corners: defaultProject().corners })}>
              ↺ Reset calibration
            </button>
          </section>

          <section className="panel">
            <div className="panel-title"><span className="step">04</span> OUTPUT</div>
            <label className="field-label" htmlFor="resolution">Projector resolution</label>
            <select id="resolution" value={project.width + 'x' + project.height}
              onChange={e => {
                const preset = PRESETS.find(p => p.width + 'x' + p.height === e.target.value);
                if (preset) patch({ width: preset.width, height: preset.height });
              }}>
              {PRESETS.map(p => <option key={p.name}
                value={p.width + 'x' + p.height}>{p.name}</option>)}
            </select>
            <div className="slider-label"><span>Brightness</span>
              <strong>{Math.round(project.opacity * 100)}%</strong></div>
            <input type="range" min="0" max="100" value={project.opacity * 100}
              onChange={e => patch({ opacity: Number(e.target.value) / 100 })} />
            <small className="help-text">Use your projector's own settings for actual lamp brightness.</small>
          </section>
          <button className="reset-all" onClick={() => {
            setProject(defaultProject());
            setStatus('Default project restored.');
          }}>Restore R1 defaults</button>
        </aside>

        <main className="main-content">
          <div className="content-heading">
            <div><div className="eyebrow">LIVE WORKSPACE / SURFACE 01</div>
              <h2>Projection Canvas <span>↗</span></h2>
              <p>Design with normalized coordinates. Live output follows every change.</p></div>
            <button className="primary-button" onClick={openOutput}>◉ Open Projector Output ↗</button>
          </div>

          <div className="stage-shell">
            <div className="stage-topline"><span><i className="live-dot" /> REAL-TIME PREVIEW</span>
              <span>{project.width} × {project.height} · {project.mode.toUpperCase()}</span></div>
            <div className="stage-container">
              <div className="stage" ref={stageRef}
                style={{ aspectRatio: `${project.width} / ${project.height}` }}>
                <WarpCanvas corners={project.corners} mode={project.mode}
                  opacity={project.opacity} mediaUrl={mediaUrl} mediaKind={mediaKind}
                  muted={project.muted} />
                {referenceUrl && showReference && (
                  <img className="reference-image" src={referenceUrl}
                    alt="Reference surface alignment overlay" />
                )}
                <svg className="warp-guide" viewBox="0 0 1000 562.5"
                  preserveAspectRatio="none" aria-hidden="true">
                  <polygon points={polygon} />
                </svg>
                {project.corners.map((p, i) => (
                  <button type="button" key={i} className="corner-handle"
                    style={{ left: p.x * 100 + '%', top: p.y * 100 + '%' }}
                    title={NAMES[i]} aria-label={`Corner ${i + 1} ${NAMES[i]}. Use arrow keys to adjust.`}
                    onPointerDown={e => {
                      e.preventDefault();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      moveFromPointer(e, i);
                    }}
                    onPointerMove={e => {
                      if (e.currentTarget.hasPointerCapture(e.pointerId)) moveFromPointer(e, i);
                    }}
                    onPointerUp={e => {
                      if (e.currentTarget.hasPointerCapture(e.pointerId))
                        e.currentTarget.releasePointerCapture(e.pointerId);
                    }}
                    onKeyDown={e => onHandleKey(e, i)}>{i + 1}</button>
                ))}
                <span className="stage-watermark">ΦMAPPER369 / FIRST LIGHT</span>
              </div>
            </div>
            <div className="stage-footer"><span>◈ 4-POINT PERSPECTIVE WARP</span>
              <span>LOCAL-FIRST · WEBGL</span></div>
          </div>

          <div className="status-bar" role="status"><span className="status-symbol">●</span>{status}</div>
          <div className="instructions">
            <div><span className="instruction-number">01</span><strong>Connect</strong>
              <p>Connect an external projector as an extended display.</p></div>
            <div><span className="instruction-number">02</span><strong>Calibrate</strong>
              <p>Choose Grid and drag the four corners while watching the real surface.</p></div>
            <div><span className="instruction-number">03</span><strong>Project</strong>
              <p>Move the output window onto the projector display, then press F.</p></div>
          </div>
          <footer>PHIMAPPER369 · MIT OPEN SOURCE · FIRST LIGHT R1 ·
            Built for the MichaelWave369 creative ecosystem</footer>
        </main>
      </div>
    </div>
  );
}
