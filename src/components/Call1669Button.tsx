import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { StringKey } from '@/i18n/t';
import { useT } from '@/state/language';
import { fonts, minTouch, radius, spacing, useTheme } from '@/ui/theme';

type Props = {
  label?: StringKey;
  // 'solid' is red with light text (on normal screens); 'inverse' is light with red text (on a red card).
  variant?: 'solid' | 'inverse';
};

// Dials 1669, Thailand's emergency medical service. Says so if the device can't make calls.
export function Call1669Button({ label = 'emergency.call', variant = 'solid' }: Props) {
  const { colors } = useTheme();
  const { t } = useT();
  const [failed, setFailed] = useState(false);
  const bg = variant === 'solid' ? colors.danger : colors.onDanger;
  const fg = variant === 'solid' ? colors.onDanger : colors.danger;

  const call = () => {
    setFailed(false);
    Linking.openURL('tel:1669').catch(() => setFailed(true));
  };

  return (
    <View>
      <Pressable
        onPress={call}
        accessibilityRole="button"
        accessibilityHint={t('emergency.callHint')}
        style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: pressed ? 0.85 : 1 }]}>
        <Text style={[styles.text, { color: fg }]}>{t(label)}</Text>
      </Pressable>
      {failed && (
        <Text style={[styles.failed, { color: variant === 'solid' ? colors.danger : colors.onDanger }]}>
          {t('emergency.callFailed')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: minTouch + 12,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  text: { fontFamily: fonts.bold, fontSize: 20 },
  failed: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, marginTop: spacing.sm },
});
