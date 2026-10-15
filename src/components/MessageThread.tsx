import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { StringKey } from '@/i18n/t';
import { isQuickReplyKey, MAX_MESSAGE_LENGTH, messageTime, QUICK_REPLIES, type Draft, type Side } from '@/logic/messages';
import type { Message } from '@/logic/types';
import { useT } from '@/state/language';
import { fonts, minTouch, radius, spacing, useTheme } from '@/ui/theme';

type Props = {
  messages: Message[];
  // Which side this screen is: the patient or hospital staff.
  me: Side;
  onSend: (draft: Draft) => void;
  // Read-only once the request has ended (requirement 7.4).
  closed?: boolean;
};

// Conversation about one request (task 12, requirement 7). Quick replies are stored as keys and
// shown in the reader's language; free text is shown exactly as written, never translated.
export function MessageThread({ messages, me, onSend, closed = false }: Props) {
  const { colors } = useTheme();
  const { t } = useT();
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0 && text.length <= MAX_MESSAGE_LENGTH;

  const send = () => {
    if (!canSend) return;
    onSend({ text });
    setText('');
  };

  const body = (m: Message) =>
    m.key && isQuickReplyKey(m.key) ? t(`quick.${m.key}` as StringKey) : (m.text ?? '');

  return (
    <View style={styles.wrap}>
      {messages.length === 0 && <Text style={[styles.empty, { color: colors.textMuted }]}>{t('messages.empty')}</Text>}
      {messages.map((m) => {
        const mine = m.from === me;
        const who = mine ? t('messages.you') : t(m.from === 'hospital' ? 'messages.hospital' : 'messages.patient');
        return (
          <View
            key={m.id}
            accessible
            accessibilityLabel={`${who}, ${messageTime(m.createdAtMs)}: ${body(m)}`}
            style={[
              styles.bubble,
              mine
                ? { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: radius.sm / 2 }
                : { alignSelf: 'flex-start', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderBottomLeftRadius: radius.sm / 2 },
            ]}>
            <Text style={[styles.bubbleText, { color: mine ? colors.onPrimary : colors.text }]}>{body(m)}</Text>
            <Text style={[styles.time, { color: mine ? colors.onPrimary : colors.textMuted }]}>{messageTime(m.createdAtMs)}</Text>
          </View>
        );
      })}

      {closed ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>{t('messages.closed')}</Text>
      ) : (
        <>
          <View style={styles.quick}>
            {QUICK_REPLIES[me].map((key) => (
              <Pressable
                key={key}
                onPress={() => onSend({ key })}
                accessibilityRole="button"
                style={({ pressed }) => [styles.chip, { borderColor: colors.primary, opacity: pressed ? 0.6 : 1 }]}>
                <Text style={[styles.chipText, { color: colors.primary }]}>{t(`quick.${key}`)}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.compose}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t('messages.placeholder')}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={t('messages.placeholder')}
              maxLength={MAX_MESSAGE_LENGTH}
              multiline
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            <Pressable
              onPress={send}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSend }}
              style={({ pressed }) => [styles.send, { backgroundColor: colors.primary, opacity: !canSend ? 0.4 : pressed ? 0.8 : 1 }]}>
              <Text style={[styles.sendText, { color: colors.onPrimary }]}>{t('messages.send')}</Text>
            </Pressable>
          </View>
          <Text style={[styles.count, { color: colors.textMuted }]}>
            {t('messages.count', { count: text.length, max: MAX_MESSAGE_LENGTH })}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  empty: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  bubble: { maxWidth: '82%', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  time: { fontFamily: fonts.regular, fontSize: 11, marginTop: 2, alignSelf: 'flex-end', opacity: 0.8 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: { borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: spacing.md, minHeight: minTouch - 4, justifyContent: 'center' },
  chipText: { fontFamily: fonts.medium, fontSize: 13 },
  compose: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: minTouch,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  send: { minHeight: minTouch, paddingHorizontal: spacing.md, borderRadius: radius.sm, justifyContent: 'center' },
  sendText: { fontFamily: fonts.semiBold, fontSize: 15 },
  count: { fontFamily: fonts.regular, fontSize: 12, textAlign: 'right', marginTop: -spacing.xs },
});
