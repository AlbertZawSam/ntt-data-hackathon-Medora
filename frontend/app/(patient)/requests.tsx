/**
 * My requests: live status of each request (accepted automatically, waiting, declined with a
 * reason), cancel, and the message thread with the hospital. Requirements: 6.3 to 6.6, 7.1 to 7.4
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NO_REPLY_MS, isDeclineReason, patientCanCancel } from '@medora/shared/logic/care';
import type { CareRequest, ReferralProgressStatus } from '@medora/shared/logic/types';
import { MessageThread } from '../../src/components/MessageThread';
import { agoText } from '../../src/i18n/ago';
import { pick, type StringKey } from '../../src/i18n/t';
import { cancelRequest } from '../../src/services/data';
import { useApp, useT } from '../../src/state/AppProvider';
import { Badge } from '../../src/ui/Badge';
import { Button } from '../../src/ui/Button';
import { Card, type Tone } from '../../src/ui/Card';
import { ConfirmPanel } from '../../src/ui/ConfirmPanel';
import { EmptyState } from '../../src/ui/EmptyState';
import { Notice } from '../../src/ui/Notice';
import { Page } from '../../src/ui/Page';
import { Icon, type IconName } from '../../src/ui/Icon';
import { Reveal } from '../../src/ui/Reveal';
import { SkeletonCard } from '../../src/ui/Skeleton';
import { fonts, fontSizes, spacing, useTheme } from '../../src/ui/theme';

const STATUS_LOOK: Record<CareRequest['status'], { tone: Tone; icon: IconName }> = {
  waiting: { tone: 'warning', icon: 'time' },
  accepted: { tone: 'success', icon: 'checkmark-circle' },
  declined: { tone: 'danger', icon: 'close-circle' },
  cancelled: { tone: 'neutral', icon: 'remove-circle' },
  no_reply: { tone: 'warning', icon: 'help-circle' },
  completed: { tone: 'success', icon: 'ribbon' },
};

/** How a doctor's referral reads on the patient's request: waiting, good news, or a setback. */
const REFERRAL_TONE: Record<ReferralProgressStatus, Tone> = {
  waiting: 'info',
  accepted: 'success',
  confirmed: 'success',
  arrived: 'success',
  declined: 'warning',
  set_aside: 'warning',
};

