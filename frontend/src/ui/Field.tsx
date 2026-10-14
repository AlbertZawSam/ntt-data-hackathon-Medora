import React from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { fonts, fontSizes, radii, spacing, useTheme } from './theme';

interface Props extends Omit<TextInputProps, 'style' | 'placeholder'> {
  label: string;
  hint?: string;
}

/** Labelled text input; the label doubles as the accessibility label. */
export function Field({ label, hint, ...input }: Props): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        placeholderTextColor={theme.textMuted}
        style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
      />
      {hint ? <Text style={[styles.hint, { color: theme.textMuted }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { fontSize: fontSizes.sm, fontFamily: fonts.medium },
  input: { minHeight: 48, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, fontSize: fontSizes.md, fontFamily: fonts.regular },
  hint: { fontSize: fontSizes.xs, fontFamily: fonts.regular },
});
