import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '../components/BrandMark';
import { LanguageToggle } from '../components/LanguageToggle';
import { useT } from '../state/AppProvider';
import { Card } from './Card';
import { Icon, type IconName } from './Icon';
import { Notice } from './Notice';
import { Reveal } from './Reveal';
import { fonts, fontSizes, radii, spacing, useBreakpoint, useTheme } from './theme';

interface Props {
  title: string;
  subtitle?: string;
  /** Error or notice shown above the form. */
  message?: { text: string; tone: 'error' | 'info' } | null;
  children: React.ReactNode;
}

const POINTS: ReadonlyArray<{ icon: IconName; key: 'brand.point1' | 'brand.point2' | 'brand.point3' }> = [
  { icon: 'locate', key: 'brand.point1' },
  { icon: 'pulse', key: 'brand.point2' },
  { icon: 'language', key: 'brand.point3' },
];

/**
 * The page every sign-in style form sits on. On a wide screen: a green brand panel on the left and the form on the right.
 * On a phone: the logo above the form. Scrolls and keeps clear of the keyboard.
 */
export function FormScreen({ title, subtitle, message, children }: Props): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const split = useBreakpoint() === 'expanded';

  const form = (
    <ScrollView contentContainerStyle={[styles.formScroll, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
      <View style={styles.column}>
        <View style={styles.topRow}>
          {split ? <View /> : <BrandMark size={36} />}
          <LanguageToggle />
        </View>
        <Reveal>
          <Card padding="lg" elevation={split ? 1 : 2} style={styles.formCard}>
            <View style={styles.heading}>
              <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{title}</Text>
              {subtitle ? <Text style={[styles.subtitle, { color: theme.textMuted }]}>{subtitle}</Text> : null}
            </View>
            {message ? <Notice tone={message.tone === 'error' ? 'danger' : 'success'}>{message.text}</Notice> : null}
            <View style={styles.form}>{children}</View>
          </Card>
        </Reveal>
      </View>
    </ScrollView>
  );

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {split ? (
        <View style={styles.split}>
          <View style={[styles.brandPanel, { backgroundColor: theme.primary }]}>
            <View style={[styles.circle, styles.circleA, { backgroundColor: theme.onPrimary }]} />
            <View style={[styles.circle, styles.circleB, { backgroundColor: theme.accent }]} />
            <View style={styles.brandContent}>
              <View style={styles.brandLogo}>
                <View style={[styles.logoBox, { backgroundColor: theme.onPrimary }]}>
                  <Icon name="medical" size={26} color={theme.primary} />
                </View>
                <Text style={[styles.brandName, { color: theme.onPrimary }]}>{t('app.name')}</Text>
              </View>
              <Text accessibilityRole="header" style={[styles.tagline, { color: theme.onPrimary }]}>{t('brand.tagline')}</Text>
              <View style={styles.points}>
                {POINTS.map((point) => (
                  <View key={point.key} style={styles.point}>
                    <View style={[styles.pointIcon, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                      <Icon name={point.icon} size={20} color={theme.onPrimary} />
                    </View>
                    <Text style={[styles.pointText, { color: theme.onPrimary }]}>{t(point.key)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
          <View style={styles.formPane}>{form}</View>
        </View>
      ) : (
        form
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  split: { flex: 1, flexDirection: 'row' },
  brandPanel: { flex: 1, overflow: 'hidden', justifyContent: 'center', padding: spacing.xl * 1.5 },
  circle: { position: 'absolute', borderRadius: 999, opacity: 0.1 },
  circleA: { width: 420, height: 420, top: -120, right: -140 },
  circleB: { width: 300, height: 300, bottom: -90, left: -80, opacity: 0.18 },
  brandContent: { gap: spacing.lg, maxWidth: 480 },
  brandLogo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  logoBox: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: fontSizes.xxl, fontFamily: fonts.bold, letterSpacing: -0.4 },
  tagline: { fontSize: 40, lineHeight: 48, fontFamily: fonts.bold, letterSpacing: -0.8 },
  points: { gap: spacing.md },
  point: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pointIcon: { width: 40, height: 40, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  pointText: { flex: 1, fontSize: fontSizes.md, fontFamily: fonts.medium, lineHeight: 22 },
  formPane: { flex: 1 },
  formScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.md },
  column: { width: '100%', maxWidth: 460, gap: spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  formCard: { gap: spacing.md },
  heading: { gap: 4 },
  title: { fontSize: fontSizes.xxl, fontFamily: fonts.bold, letterSpacing: -0.4 },
  subtitle: { fontSize: fontSizes.md, fontFamily: fonts.regular, lineHeight: 22 },
  form: { gap: spacing.md },
});
