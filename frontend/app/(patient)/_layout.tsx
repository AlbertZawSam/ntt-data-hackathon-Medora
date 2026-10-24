import React from 'react';
import { Tabs } from 'expo-router';
import { RoleTabs, tabIcon } from '../../src/components/RoleTabs';
import { useT } from '../../src/state/AppProvider';

/** People seeking care: home, find care, specialists and their requests. The 1669 screen is reached from anywhere but not listed. */
export default function PatientLayout(): React.JSX.Element {
  const t = useT();
  return (
    <RoleTabs>
      <Tabs.Screen name="home" options={{ title: t('patient.tab.home'), tabBarIcon: tabIcon('home-outline', 'home') }} />
      <Tabs.Screen name="care" options={{ title: t('patient.care.title'), tabBarIcon: tabIcon('search-outline', 'search') }} />
      <Tabs.Screen name="specialists" options={{ title: t('patient.specialists.title'), tabBarIcon: tabIcon('people-outline', 'people') }} />
      <Tabs.Screen name="requests" options={{ title: t('patient.tab.requests'), tabBarIcon: tabIcon('chatbubbles-outline', 'chatbubbles') }} />
      <Tabs.Screen name="emergency" options={{ href: null, tabBarStyle: { display: 'none' } }} />
    </RoleTabs>
  );
}
