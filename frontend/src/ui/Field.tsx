import React from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle } from 'react-native';
import { Icon, type IconName } from './Icon';
import { fonts, fontSizes, lineHeights, radii, spacing, useTheme } from './theme';
import { webTransition } from './web';

interface Props extends Omit<TextInputProps, 'style' | 'placeholder'> {
  label: string;
  hint?: string;
  /** What is wrong with the value; turns the field red and is announced to screen readers. */
  error?: string;
  /** A small icon at the start of the field, such as a magnifier for search. */
  icon?: IconName;
  inputStyle?: StyleProp<TextStyle>;
}

/** Labelled text input with a clear focus state; the label doubles as the accessibility label. */
export function Field({ label, hint, error, icon, inputStyle, onFocus, onBlur, multiline, ...input }: Props): React.JSX.Element {
  const theme = useTheme();
  const [focused, setFocused] = React.useState(false);
  const border = error ? theme.emergency : focused ? theme.primary : theme.borderStrong;
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <View style={[styles.box, { borderColor: border, backgroundColor: theme.surface, borderWidth: focused || error ? 2 : 1 }, multiline && styles.boxMultiline, webTransition()]}>
        {icon ? <Icon name={icon} size={20} color={focused ? theme.primary : theme.textMuted} style={multiline ? styles.iconTop : undefined} /> : null}
        <TextInput
          {...input}
          multiline={multiline}
          // The error goes into the label, which every screen reader reads; hints are often read late or skipped.
          accessibilityLabel={error ? `${label}, ${error}` : label}
          accessibilityHint={error ? undefined : hint}
          {...(error ? ({ 'aria-invalid': true } as object) : {})}
          placeholderTextColor={theme.textMuted}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, { color: theme.text }, webOutline, inputStyle]}
        />
      </View>
      {error ? (
        <View accessibilityLiveRegion="assertive" style={styles.errorRow}>
          <Icon name="alert-circle" size={16} color={theme.emergency} />
          <Text style={[styles.hint, { color: theme.emergency }]}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={[styles.hint, { color: theme.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

// The box draws the focus ring, so the browser's own outline on the input would double it.
const webOutline = { outlineStyle: 'none' } as unknown as TextStyle;

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs + spacing.xxs },
  label: { fontSize: fontSizes.sm, lineHeight: lineHeights.sm, fontFamily: fonts.semibold },
  box: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, borderRadius: radii.lg, paddingHorizontal: spacing.md },
  boxMultiline: { alignItems: 'flex-start', paddingVertical: spacing.sm },
  iconTop: { marginTop: spacing.sm },
  input: { flex: 1, minHeight: 48, fontSize: fontSizes.md, fontFamily: fonts.regular },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  hint: { flexShrink: 1, fontSize: fontSizes.sm, fontFamily: fonts.regular, lineHeight: lineHeights.sm },
});
