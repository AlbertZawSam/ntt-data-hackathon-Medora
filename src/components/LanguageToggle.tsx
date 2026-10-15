import { Pressable, StyleSheet, Text, View } from 'react-native';

import { languages, t, type Lang } from '@/i18n/t';
import { useLanguage } from '@/state/language';
import { fonts, minTouch, radius, spacing, useTheme } from '@/ui/theme';

// Each language is named in its own script so it can be found whichever language is active.
const labels: Record<Lang, string> = { en: 'EN', th: 'ไทย' };

export function LanguageToggle() {
  const { colors } = useTheme();
  const { lang, setLang } = useLanguage();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('lang.label')}
      style={[styles.group, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      {languages.map((code) => {
        const selected = code === lang;
        return (
          <Pressable
            key={code}
            onPress={() => setLang(code)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={t(code === 'en' ? 'lang.english' : 'lang.thai')}
            hitSlop={{ top: 4, bottom: 4 }}
            style={[styles.option, selected && { backgroundColor: colors.primary }]}>
            <Text style={[styles.text, { color: selected ? colors.onPrimary : colors.text }]}>{labels[code]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginHorizontal: spacing.md,
  },
  option: { minWidth: minTouch, minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  text: { fontFamily: fonts.semiBold, fontSize: 14 },
});
