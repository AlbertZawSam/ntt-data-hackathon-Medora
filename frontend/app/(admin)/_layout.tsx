import { Tabs } from 'expo-router';
import React from 'react';
import { useT } from '../../src/state/AppProvider';
import { fonts, useTheme } from '../../src/ui/theme';

/** Admins: staff invitations, auto-accept rules, specialists. Hospital setup is a one-time screen with no tab. */
export default function AdminLayout(): React.JSX.Element {
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
      <Tabs.Screen name="staff-invite" options={{ title: t('admin.tab.staff') }} />
      <Tabs.Screen name="rules" options={{ title: t('staff.rules.title') }} />
      <Tabs.Screen name="specialists" options={{ title: t('admin.tab.specialists') }} />
      <Tabs.Screen name="activity" options={{ title: t('doctor.tab.activity') }} />
      <Tabs.Screen name="hospital-setup" options={{ href: null }} />
    </Tabs>
  );
}
