import { describe, expect, it } from 'vitest';

import { hospitals } from '../../src/logic/data';
import { clampViewport, fitPoints, minScale, panBy, project, unproject, zoomAt, type Viewport } from '../../src/logic/mapView';
import { BANGKOK_BOUNDS, SIAM } from '../../src/logic/places';

const SIZE = { width: 360, height: 480 };
const VIEW: Viewport = { center: SIAM, scale: 2000 };

describe('project and unproject', () => {
  it('puts the centre in the middle of the view', () => {
    expect(project(SIAM, VIEW, SIZE)).toEqual({ x: 180, y: 240 });
  });

  it('puts north up and east right', () => {
    const north = project({ lat: SIAM.lat + 0.01, lng: SIAM.lng }, VIEW, SIZE);
    const east = project({ lat: SIAM.lat, lng: SIAM.lng + 0.01 }, VIEW, SIZE);
    expect(north.y).toBeLessThan(240);
    expect(east.x).toBeGreaterThan(180);
  });

  it('round-trips a point', () => {
    const p = { lat: 13.8, lng: 100.6 };
    const back = unproject(project(p, VIEW, SIZE), VIEW, SIZE);
    expect(back.lat).toBeCloseTo(p.lat, 9);
    expect(back.lng).toBeCloseTo(p.lng, 9);
  });
});

describe('fitPoints', () => {
  it('shows every hospital inside the padding', () => {
    const v = fitPoints(hospitals, SIZE, 40);
    for (const h of hospitals) {
      const { x, y } = project(h, v, SIZE);
      expect(x).toBeGreaterThanOrEqual(40 - 1e-6);
      expect(x).toBeLessThanOrEqual(SIZE.width - 40 + 1e-6);
      expect(y).toBeGreaterThanOrEqual(40 - 1e-6);
      expect(y).toBeLessThanOrEqual(SIZE.height - 40 + 1e-6);
    }
  });

  it('does not zoom in past the limit for a single point', () => {
    const v = fitPoints([SIAM], SIZE);
    expect(v.center).toEqual(SIAM);
    expect(Number.isFinite(v.scale)).toBe(true);
    expect(v.scale).toBe(clampViewport({ center: SIAM, scale: Infinity }, SIZE).scale);
  });

  it('shows the whole demo area with no points', () => {
    expect(fitPoints([], SIZE).scale).toBe(minScale(SIZE));
  });
});

describe('zoomAt', () => {
  it('keeps the map point under the focus still', () => {
    const focus = { x: 100, y: 300 };
    const before = unproject(focus, VIEW, SIZE);
    const after = unproject(focus, zoomAt(VIEW, 2, focus, SIZE), SIZE);
    expect(after.lat).toBeCloseTo(before.lat, 9);
    expect(after.lng).toBeCloseTo(before.lng, 9);
  });

  it('cannot zoom out past the whole demo area', () => {
    expect(zoomAt(VIEW, 0.0001, { x: 180, y: 240 }, SIZE).scale).toBe(minScale(SIZE));
  });
});

describe('panBy', () => {
  it('moves the map with the finger', () => {
    const v = panBy(VIEW, { x: 50, y: 0 }, SIZE);
    // Dragging right brings what was to the west into the middle.
    expect(v.center.lng).toBeLessThan(SIAM.lng);
    expect(project(SIAM, v, SIZE).x).toBeCloseTo(230, 9);
  });

  it('keeps the centre inside the demo area', () => {
    const v = panBy(VIEW, { x: -1e7, y: 1e7 }, SIZE);
    expect(v.center.lng).toBe(BANGKOK_BOUNDS.east);
    expect(v.center.lat).toBe(BANGKOK_BOUNDS.north);
  });
});
