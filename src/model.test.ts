import { expect, describe, it } from 'vitest';
import { defaultProject, parseProject, MAX_SURFACES, patchSurface, reorderSurface, newSurface, cueScene, SCENES } from './model';
describe('R3 project format', () => {
  it('round trips project JSON', () => {
    const p = defaultProject();
    expect(parseProject(JSON.parse(JSON.stringify(p)) as unknown)).toEqual(p);
  });
  it('upgrades First Light v1 projects with four corner mapping', () => {
    const p = defaultProject();
    const legacy = {
      version: 1, name: 'R1', corners: p.surfaces[0].corners,
      mode: 'checker', opacity: 0.42, muted: true, width: 1920, height: 1080,
      mediaName: 'demo.mp4',
    };
    const upgraded = parseProject(legacy);
    expect(upgraded.version).toBe(3);
    expect(upgraded.surfaces[0].mode).toBe('checker');
    expect(upgraded.surfaces[0].opacity).toBeCloseTo(0.42);
    expect(upgraded.surfaces[0].corners).toEqual(legacy.corners);
  });
  it('rejects nonfinite coordinates, empty layer stacks and duplicate ids', () => {
    const p = defaultProject();
    expect(() => parseProject({ ...p, surfaces: [] })).toThrow();
    expect(() => parseProject({ ...p, surfaces: [{ ...p.surfaces[0],
      corners: [{ x: Infinity, y: 0 }] }] })).toThrow();
    expect(() => parseProject({ ...p, surfaces: [p.surfaces[0], p.surfaces[0]] })).toThrow();
    expect(() => parseProject({ ...p, surfaces: Array.from({ length: MAX_SURFACES + 1 },
      (_, i) => newSurface(i)) })).toThrow();
  });
  it('patches a single layer and moves layer stacking order', () => {
    const a = defaultProject();
    const b = newSurface(2);
    const project = { ...a, surfaces: [...a.surfaces, b] };
    const patched = patchSurface(project, b.id, { opacity: 0.5 });
    expect(patched.surfaces[0].opacity).toBe(1);
    expect(patched.surfaces[1].opacity).toBe(0.5);
    const reordered = reorderSurface(patched, b.id, -1);
    expect(reordered.surfaces[0].id).toBe(b.id);
    expect(reordered.surfaces[1].id).toBe(a.surfaces[0].id);
  });
});

it('upgrades R2 surfaces to four-scene R3 defaults without moving corners', () => {
  const p = defaultProject();
  const legacy = {
    ...p, version: 2, surfaces: p.surfaces.map(s => {
      const { scene: _scene, speed: _speed, reactivity: _reactivity, ...old } = s;
      void _scene; void _speed; void _reactivity;
      return old;
    }),
  };
  const upgraded = parseProject(legacy);
  expect(upgraded.version).toBe(3);
  expect(upgraded.surfaces[0].scene).toBe('gears');
  expect(upgraded.surfaces[0].speed).toBe(1);
  expect(upgraded.surfaces[0].reactivity).toBe(1);
  expect(upgraded.surfaces[0].corners).toEqual(p.surfaces[0].corners);
});

it('preserves R3 scenes across export/import and constrains extreme speed', () => {
  const p = defaultProject();
  p.surfaces[0].scene = 'tunnel';
  p.surfaces[0].speed = 2.3;
  p.surfaces[0].reactivity = 1.5;
  expect(parseProject(JSON.parse(JSON.stringify(p)) as unknown)).toEqual(p);
  const out = parseProject({ ...p, surfaces: [{ ...p.surfaces[0],
    scene: 'invalid', speed: Infinity, reactivity: 55 }] });
  expect(out.surfaces[0].scene).toBe('gears');
  expect(out.surfaces[0].speed).toBe(1);
  expect(out.surfaces[0].reactivity).toBe(2);
  expect(SCENES.length).toBe(4);
});

it('applies a cue only to procedural surfaces without touching geometry or media', () => {
  const p = defaultProject();
  const media = newSurface(2, 'media');
  media.scene = 'bubbles';
  p.surfaces.push(media);
  const cued = cueScene(p, 'portal');
  expect(cued.surfaces[0].scene).toBe('tunnel');
  expect(cued.surfaces[1].scene).toBe('bubbles');
  expect(cued.surfaces[0].corners).toEqual(p.surfaces[0].corners);
  expect(cued.surfaces[1].corners).toEqual(media.corners);
});
