/**
 * Incoming referral: the receiving department opens one doctor's referral to see everything at once,
 * where the patient comes from, who they are, why, when they arrive, then accepts or declines. The
 * server checks the department again (`care-actions`). Patient text is data, shown as plain text.
 * Requirements: 6.3, 13.1
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { canAnswerRequest } from '@medora/shared/logic/access';
import { quickRepliesFor } from '@medora/shared/logic/care';
import { MessageThread } from '../../src/components/MessageThread';
import { pick, type StringKey } from '../../src/i18n/t';
import { answerRequest } from '../../src/services/data';
import { useApp, useT } from '../../src/state/AppProvider';
import { Badge } from '../../src/ui/Badge';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { EmptyState } from '../../src/ui/EmptyState';
import { Notice } from '../../src/ui/Notice';
import { Page } from '../../src/ui/Page';
import { SectionHeader } from '../../src/ui/SectionHeader';
import { fonts, fontSizes, radii, spacing, useTheme } from '../../src/ui/theme';

const DECLINE_REASONS = ['nobed', 'busy', 'equip', 'divert'] as const;

export default function IncomingReferralScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const { data, session, lang } = useApp();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [declining, setDeclining] = React.useState(false);
  const request = data.careRequests.find((r) => r.id === id && session !== null && canAnswerRequest(session, r));

  const act = async (action: 'accept' | 'decline' | 'arrived', reason?: string): Promise<void> => {
    if (!request) return;
    setBusy(true);
    setFailed(false);
    try {
      await answerRequest(request.id, action, reason ? { reason } : {});
      setDeclining(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const back = <Button variant="ghost" icon="chevron-back" fullWidth={false} label={t('staff.referral.back')} onPress={() => router.replace('/(staff)/inbox' as Href)} />;
  if (!request) {
    return (
      <Page title={t('staff.referral.title')}>
        <Card padding="lg">
          <EmptyState icon="document-outline" title={t('staff.referral.notFound')} />
        </Card>
        {back}
      </Page>
    );
  }

  const from = request.patient.referredFrom ? pick(request.patient.referredFrom, lang) : t('patient.requests.fromHospital');
  const rows: Array<[StringKey, string]> = [
    ['staff.referral.from', from],
    ['staff.referral.patient', request.patient.name || t('doctor.patients.unnamed')],
    ...(request.patient.phone ? ([['staff.referral.phone', request.patient.phone]] as Array<[StringKey, string]>) : []),
    ['staff.referral.department', request.department ? t(`unit.name.${request.department}` as StringKey) : t('department.short.general')],
    ['staff.referral.arrival', t('staff.inbox.arriving', { min: request.etaMin, mode: t(`mode.${request.patient.mode}` as StringKey) })],
  ];

  return (
    <Page title={t('staff.referral.title')} subtitle={t('staff.referral.subtitle')}>
      <Card padding="lg" selected={request.status === 'waiting'}>
        <View style={styles.row}>
          <Badge tone="primary" icon="git-network" label={t('staff.inbox.referral')} />
          <Badge tone={request.status === 'waiting' ? 'warning' : request.status === 'accepted' ? 'success' : 'neutral'} label={t(`request.status.${request.status}` as StringKey)} />
        </View>
        {rows.map(([label, value]) => (
          <View key={label} style={[styles.line, { borderBottomColor: theme.border }]}>
            <Text style={[styles.label, { color: theme.textMuted }]}>{t(label)}</Text>
            <Text style={[styles.value, { color: theme.text }]}>{value}</Text>
          </View>
        ))}
        <SectionHeader title={t('staff.referral.reason')} />
        <View style={[styles.quote, { backgroundColor: theme.surfaceAlt, borderLeftColor: theme.primary }]}>
          <Text style={[styles.value, { color: theme.text }]}>{request.patient.description}</Text>
        </View>
        {failed ? <Notice tone="danger">{t('staff.inbox.answerError')}</Notice> : null}
        {request.status === 'waiting' && !declining ? (
          <View style={styles.buttons}>
            <View style={styles.flex}>
              <Button size="lg" icon="checkmark" label={t('staff.inbox.accept')} busy={busy} onPress={() => void act('accept')} />
            </View>
            <View style={styles.flex}>
              <Button size="lg" variant="secondary" icon="close" label={t('staff.inbox.decline')} onPress={() => setDeclining(true)} />
            </View>
          </View>
        ) : null}
        {request.status === 'waiting' && declining ? (
          <View style={styles.stack}>
            {DECLINE_REASONS.map((reason) => (
              <Button key={reason} variant="secondary" label={t(`request.reason.${reason}` as StringKey)} busy={busy} onPress={() => void act('decline', reason)} />
            ))}
            <Button variant="ghost" icon="chevron-back" label={t('common.back')} onPress={() => setDeclining(false)} />
          </View>
        ) : null}
        {request.status === 'accepted' ? <Button size="lg" icon="walk" label={t('staff.inbox.arrived')} busy={busy} onPress={() => void act('arrived')} /> : null}
      </Card>
      {request.status === 'waiting' || request.status === 'accepted' ? (
        <Card padding="lg">
          <SectionHeader title={t('patient.requests.messages')} />
          <MessageThread requestId={request.id} messages={data.messages} me="hospital" quickKeys={quickRepliesFor(request)} />
        </Card>
      ) : null}
      {back}
    </Page>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  line: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { width: 110, fontSize: fontSizes.sm, fontFamily: fonts.medium },
  value: { flex: 1, fontSize: fontSizes.md, fontFamily: fonts.regular },
  quote: { borderLeftWidth: 3, borderRadius: radii.md, padding: spacing.md },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  stack: { gap: spacing.sm },
});
