/**
 * Inbox: patient requests and doctor referrals for the staff member's own hospital. Accept, decline with a reason and an
 * optional note, undo an automatic acceptance for 60 seconds, and message the patient. A new waiting
 * request raises an alert banner with a vibration. The server checks hospital and role again.
 * Requirements: 6.3, 6.4, 10.2, 10.3, 10.5
 */
import React from 'react';
import { Platform, StyleSheet, Text, Vibration, View } from 'react-native';
import { quickRepliesFor, undoSecondsLeft } from '@medora/shared/logic/care';
import type { CareRequest } from '@medora/shared/logic/types';
import { MessageThread } from '../../src/components/MessageThread';
import type { StringKey } from '../../src/i18n/t';
import { answerRequest } from '../../src/services/data';
import { useApp, useT } from '../../src/state/AppProvider';
import { Badge } from '../../src/ui/Badge';
import { Button } from '../../src/ui/Button';
import { Card, type Tone } from '../../src/ui/Card';
import { EmptyState } from '../../src/ui/EmptyState';
import { Field } from '../../src/ui/Field';
import { Icon, type IconName } from '../../src/ui/Icon';
import { Notice } from '../../src/ui/Notice';
import { Page } from '../../src/ui/Page';
import { Reveal } from '../../src/ui/Reveal';
import { brand, fonts, fontSizes, radii, spacing, useTheme } from '../../src/ui/theme';

const DECLINE_REASONS = ['nobed', 'busy', 'equip', 'divert'] as const;
const DECLINE_ICON: Record<(typeof DECLINE_REASONS)[number], IconName> = { nobed: 'bed-outline', busy: 'person-outline', equip: 'construct-outline', divert: 'swap-horizontal' };
const CLOSED: ReadonlyArray<CareRequest['status']> = ['declined', 'cancelled', 'completed'];
const MODE_ICON: Record<string, IconName> = { car: 'car', taxi: 'car-sport', ambulance: 'medkit', walking: 'walk' };
const STATUS_TONE: Record<CareRequest['status'], Tone> = { waiting: 'warning', accepted: 'success', declined: 'danger', cancelled: 'neutral', no_reply: 'warning', completed: 'success' };
/** The automatic-acceptance undo window, for the countdown bar. */
const UNDO_WINDOW_S = 60;

