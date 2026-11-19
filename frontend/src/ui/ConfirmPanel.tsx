import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { Icon } from './Icon';
import { fonts, fontSizes, radii, spacing, useTheme } from './theme';

interface Props {
  /** The question, naming what will happen: "Cancel your request to Chao Phraya Central Hospital?" */
  title: string;
  /** What follows, in one or two short sentences. */
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** danger for something that can't be undone (cancel, delete); primary for a weighty but normal step. */
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * An inline "are you sure?" step shown in place of the action it guards. Inline rather than a pop-up, because the
 * React Native alert does nothing on the web and an inline panel keeps the person's eyes where they tapped.
 */
export function ConfirmPanel({ title, body, confirmLabel, cancelLabel, tone = 'danger', busy = false, onConfirm, onCancel }: Props): React.JSX.Element {
  const theme = useTheme();
  const color = tone === 'danger' ? theme.emergency : theme.primary;
  const soft = tone === 'danger' ? theme.emergencySoft : theme.primarySoft;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.panel, { backgroundColor: soft, borderColor: color }]}>
      <View style={styles.head}>
        <Icon name={tone === 'danger' ? 'warning' : 'help-circle'} size={22} color={color} />
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      </View>
      {body ? <Text style={[styles.body, { color: theme.text }]}>{body}</Text> : null}
      <View style={styles.actions}>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} fullWidth={false} label={confirmLabel} busy={busy} onPress={onConfirm} />
        <Button variant="secondary" fullWidth={false} label={cancelLabel} disabled={busy} onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, borderWidth: 1.5 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { flex: 1, fontSize: fontSizes.md, fontFamily: fonts.semibold, lineHeight: 24 },
  body: { fontSize: fontSizes.md, fontFamily: fonts.regular, lineHeight: 24 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
});
