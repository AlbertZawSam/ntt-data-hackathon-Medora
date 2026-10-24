import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { pick } from '../i18n/t';
import { useChosenLocation } from '../services/location';
import { useApp, useT } from '../state/AppProvider';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { fonts, fontSizes, radii, spacing, useTheme } from '../ui/theme';

/** Where the search will start from, with a way to change it: used above the places a person can search. */
export function LocationChip(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const { lang } = useApp();
  const location = useChosenLocation();
  const text =
    location.source === 'gps'
      ? location.accuracyM !== undefined
        ? t('patient.home.locationGpsLive', { m: Math.max(1, Math.round(location.accuracyM)) })
        : t('patient.home.locationGps')
      : location.source === 'map'
        ? t('patient.home.locationMap')
        : t('patient.home.locationPlace', { place: location.place ? pick(location.place.name, lang) : '' });
  return (
    <View style={[styles.chip, { backgroundColor: theme.primarySoft }]}>
      <Icon name={location.source === 'gps' ? 'locate' : 'pin'} size={18} color={theme.primary} />
      <Text accessibilityLiveRegion="polite" numberOfLines={2} style={[styles.text, { color: theme.text }]}>{text}</Text>
      <Button variant="ghost" size="sm" fullWidth={false} label={t('patient.care.changeLocation')} onPress={() => router.push('/(patient)/home' as Href)} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.lg, paddingLeft: spacing.md, paddingRight: spacing.xs, paddingVertical: spacing.xs },
  text: { flex: 1, fontSize: fontSizes.sm, fontFamily: fonts.medium },
});
