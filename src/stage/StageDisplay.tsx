import { useEffect, useState } from 'react';
import WarpCanvas from '../render/WarpCanvas';
import { defaultProject, parseProject } from '../model';
import type { Project } from '../model';
import StageLayer from './StageLayer';
import LanPanel from './LanPanel';
import { onLanSnapshot } from './lan';

/** Remote projector receiver. Run from a different machine using ?display=1. */
export default function StageDisplay() {
  const [project, setProject] = useState<Project>(defaultProject);
  const [blackout, setBlackout] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [synced, setSynced] = useState(false);
  useEffect(() => onLanSnapshot(snapshot => {
    try {
      setProject(parseProject(snapshot.project));
      setBlackout(snapshot.blackout);
      setPulse(snapshot.audioLevel);
      setSynced(true);
    } catch { /* Keep last good state. */ }
  }), []);
  return (
    <div className="stage-display-root">
      <div className="stage-display-canvas">
        <WarpCanvas className="projector-canvas" surfaces={project.surfaces}
          mediaUrl={null} mediaKind={null} muted={true}
          audioLevel={pulse} blackout={blackout} />
        <StageLayer surfaces={project.surfaces} blackout={blackout} />
      </div>
      <div className="stage-display-controls">
        <div className="stage-display-heading">
          <strong>ΦSTAGE · REMOTE PROJECTOR</strong>
          <span>{synced ? 'Snapshot received' : 'Waiting for editor snapshot'}</span>
          <button onClick={() => document.documentElement.requestFullscreen().catch(() => {})}>
            Fullscreen output</button>
        </div>
        <LanPanel role="display" />
      </div>
    </div>
  );
}
