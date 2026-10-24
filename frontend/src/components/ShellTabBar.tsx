/**
 * The navigation for every role's screens, as one component that adapts: a bar of icons and labels along the bottom on
 * phones and tablets, and a sidebar on the left on desktop (with the logo, the language and the person's menu).
 * Each role's layout lists its screens; this draws them.
 */
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../state/AppProvider';
import { Icon } from '../ui/Icon';
import { fonts, fontSizes, layout, radii, shadow, spacing, useBreakpoint, useIsDark, useTheme } from '../ui/theme';
import { focusRing, pointer, webTransition } from '../ui/web';
import { BrandMark } from './BrandMark';
import { LanguageToggle } from './LanguageToggle';
import { ProfileMenu } from './ProfileMenu';

export function ShellTabBar({ state, descriptors, navigation }: BottomTabBarProps): React.JSX.Element {
  const theme = useTheme();
  const dark = useIsDark();
  const t = useT();
  const insets = useSafeAreaInsets();
  const sidebar = useBreakpoint() === 'expanded';

  // A screen can ask for no navigation at all (the 1669 screen does, so nothing competes with the call button).
  const current = descriptors[state.routes[state.index]?.key ?? '']?.options;
  if ((current?.tabBarStyle as { display?: string } | undefined)?.display === 'none') return <></>;

  // Screens with `href: null` are reachable but not listed.
  // Expo Router doesn't pass `href` through to the options here, so a screen that hides the bar is also left out of the list.
  const routes = state.routes.filter((route) => {
    const options = descriptors[route.key].options as { href?: string | null; tabBarStyle?: { display?: string } };
    return options.href !== null && options.tabBarStyle?.display !== 'none';
  });

  const items = routes.map((route) => {
    const { options } = descriptors[route.key];
    const focused = state.routes[state.index]?.key === route.key;
    const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name);
    const badge = options.tabBarBadge;
    const press = (): void => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
    };
    const icon = options.tabBarIcon?.({ focused, color: focused ? theme.primary : theme.textMuted, size: sidebar ? 22 : 24 });
    return { key: route.key, label, focused, badge, press, icon };
  });

  if (sidebar) {
    return (
      <View accessibilityRole="tablist" accessibilityLabel={t('nav.primary')} style={[styles.sidebar, { backgroundColor: theme.surface, borderRightColor: theme.border, width: layout.sidebar }]}>
        <View style={styles.sidebarBrand}>
          <BrandMark size={38} />
        </View>
        <ScrollView contentContainerStyle={styles.sidebarItems}>
          {items.map((item) => (
            <Pressable
              key={item.key}
              onPress={item.press}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: item.focused }}
              style={(s) => [
                styles.sideItem,
                { backgroundColor: item.focused ? theme.primarySoft : (s as { hovered?: boolean }).hovered === true ? theme.surfaceAlt : 'transparent' },
                pointer,
                webTransition(),
                focusRing(theme.primary, (s as { focused?: boolean }).focused === true),
              ]}
            >
              <View style={[styles.accent, { backgroundColor: item.focused ? theme.primary : 'transparent' }]} />
              {item.icon}
              <Text style={[styles.sideLabel, { color: item.focused ? theme.primary : theme.text, fontFamily: item.focused ? fonts.bold : fonts.medium }]}>{item.label}</Text>
              {item.badge !== undefined ? <View style={[styles.badge, { backgroundColor: theme.emergency }]}><Text style={styles.badgeText}>{item.badge}</Text></View> : null}
            </Pressable>
          ))}
        </ScrollView>
        <View style={[styles.sidebarFooter, { borderTopColor: theme.border }]}>
          <LanguageToggle />
          <ProfileMenu />
        </View>
      </View>
    );
  }

  return (
    <View accessibilityRole="tablist" accessibilityLabel={t('nav.primary')} style={[styles.bar, { backgroundColor: theme.surface, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, spacing.sm) }, shadow(3, dark)]}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={item.press}
          accessibilityRole="tab"
          accessibilityLabel={item.label}
          accessibilityState={{ selected: item.focused }}
          style={(s) => [styles.barItem, pointer, focusRing(theme.primary, (s as { focused?: boolean }).focused === true)]}
        >
          <View style={[styles.pill, { backgroundColor: item.focused ? theme.primarySoft : 'transparent' }, webTransition()]}>
            {item.icon}
            {item.badge !== undefined ? <View style={[styles.dot, { backgroundColor: theme.emergency }]}><Text style={styles.badgeText}>{item.badge}</Text></View> : null}
          </View>
          <Text numberOfLines={1} style={[styles.barLabel, { color: item.focused ? theme.primary : theme.textMuted, fontFamily: item.focused ? fonts.bold : fonts.medium }]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm - 2 },
  barItem: { flex: 1, alignItems: 'center', gap: 2, minHeight: 52 },
  pill: { minWidth: 56, height: 32, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  barLabel: { fontSize: 11 },
  dot: { position: 'absolute', top: -2, right: 4, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 'auto' },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontFamily: fonts.bold },
  sidebar: { borderRightWidth: StyleSheet.hairlineWidth, paddingTop: spacing.lg },
  sidebarBrand: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  sidebarItems: { paddingHorizontal: spacing.md, gap: 4 },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, borderRadius: radii.lg, paddingRight: spacing.md, overflow: 'hidden' },
  accent: { width: 4, alignSelf: 'stretch' },
  sideLabel: { flex: 1, fontSize: fontSizes.md },
  sidebarFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.sm },
});
