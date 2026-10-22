import { Tabs } from 'expo-router';
import React from 'react';
import { useT } from '../../src/state/AppProvider';
import { fonts, useTheme } from '../../src/ui/theme';

/** Doctors: refer with the AI agent, track transfers, see the activity log. The pending screen has no tab. */
export default function DoctorLayout(): React.JSX.Element {
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
      <Tabs.Screen name="refer" options={{ title: t('doctor.tab.refer') }} />
      <Tabs.Screen name="transfers" options={{ title: t('doctor.tab.transfers') }} />
      <Tabs.Screen name="activity" options={{ title: t('doctor.tab.activity') }} />
      <Tabs.Screen name="pending" options={{ href: null }} />
    </Tabs>
  );
}
