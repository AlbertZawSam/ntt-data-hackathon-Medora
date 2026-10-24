import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { fonts, fontSizes, spacing, useTheme } from '../ui/theme';
import { useT } from '../state/AppProvider';

/** The Medora logo (assets/logo.png) and the name. */
export function BrandMark({ size = 36, showName = true }: { size?: number; showName?: boolean }): React.JSX.Element {
  const theme = useTheme();
  const t = useT();
  return (
    <View accessibilityRole="header" accessibilityLabel={t('app.name')} style={styles.row}>
      <Image source={require('../../assets/logo.png')} accessibilityIgnoresInvertColors style={{ width: size, height: size }} />
      {showName ? <Text style={[styles.name, { color: theme.text, fontSize: size * 0.58 }]}>{t('app.name')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { fontFamily: fonts.bold, fontSize: fontSizes.xl, letterSpacing: -0.3 },
});
