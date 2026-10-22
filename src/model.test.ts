import { expect, describe, it } from 'vitest';
import { defaultProject, parseProject, MAX_SURFACES, patchSurface, reorderSurface, newSurface } from './model';
describe('R2 project format', () => {
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
    expect(upgraded.version).toBe(2);
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
