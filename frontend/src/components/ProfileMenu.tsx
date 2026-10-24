import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pick } from '../i18n/t';
import type { StringKey } from '../i18n/t';
import { useApp, useT } from '../state/AppProvider';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { fonts, fontSizes, shadow, spacing, useIsDark, useTheme } from '../ui/theme';
import { focusRing, pointer, webTransition } from '../ui/web';

const ROLE_ORDER = ['admins', 'doctors', 'hospital_staff', 'patients'] as const;

/** The signed-in person: initials in a circle that opens who they are, their role and hospital, and Sign out. */
export function ProfileMenu(): React.JSX.Element | null {
  const { session, data, lang, signOut } = useApp();
  const t = useT();
  const theme = useTheme();
  const dark = useIsDark();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = React.useState(false);
  if (!session) return null;
  const role = ROLE_ORDER.find((group) => session.groups.includes(group));
  const hospital = data.hospitalProfiles.find((h) => h.hospitalId === session.hospitalId);
  const initial = (session.email.trim()[0] ?? '?').toUpperCase();
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('nav.account')}
        hitSlop={6}
        style={(state) => [styles.avatar, { backgroundColor: theme.primary }, shadow(1, dark), pointer, webTransition(), { opacity: (state as { hovered?: boolean }).hovered === true ? 0.9 : 1 }, focusRing(theme.primary, (state as { focused?: boolean }).focused === true)]}
      >
        <Text style={[styles.initial, { color: theme.onPrimary }]}>{initial}</Text>
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel={t('common.back')} onPress={() => setOpen(false)} style={[styles.backdrop, { backgroundColor: theme.overlay, paddingTop: insets.top + 56 }]}>
          <Pressable onPress={() => undefined} style={styles.sheet}>
            <Card elevation={2} padding="lg">
              <Text style={[styles.small, { color: theme.textMuted }]}>{t('profile.signedInAs')}</Text>
              <Text numberOfLines={1} style={[styles.email, { color: theme.text }]}>{session.email}</Text>
              <View style={styles.badges}>
                {role ? <Badge tone="primary" icon="shield-checkmark" label={t(`role.${role}` as StringKey)} /> : null}
                {session.unit ? <Badge tone="info" label={session.unit.toUpperCase()} /> : null}
              </View>
              {hospital ? (
                <Text style={[styles.small, { color: theme.text }]}>
                  {t('profile.hospital')}: {pick(hospital.name, lang)}
                </Text>
              ) : null}
              <Button variant="secondary" icon="log-out-outline" label={t('common.signOut')} onPress={() => { setOpen(false); void signOut(); }} />
            </Card>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: fontSizes.md, fontFamily: fonts.bold },
  backdrop: { flex: 1, alignItems: 'flex-end', paddingHorizontal: spacing.md },
  sheet: { width: '100%', maxWidth: 340 },
  small: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
  email: { fontSize: fontSizes.lg, fontFamily: fonts.semibold },
  badges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
});
