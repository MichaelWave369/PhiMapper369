export type Point = { x: number; y: number };
export type Corners = [Point, Point, Point, Point];
export type VisualMode = 'demo' | 'grid' | 'checker' | 'media';
export type MediaKind = 'image' | 'video' | null;

export type Project = {
  version: 1;
  name: string;
  corners: Corners;
  mode: VisualMode;
  opacity: number;
  width: number;
  height: number;
  muted: boolean;
  mediaName: string;
};

export const STORAGE_KEY = 'phimapper369.project.r1';
export const DEFAULT_CORNERS: Corners = [
  { x: 0.12, y: 0.14 },
  { x: 0.88, y: 0.14 },
  { x: 0.88, y: 0.86 },
  { x: 0.12, y: 0.86 },
];

export function defaultProject(): Project {
  return {
    version: 1,
    name: 'First Light',
    corners: DEFAULT_CORNERS.map(p => ({ ...p })) as Corners,
    mode: 'demo',
    opacity: 1,
    width: 1920,
    height: 1080,
    muted: true,
    mediaName: '',
  };
}

export function constrain(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function parseProject(value: unknown): Project {
  if (!value || typeof value !== 'object') throw new Error('Invalid project file.');
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || !Array.isArray(v.corners) || v.corners.length !== 4) {
    throw new Error('Unsupported project format.');
  }
  const corners = v.corners.map((p: unknown) => {
    if (!p || typeof p !== 'object') throw new Error('Invalid calibration points.');
    const point = p as Record<string, unknown>;
    if (typeof point.x !== 'number' || typeof point.y !== 'number' ||
      !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
      throw new Error('Calibration points must be within the projector output.');
    }
    return { x: point.x, y: point.y };
  }) as Corners;
  const modes: VisualMode[] = ['demo', 'grid', 'checker', 'media'];
  if (!modes.includes(v.mode as VisualMode)) throw new Error('Invalid visual mode.');
  if (typeof v.width !== 'number' || typeof v.height !== 'number' ||
      !Number.isInteger(v.width) || !Number.isInteger(v.height) ||
      v.width < 320 || v.height < 240 || v.width > 7680 || v.height > 4320) {
    throw new Error('Invalid projector resolution.');
  }
  return {
    version: 1,
    name: typeof v.name === 'string' ? v.name.slice(0, 80) : 'Imported Project',
    corners,
    mode: v.mode as VisualMode,
    opacity: typeof v.opacity === 'number' && Number.isFinite(v.opacity)
      ? constrain(v.opacity, 0, 1) : 1,
    width: v.width,
    height: v.height,
    muted: typeof v.muted === 'boolean' ? v.muted : true,
    mediaName: typeof v.mediaName === 'string' ? v.mediaName.slice(0, 250) : '',
  };
}

export function readStoredProject(): Project {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    return json ? parseProject(JSON.parse(json) as unknown) : defaultProject();
  } catch {
    return defaultProject();
  }
}

export function saveStoredProject(project: Project): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); }
  catch { /* Private-mode storage may be unavailable. Export still works. */ }
}

export function downloadProject(project: Project): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (project.name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'phimapper') + '.phimap.json';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
