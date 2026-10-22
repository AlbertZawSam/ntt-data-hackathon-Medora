/** Transfer tracking: the doctor's own confirmed transfers and their status. Requirements: 13.4, 17.3 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { pick, type StringKey } from '../../src/i18n/t';
import { useApp, useT } from '../../src/state/AppProvider';
import { Screen } from '../../src/ui/Screen';
import { fonts, fontSizes, radii, spacing, useTheme } from '../../src/ui/theme';

export default function DoctorTransfersScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { data, lang, session } = useApp();
  const rows = React.useMemo(
    () => data.transfers.filter((x) => x.ownerId === session?.userId),
    [data.transfers, session?.userId],
  );
  const nameOf = (referralId: string, toHospitalId: string): string => {
    const named = data.referrals.find((r) => r.id === referralId)?.chosenName;
    return named ? pick(named, lang) : toHospitalId;
  };
  return (
    <Screen title={t('doctor.transfers.title')}>
      {rows.length === 0 ? <Text style={[styles.note, { color: theme.textMuted }]}>{t('doctor.transfers.empty')}</Text> : null}
      {rows.map((x) => (
        <View key={x.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.name, { color: theme.text }]}>{t('doctor.transfers.to', { hospital: nameOf(x.referralId, x.toHospitalId) })}</Text>
          <Text style={[styles.status, { color: x.status === 'arrived' ? theme.success : theme.warning }]}>
            {t(x.status === 'in_progress' ? 'doctor.transfers.inProgress' : (`doctor.transfers.${x.status}` as StringKey))}
          </Text>
          <Text style={[styles.note, { color: theme.textMuted }]}>{t('doctor.transfers.eta', { min: x.etaMin })}</Text>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, gap: spacing.xs },
  name: { fontSize: fontSizes.lg, fontFamily: fonts.semibold },
  status: { fontSize: fontSizes.md, fontFamily: fonts.semibold },
  note: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
});
