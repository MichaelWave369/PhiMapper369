import { describe, expect, it } from 'vitest';
import { homographyFromQuad, inverse3x3, transform } from './homography';
import type { Corners } from '../model';

const square: Corners = [
  { x: 0, y: 0 }, { x: 1, y: 0 },
  { x: 1, y: 1 }, { x: 0, y: 1 },
];

describe('projective warp', () => {
  it('keeps unit square aligned', () => {
    const h = homographyFromQuad(square);
    expect(transform(h, { x: 0.32, y: 0.75 }).x).toBeCloseTo(0.32, 7);
    expect(transform(h, { x: 0.32, y: 0.75 }).y).toBeCloseTo(0.75, 7);
  });
  it('hits four arbitrary destination corners and supports inverse mapping', () => {
    const quad: Corners = [
      { x: 0.11, y: 0.22 }, { x: 0.87, y: 0.13 },
      { x: 0.75, y: 0.92 }, { x: 0.23, y: 0.82 },
    ];
    const h = homographyFromQuad(quad);
    const inv = inverse3x3(h);
    square.forEach((p, i) => {
      const q = transform(h, p);
      expect(q.x).toBeCloseTo(quad[i].x, 6);
      expect(q.y).toBeCloseTo(quad[i].y, 6);
      const roundtrip = transform(inv, q);
      expect(roundtrip.x).toBeCloseTo(p.x, 6);
      expect(roundtrip.y).toBeCloseTo(p.y, 6);
    });
  });
  it('rejects collapsed quads', () => {
    const collapsed: Corners = square.map(() => ({ x: 0.5, y: 0.5 })) as Corners;
    expect(() => homographyFromQuad(collapsed)).toThrow();
  });
});
