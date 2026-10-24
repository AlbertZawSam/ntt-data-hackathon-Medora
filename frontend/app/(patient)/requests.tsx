/**
 * My requests: live status of each request (accepted automatically, waiting, declined with a
 * reason), cancel, and the message thread with the hospital. Requirements: 6.3 to 6.6, 7.1 to 7.4
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NO_REPLY_MS } from '@medora/shared/logic/care';
import type { CareRequest } from '@medora/shared/logic/types';
import { MessageThread } from '../../src/components/MessageThread';
import { pick, type StringKey } from '../../src/i18n/t';
import { cancelRequest } from '../../src/services/data';
import { useApp, useT } from '../../src/state/AppProvider';
import { Badge } from '../../src/ui/Badge';
import { Button } from '../../src/ui/Button';
import { Card, type Tone } from '../../src/ui/Card';
import { EmptyState } from '../../src/ui/EmptyState';
import type { IconName } from '../../src/ui/Icon';
import { Notice } from '../../src/ui/Notice';
import { Page } from '../../src/ui/Page';
import { Reveal } from '../../src/ui/Reveal';
import { Timeline, type TimelineStep } from '../../src/ui/Timeline';
import { fonts, fontSizes, spacing, useTheme } from '../../src/ui/theme';

const STATUS_LOOK: Record<CareRequest['status'], { tone: Tone; icon: IconName }> = {
  waiting: { tone: 'warning', icon: 'time' },
  accepted: { tone: 'success', icon: 'checkmark-circle' },
  declined: { tone: 'danger', icon: 'close-circle' },
  cancelled: { tone: 'neutral', icon: 'remove-circle' },
  no_reply: { tone: 'warning', icon: 'help-circle' },
  completed: { tone: 'success', icon: 'ribbon' },
};

export default function PatientRequestsScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const { data, session, lang } = useApp();
  const [now, setNow] = React.useState(Date.now());
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
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
  const stepsFor = (status: CareRequest['status']): TimelineStep[] => {
    const answered = status === 'accepted' || status === 'declined' || status === 'completed';
    return [
      { id: 'sent', title: t('patient.requests.stepSent'), state: 'done' },
      { id: 'review', title: t('patient.requests.stepReview'), state: status === 'waiting' ? 'active' : status === 'cancelled' || status === 'no_reply' ? 'error' : 'done' },
      {
        id: 'answer',
        title: answered || status === 'cancelled' || status === 'no_reply' ? t(`request.status.${status}` as StringKey) : t('patient.requests.stepAnswer'),
        state: status === 'accepted' || status === 'completed' ? 'done' : status === 'declined' || status === 'cancelled' || status === 'no_reply' ? 'error' : 'pending',
      },
    ];
  };

  const minutesAgo = (ms: number): string => {
    const min = Math.floor((now - ms) / 60_000);
    return min < 1 ? t('patient.requests.justNow') : t('patient.requests.sentAgo', { min });
  };

  return (
    <Page title={t('patient.requests.title')} subtitle={t('patient.requests.sub')} width="readable">
      {mine.length === 0 ? (
        <Card padding="lg">
          <EmptyState icon="chatbubbles-outline" title={t('patient.requests.emptyTitle')} text={t('patient.requests.empty')} actionLabel={t('patient.requests.emptyAction')} onAction={() => router.push('/(patient)/care' as Href)} />
        </Card>
      ) : null}
      {mine.map((r, index) => {
        const status = statusOf(r);
        const look = STATUS_LOOK[status];
        const open = status === 'waiting' || status === 'accepted' || status === 'no_reply';
        const chat = status === 'accepted' || status === 'waiting';
        const expanded = openId === r.id;
        return (
          <Reveal key={r.id} index={index}>
            <Card padding="lg" selected={status === 'accepted'}>
              <View style={styles.head}>
                <View style={styles.flex}>
                  <Text style={[styles.name, { color: theme.text }]}>{r.hospitalName ? pick(r.hospitalName, lang) : r.hospitalId}</Text>
                  {r.department ? <Text style={[styles.meta, { color: theme.primary }]}>{t(`department.${r.department}` as StringKey)}</Text> : null}
                  <Text style={[styles.meta, { color: theme.textMuted }]}>{minutesAgo(r.createdAtMs)}</Text>
                </View>
                <View accessibilityLiveRegion="polite">
                  <Badge tone={look.tone} icon={look.icon} label={t(`request.status.${status}` as StringKey)} />
                </View>
              </View>

              <Timeline steps={stepsFor(status)} />

              {r.auto && status === 'accepted' ? <Notice tone="success">{t('patient.requests.autoAccepted')}</Notice> : null}
              {status === 'declined' && r.reason && ['nobed', 'busy', 'equip', 'divert'].includes(r.reason) ? (
                <Notice tone="warning">{t(`request.reason.${r.reason}` as StringKey)}</Notice>
              ) : null}
              {status === 'no_reply' ? <Notice tone="warning">{t('patient.requests.noReply')}</Notice> : null}

              <View style={styles.buttons}>
                {chat ? (
                  <View style={styles.flex}>
                    <Button variant={expanded ? 'ghost' : 'secondary'} icon={expanded ? 'chevron-up' : 'chatbubbles'} label={expanded ? t('patient.requests.hide') : t('patient.requests.open')} onPress={() => setOpenId(expanded ? null : r.id)} />
                  </View>
                ) : null}
                {open ? (
                  <Button
                    variant="ghost"
                    icon="close-circle-outline"
                    fullWidth={false}
                    label={t('patient.requests.cancel')}
                    busy={busyId === r.id}
                    onPress={() => {
                      setBusyId(r.id);
                      void cancelRequest(r.id).finally(() => setBusyId(null));
                    }}
                  />
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  name: { fontSize: fontSizes.lg, fontFamily: fonts.bold },
  meta: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
