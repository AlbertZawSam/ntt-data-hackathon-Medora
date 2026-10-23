/**
 * Transfer tracking: the doctor's own confirmed transfers with a simulated ambulance moving on the map
 * and the minutes left (simulated in the demo; a real position feed would replace it).
 * Requirements: 13.4, 17.3
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { along, minutesLeft, tripProgress } from '@medora/shared/logic/mapView';
import type { DecisionRow } from '@medora/shared/logic/types';
import { MapView } from '../../src/components/MapView';
import { pick, type StringKey } from '../../src/i18n/t';
import { useApp, useT } from '../../src/state/AppProvider';
import { Screen } from '../../src/ui/Screen';
import { fonts, fontSizes, radii, spacing, useTheme } from '../../src/ui/theme';

/** The stored transfer: the schema calls the start time `startedAt`. */
type StoredTransfer = { id: string; referralId: string; toHospitalId: string; ownerId: string; etaMin: number; status: string; startedAt?: number };

export default function DoctorTransfersScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { data, lang, session } = useApp();
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);
  const origin = data.hospitalProfiles.find((p) => p.hospitalId === session?.hospitalId);
  const rows = React.useMemo(
    () => (data.transfers as unknown as StoredTransfer[]).filter((x) => x.ownerId === session?.userId),
    [data.transfers, session?.userId],
  );
  const destination = (referralId: string, toHospitalId: string): DecisionRow | undefined => {
    const list = data.referrals.find((r) => r.id === referralId)?.rows;
    return (Array.isArray(list) ? (list as DecisionRow[]) : []).find((r) => r.hospitalId === toHospitalId);
  };
  const nameOf = (referralId: string, toHospitalId: string): string => {
    const named = data.referrals.find((r) => r.id === referralId)?.chosenName;
    return named ? pick(named, lang) : toHospitalId;
  };

  return (
    <Screen title={t('doctor.transfers.title')}>
      {rows.length === 0 ? <Text style={[styles.note, { color: theme.textMuted }]}>{t('doctor.transfers.empty')}</Text> : null}
      {rows.map((x) => {
        const to = destination(x.referralId, x.toHospitalId);
        const started = x.startedAt ?? now;
        const progress = x.status === 'arrived' ? 1 : tripProgress(started, x.etaMin, now);
        return (
          <View key={x.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.name, { color: theme.text }]}>{t('doctor.transfers.to', { hospital: nameOf(x.referralId, x.toHospitalId) })}</Text>
            <Text style={[styles.status, { color: x.status === 'arrived' ? theme.success : theme.warning }]}>
              {t(x.status === 'in_progress' ? 'doctor.transfers.inProgress' : (`doctor.transfers.${x.status}` as StringKey))}
            </Text>
            <Text style={[styles.note, { color: theme.textMuted }]}>{t('doctor.transfers.minLeft', { min: x.status === 'arrived' ? 0 : minutesLeft(started, x.etaMin, now) })}</Text>
            {origin && to ? (
              <>
                <Text style={[styles.note, { color: theme.textMuted }]}>{t('doctor.transfers.mapTitle')}</Text>
                <MapView
                  accessibilityLabel={t('map.alt.transfer')}
                  markers={[
                    { id: 'from', point: origin, kind: 'me', label: pick(origin.name, lang) },
                    { id: 'to', point: to, kind: 'chosen', label: pick(to.name, lang) },
                    { id: 'van', point: along(origin, to, progress), kind: 'vehicle' },
                  ]}
                  route={[origin, to]}
                />
              </>
            ) : null}
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  name: { fontSize: fontSizes.lg, fontFamily: fonts.semibold },
  status: { fontSize: fontSizes.md, fontFamily: fonts.semibold },
  note: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
});
