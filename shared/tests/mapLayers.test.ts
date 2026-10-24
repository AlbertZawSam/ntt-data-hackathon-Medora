import { MARKER_KINDS, isCrossedOut, markerSize, routeGeoJson, visibleMarkers, type MarkerLike } from '../logic/mapLayers';

const marker = (id: string, kind: MarkerLike['kind'], lat = 13.75, lng = 100.53): MarkerLike => ({ id, kind, point: { lat, lng } });

describe('visibleMarkers', () => {
  it('leaves out the built-in place dots, which the real map does not need, and keeps everything else in order', () => {
    const shown = visibleMarkers([marker('a', 'place'), marker('me', 'me'), marker('h1', 'ok'), marker('b', 'place'), marker('h2', 'no')]);
    expect(shown.map((m) => m.id)).toEqual(['me', 'h1', 'h2']);
  });
  it('drops markers without a usable position', () => {
    expect(visibleMarkers([marker('bad', 'ok', Number.NaN, 100), marker('bad2', 'ok', 13, Number.POSITIVE_INFINITY), marker('good', 'ok')]).map((m) => m.id)).toEqual(['good']);
  });
});

describe('marker look', () => {
  it('makes the person and the chosen hospital bigger than other markers', () => {
    expect(markerSize('me')).toBeGreaterThan(markerSize('ok'));
    expect(markerSize('chosen')).toBe(markerSize('me'));
    for (const kind of MARKER_KINDS) expect(markerSize(kind)).toBeGreaterThan(0);
  });
  it('crosses out only hospitals that cannot help or declined', () => {
    expect(MARKER_KINDS.filter(isCrossedOut)).toEqual(['no', 'declined']);
  });
});

describe('routeGeoJson', () => {
  it('draws the line with longitude first, as GeoJSON requires', () => {
    const geo = routeGeoJson([{ lat: 13.7, lng: 100.5 }, { lat: 13.8, lng: 100.6 }]);
    expect(geo.features[0].geometry.coordinates).toEqual([[100.5, 13.7], [100.6, 13.8]]);
  });
  it('is empty with no route or a broken point', () => {
    expect(routeGeoJson(undefined).features).toEqual([]);
    expect(routeGeoJson([{ lat: Number.NaN, lng: 1 }, { lat: 2, lng: 3 }]).features).toEqual([]);
  });
});