export default function StaffInboxScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { data, session } = useApp();
  const [now, setNow] = React.useState(Date.now());
  const [busy, setBusy] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [declining, setDeclining] = React.useState<string | null>(null);
  const [chatOpen, setChatOpen] = React.useState<string | null>(null);
  const [note, setNote] = React.useState('');
  const seen = React.useRef<Set<string> | null>(null);

  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const requests = React.useMemo(
    () =>
      data.careRequests
        .filter((r) => r.hospitalId === session?.hospitalId && !CLOSED.includes(r.status))
        .sort((a, b) => b.createdAtMs - a.createdAtMs),
    [data.careRequests, session?.hospitalId],
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
    <Page
      title={t('staff.inbox.title')}
      subtitle={t('staff.inbox.sub')}
      actions={waiting.length > 0 ? <Badge tone="warning" icon="notifications" label={`${t('staff.inbox.alert')}: ${waiting.length}`} /> : undefined}
      width="readable"
    >
      {waiting.length > 0 ? (
        <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[styles.alert, { backgroundColor: theme.accent }]}>
          <Icon name="notifications" size={24} color={brand.ink} />
          <Text style={[styles.alertText, { color: brand.ink }]}>{`${t('staff.inbox.alert')}: ${waiting.length}`}</Text>
        </View>
      ) : null}
      {failed ? <Notice tone="danger">{t('staff.inbox.answerError')}</Notice> : null}
      {requests.length === 0 ? (
        <Card padding="lg">
          <EmptyState icon="mail-open-outline" title={t('staff.inbox.empty')} />
        </Card>
      ) : null}
      {requests.map((r, index) => {
        const undoLeft = undoSecondsLeft(r, now);
        const name = r.patient.name || t('patient.requests.fromHospital');
        const answerable = r.status === 'waiting' || r.status === 'no_reply';
        return (
          <Reveal key={r.id} index={index}>
            <Card padding="lg" selected={r.status === 'waiting'}>
              <View style={styles.head}>
                <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}>
                  <Icon name={r.referralId ? 'git-network' : 'person'} size={24} color={theme.primary} />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.name, { color: theme.text }]}>{name}</Text>
                  {r.patient.phone ? <Text style={[styles.note, { color: theme.textMuted }]}>{r.patient.phone}</Text> : null}
                </View>
                <Badge tone={STATUS_TONE[r.status]} label={t(`request.status.${r.status}` as StringKey)} />
              </View>
              <View style={styles.row}>
                {r.referralId ? <Badge tone="primary" icon="git-network" label={t('staff.inbox.referral')} /> : null}
                <Badge tone="info" icon={MODE_ICON[r.patient.mode] ?? 'navigate'} label={t('staff.inbox.arriving', { min: r.etaMin, mode: t(`mode.${r.patient.mode}` as StringKey) })} />
              </View>
              {/* Patient text is data, shown as plain text and never interpreted. */}
              <View style={[styles.quote, { backgroundColor: theme.surfaceAlt, borderLeftColor: theme.primary }]}>
                <Text style={[styles.body, { color: theme.text }]}>{r.patient.description}</Text>
              </View>
              {r.auto && r.status === 'accepted' ? <Notice tone="info">{t('staff.inbox.auto')}</Notice> : null}

              {answerable ? (
                declining === r.id ? (
                  <View style={styles.stack}>
                    {DECLINE_REASONS.map((reason) => (
                      <Button key={reason} variant="secondary" icon={DECLINE_ICON[reason]} label={t(`request.reason.${reason}` as StringKey)} busy={busy === r.id} onPress={() => void act(r.id, 'decline', { reason, ...(note.trim() ? { note: note.trim() } : {}) })} />
                    ))}
                    <Field label={t('staff.inbox.noteLabel')} icon="create-outline" value={note} onChangeText={setNote} maxLength={200} />
                    <Button variant="ghost" icon="chevron-back" label={t('common.back')} onPress={() => setDeclining(null)} />
                  </View>
                ) : (
                  <View style={styles.buttons}>
                    <View style={styles.flex}>
                      <Button size="lg" icon="checkmark" label={t('staff.inbox.accept')} busy={busy === r.id} onPress={() => void act(r.id, 'accept')} />
                    </View>
                    <View style={styles.flex}>
                      <Button size="lg" variant="secondary" icon="close" label={t('staff.inbox.decline')} onPress={() => setDeclining(r.id)} />
                    </View>
                  </View>
                )
              ) : null}

              {undoLeft > 0 ? (
                <View style={[styles.undo, { backgroundColor: theme.infoSoft }]}>
                  <View style={[styles.undoBar, { backgroundColor: theme.info, width: `${Math.max(4, Math.min(100, (undoLeft / UNDO_WINDOW_S) * 100))}%` }]} />
                  <Button variant="secondary" icon="arrow-undo" label={t('staff.inbox.undoSeconds', { s: undoLeft })} busy={busy === r.id} onPress={() => void act(r.id, 'undo')} />
                </View>
<<<<<<< HEAD
              ) : null}
              {r.status === 'accepted' ? <Button size="lg" icon="walk" label={t('staff.inbox.arrived')} busy={busy === r.id} onPress={() => void act(r.id, 'arrived')} /> : null}
              {r.status === 'accepted' ? (
                <>
                  <Button variant={chatOpen === r.id ? 'ghost' : 'secondary'} icon={chatOpen === r.id ? 'chevron-up' : 'chatbubbles'} label={t('staff.inbox.messages')} onPress={() => setChatOpen(chatOpen === r.id ? null : r.id)} />
                  {chatOpen === r.id ? <MessageThread requestId={r.id} messages={data.messages} me="hospital" /> : null}
                </>
              ) : null}
            </Card>
          </Reveal>
=======
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
>>>>>>> 59db478012eb14bc9d137be476feffc3edcca1de
        );
      })}
    </Page>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  alert: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.lg, padding: spacing.md },
  alertText: { fontFamily: fonts.bold, fontSize: fontSizes.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: fontSizes.lg, fontFamily: fonts.bold },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  note: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
  quote: { borderLeftWidth: 4, borderRadius: radii.md, padding: spacing.md },
  body: { fontSize: fontSizes.md, fontFamily: fonts.regular, lineHeight: 24 },
  stack: { gap: spacing.sm },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  undo: { borderRadius: radii.lg, padding: spacing.sm, gap: spacing.sm, overflow: 'hidden' },
  undoBar: { height: 4, borderRadius: 2 },
});
