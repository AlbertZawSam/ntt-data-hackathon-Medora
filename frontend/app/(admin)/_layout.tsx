import { Tabs } from 'expo-router';
import React from 'react';
import { RoleTabs, tabIcon } from '../../src/components/RoleTabs';
import { useT } from '../../src/state/AppProvider';

/** Admins: beds and departments, who owns each item, staff invitations, auto-accept rules, specialists. Hospital setup is a one-time screen with no tab. */
export default function AdminLayout(): React.JSX.Element {
  const t = useT();
  return (
    <RoleTabs>
      <Tabs.Screen name="hospital" options={{ title: t('admin.tab.hospital'), tabBarIcon: tabIcon('business-outline', 'business') }} />
      <Tabs.Screen name="units" options={{ title: t('admin.tab.units'), tabBarIcon: tabIcon('git-branch-outline', 'git-branch') }} />
      <Tabs.Screen name="staff-invite" options={{ title: t('admin.tab.staff'), tabBarIcon: tabIcon('person-add-outline', 'person-add') }} />
      <Tabs.Screen name="rules" options={{ title: t('staff.rules.title'), tabBarIcon: tabIcon('shield-checkmark-outline', 'shield-checkmark') }} />
      <Tabs.Screen name="specialists" options={{ title: t('admin.tab.specialists'), tabBarIcon: tabIcon('medkit-outline', 'medkit') }} />
      <Tabs.Screen name="activity" options={{ title: t('doctor.tab.activity'), tabBarIcon: tabIcon('list-outline', 'list') }} />
      {/* ShellTabBar hides a screen only when it also hides the bar (Expo Router drops href: null there). */}
      <Tabs.Screen name="hospital-setup" options={{ href: null, tabBarStyle: { display: 'none' } }} />
    </RoleTabs>
  );
}
