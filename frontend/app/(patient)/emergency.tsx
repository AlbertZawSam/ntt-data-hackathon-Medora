/**
 * Emergency screen: shown when a red flag matches. It never calls a model; it tells the patient
 * to call 1669 now and names the nearest hospital whose emergency department is open, from the live
 * public directory (when the phone is offline, only the 1669 button shows). Requirements: 4.2, 4.3
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React from 'react';
import { Animated, Easing, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nearestOpenEd } from '@medora/shared/logic/publicDirectory';
import { RED_FLAGS } from '@medora/shared/logic/redFlags';
import { pick } from '../../src/i18n/t';
import { call1669 } from '../../src/services/emergency';
import { nearestOpen } from '../../src/services/lastResults';
import { useChosenLocation } from '../../src/services/location';
import { useApp, useT } from '../../src/state/AppProvider';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { Icon } from '../../src/ui/Icon';
import { Notice } from '../../src/ui/Notice';
import { useReducedMotion } from '../../src/ui/Reveal';
import { fonts, fontSizes, radii, spacing, useTheme } from '../../src/ui/theme';

/** The phone icon in a ring that gently pulses, to draw the eye to the one thing to do. Still when the person wants less motion. */
function PulsingCall(): React.JSX.Element {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const pulse = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (reduced) return undefined;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: Platform.OS !== 'web' }));
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);
  return (
    <View style={styles.pulseWrap}>
      <Animated.View
        style={[styles.pulseRing, { borderColor: theme.onEmergency, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }] }]}
      />
      <View style={[styles.pulseCore, { backgroundColor: theme.onEmergency }]}>
        <Icon name="call" size={34} color={theme.emergency} />
      </View>
    </View>
  );
}

export default function EmergencyScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lang, data } = useApp();
  const location = useChosenLocation();
  const { flag } = useLocalSearchParams<{ flag?: string }>();
  const rule = RED_FLAGS.find((r) => r.key === flag);
  // The nearest open emergency department from the live public directory (no search needed, never a
  // model); offline, the closest hospital that could help in the last search, kept in memory.
  const liveEd = nearestOpenEd(data.publicDirectory, location, Date.now());
  const cached = liveEd ? null : nearestOpen();
  const nearest = liveEd
    ? t('emergency.nearestEd', { name: pick(liveEd.entry.name, lang), min: Math.round(liveEd.driveMin) })
    : cached
      ? t('emergency.nearestOpen', { name: pick(cached.name, lang), min: cached.driveMin })
      : t('emergency.noNearest');

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.column}>
        <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: theme.emergency }]}>
          <PulsingCall />
          <Text accessibilityRole="header" style={[styles.title, { color: theme.onEmergency }]}>{t('emergency.title')}</Text>
          {rule ? <Text style={[styles.flag, { color: theme.onEmergency }]}>{pick(rule.label, lang)}</Text> : null}
          <Text style={[styles.instructions, { color: theme.onEmergency }]}>{t('emergency.instructions')}</Text>
        </View>

        <Button variant="danger" size="lg" icon="call" label={t('emergency.call1669')} onPress={() => void call1669()} />

        <Card padding="lg">
          <View style={styles.nearestRow}>
            <View style={[styles.nearestIcon, { backgroundColor: theme.emergencySoft }]}>
              <Icon name="medkit" size={24} color={theme.emergency} />
            </View>
            <Text accessibilityLiveRegion="polite" style={[styles.nearest, { color: theme.text }]}>{nearest}</Text>
          </View>
        </Card>

        <Notice tone="neutral">{t('emergency.noAi')}</Notice>
        <Button variant="ghost" icon="home" label={t('emergency.back')} onPress={() => router.replace('/(patient)/home' as Href)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, alignItems: 'center', paddingHorizontal: spacing.md },
  column: { width: '100%', maxWidth: 520, gap: spacing.md },
  banner: { borderRadius: radii.xl, padding: spacing.lg, gap: spacing.sm, alignItems: 'center' },
  pulseWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  pulseRing: { position: 'absolute', width: 72, height: 72, borderRadius: 36, borderWidth: 3 },
  pulseCore: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSizes.xxl + 2, fontFamily: fonts.bold, textAlign: 'center', lineHeight: 36 },
  flag: { fontSize: fontSizes.lg, fontFamily: fonts.semibold, textAlign: 'center' },
  instructions: { fontSize: fontSizes.lg, fontFamily: fonts.medium, textAlign: 'center', lineHeight: 26 },
  nearestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nearestIcon: { width: 48, height: 48, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center' },
  nearest: { flex: 1, fontSize: fontSizes.md, fontFamily: fonts.semibold, lineHeight: 22 },
});
