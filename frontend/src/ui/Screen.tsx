import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LanguageToggle } from '../components/LanguageToggle';
import { fonts, fontSizes, spacing, useTheme } from './theme';

/** Scrollable screen with a title and the language toggle, in a readable column on wide screens. */
export function Screen({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  const theme = useTheme();
  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.column}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
            {title}
          </Text>
          <LanguageToggle />
        </View>
        {children}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, alignItems: 'center', padding: spacing.lg, paddingTop: spacing.xl * 1.5 },
  column: { width: '100%', maxWidth: 560, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1, fontSize: fontSizes.xl, fontFamily: fonts.bold },
});
