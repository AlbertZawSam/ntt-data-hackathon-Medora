import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { fonts, fontSizes, spacing, useTheme } from './theme';

export interface TimelineStep {
  id: string;
  title: string;
  detail?: string;
  /** done: finished; active: happening now; pending: still to come; error: went wrong. */
  state: 'done' | 'active' | 'pending' | 'error';
  /** A short time or duration shown on the right. */
  time?: string;
}

const ICON: Record<TimelineStep['state'], IconName> = { done: 'checkmark', active: 'ellipse', pending: 'ellipse-outline', error: 'close' };

/** A vertical list of steps joined by a line, for the agent's trace and for where a request stands. */
export function Timeline({ steps }: { steps: readonly TimelineStep[] }): React.JSX.Element {
  const theme = useTheme();
  return (
    <View accessibilityRole="list">
      {steps.map((step, index) => {
        const color = step.state === 'done' ? theme.success : step.state === 'active' ? theme.primary : step.state === 'error' ? theme.emergency : theme.border;
        const last = index === steps.length - 1;
        return (
          <View key={step.id} accessibilityRole="text" accessibilityLabel={`${step.title}${step.detail ? `. ${step.detail}` : ''}`} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: step.state === 'pending' ? theme.surface : color, borderColor: color }]}>
                <Icon name={ICON[step.state]} size={step.state === 'active' ? 8 : 13} color={step.state === 'pending' ? color : theme.onPrimary} />
              </View>
              {!last ? <View style={[styles.line, { backgroundColor: step.state === 'done' ? theme.success : theme.border }]} /> : null}
            </View>
            <View style={[styles.body, last && { paddingBottom: 0 }]}>
              <View style={styles.head}>
                <Text style={[styles.title, { color: step.state === 'pending' ? theme.textMuted : theme.text }]}>{step.title}</Text>
                {step.time ? <Text style={[styles.time, { color: theme.textMuted }]}>{step.time}</Text> : null}
              </View>
              {step.detail ? <Text style={[styles.detail, { color: theme.textMuted }]}>{step.detail}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm + 4 },
  rail: { alignItems: 'center', width: 24 },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, width: 2, marginVertical: 2, minHeight: 12 },
  body: { flex: 1, paddingBottom: spacing.md, gap: 2 },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  title: { flex: 1, fontSize: fontSizes.md, fontFamily: fonts.semibold },
  time: { fontSize: fontSizes.xs, fontFamily: fonts.medium },
  detail: { fontSize: fontSizes.sm, fontFamily: fonts.regular, lineHeight: 20 },
});
