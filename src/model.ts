export type Point = { x: number; y: number };
export type Corners = [Point, Point, Point, Point];
export type VisualMode = 'demo' | 'grid' | 'checker' | 'media';
export type SceneId = 'gears' | 'tunnel' | 'bubbles' | 'lattice';
export const SCENES: { id: SceneId; label: string; description: string }[] = [
  { id: 'gears', label: 'Nested Gear', description: 'Φ Engine classic' },
  { id: 'tunnel', label: 'Infinity Tunnel', description: 'Depth vortex' },
  { id: 'bubbles', label: 'Bubble Field', description: 'Floating bubbles' },
  { id: 'lattice', label: 'Light Lattice', description: 'Kinetic geometry' },
];
export const SCENE_IDS = SCENES.map(s => s.id);
export type CueId = 'chamber' | 'portal' | 'dream' | 'gridline';
export const CUES: { id: CueId; label: string; scene: SceneId }[] = [
  { id: 'chamber', label: 'Gear Chamber', scene: 'gears' },
  { id: 'portal', label: 'Portal Shift', scene: 'tunnel' },
  { id: 'dream', label: 'Bubble Dream', scene: 'bubbles' },
  { id: 'gridline', label: 'Light Grid', scene: 'lattice' },
];
export type MediaKind = 'image' | 'video' | null;
export type MaskShape = 'quad' | 'ellipse';
export type Surface = {
  id: string;
  name: string;
  corners: Corners;
  mode: VisualMode;
  scene: SceneId;
  speed: number;
  reactivity: number;
  opacity: number;
  visible: boolean;
  mask: MaskShape;
  feather: number;
};
export type Project = {
  version: 3;
  name: string;
  surfaces: Surface[];
  selectedId: string;
  width: number;
  height: number;
  muted: boolean;
  mediaName: string;
};
export const MAX_SURFACES = 6;
export const STORAGE_KEY = 'phimapper369.project.r3';
export const LEGACY_STORAGE_KEY = 'phimapper369.project.r1';
export const LEGACY_R2_STORAGE_KEY = 'phimapper369.project.r2';
export const DEFAULT_CORNERS: Corners = [
  { x: 0.12, y: 0.14 },
  { x: 0.88, y: 0.14 },
  { x: 0.88, y: 0.86 },
  { x: 0.12, y: 0.86 },
];
export const constrain = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const cloneProject = (p: Project): Project => JSON.parse(JSON.stringify(p)) as Project;

export function newSurface(index: number, mode: VisualMode = 'demo'): Surface {
  const offset = Math.min(index * 0.035, 0.12);
  return {
    id: 'surface-' + index + '-' + Math.random().toString(36).slice(2, 9),
    name: 'Surface ' + index,
    corners: DEFAULT_CORNERS.map(p => ({ x: constrain(p.x + offset, 0, 1),
      y: constrain(p.y + offset, 0, 1) })) as Corners,
    mode,
    scene: 'gears',
    speed: 1,
    reactivity: 1,
    opacity: 1,
    visible: true,
    mask: 'quad',
    feather: 0,
  };
}
export function defaultProject(): Project {
  const s = newSurface(1);
  s.id = 'surface-1';
  s.name = 'Main Projection';
  return {
    version: 3, name: 'Living Geometry',
    surfaces: [s], selectedId: s.id,
    width: 1920, height: 1080, muted: true, mediaName: '',
  };
}

