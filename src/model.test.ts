import { expect, it } from 'vitest';
import { defaultProject, parseProject } from './model';

it('round trips exported project JSON', () => {
  const data = defaultProject();
  expect(parseProject(JSON.parse(JSON.stringify(data)) as unknown)).toEqual(data);
});
it('rejects malformed calibration input', () => {
  const data = defaultProject();
  expect(() => parseProject({ ...data, corners: [{ x: Infinity, y: 0 }] })).toThrow();
});