export default function PatientRequestsScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const { data, session, lang } = useApp();
  const [now, setNow] = React.useState(Date.now());
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  // The request whose cancel the patient tapped, waiting for "Yes, cancel request".
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  const mine = React.useMemo(
    () => data.careRequests.filter((r) => r.ownerId === session?.userId).sort((a, b) => b.createdAtMs - a.createdAtMs),
    [data.careRequests, session?.userId],
  );

  /** A waiting request nobody answered in 45 seconds shows as "no reply" so the patient can try another hospital. */
  const statusOf = (r: CareRequest): CareRequest['status'] => (r.status === 'waiting' && now - r.createdAtMs >= NO_REPLY_MS ? 'no_reply' : r.status);

  /** Where the request stands, as three steps: sent, the hospital looking at it, and its answer. */
  const stepsOf = (status: CareRequest['status']): Array<{ key: StringKey; state: StepState }> => {
    const answered = status === 'accepted' || status === 'completed' || status === 'declined';
    return [
      { key: 'patient.requests.stepSent', state: 'done' },
      { key: 'patient.requests.stepReview', state: answered ? 'done' : 'active' },
      { key: 'patient.requests.stepAnswer', state: status === 'declined' ? 'error' : answered ? 'done' : 'pending' },
    ];
  };

  const minutesAgo = (ms: number): string => {
    return t('patient.requests.sentAgo', { ago: agoText(t, ms, now) });
  };

  return (
    <Page title={t('patient.requests.title')} subtitle={t('patient.requests.sub')} width="readable">
      {mine.length === 0 && !data.isSynced ? (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </>
      ) : null}
      {mine.length === 0 && data.isSynced ? (
        <Card padding="lg">
          <EmptyState icon="chatbubbles-outline" title={t('patient.requests.emptyTitle')} text={t('patient.requests.empty')} actionLabel={t('patient.requests.emptyAction')} onAction={() => router.push('/(patient)/care' as Href)} />
        </Card>
      ) : null}
      {mine.map((r, index) => {
        const status = statusOf(r);
        const look = STATUS_LOOK[status];
        // While a doctor's referral is in progress, the referral is the news: no "no reply" warning.
        // The API returns null (not undefined) for a request that was never referred.
        const referred = r.referredTo != null && r.referredTo.status !== 'declined' && r.referredTo.status !== 'set_aside';
        // The patient can cancel until the doctor confirms the transfer; the server checks the same rule.
        const open = patientCanCancel({ status, referredTo: r.referredTo });
        const chat = status === 'accepted' || status === 'waiting';
        const expanded = openId === r.id;
        return (
          <Reveal key={r.id} index={index}>
            <Card padding="lg" selected={status === 'accepted'}>
              <View style={styles.head}>
                <View style={styles.flex}>
                  <Text style={[styles.name, { color: theme.text }]}>{r.hospitalName ? pick(r.hospitalName, lang) : r.hospitalId}</Text>
                  {r.department ? <Text style={[styles.meta, { color: theme.primary }]}>{t(`department.short.${r.department}` as StringKey)}</Text> : null}
                  <Text style={[styles.meta, { color: theme.textMuted }]}>{minutesAgo(r.createdAtMs)}</Text>
                </View>
                <View accessibilityLiveRegion="polite">
                  <Badge tone={look.tone} icon={look.icon} label={t(`request.status.${status}` as StringKey)} />
                </View>
              </View>


              {status !== 'cancelled' ? <Steps steps={stepsOf(status)} /> : null}

              {r.referredTo && status !== 'cancelled' ? (
                <Notice
                  tone={REFERRAL_TONE[r.referredTo.status]}
                  title={t('patient.requests.referredTo', { hospital: pick(r.referredTo.name, lang) })}
                >
                  {t(`referralProgress.${r.referredTo.status}` as StringKey)}
                </Notice>
              ) : null}
              {r.auto && status === 'accepted' ? <Notice tone="success">{t('patient.requests.autoAccepted')}</Notice> : null}
              {status === 'declined' && isDeclineReason(r.reason) ? (
                <Notice tone="warning">{t(`request.reason.${r.reason}` as StringKey)}</Notice>
              ) : null}
              {status === 'no_reply' && !referred ? (
                <Notice tone="warning" actionLabel={open && confirmId !== r.id ? t('patient.requests.cancel') : undefined} onAction={() => setConfirmId(r.id)}>
                  {t('patient.requests.noReply')}
                </Notice>
              ) : null}

              {open && confirmId === r.id ? (
                <ConfirmPanel
                  title={t('patient.requests.cancelAsk', { hospital: r.hospitalName ? pick(r.hospitalName, lang) : r.hospitalId })}
                  body={t('patient.requests.cancelBody')}
                  confirmLabel={t('patient.requests.cancelYes')}
                  cancelLabel={t('patient.requests.cancelKeep')}
                  busy={busyId === r.id}
                  onCancel={() => setConfirmId(null)}
                  onConfirm={() => {
                    setBusyId(r.id);
                    void cancelRequest(r.id).finally(() => {
                      setBusyId(null);
                      setConfirmId(null);
                    });
                  }}
                />
              ) : null}
              <View style={styles.buttons}>
                {chat ? (
                  <View style={styles.flex}>
                    <Button variant={expanded ? 'ghost' : 'secondary'} icon={expanded ? 'chevron-up' : 'chatbubbles'} label={expanded ? t('patient.requests.hide') : t('patient.requests.open')} onPress={() => setOpenId(expanded ? null : r.id)} />
                  </View>
                ) : null}
                {open && confirmId !== r.id ? (
                  <Button variant="ghost" icon="close-circle-outline" fullWidth={false} label={t('patient.requests.cancel')} onPress={() => setConfirmId(r.id)} />
                ) : null}
              </View>

              {chat && expanded ? (
                <Reveal y={6}>
                  <Text accessibilityRole="header" style={[styles.name, { color: theme.text }]}>{t('patient.requests.messages')}</Text>
                  <MessageThread requestId={r.id} messages={data.messages} me="patient" />
                </Reveal>
              ) : null}
            </Card>
          </Reveal>
        );
      })}
    </Page>
  );
}

type StepState = 'done' | 'active' | 'pending' | 'error';

/** Three steps in a row, each with an icon and a word for its state, so progress never depends on colour alone. */
function Steps({ steps }: { steps: Array<{ key: StringKey; state: StepState }> }): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const look: Record<StepState, { icon: IconName; color: string }> = {
    done: { icon: 'checkmark-circle', color: theme.success },
    active: { icon: 'time', color: theme.primary },
    pending: { icon: 'ellipse-outline', color: theme.textMuted },
    error: { icon: 'close-circle', color: theme.emergency },
  };
  return (
    <View accessibilityRole="list" style={styles.steps}>
      {steps.map((step, index) => (
        <React.Fragment key={step.key}>
          {index > 0 ? <View style={[styles.stepLine, { backgroundColor: step.state === 'pending' ? theme.border : look.done.color }]} /> : null}
          <View accessible accessibilityLabel={`${t(step.key)}, ${t(`timeline.state.${step.state}`)}`} style={styles.step}>
            <Icon name={look[step.state].icon} size={22} color={look[step.state].color} />
            <Text style={[styles.stepText, { color: step.state === 'pending' ? theme.textMuted : theme.text }]}>{t(step.key)}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  steps: { flexDirection: 'row', alignItems: 'flex-start' },
  step: { flex: 1, alignItems: 'center', gap: spacing.xs },
  stepLine: { height: 2, flex: 0.4, marginTop: 10 },
  stepText: { fontSize: fontSizes.sm, lineHeight: 20, fontFamily: fonts.medium, textAlign: 'center' },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  name: { fontSize: fontSizes.lg, fontFamily: fonts.bold },
  meta: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
