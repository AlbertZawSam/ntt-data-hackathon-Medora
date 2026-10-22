/**
 * Auto-accept rules: one switch per care target plus a minimum of free beds. A request that fits an
 * enabled rule is accepted at once; staff can undo for 60 seconds. Only admins change these, and the
 * server checks it. Requirements: 11.2, 6.4
 */
import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { RULE_TARGETS } from '@medora/shared/logic/rules';
import type { AutoAcceptRules, HospitalStatus, RuleTarget } from '@medora/shared/logic/types';
import { pick, type StringKey } from '../../src/i18n/t';
import { PATHWAYS } from '@medora/shared/logic/pathways';
import { setAutoAcceptRules } from '../../src/services/data';
import { useApp, useT } from '../../src/state/AppProvider';
import { Button } from '../../src/ui/Button';
import { Field } from '../../src/ui/Field';
import { StatusReminder } from '../../src/components/StatusReminder';
import { Screen } from '../../src/ui/Screen';
import { fonts, fontSizes, spacing, useTheme } from '../../src/ui/theme';

export default function AdminRulesScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { data, session, lang } = useApp();
  const stored = data.hospitalStatuses.find((row) => row.hospitalId === session?.hospitalId)?.status as HospitalStatus | undefined;
  const [rules, setRules] = React.useState<AutoAcceptRules>({ minBeds: 1 });
  const [minBeds, setMinBeds] = React.useState('1');
  const [state, setState] = React.useState<'idle' | 'busy' | 'saved' | 'error'>('idle');
  const loaded = React.useRef(false);

  React.useEffect(() => {
    if (stored && !loaded.current) {
      loaded.current = true;
      setRules(stored.rules);
      setMinBeds(String(stored.rules.minBeds));
    }
  }, [stored]);

  const label = (target: RuleTarget): string => (target === 'visit' ? t('patient.care.requestButton') : pick(PATHWAYS[target].name, lang));

  const save = async (): Promise<void> => {
    const n = Number(minBeds);
    if (!Number.isInteger(n) || n < 0 || n > 100) return setState('error');
    setState('busy');
    try {
      await setAutoAcceptRules({ ...rules, minBeds: n });
      setState('saved');
    } catch {
      setState('error');
    }
  };

  return (
    <Screen title={t('staff.rules.title')}>
      <StatusReminder audience="admin" />
      {RULE_TARGETS.map((target) => (
        <View key={target} style={styles.row}>
          <Text style={[styles.label, { color: theme.text }]}>{label(target)}</Text>
          <Switch
            accessibilityLabel={label(target)}
            value={rules[target] === true}
            onValueChange={(value) => { setRules({ ...rules, [target]: value }); setState('idle'); }}
          />
        </View>
      ))}
      <Field label={t('staff.rules.minBeds')} value={minBeds} onChangeText={(v) => { setMinBeds(v); setState('idle'); }} keyboardType="number-pad" maxLength={3} />
      {state === 'error' ? <Text style={[styles.note, { color: theme.emergency }]}>{t('staff.status.saveError' as StringKey)}</Text> : null}
      {state === 'saved' ? <Text style={[styles.note, { color: theme.success }]}>{t('staff.rules.enabled')}</Text> : null}
      <Button label={t('staff.status.submit')} busy={state === 'busy'} onPress={() => void save()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: 44 },
  label: { flex: 1, fontSize: fontSizes.md, fontFamily: fonts.medium },
  note: { fontSize: fontSizes.sm, fontFamily: fonts.medium },
});
