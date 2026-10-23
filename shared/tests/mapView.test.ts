import { along, boundsOf, minutesLeft, project, tripProgress, unproject } from '../logic/mapView';

const box = { width: 300, height: 200, padding: 20 };
const pts = [{ lat: 13.7, lng: 100.5 }, { lat: 13.8, lng: 100.6 }];

describe('project and unproject', () => {
  it('puts north at the top and east to the right', () => {
    const b = boundsOf(pts);
    const sw = project(pts[0], b, box);
    const ne = project(pts[1], b, box);
    expect(ne.y).toBeLessThan(sw.y);
    expect(ne.x).toBeGreaterThan(sw.x);
  });
  it('keeps every point inside the box padding', () => {
    const b = boundsOf(pts);
    for (const p of pts) {
      const { x, y } = project(p, b, box);
      expect(x).toBeGreaterThanOrEqual(box.padding - 0.001);
      expect(x).toBeLessThanOrEqual(box.width - box.padding + 0.001);
      expect(y).toBeGreaterThanOrEqual(box.padding - 0.001);
      expect(y).toBeLessThanOrEqual(box.height - box.padding + 0.001);
    }
  });
  it('turns a tap back into the point it came from', () => {
    const b = boundsOf(pts);
    const back = unproject(project(pts[1], b, box), b, box);
    expect(back.lat).toBeCloseTo(pts[1].lat, 6);
    expect(back.lng).toBeCloseTo(pts[1].lng, 6);
  });
  it('does not zoom in absurdly on a single point', () => {
    const b = boundsOf([pts[0]]);
    expect(b.maxLat - b.minLat).toBeCloseTo(0.02, 6);
  });
  it('has a Bangkok default with no points', () => {
    expect(boundsOf([]).minLat).toBeLessThan(13.75);
  });
});

describe('simulated transfer', () => {
  const a = { lat: 13.7, lng: 100.5 };
  const z = { lat: 13.8, lng: 100.6 };
  it('moves along the line and stays at the ends outside 0 to 1', () => {
    expect(along(a, z, 0.5)).toEqual({ lat: 13.75, lng: 100.55 });
    expect(along(a, z, -1)).toEqual(a);
    expect(along(a, z, 2)).toEqual(z);
  });
  it('counts the minutes left and the progress from the clock', () => {
    expect(minutesLeft(0, 20, 5 * 60_000)).toBe(15);
    expect(minutesLeft(0, 20, 99 * 60_000)).toBe(0);
    expect(tripProgress(0, 20, 10 * 60_000)).toBe(0.5);
    expect(tripProgress(0, 0, 0)).toBe(1);
  });
});
