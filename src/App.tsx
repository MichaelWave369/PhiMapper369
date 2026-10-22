import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent, PointerEvent } from 'react';
import WarpCanvas from './render/WarpCanvas';
import type { Corners, MediaKind, Point, Project, Surface, VisualMode } from './model';
import {
  cloneProject, constrain, defaultProject, downloadProject, MAX_SURFACES,
  newSurface, parseProject, patchSurface, readStoredProject,
  reorderSurface, saveStoredProject, selectedSurface,
} from './model';

const PROJECTOR = new URLSearchParams(window.location.search).has('projector');
const CHANNEL = 'phimapper369-r2-live';
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
  { key: 'media', label: 'My media', description: 'Local photo or video' },
];
const NAMES = ['TOP LEFT', 'TOP RIGHT', 'BOTTOM RIGHT', 'BOTTOM LEFT'];
type SyncMessage = { type: 'SYNC'; project: Project; mediaUrl: string | null; mediaKind: MediaKind };
type RequestMessage = { type: 'REQUEST' };
type ChannelMessage = SyncMessage | RequestMessage;
type History = { past: Project[]; future: Project[] };
const HISTORY_LIMIT = 80;

function preset(which: 'split' | 'gallery'): Project {
  const p = defaultProject();
  if (which === 'split') {
    const left = newSurface(1, 'demo');
    left.name = 'Left Gallery';
    left.corners = [
      {x:.04,y:.08}, {x:.48,y:.08}, {x:.48,y:.92}, {x:.04,y:.92},
    ];
    const right = newSurface(2, 'checker');
    right.name = 'Right Gallery';
    right.corners = [
      {x:.52,y:.08}, {x:.96,y:.08}, {x:.96,y:.92}, {x:.52,y:.92},
    ];
    p.name = 'Dual Gallery';
    p.surfaces = [left, right];
    p.selectedId = right.id;
  } else {
    const modes: VisualMode[] = ['demo','checker','grid'];
    const names = ['Left Column', 'Center Column', 'Right Column'];
    p.name = 'Triple Gallery';
    p.surfaces = modes.map((mode, i) => {
      const s = newSurface(i+1, mode);
      s.name = names[i];
      const left = .03 + i * .33;
      const right = left + .30;
      s.corners = [
        {x:left,y:.14}, {x:right,y:.14}, {x:right,y:.86}, {x:left,y:.86},
      ];
      return s;
    });
    p.selectedId = p.surfaces[1].id;
  }
  return p;
}

