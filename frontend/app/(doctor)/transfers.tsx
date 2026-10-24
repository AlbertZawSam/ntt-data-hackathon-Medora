/**
 * Transfer tracking for the doctor's confirmed referrals: where the ambulance is along the drive and
 * the minutes left, simulated in the demo from the start time and drive estimate. Requirements: 13.3
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { parseDecisionRows } from '@medora/shared/logic/decisionTable';
import { positionAlong, transferProgress } from '@medora/shared/logic/transfer';
import type { Transfer } from '@medora/shared/logic/types';
import { MapView, shortLabel } from '../../src/components/MapView';
import { pick } from '../../src/i18n/t';
import { markTransferArrived } from '../../src/services/data';
import { useApp, useT } from '../../src/state/AppProvider';
import { Button } from '../../src/ui/Button';
import { FormScreen } from '../../src/ui/FormScreen';
import { fonts, fontSizes, radii, spacing, useTheme } from '../../src/ui/theme';

export default function DoctorTransfersScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const { data, session } = useApp();
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  const transfers = React.useMemo(
    () => data.transfers.filter((item) => item.ownerId === session?.userId).sort((left, right) => right.startedAt - left.startedAt),
    [data.transfers, session?.userId],
  );

  return (
    <FormScreen title={t('doctor.transfers.title')} subtitle={t('doctor.transfers.simulated')}>
      {transfers.length === 0 ? <Text style={[styles.muted, { color: theme.textMuted }]}>{t('doctor.transfers.empty')}</Text> : null}
      {transfers.map((transfer) => (
        <TransferCard key={transfer.id} transfer={transfer} now={now} />
      ))}
      <Button variant="link" label={t('doctor.transfers.back')} onPress={() => router.push('/(doctor)/refer' as Href)} />
    </FormScreen>
  );
}

function TransferCard({ transfer, now }: { transfer: Transfer; now: number }): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { data, lang } = useApp();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(false);
  // Shown as soon as the server accepts the click: a transfer changed by the server doesn't always arrive live.
  const [markedArrived, setMarkedArrived] = React.useState(false);
  const referral = data.referrals.find((item) => item.id === transfer.referralId);
  const name = referral?.chosenName ? pick(referral.chosenName, lang) : transfer.toHospitalId;
  const progress = transferProgress(markedArrived ? { ...transfer, status: 'arrived' } : transfer, now);
  const arrived = transfer.status === 'arrived' || markedArrived;
  // Simulated ambulance: a straight line from the sending hospital to the receiving one (13.3).
  const from = data.hospitalProfiles.find((profile) => profile.hospitalId === transfer.fromHospitalId);
  const to = parseDecisionRows(referral?.rows).find((row) => row.hospitalId === transfer.toHospitalId);
  const toPoint = to?.lat !== undefined && to.lng !== undefined ? { lat: to.lat, lng: to.lng } : undefined;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: arrived ? theme.success : theme.border }]}>
      <Text style={[styles.title, { color: theme.text }]}>{t('doctor.transfers.toHospital', { name })}</Text>
      {referral ? (
        <Text numberOfLines={2} style={[styles.muted, { color: theme.textMuted }]}>
          {referral.text}
        </Text>
      ) : null}
      {from && toPoint ? (
        <MapView
          height={180}
          accessibilityLabel={t('map.alt.transfer')}
          route={[from, toPoint]}
          markers={[
            { id: 'from', point: { lat: from.lat, lng: from.lng }, kind: 'me', label: t('doctor.refer.mapYou') },
            { id: 'to', point: toPoint, kind: 'chosen', label: shortLabel(name) },
            ...(arrived ? [] : [{ id: 'ambulance', point: positionAlong(from, toPoint, progress.fraction), kind: 'vehicle' as const }]),
          ]}
        />
      ) : null}
      {from && toPoint && !arrived ? <Text style={[styles.muted, { color: theme.textMuted }]}>{t('doctor.transfers.ambulance')}</Text> : null}
      <View style={[styles.track, { backgroundColor: theme.border }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress.fraction * 100) }}>
        <View style={[styles.fill, { width: `${Math.round(progress.fraction * 100)}%`, backgroundColor: arrived ? theme.success : theme.primary }]} />
      </View>
      <Text style={[styles.status, { color: arrived ? theme.success : progress.due ? theme.warning : theme.text }]}>
        {arrived ? t('doctor.transfers.arrived') : progress.due ? t('doctor.transfers.due') : t('doctor.transfers.minutesLeft', { min: progress.minutesLeft })}
      </Text>
      {error ? <Text style={[styles.muted, { color: theme.emergency }]}>{t('doctor.transfers.error')}</Text> : null}
      {!arrived ? (
        <Button
          variant="secondary"
          label={t('doctor.transfers.markArrived')}
          busy={busy}
          onPress={() => {
            setBusy(true);
            setError(false);
            void markTransferArrived(transfer)
              .then(() => setMarkedArrived(true))
              .catch(() => setError(true))
              .finally(() => setBusy(false));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', borderWidth: 1, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm },
  fill: { height: '100%', borderRadius: radii.sm },
  muted: { fontFamily: fonts.regular, fontSize: fontSizes.sm },
  status: { fontFamily: fonts.semibold, fontSize: fontSizes.md },
  title: { fontFamily: fonts.semibold, fontSize: fontSizes.lg },
  track: { height: 10, borderRadius: radii.sm, overflow: 'hidden' },
});
