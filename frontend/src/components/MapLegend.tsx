/**
 * The key under a map: each marker shown as the same small sign the map draws (a square with a cross for a
 * hospital, crossed out when it can't help, a dot for you or the ambulance) with a plain explanation, so a colour is
 * never left to guess. Requirements: 5.4, 13.2
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { HOSPITAL_MARKER_KINDS, isCrossedOut, type MarkerKind } from '@medora/shared/logic/mapLayers';
import type { StringKey } from '../i18n/t';
import { useT } from '../state/AppProvider';
import { fonts, fontSizes, spacing, useTheme } from '../ui/theme';
import { markerColors } from './markerColors';

export function MapLegend({ kinds, labels = {} }: { kinds: readonly MarkerKind[]; labels?: Partial<Record<MarkerKind, StringKey>> }): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const colors = markerColors(theme);
  return (
    <View style={styles.wrap} accessibilityRole="text">
      {kinds.map((kind) => {
        const crossed = isCrossedOut(kind);
        const hospital = HOSPITAL_MARKER_KINDS.includes(kind);
        return (
          <View key={kind} style={styles.item}>
            <View
              style={[
                styles.sign,
                { borderRadius: hospital ? 4 : 7, backgroundColor: crossed ? theme.surface : colors[kind], borderColor: crossed ? theme.emergency : theme.surface },
              ]}
            >
              <Text style={[styles.symbol, { color: crossed ? theme.emergency : '#fff' }]}>{crossed ? '×' : hospital ? '+' : ''}</Text>
            </View>
            <Text style={[styles.label, { color: theme.textMuted }]}>{t(labels[kind] ?? (`map.key.${kind}` as StringKey))}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xs },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sign: { width: 16, height: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  symbol: { fontSize: 13, lineHeight: 14, fontFamily: fonts.bold },
  label: { fontSize: fontSizes.xs, fontFamily: fonts.regular },
});
