/**
 * Messages on one request. Quick replies are stored as keys and shown in each reader's language;
 * free text is limited to 500 characters. The server decides who sent each message from the token.
 * Requirements: 7.1 to 7.4, 2.4
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MAX_MESSAGE, QUICK_REPLY_KEYS, type QuickReplyKey } from '@medora/shared/logic/care';
import type { Message } from '@medora/shared/logic/types';
import type { StringKey } from '../i18n/t';
import { sendMessage } from '../services/data';
import { useT } from '../state/AppProvider';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { fonts, fontSizes, radii, spacing, useTheme } from '../ui/theme';

interface Props {
  requestId: string;
  messages: Message[];
  /** Which side this reader is, to label and align messages. */
  me: 'patient' | 'hospital';
  disabled?: boolean;
  /** Quick replies offered to the hospital side; doctor referrals use their own set. */
  quickKeys?: readonly QuickReplyKey[];
}

export function MessageThread({ requestId, messages, me, disabled, quickKeys = QUICK_REPLY_KEYS }: Props): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
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
      {thread.length === 0 ? <Text style={[styles.muted, { color: theme.textMuted }]}>{t('patient.requests.noMessages')}</Text> : null}
      {thread.map((m) => (
        <View
          key={m.id}
          style={[
            styles.bubble,
            m.from === me ? styles.mine : styles.theirs,
            { backgroundColor: m.from === me ? theme.primary : theme.surface, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.who, { color: m.from === me ? theme.onPrimary : theme.textMuted }]}>
            {t(m.from === 'patient' ? (me === 'patient' ? 'patient.requests.fromYou' : 'patient.requests.fromHospital') : me === 'patient' ? 'patient.requests.fromHospital' : 'patient.requests.fromYou')}
          </Text>
          <Text style={[styles.body, { color: m.from === me ? theme.onPrimary : theme.text }]}>
            {m.key ? t(`message.quickReply.${m.key}` as StringKey) : m.text}
          </Text>
        </View>
      ))}
      {failed ? <Text style={[styles.muted, { color: theme.emergency }]}>{t('message.sendError')}</Text> : null}
      {!disabled ? (
        <>
          {me === 'hospital' ? (
            <View style={styles.quick}>
              {quickKeys.map((key) => (
                <Button key={key} variant="secondary" label={t(`message.quickReply.${key}` as StringKey)} disabled={busy} onPress={() => void send({ key })} />
              ))}
            </View>
          ) : null}
          <Field label={t('message.inputPlaceholder')} value={text} onChangeText={setText} maxLength={MAX_MESSAGE} multiline />
          <Button label={t('patient.requests.send')} busy={busy} disabled={!text.trim()} onPress={() => void send({ text: text.trim() })} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  muted: { fontFamily: fonts.regular, fontSize: fontSizes.sm },
  bubble: { borderWidth: 1, borderRadius: radii.md, padding: spacing.sm, maxWidth: '85%', gap: 2 },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
  who: { fontFamily: fonts.medium, fontSize: fontSizes.xs },
  body: { fontFamily: fonts.regular, fontSize: fontSizes.md },
  quick: { gap: spacing.xs },
});
