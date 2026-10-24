import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppHeader } from '../components/AppHeader';
import { Button } from './Button';
import { Reveal } from './Reveal';
import { fonts, fontSizes, layout, spacing, useBreakpoint, useTheme } from './theme';

interface Props {
  title: string;
  subtitle?: string;
  /** Buttons or chips on the right of the title. */
  actions?: React.ReactNode;
  /** Shows a back button above the title. */
  onBack?: () => void;
  backLabel?: string;
  /** content: wide dashboards (up to about 1040 px); readable: forms and text (about 640 px). */
  width?: 'content' | 'readable';
  /** Draw the Medora top bar. On by default on phones and tablets; the desktop sidebar already has the brand. */
  header?: boolean;
  children: React.ReactNode;
}

/**
 * The standard screen: a top bar on small screens, a title with room for actions, and content in a centred column
 * that never gets too wide to read. Scrolls, keeps clear of the keyboard, and fades in.
 */
export function Page({ title, subtitle, actions, onBack, backLabel, width = 'content', header = true, children }: Props): React.JSX.Element {
  const theme = useTheme();
  const breakpoint = useBreakpoint();
  const insets = useSafeAreaInsets();
  const expanded = breakpoint === 'expanded';
  const gutter = breakpoint === 'compact' ? spacing.md : spacing.lg;
  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header && !expanded ? <View style={{ paddingTop: insets.top, backgroundColor: theme.surface }}><AppHeader /></View> : null}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter, paddingTop: expanded ? spacing.xl : spacing.lg, paddingBottom: spacing.xl * 2 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.column, { maxWidth: width === 'readable' ? layout.readableMax : layout.contentMax }]}>
          <Reveal y={8}>
            <View style={styles.titleBlock}>
              {onBack ? <Button variant="ghost" size="sm" icon="chevron-back" fullWidth={false} label={backLabel ?? ''} onPress={onBack} /> : null}
              <View style={styles.titleRow}>
                <View style={styles.titleText}>
                  <Text accessibilityRole="header" style={[styles.title, { color: theme.text, fontSize: expanded ? fontSizes.xxl + 4 : fontSizes.xxl }]}>{title}</Text>
                  {subtitle ? <Text style={[styles.subtitle, { color: theme.textMuted }]}>{subtitle}</Text> : null}
                </View>
                {actions ? <View style={styles.actions}>{actions}</View> : null}
              </View>
            </View>
          </Reveal>
          <View style={styles.body}>{children}</View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  column: { width: '100%', gap: spacing.lg },
  titleBlock: { gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' },
  titleText: { flex: 1, minWidth: 220, gap: 4 },
  title: { fontFamily: fonts.bold, letterSpacing: -0.4 },
  subtitle: { fontSize: fontSizes.md, fontFamily: fonts.regular, lineHeight: 22 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  body: { gap: spacing.md },
});
