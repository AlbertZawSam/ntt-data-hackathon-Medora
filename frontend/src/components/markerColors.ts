/**
 * One colour per map marker kind, shared by the street map, the offline map and the map legend, so a sign means
 * the same thing everywhere: green can help or accepted, amber limited or waiting for a reply, grey may be out of
 * date, blue your own hospital, red declined.
 */
import type { MarkerKind } from '@medora/shared/logic/mapLayers';
import type { Palette } from '../ui/theme';

export function markerColors(theme: Palette): Record<MarkerKind, string> {
  return {
    me: theme.primary,
    home: theme.info,
    ok: theme.success,
    limited: theme.warning,
    outdated: theme.textMuted,
    no: theme.textMuted,
    asked: theme.warning,
    accepted: theme.success,
    declined: theme.emergency,
    chosen: theme.primary,
    vehicle: theme.accent,
    place: theme.textMuted,
  };
}
