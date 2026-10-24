import { Tabs } from 'expo-router';
import React from 'react';
import { RoleTabs, tabIcon } from '../../src/components/RoleTabs';
import { useT } from '../../src/state/AppProvider';

/** Doctors: refer with the AI agent, track transfers, see the activity log. The pending screen has no tab. */
export default function DoctorLayout(): React.JSX.Element {
  const t = useT();
  return (
    <RoleTabs>
      <Tabs.Screen name="refer" options={{ title: t('doctor.tab.refer'), tabBarIcon: tabIcon('git-network-outline', 'git-network') }} />
      <Tabs.Screen name="transfers" options={{ title: t('doctor.tab.transfers'), tabBarIcon: tabIcon('car-outline', 'car') }} />
      <Tabs.Screen name="activity" options={{ title: t('doctor.tab.activity'), tabBarIcon: tabIcon('list-outline', 'list') }} />
      {/* ShellTabBar hides a screen only when it also hides the bar (Expo Router drops href: null there). */}
      <Tabs.Screen name="pending" options={{ href: null, tabBarStyle: { display: 'none' } }} />
    </RoleTabs>
  );
}
