/**
 * Messages on one request, as a chat: bubbles on each side with the time, quick replies as chips, and a composer. Quick replies
 * are stored as keys and shown in each reader's language; free text is limited to 500 characters. The server decides who sent
 * each message from the token. Requirements: 7.1 to 7.4, 2.4
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MAX_MESSAGE, QUICK_REPLY_KEYS, type QuickReplyKey } from '@medora/shared/logic/care';
import type { Message } from '@medora/shared/logic/types';
import type { StringKey } from '../i18n/t';
import { refreshMessages, sendMessage } from '../services/data';
import { useApp, useT } from '../state/AppProvider';
import { Chip } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Notice } from '../ui/Notice';
import { fonts, fontSizes, lineHeights, radii, spacing, useTheme } from '../ui/theme';

interface Props {
  requestId: string;
  messages: Message[];
  /** Which side this reader is, to label and align messages. */
  me: 'patient' | 'hospital';
  disabled?: boolean;
  /** Quick replies offered to the hospital side; doctor referrals use their own set. */
  quickKeys?: readonly QuickReplyKey[];
  /** On the hospital side, who the other person is: a patient, or the doctor who referred them. */
  other?: 'patient' | 'doctor';
}

/** How often an open thread reads its messages again. */
const REFRESH_MS = 5_000;

/** The time in the app's language (not the device's), so Thai readers see Thai digits and order. */
const clock = (ms: number, lang: string): string => new Date(ms).toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-GB', { hour: '2-digit', minute: '2-digit' });

export function MessageThread({ requestId, messages, me, disabled, quickKeys = QUICK_REPLY_KEYS, other = 'patient' }: Props): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { lang } = useApp();
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  // While the thread is open, read it again every few seconds, so a reply shows even if its live event was missed.
  React.useEffect(() => {
    void refreshMessages(requestId);
    const timer = setInterval(() => void refreshMessages(requestId), REFRESH_MS);
    return () => clearInterval(timer);
  }, [requestId]);
  const thread = React.useMemo(
    () => messages.filter((m) => m.requestId === requestId).sort((a, b) => a.createdAtMs - b.createdAtMs),
    [messages, requestId],
  );

  const send = async (message: { key: QuickReplyKey } | { text: string }): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      await sendMessage(requestId, message);
      if ('text' in message) setText('');
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View accessibilityLiveRegion="polite" style={[styles.log, { backgroundColor: theme.surfaceAlt }]}>
        {thread.length === 0 ? <Text style={[styles.muted, { color: theme.textMuted }]}>{t('patient.requests.noMessages')}</Text> : null}
        {thread.map((m) => {
          const mine = m.from === me;
          return (
            <View key={m.id} style={[styles.bubble, mine ? styles.mine : styles.theirs, { backgroundColor: mine ? theme.primary : theme.surface, borderColor: mine ? theme.primary : theme.border }]}>
              <Text style={[styles.who, { color: mine ? theme.onPrimary : theme.textMuted }]}>
                {t(mine ? 'patient.requests.fromYou' : me === 'patient' ? 'patient.requests.fromHospital' : other === 'doctor' ? 'patient.requests.fromDoctor' : 'patient.requests.fromPatient')}
                {'  ·  '}
                {clock(m.createdAtMs, lang)}
              </Text>
              <Text style={[styles.body, { color: mine ? theme.onPrimary : theme.text }]}>{m.key ? t(`message.quickReply.${m.key}` as StringKey) : m.text}</Text>
            </View>
          );
        })}
      </View>
      {failed ? <Notice tone="danger">{t('message.sendError')}</Notice> : null}
      {!disabled ? (
        <>
          {me === 'hospital' ? (
            <View style={styles.quick}>
              {quickKeys.map((key) => (
                <Chip key={key} label={t(`message.quickReply.${key}` as StringKey)} icon="flash-outline" selected={false} onPress={() => { if (!busy) void send({ key }); }} />
              ))}
            </View>
          ) : null}
          <Field label={t('message.inputPlaceholder')} value={text} onChangeText={setText} maxLength={MAX_MESSAGE} multiline icon="chatbubble-outline" />
          <Button icon="send" label={t('patient.requests.send')} busy={busy} disabled={!text.trim()} onPress={() => void send({ text: text.trim() })} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm + 2 },
  log: { borderRadius: radii.lg, padding: spacing.sm + 2, gap: spacing.sm, minHeight: 64 },
  muted: { fontFamily: fonts.regular, fontSize: fontSizes.sm, textAlign: 'center', padding: spacing.sm },
  bubble: { borderWidth: 1, borderRadius: radii.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.md - 2, maxWidth: '88%', gap: 2 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: radii.sm },
  theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: radii.sm },
  who: { fontFamily: fonts.medium, fontSize: fontSizes.sm, lineHeight: lineHeights.sm },
  body: { fontFamily: fonts.regular, fontSize: fontSizes.md, lineHeight: 22 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
