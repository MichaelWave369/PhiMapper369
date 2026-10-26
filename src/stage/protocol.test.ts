import { describe, expect, it } from 'vitest';
import { defaultProject } from '../model';
import { mapFocusToProjector, parseStagePacket } from './protocol';

const valid = {
  protocol: 'phistage', version: 1, sender: 'table-1', seq: 7,
  sentAt: 1000, payload: { kind: 'focus', surfaceId: 'surface-1',
    point: { x: .5, y: .25 } },
};
describe('PhiStage v1', () => {
  it('accepts valid focus and cue packets', () => {
    expect(parseStagePacket(valid)).toEqual(valid);
    expect(parseStagePacket({ ...valid,
      payload: { kind: 'cue', cue: 'portal' } })?.payload).toEqual({
      kind: 'cue', cue: 'portal',
    });
  });
  it('rejects invalid versions, payloads, and coordinates', () => {
    expect(parseStagePacket({ ...valid, version: 2 })).toBeNull();
    expect(parseStagePacket({ ...valid, seq: -1 })).toBeNull();
    expect(parseStagePacket({ ...valid, sender: '<script>' })).toBeNull();
    expect(parseStagePacket({ ...valid, payload: {
      kind: 'focus', surfaceId: 'surface-1', point: { x: NaN, y: 0 },
    } })).toBeNull();
    expect(parseStagePacket({ ...valid, payload: {
      kind: 'focus', surfaceId: 'surface-1', point: { x: 1.2, y: 0 },
    } })).toBeNull();
    expect(parseStagePacket({ ...valid,
      payload: { kind: 'cue', cue: 'execute' } })).toBeNull();
  });
  it('maps surface-local coordinates with the existing projective warp', () => {
    const s = defaultProject().surfaces[0];
    expect(mapFocusToProjector({ x: 0, y: 0 }, s)?.x).toBeCloseTo(.12);
    expect(mapFocusToProjector({ x: 0, y: 0 }, s)?.y).toBeCloseTo(.14);
    expect(mapFocusToProjector({ x: .5, y: .5 }, s)?.x).toBeCloseTo(.5);
  });
  it('handles invalid points or degenerate calibration', () => {
    const s = defaultProject().surfaces[0];
    expect(mapFocusToProjector({ x: -1, y: .5 }, s)).toBeNull();
    s.corners = [s.corners[0], s.corners[0], s.corners[0], s.corners[0]];
    expect(mapFocusToProjector({ x: .5, y: .5 }, s)).toBeNull();
  });
});
