/**
 * The map every screen imports. On the phone apps it is the simple offline map; on the web, Metro picks
 * MapView.web.tsx instead, which draws a real Amazon Location map and falls back to this one.
 */
export { SchematicMap as MapView, shortLabel } from './SchematicMap';
export type { MapMarker, MapViewProps, MarkerKind } from './SchematicMap';
