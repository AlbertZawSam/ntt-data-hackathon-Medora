import { MAX_PATH_POINTS, parseRoutePath, pathFromLineString, pathGeoJson, routeKey, thinPath } from '../logic/routePath';

describe('routePath', () => {
  it('turns [lng, lat] pairs into positions and drops bad ones', () => {
    expect(pathFromLineString([[100.5, 13.7], ['x', 1], [100.6, 13.8], [1]])).toEqual([
      { lat: 13.7, lng: 100.5 },
      { lat: 13.8, lng: 100.6 },
    ]);
    expect(pathFromLineString(undefined)).toEqual([]);
  });

  it('keeps the ends when thinning a long path', () => {
    const long = Array.from({ length: 2000 }, (_, i) => ({ lat: 13 + i / 10_000, lng: 100 }));
    const thin = thinPath(long);
    expect(thin).toHaveLength(MAX_PATH_POINTS);
    expect(thin[0]).toEqual(long[0]);
    expect(thin[thin.length - 1]).toEqual(long[1999]);
  });

  it('accepts only an answer with a path of at least two valid points', () => {
    expect(parseRoutePath({ path: [{ lat: 13.7, lng: 100.5 }, { lat: 13.8, lng: 100.6 }] })).toHaveLength(2);
    expect(parseRoutePath({ path: [{ lat: 13.7, lng: 100.5 }] })).toEqual([]);
    expect(parseRoutePath({ path: [{ lat: 99, lng: 100.5 }, { lat: 13.8, lng: 100.6 }] })).toEqual([]);
    expect(parseRoutePath({ path: 'no' })).toEqual([]);
    expect(parseRoutePath(null)).toEqual([]);
  });

  it('builds a GeoJSON line in [lng, lat] order, or nothing', () => {
    const json = pathGeoJson([{ lat: 13.7, lng: 100.5 }, { lat: 13.8, lng: 100.6 }]);
    expect(json.features).toHaveLength(1);
    expect((json.features[0] as { geometry: { coordinates: number[][] } }).geometry.coordinates[0]).toEqual([100.5, 13.7]);
    expect(pathGeoJson(undefined).features).toEqual([]);
  });

  it('gives the same key for positions a few metres apart', () => {
    const a = routeKey({ lat: 13.70012, lng: 100.5 }, { lat: 13.8, lng: 100.6 });
    expect(routeKey({ lat: 13.70031, lng: 100.50004 }, { lat: 13.8, lng: 100.6 })).toBe(a);
  });
});
