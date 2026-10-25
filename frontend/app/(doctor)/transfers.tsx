/**
 * Transfer tracking for the doctor's confirmed referrals: which patient, from which hospital to which, why,
 * where the ambulance is along the drive and the minutes left (simulated in the demo from the start time and
 * drive estimate). Transfers on the way come first; arrived ones fold away. Requirements: 13.3
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { parseDecisionRows } from '@medora/shared/logic/decisionTable';
import { positionAlong, transferProgress } from '@medora/shared/logic/transfer';
import type { Transfer } from '@medora/shared/logic/types';
import { MapView, shortLabel } from '../../src/components/MapView';
import { agoText } from '../../src/i18n/ago';
import { patientLabel } from '../../src/i18n/patientLabel';
import { pick, type StringKey } from '../../src/i18n/t';
import { markTransferArrived } from '../../src/services/data';
import { useApp, useT } from '../../src/state/AppProvider';
import { Badge } from '../../src/ui/Badge';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { EmptyState } from '../../src/ui/EmptyState';
import { Icon } from '../../src/ui/Icon';
import { Notice } from '../../src/ui/Notice';
import { Page } from '../../src/ui/Page';
import { Reveal } from '../../src/ui/Reveal';
import { SectionHeader } from '../../src/ui/SectionHeader';
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
  const active = transfers.filter((item) => item.status !== 'arrived');
  const arrived = transfers.filter((item) => item.status === 'arrived');
  const [showArrived, setShowArrived] = React.useState(false);

  return (
    <Page title={t('doctor.transfers.title')} width="readable">
      {transfers.length === 0 ? (
        <Card padding="lg">
          <EmptyState icon="car-outline" title={t('doctor.transfers.empty')} />
        </Card>
      ) : null}
      {active.length > 0 ? <SectionHeader title={t('doctor.transfers.active')} /> : null}
      {active.map((transfer, index) => (
        <Reveal key={transfer.id} index={index}>
          <TransferCard transfer={transfer} now={now} />
        </Reveal>
      ))}
      {arrived.length > 0 ? (
        <Button variant="ghost" icon={showArrived ? 'chevron-up' : 'chevron-down'} label={t('doctor.transfers.arrivedList', { count: arrived.length })} onPress={() => setShowArrived(!showArrived)} />
      ) : null}
      {showArrived ? arrived.map((transfer) => <TransferCard key={transfer.id} transfer={transfer} now={now} />) : null}
      <Button variant="ghost" icon="chevron-back" fullWidth={false} label={t('doctor.transfers.back')} onPress={() => router.push('/(doctor)/refer' as Href)} />
    </Page>
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
  // Doctors read only their own hospital's profile; every hospital's name and position is in the public directory.
  const toProfile = data.hospitalProfiles.find((profile) => profile.hospitalId === transfer.toHospitalId) ?? data.publicDirectory.find((entry) => entry.hospitalId === transfer.toHospitalId);
  const name = referral?.chosenName ? pick(referral.chosenName, lang) : toProfile ? pick(toProfile.name, lang) : transfer.toHospitalId;
  // The request sent to the receiving hospital carries the patient, department and how they travel.
  const request = data.careRequests.find((r) => r.referralId === transfer.referralId && r.hospitalId === transfer.toHospitalId);
  const who = patientLabel(t, request?.patient.name, referral?.sourceRequestId ?? request?.id ?? transfer.referralId);
  const progress = transferProgress(markedArrived ? { ...transfer, status: 'arrived' } : transfer, now);
  const arrived = transfer.status === 'arrived' || markedArrived;
  // Simulated ambulance: a straight line from the sending hospital to the receiving one (13.3).
  const from = data.hospitalProfiles.find((profile) => profile.hospitalId === transfer.fromHospitalId) ?? data.publicDirectory.find((entry) => entry.hospitalId === transfer.fromHospitalId);
  const to = parseDecisionRows(referral?.rows).find((row) => row.hospitalId === transfer.toHospitalId);
  // AI referrals carry positions in their decision rows; a direct referral uses the hospital's profile.
  const toPoint = to?.lat !== undefined && to.lng !== undefined ? { lat: to.lat, lng: to.lng } : toProfile ? { lat: toProfile.lat, lng: toProfile.lng } : undefined;
  const fromName = from ? pick(from.name, lang) : transfer.fromHospitalId;

  return (
    <Card padding="lg" tone={arrived ? 'success' : undefined}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{who}</Text>
        <Badge tone={arrived ? 'success' : progress.due ? 'warning' : 'info'} icon={arrived ? 'checkmark-done' : 'car'} label={arrived ? t('doctor.transfers.arrived') : progress.due ? t('doctor.transfers.due') : t('doctor.transfers.minutesLeft', { min: progress.minutesLeft })} />
      </View>
      <View style={styles.route}>
        <Icon name="git-network" size={18} color={theme.primary} />
        <Text style={[styles.routeText, { color: theme.text }]}>{t('doctor.transfers.route', { from: fromName, to: name })}</Text>
      </View>
      {/* Patient text is data, shown as plain text and never interpreted. */}
      {referral ? (
        <Text numberOfLines={2} style={[styles.body, { color: theme.text }]}>
          {[request?.department ? t(`department.short.${request.department}` as StringKey) : null, referral.text].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      <Text style={[styles.muted, { color: theme.textMuted }]}>{t('doctor.transfers.started', { ago: agoText(t, transfer.startedAt, now) })}</Text>
      {from && toPoint ? (
        <MapView
          height={180}
          accessibilityLabel={t('map.alt.transfer')}
          route={[from, toPoint]}
          markers={[
            { id: 'from', point: { lat: from.lat, lng: from.lng }, kind: 'me', label: shortLabel(fromName) },
            { id: 'to', point: toPoint, kind: 'chosen', label: shortLabel(name) },
            ...(arrived ? [] : [{ id: 'ambulance', point: positionAlong(from, toPoint, progress.fraction), kind: 'vehicle' as const }]),
          ]}
        />
      ) : null}
      {from && toPoint && !arrived ? <Text style={[styles.muted, { color: theme.textMuted }]}>{t('doctor.transfers.ambulance')}</Text> : null}
      <View style={[styles.track, { backgroundColor: theme.border }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress.fraction * 100) }}>
        <View style={[styles.fill, { width: `${Math.round(progress.fraction * 100)}%`, backgroundColor: arrived ? theme.success : theme.primary }]} />
      </View>
      {error ? <Notice tone="danger">{t('doctor.transfers.error')}</Notice> : null}
      {!arrived ? (
        <Button
          variant="secondary"
          icon="flag"
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
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  fill: { height: '100%', borderRadius: radii.sm },
  muted: { fontFamily: fonts.regular, fontSize: fontSizes.sm },
  body: { fontFamily: fonts.regular, fontSize: fontSizes.md, lineHeight: 22 },
  route: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  routeText: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSizes.md },
  title: { flex: 1, fontFamily: fonts.bold, fontSize: fontSizes.lg },
  track: { height: 10, borderRadius: radii.sm, overflow: 'hidden' },
});
