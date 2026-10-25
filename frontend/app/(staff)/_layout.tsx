import { Tabs } from 'expo-router';
import React from 'react';
import { RoleTabs, tabIcon } from '../../src/components/RoleTabs';
import { useT } from '../../src/state/AppProvider';

/** Unit staff move between My unit and the inbox; auto-accept rules belong to admins. docs/roles.md */
export default function StaffLayout(): React.JSX.Element {
  const t = useT();
  return (
    <RoleTabs>
      <Tabs.Screen name="unit" options={{ title: t('staff.status.myUnit'), tabBarIcon: tabIcon('bed-outline', 'bed') }} />
      <Tabs.Screen name="inbox" options={{ title: t('staff.inbox.title'), tabBarIcon: tabIcon('mail-outline', 'mail') }} />
      <Tabs.Screen name="activity" options={{ title: t('doctor.tab.activity'), tabBarIcon: tabIcon('list-outline', 'list') }} />
      {/* Opened from an Inbox card; not a tab (ShellTabBar needs both settings to hide it). */}
      <Tabs.Screen name="referral" options={{ href: null, tabBarStyle: { display: 'none' } }} />
    </RoleTabs>
  );
}
