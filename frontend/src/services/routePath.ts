/**
 * The real road route for a map's line. Asks once per pair of points (kept in memory, keyed by the rounded
 * positions so a live position that drifts a few metres doesn't ask again) and returns null until it arrives or when
 * there is no route, so the map draws its straight line meanwhile and as the fallback.
 */
import React from 'react';
import type { LatLng } from '@medora/shared/logic/ranking';
import { routeKey } from '@medora/shared/logic/routePath';
import { fetchRoutePath } from './data';

const cache = new Map<string, Promise<LatLng[]>>();

function load(from: LatLng, to: LatLng): Promise<LatLng[]> {
  const key = routeKey(from, to);
  let hit = cache.get(key);
  if (!hit) {
    hit = fetchRoutePath(from, to);
    cache.set(key, hit);
    // A failure shouldn't be remembered: a later render may try again.
    void hit.then((path) => {
      if (path.length === 0) cache.delete(key);
    });
  }
  return hit;
}

export function useRoutePath(route: readonly [LatLng, LatLng] | undefined): LatLng[] | null {
  const key = route ? routeKey(route[0], route[1]) : null;
  const [state, setState] = React.useState<{ key: string | null; path: LatLng[] | null }>({ key: null, path: null });
  React.useEffect(() => {
    if (!route || !key) return;
    let alive = true;
    void load(route[0], route[1]).then((path) => {
      if (alive) setState({ key, path: path.length >= 2 ? path : null });
    });
    return () => {
      alive = false;
    };
    // The key stands for the two points.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state.path : null;
}
