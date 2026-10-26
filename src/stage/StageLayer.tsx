import { useEffect, useState } from 'react';
import type { Surface } from '../model';
import { createStageBridge, mapFocusToProjector } from './protocol';
import { onLanEvent } from './lan';
import type { StagePayload } from './protocol';

type Focus = Extract<StagePayload, { kind: 'focus' }>;
type Props = { surfaces: Surface[]; blackout: boolean };

/** A projected focus marker above the mapped WebGL output. */
export default function StageLayer({ surfaces, blackout }: Props) {
  const [focus, setFocus] = useState<Focus | null>(null);
  useEffect(() => {
    const remote = onLanEvent(packet => {
      if (packet.payload.kind === 'focus') setFocus(packet.payload);
    });
    const bus = typeof BroadcastChannel !== 'undefined'
      ? createStageBridge(packet => {
          if (packet.payload.kind === 'focus') setFocus(packet.payload);
        }) : null;
    return () => { bus?.close(); remote(); };
  }, []);
  if (!focus || blackout) return null;
  const surface = surfaces.find(s => s.id === focus.surfaceId && s.visible);
  const position = surface && mapFocusToProjector(focus.point, surface);
  if (!position) return null;
  return (
    <div className="stage-layer" aria-hidden="true">
      <span className="stage-beacon" style={{
        left: (position.x * 100) + '%', top: (position.y * 100) + '%',
      }} />
    </div>
  );
}
