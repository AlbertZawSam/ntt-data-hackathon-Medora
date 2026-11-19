/**
 * Invite staff: an admin invites unit staff (with exactly one unit), a doctor or another admin into
 * their own hospital. The server fixes the hospital from the admin's token and refuses a unit
 * outside the list. Requirements: 1.5, 18.1
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { UNITS, ALL_UNITS } from '@medora/shared/logic/access';
import type { StringKey } from '../../src/i18n/t';
import { inviteStaff } from '../../src/services/data';
import { useT } from '../../src/state/AppProvider';
import { Chip } from '../../src/ui/Badge';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { ConfirmPanel } from '../../src/ui/ConfirmPanel';
import { Field } from '../../src/ui/Field';
import { Notice } from '../../src/ui/Notice';
import { StatusReminder } from '../../src/components/StatusReminder';
import { Page } from '../../src/ui/Page';
import { fonts, fontSizes, spacing, useTheme } from '../../src/ui/theme';

const GROUPS = ['hospital_staff', 'doctors', 'admins'] as const;

export default function AdminStaffInviteScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const [email, setEmail] = React.useState('');
  const [group, setGroup] = React.useState<(typeof GROUPS)[number]>('hospital_staff');
  const [unit, setUnit] = React.useState<string>('ward');
  const [state, setState] = React.useState<'idle' | 'busy' | 'sent' | 'error' | 'badEmail'>('idle');
  // Inviting an admin gives full control of the hospital's settings and staff, so it asks first.
  const [askAdmin, setAskAdmin] = React.useState(false);
  const validEmail = (): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = async (): Promise<void> => {
    if (!validEmail()) return setState('badEmail');
    setAskAdmin(false);
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
    <Page title={t('admin.staffInvite.title')} subtitle={t('admin.staffInvite.sub')} width="readable">
      <StatusReminder audience="admin" />
      <Card padding="lg">
        <View style={styles.list}>
          <Field
            label={t('admin.staffInvite.emailPlaceholder')}
            value={email}
            onChangeText={(v) => { setEmail(v); setState('idle'); setAskAdmin(false); }}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            error={state === 'badEmail' ? t('admin.staffInvite.badEmail') : undefined}
          />
          <Text style={[styles.label, { color: theme.text }]}>{t('admin.staffInvite.groupLabel')}</Text>
          <View accessibilityRole="radiogroup" style={styles.wrap}>
            {GROUPS.map((g) => (
              <Chip key={g} label={t(`admin.staffInvite.group.${g}` as StringKey)} selected={group === g} onPress={() => { setGroup(g); setAskAdmin(false); }} />
            ))}
          </View>
          {group === 'hospital_staff' ? (
            <>
              <Text style={[styles.label, { color: theme.text }]}>{t('admin.staffInvite.unitLabel')}</Text>
              <View accessibilityRole="radiogroup" style={styles.wrap}>
                {[...UNITS, ALL_UNITS].map((u) => (
                  <Chip key={u} label={t(`unit.name.${u}` as StringKey)} selected={unit === u} onPress={() => setUnit(u)} />
                ))}
              </View>
            </>
          ) : null}
          {state === 'sent' ? <Notice tone="success">{t('admin.staffInvite.sent')}</Notice> : null}
          {state === 'error' ? <Notice tone="danger">{t('admin.staffInvite.error')}</Notice> : null}
          {askAdmin ? (
            <ConfirmPanel
              title={t('admin.staffInvite.adminConfirm', { email: email.trim() })}
              body={t('admin.staffInvite.adminBody')}
              confirmLabel={t('admin.staffInvite.submitButton')}
              cancelLabel={t('common.cancel')}
              busy={state === 'busy'}
              onConfirm={() => void submit()}
              onCancel={() => setAskAdmin(false)}
            />
          ) : (
            <Button
              icon="mail"
              label={t('admin.staffInvite.submitButton')}
              busy={state === 'busy'}
              onPress={() => {
                if (group === 'admins' && validEmail()) setAskAdmin(true);
                else void submit();
              }}
            />
          )}
        </View>
      </Card>
    </Page>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  label: { fontSize: fontSizes.md, fontFamily: fonts.semibold },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
