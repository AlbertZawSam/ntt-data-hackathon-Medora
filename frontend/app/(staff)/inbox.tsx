/**
 * Inbox: patient requests and doctor referrals for the staff member's own hospital. Accept, decline with a reason and an
 * optional note, undo an automatic acceptance for 60 seconds, and message the patient. A new waiting
 * request raises an alert banner with a vibration. The server checks hospital and role again.
 * Requirements: 6.3, 6.4, 10.2, 10.3, 10.5
 */
import React from 'react';
import { Platform, StyleSheet, Text, Vibration, View } from 'react-native';
import { canAnswerRequest } from '@medora/shared/logic/access';
import { quickRepliesFor, undoSecondsLeft } from '@medora/shared/logic/care';
import type { CareRequest } from '@medora/shared/logic/types';
import { MessageThread } from '../../src/components/MessageThread';
import type { StringKey } from '../../src/i18n/t';
import { answerRequest } from '../../src/services/data';
import { useApp, useT } from '../../src/state/AppProvider';
import { Button } from '../../src/ui/Button';
import { Field } from '../../src/ui/Field';
import { Screen } from '../../src/ui/Screen';
import { brand, fonts, fontSizes, radii, spacing, useTheme } from '../../src/ui/theme';

const DECLINE_REASONS = ['nobed', 'busy', 'equip', 'divert'] as const;
const CLOSED: ReadonlyArray<CareRequest['status']> = ['declined', 'cancelled', 'completed'];

export default function StaffInboxScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { data, session } = useApp();
  const [now, setNow] = React.useState(Date.now());
  const [busy, setBusy] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [declining, setDeclining] = React.useState<string | null>(null);
  const [note, setNote] = React.useState('');
  const seen = React.useRef<Set<string> | null>(null);

  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const requests = React.useMemo(
    () =>
      data.careRequests
        // The same rule the server applies: a department's requests reach only that department.
        .filter((r) => session !== null && canAnswerRequest(session, r) && !CLOSED.includes(r.status))
        .sort((a, b) => b.createdAtMs - a.createdAtMs),
    [data.careRequests, session],
  );
  const waiting = requests.filter((r) => r.status === 'waiting');

  // Alert: vibrate once for each request that appears after the first load.
  React.useEffect(() => {
    if (!data.isSynced) return;
    const ids = new Set(waiting.map((r) => r.id));
    if (seen.current && [...ids].some((id) => !seen.current?.has(id)) && Platform.OS !== 'web') Vibration.vibrate([0, 400, 200, 400]);
    seen.current = ids;
  }, [data.isSynced, waiting]);

  const act = async (id: string, action: 'accept' | 'decline' | 'undo' | 'arrived', extra: { reason?: string; note?: string } = {}): Promise<void> => {
    setBusy(id);
    setFailed(false);
    try {
      await answerRequest(id, action, extra);
      setDeclining(null);
      setNote('');
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title={t('staff.inbox.title')}>
      {waiting.length > 0 ? (
        <View accessibilityLiveRegion="assertive" style={[styles.alert, { backgroundColor: theme.accent }]}>
          <Text style={[styles.alertText, { color: brand.ink }]}>{`${t('staff.inbox.alert')}: ${waiting.length}`}</Text>
        </View>
      ) : null}
      {requests.length === 0 ? <Text style={[styles.note, { color: theme.textMuted }]}>{t('staff.inbox.empty')}</Text> : null}
      {failed ? <Text style={[styles.note, { color: theme.emergency }]}>{t('staff.inbox.answerError')}</Text> : null}
      {requests.map((r) => {
        const undoLeft = undoSecondsLeft(r, now);
        return (
          <View key={r.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {r.referralId ? <Text style={[styles.status, { color: theme.primary }]}>{t('staff.inbox.referral')}</Text> : null}
            {r.department ? (
              <Text style={[styles.status, { color: theme.primary }]}>
                {t('staff.inbox.department', { department: t(`unit.name.${r.department}` as StringKey) })}
              </Text>
            ) : null}
            <Text style={[styles.name, { color: theme.text }]}>{r.patient.name || t('patient.requests.fromHospital')}</Text>
            <Text style={[styles.note, { color: theme.textMuted }]}>
              {t('staff.inbox.arriving', { min: r.etaMin, mode: t(`mode.${r.patient.mode}` as StringKey) })}
            </Text>
            {r.patient.phone ? <Text style={[styles.note, { color: theme.textMuted }]}>{r.patient.phone}</Text> : null}
            {/* Patient text is data, shown as plain text and never interpreted. */}
            <Text style={[styles.body, { color: theme.text }]}>{r.patient.description}</Text>
            <Text style={[styles.status, { color: r.status === 'accepted' ? theme.success : theme.warning }]}>{t(`request.status.${r.status}` as StringKey)}</Text>
            {r.auto && r.status === 'accepted' ? <Text style={[styles.note, { color: theme.textMuted }]}>{t('staff.inbox.auto')}</Text> : null}

            {r.status === 'waiting' || r.status === 'no_reply' ? (
              declining === r.id ? (
                <View style={styles.actions}>
                  {DECLINE_REASONS.map((reason) => (
                    <Button key={reason} variant="secondary" label={t(`request.reason.${reason}` as StringKey)} busy={busy === r.id} onPress={() => void act(r.id, 'decline', { reason, ...(note.trim() ? { note: note.trim() } : {}) })} />
                  ))}
                  <Field label={t('staff.inbox.noteLabel')} value={note} onChangeText={setNote} maxLength={200} />
                  <Button variant="link" label={t('common.back')} onPress={() => setDeclining(null)} />
                </View>
              ) : (
                <View style={styles.actions}>
                  <Button label={t('staff.inbox.accept')} busy={busy === r.id} onPress={() => void act(r.id, 'accept')} />
                  <Button variant="secondary" label={t('staff.inbox.decline')} onPress={() => setDeclining(r.id)} />
                </View>
              )
            ) : null}
            {undoLeft > 0 ? <Button variant="secondary" label={t('staff.inbox.undoSeconds', { s: undoLeft })} busy={busy === r.id} onPress={() => void act(r.id, 'undo')} /> : null}
            {r.status === 'accepted' ? <Button label={t('staff.inbox.arrived')} busy={busy === r.id} onPress={() => void act(r.id, 'arrived')} /> : null}
            {r.status === 'accepted' ? (
              <>
                <Text style={[styles.name, { color: theme.text }]}>{t('staff.inbox.messages')}</Text>
                <MessageThread requestId={r.id} messages={data.messages} me="hospital" quickKeys={quickRepliesFor(r)} />
              </>
            ) : null}
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  alert: { borderRadius: radii.md, padding: spacing.md },
  alertText: { fontFamily: fonts.bold, fontSize: fontSizes.lg },
  card: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  name: { fontSize: fontSizes.lg, fontFamily: fonts.semibold },
  body: { fontSize: fontSizes.md, fontFamily: fonts.regular },
  status: { fontSize: fontSizes.md, fontFamily: fonts.semibold },
  note: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
  actions: { gap: spacing.xs },
});
