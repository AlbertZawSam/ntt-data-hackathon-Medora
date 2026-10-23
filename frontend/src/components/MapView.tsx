/**
 * Simple offline map drawn with SVG (no tiles, no network): the person, hospitals that can help,
 * crossed-out ones that can't, an optional route line, and tap-to-pick. Distances are drawn to scale
 * with north up. Requirements: 3.3, 5.4, 8.4, 13.2, 13.4
 */
import React from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import type { LatLng } from '@medora/shared/logic/ranking';
import { boundsOf, project, unproject, type Box } from '@medora/shared/logic/mapView';
import { fonts, radii, useTheme } from '../ui/theme';

export type MarkerKind = 'me' | 'ok' | 'limited' | 'no' | 'asked' | 'accepted' | 'declined' | 'chosen' | 'vehicle' | 'place';

export interface MapMarker {
  id: string;
  point: LatLng;
  kind: MarkerKind;
  /** Short label drawn next to the marker; keep it brief. */
  label?: string;
}

interface Props {
  markers: MapMarker[];
  /** A line from the first point to the second, for example the route to the best hospital. */
  route?: [LatLng, LatLng];
  /** When set, tapping the map calls this with the tapped point. */
  onPick?: (point: LatLng) => void;
  height?: number;
  /** Text read by screen readers: the map has no other text alternative. */
  accessibilityLabel: string;
}

export function MapView({ markers, route, onPick, height = 240, accessibilityLabel }: Props): React.JSX.Element {
  const theme = useTheme();
  const [width, setWidth] = React.useState(320);
  const box: Box = { width, height, padding: 28 };
  const bounds = React.useMemo(() => boundsOf([...markers.map((m) => m.point), ...(route ?? [])]), [markers, route]);

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

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e: LayoutChangeEvent) => setWidth(Math.max(200, Math.round(e.nativeEvent.layout.width)))}
      style={[styles.wrap, { borderColor: theme.border, backgroundColor: theme.surface }]}
    >
      <Svg width={width} height={height}>
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          onPress={onPick ? (e) => onPick(unproject({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }, bounds, box)) : undefined}
        />
        {route ? (() => {
          const a = project(route[0], bounds, box);
          const b = project(route[1], bounds, box);
          return <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={theme.primary} strokeWidth={3} strokeDasharray="6 4" />;
        })() : null}
        {markers.map((m) => {
          const { x, y } = project(m.point, bounds, box);
          const r = m.kind === 'me' || m.kind === 'chosen' ? 9 : m.kind === 'place' ? 4 : 7;
          return (
            <G key={m.id}>
              <Circle cx={x} cy={y} r={r} fill={colors[m.kind]} stroke={theme.surface} strokeWidth={2} />
              {m.kind === 'no' || m.kind === 'declined' ? (
                <>
                  <Line x1={x - r} y1={y - r} x2={x + r} y2={y + r} stroke={theme.emergency} strokeWidth={2} />
                  <Line x1={x - r} y1={y + r} x2={x + r} y2={y - r} stroke={theme.emergency} strokeWidth={2} />
                </>
              ) : null}
              {m.label ? (
                <SvgText x={x + r + 3} y={y + 4} fontSize={11} fontFamily={fonts.medium} fill={theme.text}>
                  {m.label}
                </SvgText>
              ) : null}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: radii.lg, overflow: 'hidden' },
});
