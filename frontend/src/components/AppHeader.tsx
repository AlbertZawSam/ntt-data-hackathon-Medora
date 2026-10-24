import React from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing, useTheme } from '../ui/theme';
import { BrandMark } from './BrandMark';
import { LanguageToggle } from './LanguageToggle';
import { ProfileMenu } from './ProfileMenu';

/** The top bar on phones and tablets: the logo on the left, language and the person's menu on the right. */
export function AppHeader(): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <BrandMark size={32} />
      <View style={styles.right}>
        <LanguageToggle />
        <ProfileMenu />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
