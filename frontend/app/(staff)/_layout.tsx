import { Tabs } from 'expo-router';
import React from 'react';
import { useT } from '../../src/state/AppProvider';
import { fonts, useTheme } from '../../src/ui/theme';

/** Unit staff move between My unit and the inbox; auto-accept rules belong to admins. docs/roles.md */
export default function StaffLayout(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarLabelStyle: { fontFamily: fonts.medium },
        tabBarIconStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen name="status" options={{ title: t('staff.status.myUnit') }} />
      <Tabs.Screen name="inbox" options={{ title: t('staff.inbox.title') }} />
      <Tabs.Screen name="activity" options={{ title: t('doctor.tab.activity') }} />
    </Tabs>
  );
}