function parseCorners(raw: unknown): Corners {
  if (!Array.isArray(raw) || raw.length !== 4) throw new Error('Four calibration corners are required.');
  return raw.map(p => {
    if (!p || typeof p !== 'object') throw new Error('Invalid calibration point.');
    const v = p as Record<string, unknown>;
    if (typeof v.x !== 'number' || typeof v.y !== 'number' ||
      !Number.isFinite(v.x) || !Number.isFinite(v.y) ||
      v.x < 0 || v.x > 1 || v.y < 0 || v.y > 1) {
      throw new Error('Calibration points must be within the projector output.');
    }
    return { x: v.x, y: v.y };
  }) as Corners;
}
function parseSurface(input: unknown): Surface {
  if (!input || typeof input !== 'object') throw new Error('Invalid surface.');
  const v = input as Record<string, unknown>;
  const allowedModes: VisualMode[] = ['demo', 'grid', 'checker', 'media'];
  if (!allowedModes.includes(v.mode as VisualMode)) throw new Error('Unsupported surface content.');
  if (typeof v.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(v.id)) {
    throw new Error('Invalid surface ID.');
  }
  if (typeof v.opacity !== 'number' || !Number.isFinite(v.opacity)) {
    throw new Error('Invalid surface opacity.');
  }
  const mask: MaskShape = v.mask === 'ellipse' ? 'ellipse' : 'quad';
  return {
    id: v.id,
    name: typeof v.name === 'string' ? v.name.slice(0, 80) : 'Surface',
    corners: parseCorners(v.corners),
    mode: v.mode as VisualMode,
    scene: SCENE_IDS.includes(v.scene as SceneId) ? v.scene as SceneId : 'gears',
    speed: typeof v.speed === 'number' && Number.isFinite(v.speed)
      ? constrain(v.speed, 0, 3) : 1,
    reactivity: typeof v.reactivity === 'number' && Number.isFinite(v.reactivity)
      ? constrain(v.reactivity, 0, 2) : 1,
    opacity: constrain(v.opacity, 0, 1),
    visible: v.visible !== false,
    mask,
    feather: typeof v.feather === 'number' && Number.isFinite(v.feather)
      ? constrain(v.feather, 0, 0.25) : 0,
  };
}
export function parseProject(raw: unknown): Project {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid project file.');
  const v = raw as Record<string, unknown>;
  let surfaces: Surface[];
  if (v.version === 1) {
    // Automatically upgrade First Light R1 JSON and cached browser projects.
    surfaces = [parseSurface({
      id: 'surface-1', name: 'Main Projection', corners: v.corners,
      mode: v.mode, opacity: v.opacity, visible: true, mask: 'quad', feather: 0,
    })];
  } else if (v.version === 2 || v.version === 3) {
    if (!Array.isArray(v.surfaces) || v.surfaces.length < 1 ||
      v.surfaces.length > MAX_SURFACES) {
      throw new Error('Projects require 1 to ' + MAX_SURFACES + ' surfaces.');
    }
    surfaces = v.surfaces.map(parseSurface);
    if (new Set(surfaces.map(s => s.id)).size !== surfaces.length) {
      throw new Error('Surface IDs must be unique.');
    }
  } else {
    throw new Error('Unsupported project version.');
  }
  if (typeof v.width !== 'number' || typeof v.height !== 'number' ||
    !Number.isInteger(v.width) || !Number.isInteger(v.height) ||
    v.width < 320 || v.height < 240 || v.width > 7680 || v.height > 4320) {
    throw new Error('Invalid projector resolution.');
  }
  const selectedId = typeof v.selectedId === 'string' &&
    surfaces.some(s => s.id === v.selectedId) ? v.selectedId : surfaces[0].id;
  return {
    version: 3,
    name: typeof v.name === 'string' ? v.name.slice(0, 80) : 'Imported Project',
    surfaces, selectedId, width: v.width, height: v.height,
    muted: v.muted !== false,
    mediaName: typeof v.mediaName === 'string' ? v.mediaName.slice(0, 250) : '',
  };
}
export function readStoredProject(): Project {
  for (const key of [STORAGE_KEY, LEGACY_R2_STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    try {
      const data = localStorage.getItem(key);
      if (data) return parseProject(JSON.parse(data) as unknown);
    } catch { /* Ignore corrupt and restricted storage. */ }
  }
  return defaultProject();
}
export function saveStoredProject(project: Project): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); }
  catch { /* Private mode may not support storage. */ }
}
export function downloadProject(project: Project): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = (project.name.trim().replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-|-$/g, '') || 'phimapper') + '.phimap.json';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function selectedSurface(project: Project): Surface {
  return project.surfaces.find(s => s.id === project.selectedId) || project.surfaces[0];
}
export function patchSurface(project: Project, id: string, changes: Partial<Surface>): Project {
  return { ...project, surfaces: project.surfaces.map(s => s.id === id
    ? { ...s, ...changes, id: s.id } : s) };
}
export function reorderSurface(project: Project, id: string, direction: -1 | 1): Project {
  const items = [...project.surfaces];
  const index = items.findIndex(s => s.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return project;
  [items[index], items[target]] = [items[target], items[index]];
  return { ...project, surfaces: items };
}

/** Switch the visual scene across procedural surfaces; calibration and media remain untouched. */
export function cueScene(project: Project, id: CueId): Project {
  const cue = CUES.find(item => item.id === id);
  if (!cue) return project;
  return {
    ...project,
    surfaces: project.surfaces.map(surface => surface.mode === 'demo'
      ? { ...surface, scene: cue.scene } : surface),
  };
}
