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
import { Button } from '../../src/ui/Button';
import { Screen } from '../../src/ui/Screen';
import { fonts, fontSizes, radii, spacing, useTheme } from '../../src/ui/theme';

export default function PatientRequestsScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const { data, session, lang } = useApp();
  const [now, setNow] = React.useState(Date.now());
  const [busyId, setBusyId] = React.useState<string | null>(null);
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

  return (
    <Screen title={t('patient.requests.title')}>
      {mine.length === 0 ? <Text style={[styles.note, { color: theme.textMuted }]}>{t('patient.requests.empty')}</Text> : null}
      {mine.map((r) => {
        const status = statusOf(r);
        const open = status === 'waiting' || status === 'accepted' || status === 'no_reply';
        return (
          <View key={r.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.name, { color: theme.text }]}>{r.hospitalName ? pick(r.hospitalName, lang) : r.hospitalId}</Text>
            <Text accessibilityLiveRegion="polite" style={[styles.status, { color: status === 'accepted' ? theme.success : status === 'declined' ? theme.emergency : theme.warning }]}>
              {t(`request.status.${status}` as StringKey)}
            </Text>
            {r.auto && status === 'accepted' ? <Text style={[styles.note, { color: theme.textMuted }]}>{t('patient.requests.autoAccepted')}</Text> : null}
            {status === 'declined' && r.reason && ['nobed', 'busy', 'equip', 'divert'].includes(r.reason) ? (
              <Text style={[styles.note, { color: theme.textMuted }]}>{t(`request.reason.${r.reason}` as StringKey)}</Text>
            ) : null}
            {status === 'no_reply' ? <Text style={[styles.note, { color: theme.textMuted }]}>{t('patient.requests.noReply')}</Text> : null}
            {open ? (
              <Button
                variant="secondary"
                label={t('patient.requests.cancel')}
                busy={busyId === r.id}
                onPress={() => {
                  setBusyId(r.id);
                  void cancelRequest(r.id).finally(() => setBusyId(null));
                }}
              />
            ) : null}
            {status === 'accepted' || status === 'waiting' ? (
              <>
                <Text style={[styles.name, { color: theme.text }]}>{t('patient.requests.messages')}</Text>
                <MessageThread requestId={r.id} messages={data.messages} me="patient" />
              </>
            ) : null}
          </View>
        );
      })}
      <Button variant="link" label={t('common.back')} onPress={() => router.replace('/(patient)/home' as Href)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  name: { fontSize: fontSizes.lg, fontFamily: fonts.semibold },
  status: { fontSize: fontSizes.md, fontFamily: fonts.semibold },
  note: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
});
