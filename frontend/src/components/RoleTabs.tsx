import { Tabs } from 'expo-router';
import React from 'react';
import { Icon, type IconName } from '../ui/Icon';
import { useBreakpoint } from '../ui/theme';
import { ShellTabBar } from './ShellTabBar';

/**
 * The tabs of one role's area, drawn by the shared navigation: along the bottom on phones and tablets, down the left side
 * on desktop. Each layout lists its screens as `Tabs.Screen` children; screens with `href: null` stay reachable but unlisted.
 */
export function RoleTabs({ children }: { children: React.ReactNode }): React.JSX.Element {
  const expanded = useBreakpoint() === 'expanded';
  return (
    <Tabs tabBar={(props) => <ShellTabBar {...props} />} screenOptions={{ headerShown: false, tabBarPosition: expanded ? 'left' : 'bottom' }}>
      {children}
    </Tabs>
  );
}

/** An outline icon that fills in when its tab is the current one. */
export const tabIcon =
  (outline: IconName, filled: IconName) =>
  ({ focused, color, size }: { focused: boolean; color: string; size: number }): React.JSX.Element => <Icon name={focused ? filled : outline} color={color} size={size} />;
