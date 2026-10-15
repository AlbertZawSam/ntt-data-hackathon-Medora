import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { fitPoints, panBy, project, unproject, zoomAt, type Size, type Viewport } from '@/logic/mapView';
import type { LatLng } from '@/logic/types';
import { useT } from '@/state/language';
import { fonts, minTouch, radius, spacing, useTheme, type Colors } from '@/ui/theme';

// Offline Bangkok map (task 8.2): drawn locally, no tiles or network. Routes are straight
// lines between points; road routes come with Amazon Location in a development build.

export type MapTone = 'primary' | 'danger' | 'muted';
// crossed marks a hospital that can't help (requirement 5.4).
export type MapPin = { id: string; point: LatLng; label: string; tone?: MapTone; selected?: boolean; crossed?: boolean };
export type MapRoute = { id: string; from: LatLng; to: LatLng; tone?: MapTone };

type Props = {
  pins?: MapPin[];
  routes?: MapRoute[];
  user?: LatLng | null;
  // While on, a tap on the map reports that point through onPick (requirement 3.3).
  pickMode?: boolean;
  onPick?: (point: LatLng) => void;
  onPinPress?: (id: string) => void;
  height?: number;
};

// Approximate course of the Chao Phraya through the demo area, north to south.
const RIVER: LatLng[] = [
  { lat: 13.92, lng: 100.505 }, { lat: 13.86, lng: 100.491 }, { lat: 13.83, lng: 100.51 },
  { lat: 13.806, lng: 100.522 }, { lat: 13.783, lng: 100.508 }, { lat: 13.762, lng: 100.495 },
  { lat: 13.752, lng: 100.489 }, { lat: 13.74, lng: 100.497 }, { lat: 13.729, lng: 100.513 },
  { lat: 13.719, lng: 100.513 }, { lat: 13.7, lng: 100.53 }, { lat: 13.695, lng: 100.553 },
  { lat: 13.705, lng: 100.565 }, { lat: 13.68, lng: 100.578 }, { lat: 13.665, lng: 100.555 },
  { lat: 13.67, lng: 100.53 }, { lat: 13.64, lng: 100.53 }, { lat: 13.6, lng: 100.55 },
];
const RIVER_LABEL: LatLng = { lat: 13.795, lng: 100.512 };
const GRID_STEP = 0.05;
const BUTTON_ZOOM = 1.6;
const LABEL_WIDTH = 200;

const toneColor = (tone: MapTone | undefined, c: Colors) =>
  tone === 'danger' ? c.danger : tone === 'muted' ? c.textMuted : c.primary;

