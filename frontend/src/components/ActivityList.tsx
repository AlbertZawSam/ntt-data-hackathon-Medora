/** Activity log for the user's hospital, newest first. Requirements: 15.2 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { pick } from '../i18n/t';
import { useApp, useT } from '../state/AppProvider';
import { Screen } from '../ui/Screen';
import { fonts, fontSizes, radii, spacing, useTheme } from '../ui/theme';

/** The schema stores the time as `at`; the shared type calls it `createdAt`. */
const when = (a: { createdAt: string }): string => (a as { at?: string }).at ?? a.createdAt ?? '';

export function ActivityList(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { data, lang, session } = useApp();
  const rows = React.useMemo(
    () => data.activities.filter((a) => a.hospitalId === session?.hospitalId).sort((x, y) => when(y).localeCompare(when(x))).slice(0, 200),
    [data.activities, session?.hospitalId],
  );
  return (
    <Screen title={t('activity.title')}>
      {rows.length === 0 ? <Text style={[styles.note, { color: theme.textMuted }]}>{t('activity.empty')}</Text> : null}
      {rows.map((a) => (
        <View key={a.id} style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.text, { color: theme.text }]}>{pick(a.text, lang)}</Text>
          <Text style={[styles.note, { color: theme.textMuted }]}>{`${pick(a.actor, lang)} · ${new Date(when(a)).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB')}`}</Text>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { borderWidth: 1, borderRadius: radii.md, padding: spacing.sm, gap: 2 },
  text: { fontSize: fontSizes.md, fontFamily: fonts.medium },
  note: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
});