export default function App() {
  const [project, setProject] = useState<Project>(readStoredProject);
  const projectRef = useRef(project);
  const history = useRef<History>({ past: [], future: [] });
  const [historyTick, setHistoryTick] = useState(0);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<MediaKind>(null);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [showReference, setShowReference] = useState(true);
  const [status, setStatus] = useState('Surface Composer ready.');
  const stageRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const mediaOwnedRef = useRef<string | null>(null);
  const referenceOwnedRef = useRef<string | null>(null);
  const snapshotRef = useRef({ project, mediaUrl, mediaKind });

  function remember() {
    const h = history.current;
    h.past.push(cloneProject(projectRef.current));
    if (h.past.length > HISTORY_LIMIT) h.past.shift();
    h.future = [];
    setHistoryTick(x => x+1);
  }
  function apply(next: Project, record = true) {
    if (JSON.stringify(next) === JSON.stringify(projectRef.current)) return;
    if (record) remember();
    projectRef.current = next;
    setProject(next);
  }
  function patchProject(changes: Partial<Project>) {
    apply({ ...projectRef.current, ...changes });
  }
  function patchActive(changes: Partial<Surface>) {
    const p = projectRef.current;
    apply(patchSurface(p, p.selectedId, changes));
  }
  function movePoint(index: number, point: Point, record = true) {
    const p = projectRef.current;
    const active = selectedSurface(p);
    const corners = active.corners.map((v, i) => i === index
      ? { x: constrain(point.x, 0, 1), y: constrain(point.y, 0, 1) } : v) as Corners;
    apply(patchSurface(p, p.selectedId, { corners }), record);
  }
  function undo() {
    const h = history.current;
    const prior = h.past.pop();
    if (!prior) return;
    h.future.push(cloneProject(projectRef.current));
    projectRef.current = prior;
    setProject(prior);
    setHistoryTick(x=>x+1);
    setStatus('Undo applied.');
  }
  function redo() {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(cloneProject(projectRef.current));
    projectRef.current = next;
    setProject(next);
    setHistoryTick(x=>x+1);
    setStatus('Redo applied.');
  }

  useEffect(() => {
    snapshotRef.current = { project, mediaUrl, mediaKind };
    if (!PROJECTOR) {
      saveStoredProject(project);
      channelRef.current?.postMessage({ type:'SYNC', project, mediaUrl, mediaKind } satisfies SyncMessage);
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
          const parsed = parseProject(msg.project);
          projectRef.current = parsed;
          setProject(parsed);
          setMediaUrl(typeof msg.mediaUrl === 'string' ? msg.mediaUrl : null);
          setMediaKind(msg.mediaKind === 'image' || msg.mediaKind === 'video' ? msg.mediaKind : null);
        } catch { /* Reject malformed channel updates. */ }
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

  useEffect(() => {
    if (PROJECTOR) return;
    const shortcut = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.closest('input,textarea,select') || target.isContentEditable)) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  function fromPointer(event: PointerEvent<HTMLButtonElement>, index: number) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    movePoint(index, {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    }, false);
  }
  function onHandleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.shiftKey ? .01 : .002;
    const delta: Record<string, Point> = {
      ArrowLeft: {x:-step,y:0}, ArrowRight: {x:step,y:0},
      ArrowUp: {x:0,y:-step}, ArrowDown: {x:0,y:step},
    };
    if (!(event.key in delta)) return;
    event.preventDefault();
    const d = delta[event.key];
    const p = selectedSurface(projectRef.current).corners[index];
    movePoint(index, {x:p.x+d.x, y:p.y+d.y});
  }
  function addSurface() {
    const p = projectRef.current;
    if (p.surfaces.length >= MAX_SURFACES) return;
    const s = newSurface(p.surfaces.length+1);
    apply({ ...p, surfaces: [...p.surfaces,s], selectedId:s.id });
    setStatus('New surface added. Drag its four corners to align.');
  }
  function duplicateSurface() {
    const p = projectRef.current;
    if (p.surfaces.length >= MAX_SURFACES) return;
    const active = selectedSurface(p);
    const clone: Surface = {
      ...active,
      id: newSurface(p.surfaces.length+1).id,
      name: active.name + ' Copy',
      corners: active.corners.map(pt => ({
        x: constrain(pt.x + .025, 0, 1), y: constrain(pt.y + .025, 0, 1),
      })) as Corners,
    };
    const index = p.surfaces.findIndex(s => s.id === p.selectedId);
    const surfaces = [...p.surfaces];
    surfaces.splice(index+1, 0, clone);
    apply({ ...p, surfaces, selectedId: clone.id });
    setStatus('Surface duplicated. Move it into its own mapped area.');
  }
  function removeActive() {
    const p = projectRef.current;
    if (p.surfaces.length <= 1) return;
    const surfaces = p.surfaces.filter(s => s.id !== p.selectedId);
    apply({ ...p, surfaces, selectedId: surfaces[surfaces.length-1].id });
    setStatus('Surface deleted. Use Undo to restore it.');
  }
  function setSource(event: ChangeEvent<HTMLInputElement>, reference: boolean) {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const kind: MediaKind = file.type.startsWith('image/') ? 'image' :
      file.type.startsWith('video/') ? 'video' : null;
    if (!kind || (reference && kind !== 'image')) {
      setStatus('Select a supported image or video.');
      return;
    }
    const url = URL.createObjectURL(file);
    if (reference) {
      if (referenceOwnedRef.current) URL.revokeObjectURL(referenceOwnedRef.current);
      referenceOwnedRef.current = url;
      setReferenceUrl(url);
      setShowReference(true);
      setStatus('Reference photo loaded. Adjust the active surface corners.');
    } else {
      if (mediaOwnedRef.current) URL.revokeObjectURL(mediaOwnedRef.current);
      mediaOwnedRef.current = url;
      setMediaUrl(url);
      setMediaKind(kind);
      const p = projectRef.current;
      apply(patchSurface({ ...p, mediaName:file.name }, p.selectedId, { mode:'media' }));
      setStatus(file.name + ' loaded locally. Media source is shared between surfaces.');
    }
  }
  async function importProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      const data = parseProject(JSON.parse(await file.text()) as unknown);
      apply(data);
      setMediaUrl(null); setMediaKind(null);
      if (mediaOwnedRef.current) URL.revokeObjectURL(mediaOwnedRef.current);
      mediaOwnedRef.current = null;
      setStatus('Project imported (R1 projects migrate automatically). Reattach media if needed.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Unable to read project file.');
    }
  }
  function openOutput() {
    const url = new URL(window.location.href);
    url.searchParams.set('projector','1');
    const win = window.open(url.toString(), 'PhiMapperProjector', 'popup=yes,width=1280,height=720');
    if (!win) {
      setStatus('Popup blocked. Allow popups on this site to open projector output.');
      return;
    }
    win.focus();
    setStatus('Move output to your second display, then press F to fullscreen.');
  }
  useEffect(() => {
    if (!PROJECTOR) return;
    const handle = (event: globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'f' || event.repeat) return;
      event.preventDefault();
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen().catch(() => {});
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);

  if (PROJECTOR) return (
    <div className="projector-root">
      <WarpCanvas className="projector-canvas" surfaces={project.surfaces}
        mediaUrl={mediaUrl} mediaKind={mediaKind} muted={true} />
      <div className="projector-toolbar">
        <span>ΦMapper · {project.surfaces.length} surfaces · {project.width} × {project.height}</span>
        <button onClick={() => {
          if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
          else document.exitFullscreen().catch(() => {});
        }}>Fullscreen (F)</button>
      </div>
    </div>
  );

  const active = selectedSurface(project);
  const activeIndex = project.surfaces.findIndex(s => s.id === project.selectedId);
  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;
  // Read historyTick to trigger rendering of undo/redo controls after history-only operations.
  void historyTick;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">Φ</div>
          <div><strong>PhiMapper<span>369</span></strong><small>SPATIAL PROJECTION STUDIO</small></div>
        </div>
        <div className="header-right">
          <span className="release">R2 · SURFACE COMPOSER</span>
          <a className="header-link" href="https://github.com/MichaelWave369/PhiMapper369"
            target="_blank" rel="noreferrer">GitHub ↗</a>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar" aria-label="Mapping controls">
          <div className="sidebar-heading">
            <div className="eyebrow">PHIMAPPER / R2</div>
            <h1>Surface Composer</h1>
            <p>Layer multiple physical projections in one space.</p>
          </div>
          <section className="panel">
            <div className="panel-title"><span className="step">01</span> PROJECT</div>
            <label className="field-label" htmlFor="project-name">Project name</label>
            <input id="project-name" className="text-input" maxLength={80} value={project.name}
              onChange={e => patchProject({name:e.target.value})} />
            <div className="button-grid">
              <button className="secondary-button" onClick={() => {
                downloadProject(project);
                setStatus('Project exported as .phimap.json. Media is not embedded.');
              }}>↓ Export JSON</button>
              <label className="secondary-button file-button">↑ Import JSON
                <input type="file" accept=".json,application/json" onChange={importProject} />
              </label>
            </div>
            <div className="history-actions">
              <button disabled={!canUndo} onClick={undo} title="Undo (Ctrl/Cmd+Z)">↶ Undo</button>
              <button disabled={!canRedo} onClick={redo} title="Redo (Ctrl/Cmd+Shift+Z)">↷ Redo</button>
            </div>
          </section>

          <section className="panel" aria-label="Projection surfaces">
            <div className="panel-title"><span className="step">02</span>
              SURFACE STACK <span className="layer-count">{project.surfaces.length}/{MAX_SURFACES}</span></div>
            <p className="help-text">Top of list projects in front. Each surface has its own mapping and visual mode.</p>
            <div className="surface-list">
              {[...project.surfaces].reverse().map((s) => (
                <div className={`surface-row ${s.id === active.id ? 'selected' : ''}`}
                  key={s.id}>
                  <button className="surface-select"
                    aria-pressed={s.id === active.id}
                    onClick={() => apply({ ...projectRef.current, selectedId:s.id }, false)}>
                    <span className="surface-indicator">{s.visible ? '◈' : '◌'}</span>
                    <span className="surface-copy"><strong>{s.name}</strong>
                      <small>{MODES.find(m => m.key === s.mode)?.label} · {s.mask}</small>
                    </span>
                  </button>
                  <button className="surface-visibility"
                    aria-label={s.visible ? 'Hide '+s.name : 'Show '+s.name}
                    title={s.visible ? 'Hide surface' : 'Show surface'}
                    onClick={() => apply(patchSurface(projectRef.current, s.id, {visible:!s.visible}))}>
                    {s.visible ? '◉' : '◯'}
                  </button>
                </div>
              ))}
            </div>
            <div className="button-grid">
              <button className="secondary-button" disabled={project.surfaces.length >= MAX_SURFACES}
                onClick={addSurface}>＋ Add surface</button>
              <button className="secondary-button" disabled={project.surfaces.length >= MAX_SURFACES}
                onClick={duplicateSurface}>⧉ Duplicate</button>
            </div>
            <div className="button-grid">
              <button className="secondary-button" disabled={activeIndex === project.surfaces.length-1}
                onClick={() => apply(reorderSurface(projectRef.current, active.id, 1))}>↑ Bring forward</button>
              <button className="secondary-button" disabled={activeIndex === 0}
                onClick={() => apply(reorderSurface(projectRef.current, active.id, -1))}>↓ Send backward</button>
            </div>
            <button className="text-button danger" disabled={project.surfaces.length <= 1}
              onClick={removeActive}>− Remove selected surface</button>
            <div className="preset-area">
              <span className="field-label">Starter layouts</span>
              <div className="button-grid">
                <button className="secondary-button" onClick={() => apply(preset('split'))}>Dual Gallery</button>
                <button className="secondary-button" onClick={() => apply(preset('gallery'))}>Triple Gallery</button>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-title"><span className="step">03</span> SELECTED SURFACE</div>
            <label className="field-label" htmlFor="surface-name">Surface label</label>
            <input id="surface-name" className="text-input" maxLength={80} value={active.name}
              onChange={e => patchActive({name:e.target.value})} />
            <div className="field-label surface-setting">Visual source</div>
            <div className="mode-grid">
              {MODES.map(m => (
                <button key={m.key} className={`mode-button ${active.mode===m.key ? 'active':''}`}
                  onClick={() => patchActive({mode:m.key})}>
                  <span>{m.label}</span><small>{m.description}</small>
                </button>
              ))}
            </div>
            <label className="secondary-button file-button upload">＋ Load shared photo or video
              <input type="file" accept="image/*,video/*" onChange={e=>setSource(e,false)} />
            </label>
            <div className="media-filename">{project.mediaName || 'No media loaded · Procedural content available'}</div>
            <small className="help-text">R2 media is shared among surfaces set to My media. Source files are local and must be reattached after reload.</small>
            <div className="field-label surface-setting">Mask shape</div>
            <select value={active.mask} onChange={e => patchActive({mask:e.target.value === 'ellipse' ? 'ellipse':'quad'})}>
              <option value="quad">Full four-corner surface</option>
              <option value="ellipse">Ellipse / circle cutout</option>
            </select>
            <div className="slider-label"><span>Edge feather</span>
              <strong>{Math.round(active.feather * 400)}%</strong></div>
            <input type="range" min="0" max="25" step="1" value={active.feather * 100}
              onChange={e => patchActive({feather:Number(e.target.value)/100})} />
            <div className="slider-label"><span>Opacity</span>
              <strong>{Math.round(active.opacity*100)}%</strong></div>
            <input type="range" min="0" max="100" step="1" value={active.opacity*100}
              onChange={e => patchActive({opacity:Number(e.target.value)/100})} />
          </section>

          <section className="panel">
            <div className="panel-title"><span className="step">04</span> ALIGNMENT</div>
            <label className="secondary-button file-button upload">▧ Load reference photo
              <input type="file" accept="image/*" onChange={e=>setSource(e,true)} />
            </label>
            {referenceUrl && (
              <label className="check-row"><input type="checkbox" checked={showReference}
                onChange={e=>setShowReference(e.target.checked)} />Show reference overlay</label>
            )}
            <p className="point-label">Drag the numbered corners for <strong>{active.name}</strong>.</p>
            <div className="coords">
              {active.corners.map((p,i)=>(
                <div className="coord" key={i}><span>{i+1} · {NAMES[i]}</span>
                  <strong>{Math.round(p.x*100)}% / {Math.round(p.y*100)}%</strong></div>
              ))}
            </div>
            <button className="text-button" onClick={() => patchActive({corners:defaultProject().surfaces[0].corners})}>
              ↺ Reset selected warp</button>
          </section>

          <section className="panel">
            <div className="panel-title"><span className="step">05</span> PROJECTOR</div>
            <label className="field-label" htmlFor="resolution">Output aspect preset</label>
            <select id="resolution" value={project.width+'x'+project.height} onChange={e=>{
              const p=PRESETS.find(x=>x.width+'x'+x.height===e.target.value);
              if(p) patchProject({width:p.width,height:p.height});
            }}>
              {PRESETS.map(p=><option key={p.name}
                value={p.width+'x'+p.height}>{p.name}</option>)}
            </select>
            {mediaKind==='video' && <label className="check-row">
              <input type="checkbox" checked={project.muted}
                onChange={e=>patchProject({muted:e.target.checked})} />
              Mute video in editor</label>}
            <small className="help-text">Projector output is always muted. Presets set aspect ratio, not monitor hardware resolution.</small>
          </section>
          <button className="reset-all" onClick={() => apply(defaultProject())}>Restore First Light defaults</button>
        </aside>

        <main className="main-content">
          <div className="content-heading">
            <div><div className="eyebrow">LIVE WORKSPACE / {project.surfaces.length} SURFACE(S)</div>
              <h2>Surface Composer <span>↗</span></h2>
              <p>Each shape is a perspective-correct layer. Selected corners are editable.</p></div>
            <button className="primary-button" onClick={openOutput}>◉ Open Projector Output ↗</button>
          </div>
          <div className="stage-shell">
            <div className="stage-topline"><span><i className="live-dot"/> REAL-TIME MULTI-SURFACE</span>
              <span>{project.width} × {project.height} · {project.surfaces.filter(s=>s.visible).length} VISIBLE</span></div>
            <div className="stage-container">
              <div className="stage" ref={stageRef}
                style={{aspectRatio:project.width+' / '+project.height}}>
                <WarpCanvas surfaces={project.surfaces} mediaUrl={mediaUrl}
                  mediaKind={mediaKind} muted={project.muted} />
                {referenceUrl && showReference && <img className="reference-image"
                  src={referenceUrl} alt="Physical target photo alignment reference" />}
                <svg className="warp-guide" viewBox="0 0 1000 562.5"
                  preserveAspectRatio="none" aria-hidden="true">
                  {project.surfaces.map(s=>(
                    <polygon key={s.id}
                      className={s.id===active.id?'':'inactive-guide'}
                      points={s.corners.map(p=>p.x*1000+','+p.y*562.5).join(' ')} />
                  ))}
                </svg>
                {active.corners.map((p,i)=>(
                  <button key={i} type="button" className="corner-handle"
                    style={{left:p.x*100+'%', top:p.y*100+'%'}}
                    title={NAMES[i]}
                    aria-label={'Corner '+(i+1)+' '+NAMES[i]+' of '+active.name+
                      '. Arrow keys adjust, Shift+arrows for larger moves.'}
                    onPointerDown={event=>{
                      event.preventDefault();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      remember();
                      fromPointer(event,i);
                    }}
                    onPointerMove={event=>{
                      if(event.currentTarget.hasPointerCapture(event.pointerId)) fromPointer(event,i);
                    }}
                    onPointerUp={event=>{
                      if(event.currentTarget.hasPointerCapture(event.pointerId))
                        event.currentTarget.releasePointerCapture(event.pointerId);
                    }}
                    onKeyDown={event=>onHandleKey(event,i)}>{i+1}</button>
                ))}
                <span className="stage-watermark">ΦMAPPER369 / SURFACE COMPOSER R2</span>
              </div>
            </div>
            <div className="stage-footer">
              <span>◈ {project.surfaces.length} INDEPENDENT WARP LAYER(S)</span>
              <span>LOCAL-FIRST · WEBGL</span></div>
          </div>
          <div className="status-bar" role="status"><span className="status-symbol">●</span>{status}</div>
          <div className="instructions">
            <div><span className="instruction-number">01</span><strong>Create surfaces</strong>
              <p>Add a surface or load the Dual/Triple Gallery layout.</p></div>
            <div><span className="instruction-number">02</span><strong>Shape and mask</strong>
              <p>Set independent content, four-corner warp, ellipse mask and feathering.</p></div>
            <div><span className="instruction-number">03</span><strong>Project together</strong>
              <p>Open projector output on a second screen. Press F for fullscreen.</p></div>
          </div>
          <footer>PHIMAPPER369 · MIT OPEN SOURCE · SURFACE COMPOSER R2 ·
            MichaelWave369 creative ecosystem</footer>
        </main>
      </div>
    </div>
  );
}
