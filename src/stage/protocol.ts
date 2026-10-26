import type { CueId, Point, Surface } from '../model';
import { homographyFromQuad, transform } from '../math/homography';

/** Surface-local coordinates: top-left is 0,0; right and down are positive. */
export const PHISTAGE_CHANNEL = 'phistage369.v1.local';
export const EDITOR_CHANNEL = 'phimapper369-r3-live';
export type StagePayload =
  | { kind: 'focus'; surfaceId: string; point: Point }
  | { kind: 'cue'; cue: CueId };
export type StagePacket = {
  protocol: 'phistage';
  version: 1;
  sender: string;
  seq: number;
  sentAt: number;
  payload: StagePayload;
};
const CUE_IDS: CueId[] = ['chamber', 'portal', 'dream', 'gridline'];
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const unit = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;

export function parseStagePacket(raw: unknown): StagePacket | null {
  if (!object(raw) || raw.protocol !== 'phistage' || raw.version !== 1 ||
      typeof raw.sender !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(raw.sender) ||
      typeof raw.seq !== 'number' || !Number.isSafeInteger(raw.seq) || raw.seq < 1 ||
      typeof raw.sentAt !== 'number' || !Number.isFinite(raw.sentAt) ||
      !object(raw.payload)) return null;
  const p = raw.payload;
  if (p.kind === 'cue' && CUE_IDS.includes(p.cue as CueId)) {
    return { protocol: 'phistage', version: 1, sender: raw.sender, seq: raw.seq,
      sentAt: raw.sentAt, payload: { kind: 'cue', cue: p.cue as CueId } };
  }
  if (p.kind === 'focus' && typeof p.surfaceId === 'string' &&
      /^[a-zA-Z0-9_-]{1,80}$/.test(p.surfaceId) && object(p.point) &&
      unit(p.point.x) && unit(p.point.y)) {
    return { protocol: 'phistage', version: 1, sender: raw.sender, seq: raw.seq,
      sentAt: raw.sentAt, payload: {
        kind: 'focus', surfaceId: p.surfaceId,
        point: { x: p.point.x, y: p.point.y },
      } };
  }
  return null;
}

/** Use precisely the same surface homography as the WebGL mapper. */
export function mapFocusToProjector(point: Point, surface: Surface): Point | null {
  if (!unit(point.x) || !unit(point.y)) return null;
  try {
    const p = transform(homographyFromQuad(surface.corners), point);
    return Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
  } catch {
    return null;
  }
}

export function createStageBridge(onPacket?: (packet: StagePacket) => void) {
  const sender = 'stage-' + Math.random().toString(36).slice(2);
  const seen = new Map<string, number>();
  let seq = 0;
  const channel = new BroadcastChannel(PHISTAGE_CHANNEL);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const packet = parseStagePacket(event.data);
    if (!packet || packet.sender === sender ||
        Math.abs(Date.now() - packet.sentAt) > 60000) return;
    if (packet.seq <= (seen.get(packet.sender) ?? 0)) return;
    seen.set(packet.sender, packet.seq);
    if (seen.size > 200) seen.clear();
    onPacket?.(packet);
  };
  return {
    publish(payload: StagePayload) {
      channel.postMessage({
        protocol: 'phistage', version: 1, sender, seq: ++seq,
        sentAt: Date.now(), payload,
      } satisfies StagePacket);
    },
    close() { channel.close(); },
  };
}
