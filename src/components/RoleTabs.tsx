import { Tabs } from 'expo-router/js-tabs';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { LanguageToggle } from '@/components/LanguageToggle';
import { t, type StringKey } from '@/i18n/t';
import { useLanguage } from '@/state/language';
import { fonts, minTouch, useTheme } from '@/ui/theme';

export type RoleTab = {
  name: string;
  title: StringKey;
  icon: SymbolViewProps['name'];
};

// Bottom tabs for one role group: (patient), (staff) or (doctor).
export function RoleTabs({ tabs }: { tabs: RoleTab[] }) {
  const { colors } = useTheme();
  useLanguage(); // re-render tab titles when the language changes
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerRight: () => <LanguageToggle />,
        headerTitleStyle: { fontFamily: fonts.semiBold },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.medium },
        tabBarItemStyle: { minHeight: minTouch },
      }}>
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.title),
            tabBarIcon: ({ color, size }) => (
              <SymbolView name={tab.icon} tintColor={color} size={size} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
