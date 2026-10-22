/**
 * Invite staff: an admin invites unit staff (with exactly one unit), a doctor or another admin into
 * their own hospital. The server fixes the hospital from the admin's token and refuses a unit
 * outside the list. Requirements: 1.5, 18.1
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { UNITS, ALL_UNITS } from '@medora/shared/logic/access';
import type { StringKey } from '../../src/i18n/t';
import { inviteStaff } from '../../src/services/data';
import { useApp, useT } from '../../src/state/AppProvider';
import { Button } from '../../src/ui/Button';
import { Field } from '../../src/ui/Field';
import { Screen } from '../../src/ui/Screen';
import { fonts, fontSizes, useTheme } from '../../src/ui/theme';

const GROUPS = ['hospital_staff', 'doctors', 'admins'] as const;

export default function AdminStaffInviteScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { signOut } = useApp();
  const [email, setEmail] = React.useState('');
  const [group, setGroup] = React.useState<(typeof GROUPS)[number]>('hospital_staff');
  const [unit, setUnit] = React.useState<string>('ward');
  const [state, setState] = React.useState<'idle' | 'busy' | 'sent' | 'error' | 'badEmail'>('idle');

  const submit = async (): Promise<void> => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setState('badEmail');
    setState('busy');
    try {
      await inviteStaff({ email: email.trim(), group, ...(group === 'hospital_staff' ? { unit } : {}) });
      setEmail('');
      setState('sent');
    } catch {
      setState('error'); // never say whether the email already has an account
    }
  };

  return (
    <Screen title={t('admin.staffInvite.title')}>
      <Field label={t('admin.staffInvite.emailPlaceholder')} value={email} onChangeText={(v) => { setEmail(v); setState('idle'); }} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />
      <Text style={[styles.label, { color: theme.text }]}>{t('admin.staffInvite.groupLabel')}</Text>
      {GROUPS.map((g) => (
        <Button key={g} variant={group === g ? 'primary' : 'secondary'} label={t(`admin.staffInvite.group.${g}` as StringKey)} onPress={() => setGroup(g)} />
      ))}
      {group === 'hospital_staff' ? (
        <>
          <Text style={[styles.label, { color: theme.text }]}>{t('admin.staffInvite.unitLabel')}</Text>
          {[...UNITS, ALL_UNITS].map((u) => (
            <Button key={u} variant={unit === u ? 'primary' : 'secondary'} label={t(`unit.name.${u}` as StringKey)} onPress={() => setUnit(u)} />
          ))}
        </>
      ) : null}
      {state === 'sent' ? <Text accessibilityLiveRegion="polite" style={[styles.note, { color: theme.success }]}>{t('admin.staffInvite.sent')}</Text> : null}
      {state === 'error' ? <Text accessibilityLiveRegion="polite" style={[styles.note, { color: theme.emergency }]}>{t('admin.staffInvite.error')}</Text> : null}
      {state === 'badEmail' ? <Text style={[styles.note, { color: theme.emergency }]}>{t('admin.staffInvite.badEmail')}</Text> : null}
      <Button label={t('admin.staffInvite.submitButton')} busy={state === 'busy'} onPress={() => void submit()} />
      <Button variant="link" label={t('common.signOut')} onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: fontSizes.md, fontFamily: fonts.semibold },
  note: { fontSize: fontSizes.sm, fontFamily: fonts.medium },
});