export function MapView({ pins = [], routes = [], user, pickMode = false, onPick, onPinPress, height = 320 }: Props) {
  const { colors } = useTheme();
  const { t } = useT();
  const [size, setSize] = useState<Size | null>(null);
  const [view, setView] = useState<Viewport | null>(null);

  const fitAll = (s: Size) => fitPoints([...pins.map((p) => p.point), ...(user ? [user] : [])], s, 36);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    const s = { width, height: h };
    setSize(s);
    setView((v) => v ?? fitAll(s));
  };

  const update = (fn: (v: Viewport, s: Size) => Viewport) => {
    if (size) setView((v) => (v ? fn(v, size) : v));
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(6)
    .onChange((e) => update((v, s) => panBy(v, { x: e.changeX, y: e.changeY }, s)));
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onChange((e) => update((v, s) => zoomAt(v, e.scaleChange, { x: e.focalX, y: e.focalY }, s)));
  const tap = Gesture.Tap()
    .runOnJS(true)
    .enabled(pickMode)
    .onEnd((e, success) => {
      if (success && size && view) onPick?.(unproject({ x: e.x, y: e.y }, view, size));
    });
  const gesture = Gesture.Race(tap, Gesture.Simultaneous(pan, pinch));

  const ready = size && view;
  const at = (p: LatLng) => project(p, view!, size!);

  const gridLines = () => {
    if (!ready) return null;
    const nw = unproject({ x: 0, y: 0 }, view, size);
    const se = unproject({ x: size.width, y: size.height }, view, size);
    const lines = [];
    for (let lat = Math.ceil(se.lat / GRID_STEP) * GRID_STEP; lat <= nw.lat; lat += GRID_STEP) {
      const y = at({ lat, lng: nw.lng }).y;
      lines.push(<Line key={`lat${lat.toFixed(2)}`} x1={0} x2={size.width} y1={y} y2={y} stroke={colors.grid} strokeWidth={1} />);
    }
    for (let lng = Math.ceil(nw.lng / GRID_STEP) * GRID_STEP; lng <= se.lng; lng += GRID_STEP) {
      const x = at({ lat: nw.lat, lng }).x;
      lines.push(<Line key={`lng${lng.toFixed(2)}`} y1={0} y2={size.height} x1={x} x2={x} stroke={colors.grid} strokeWidth={1} />);
    }
    return lines;
  };

  const zoomButton = (label: string, a11y: string, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [
        styles.control,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Text style={[styles.controlText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
  const zoomBy = (factor: number) => update((v, s) => zoomAt(v, factor, { x: s.width / 2, y: s.height / 2 }, s));

  return (
    <View style={[styles.frame, { height, backgroundColor: colors.land, borderColor: colors.border }]}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} onLayout={onLayout} accessibilityLabel={t('map.label')}>
          {ready && (
            <>
              <Svg width={size.width} height={size.height}>
                {gridLines()}
                <Polyline
                  points={RIVER.map((p) => { const { x, y } = at(p); return `${x},${y}`; }).join(' ')}
                  fill="none"
                  stroke={colors.water}
                  strokeWidth={Math.max(4, Math.min(16, view.scale / 400))}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <SvgText
                  x={at(RIVER_LABEL).x + 10}
                  y={at(RIVER_LABEL).y}
                  fill={colors.textMuted}
                  fontSize={11}
                  fontFamily={fonts.medium}>
                  {t('map.river')}
                </SvgText>
                {routes.map((r) => {
                  const a = at(r.from);
                  const b = at(r.to);
                  return (
                    <Line key={r.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke={toneColor(r.tone, colors)} strokeWidth={3} strokeDasharray="6 5" strokeLinecap="round" />
                  );
                })}
                {user && (
                  <>
                    <Circle cx={at(user).x} cy={at(user).y} r={14} fill={colors.primary} opacity={0.18} />
                    <Circle cx={at(user).x} cy={at(user).y} r={7} fill={colors.primary} stroke={colors.surface} strokeWidth={3} />
                  </>
                )}
              </Svg>

              {pins.map((pin) => {
                const { x, y } = at(pin.point);
                const color = toneColor(pin.tone, colors);
                const dot = pin.selected ? 20 : pin.crossed ? 16 : 14;
                return (
                  <Pressable
                    key={pin.id}
                    onPress={onPinPress ? () => onPinPress(pin.id) : undefined}
                    disabled={!onPinPress}
                    accessibilityRole={onPinPress ? 'button' : undefined}
                    accessibilityLabel={pin.label}
                    style={[styles.pin, { left: x - minTouch / 2, top: y - minTouch / 2 }]}>
                    <View
                      style={[
                        styles.dot,
                        { width: dot, height: dot, borderRadius: dot / 2, backgroundColor: color, borderColor: colors.surface },
                      ]}>
                      {pin.crossed && <Text style={[styles.cross, { color: colors.surface }]}>×</Text>}
                    </View>
                  </Pressable>
                );
              })}
              {pins.filter((pin) => pin.selected).map((pin) => {
                const { x, y } = at(pin.point);
                return (
                  <View
                    key={`label-${pin.id}`}
                    pointerEvents="none"
                    style={[styles.pinLabelBox, { left: x - LABEL_WIDTH / 2, top: y - 40 }]}>
                    <View style={[styles.pinLabel, { backgroundColor: colors.surface, borderColor: toneColor(pin.tone, colors) }]}>
                      <Text numberOfLines={1} style={[styles.pinLabelText, { color: colors.text }]}>{pin.label}</Text>
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </View>
      </GestureDetector>

      {pickMode && (
        <View pointerEvents="none" style={[styles.hint, { backgroundColor: colors.primary }]}>
          <Text style={[styles.hintText, { color: colors.onPrimary }]}>{t('map.pickHint')}</Text>
        </View>
      )}
      <View style={styles.controls}>
        {zoomButton('+', t('map.zoomIn'), () => zoomBy(BUTTON_ZOOM))}
        {zoomButton('−', t('map.zoomOut'), () => zoomBy(1 / BUTTON_ZOOM))}
        {zoomButton('⤢', t('map.showAll'), () => size && setView(fitAll(size)))}
      </View>
      <Text pointerEvents="none" style={[styles.note, { color: colors.textMuted }]}>{t('map.simplified')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignSelf: 'stretch', borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  pin: { position: 'absolute', width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  dot: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  cross: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 12 },
  pinLabelBox: { position: 'absolute', width: LABEL_WIDTH, alignItems: 'center' },
  pinLabel: {
    maxWidth: LABEL_WIDTH,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  pinLabelText: { fontFamily: fonts.semiBold, fontSize: 12 },
  controls: { position: 'absolute', right: spacing.sm, top: spacing.sm, gap: spacing.xs },
  control: {
    width: minTouch,
    height: minTouch,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlText: { fontFamily: fonts.semiBold, fontSize: 20 },
  hint: {
    position: 'absolute',
    left: spacing.sm,
    top: spacing.sm,
    right: minTouch + spacing.md,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  hintText: { fontFamily: fonts.medium, fontSize: 13 },
  note: { position: 'absolute', left: spacing.sm, bottom: spacing.xs, fontFamily: fonts.regular, fontSize: 11 },
});
