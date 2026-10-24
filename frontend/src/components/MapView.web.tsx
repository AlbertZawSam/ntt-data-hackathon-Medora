/**
 * The real map on the web: Amazon Location tiles drawn by MapLibre (streets, names and landmarks), with the person,
 * hospitals that can help, crossed-out ones that can't, the route line, and tap-to-pick, like the offline map. The
 * address of the style comes from the backend (`fetchMapStyleUrl`, a read-only tile key). If the map is not available,
 * or its style fails to load, this draws the simple offline map instead, so a screen never ends up with no map.
 * Requirements: 3.3, 5.4, 8.4, 13.2, 13.4
 */
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import React from 'react';
import { isCrossedOut, markerSize, routeGeoJson, visibleMarkers } from '@medora/shared/logic/mapLayers';
import { pathGeoJson } from '@medora/shared/logic/routePath';
import { useRoutePath } from '../services/routePath';
import { fetchMapStyleUrl } from '../services/data';
import { SchematicMap, shortLabel, type MapMarker, type MapViewProps, type MarkerKind } from './SchematicMap';
import { fonts, radii, useTheme } from '../ui/theme';

export { shortLabel };
export type { MapMarker, MapViewProps, MarkerKind };

/** Bangkok, until the markers say where to look. [longitude, latitude]. */
const BANGKOK: [number, number] = [100.534, 13.7455];

export function MapView(props: MapViewProps): React.JSX.Element {
  const theme = useTheme();
  // undefined: asking; null: no real map available.
  const [styleUrl, setStyleUrl] = React.useState<string | null | undefined>(undefined);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    void fetchMapStyleUrl().then((url) => {
      if (alive) setStyleUrl(url);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (styleUrl === null || failed) return <SchematicMap {...props} />;
  if (styleUrl === undefined) {
    // Same size as the map, so the screen does not jump when it arrives.
    return <div role="img" aria-label={props.accessibilityLabel} style={{ height: props.height ?? 240, borderRadius: radii.lg, border: `1px solid ${theme.border}`, background: theme.surface }} />;
  }
  return <TileMap {...props} styleUrl={styleUrl} onFailed={() => setFailed(true)} />;
}

function TileMap({ markers, route, onPick, height = 240, accessibilityLabel, styleUrl, onFailed }: MapViewProps & { styleUrl: string; onFailed: () => void }): React.JSX.Element {
  const theme = useTheme();
  const container = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = React.useState(false);
  // The parent builds new arrays on every render; these keys change only when what is drawn changes, so the map is
  // not redrawn or re-framed (fighting the person's panning) on every render.
  const shown = React.useMemo(() => visibleMarkers(markers), [markers]);
  const markerKey = JSON.stringify(shown.map((m) => [m.id, m.kind, m.point.lat, m.point.lng, m.label ?? '']));
  // The real road route when it is available; until then (and if it isn't) the straight line between the two points.
  const road = useRoutePath(route);
  const routeKey = JSON.stringify([route ?? null, road ? road.length : 0]);
  const onPickRef = React.useRef(onPick);
  onPickRef.current = onPick;
  const onFailedRef = React.useRef(onFailed);
  onFailedRef.current = onFailed;

  const colors: Record<MarkerKind, string> = {
    me: theme.primary,
    ok: theme.success,
    limited: theme.warning,
    no: theme.textMuted,
    asked: theme.warning,
    accepted: theme.success,
    declined: theme.emergency,
    chosen: theme.primary,
    vehicle: theme.accent,
    place: theme.textMuted,
  };

  // Create the map once per style address.
  React.useEffect(() => {
    if (!container.current) return undefined;
    let loaded = false;
    const map = new maplibregl.Map({ container: container.current, style: styleUrl, center: BANGKOK, zoom: 11, attributionControl: { compact: true } });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      loaded = true;
      map.addSource('route', { type: 'geojson', data: routeGeoJson(undefined) });
      map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': theme.primary, 'line-width': 5 } });
      setReady(true);
    });
    // A style that cannot load (a bad key, no network) means the offline map; a single missing tile later does not.
    map.on('error', () => {
      if (!loaded) onFailedRef.current();
    });
    map.on('click', (event) => onPickRef.current?.({ lat: event.lngLat.lat, lng: event.lngLat.lng }));
    return () => {
      setReady(false);
      map.remove();
      mapRef.current = null;
    };
    // The route line colour is read once; a theme change does not need a new map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl]);

  React.useEffect(() => {
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = onPick ? 'crosshair' : '';
  }, [onPick, ready]);

  // Markers, and frame them.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return undefined;
    const placed = shown.map((m) => {
      const element = document.createElement('div');
      element.style.cssText = 'display:flex;align-items:center;gap:4px;pointer-events:none;';
      const size = markerSize(m.kind);
      const dot = document.createElement('div');
      dot.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${colors[m.kind]};border:2px solid ${theme.surface};box-shadow:0 1px 3px rgba(0,0,0,.4);flex:none;display:flex;align-items:center;justify-content:center;color:${theme.emergency};font:700 ${size}px/1 sans-serif;`;
      if (isCrossedOut(m.kind)) {
        dot.textContent = '×';
        dot.style.background = theme.surface;
        dot.style.border = `2px solid ${theme.emergency}`;
      }
      element.appendChild(dot);
      if (m.label) {
        const label = document.createElement('span');
        label.textContent = shortLabel(m.label, 22); // textContent, never HTML: names are shown as plain text
        label.style.cssText = `font:500 12px ${fonts.medium}, sans-serif;color:#0E2A23;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;white-space:nowrap;`;
        element.appendChild(label);
      }
      return new maplibregl.Marker({ element, anchor: 'left', offset: [-size / 2, 0] }).setLngLat([m.point.lng, m.point.lat]).addTo(map);
    });
    const points = [...shown.map((m) => m.point), ...(road ?? route ?? [])];
    if (points.length === 1) {
      map.easeTo({ center: [points[0].lng, points[0].lat], zoom: 13.5, duration: 300 });
    } else if (points.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      for (const p of points) bounds.extend([p.lng, p.lat]);
      map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 400 });
    }
    return () => placed.forEach((marker) => marker.remove());
    // markerKey and routeKey stand for markers and route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, markerKey, routeKey, theme]);

  // The route line.
  React.useEffect(() => {
    const source = mapRef.current?.getSource('route') as maplibregl.GeoJSONSource | undefined;
    if (ready && source) source.setData((road ? pathGeoJson(road) : routeGeoJson(route)) as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, routeKey]);

  return (
    <div
      ref={container}
      role="img"
      aria-label={accessibilityLabel}
      style={{ height, width: '100%', borderRadius: radii.lg, overflow: 'hidden', border: `1px solid ${theme.border}`, background: theme.surface }}
    />
  );
}
