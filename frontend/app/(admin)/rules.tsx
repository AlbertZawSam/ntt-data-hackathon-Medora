/**
 * Auto-accept rules: one switch per care target plus a minimum of free beds. A request that fits an
 * enabled rule is accepted at once; staff can undo for 60 seconds. Only admins change these, and the
 * server checks it. Requirements: 11.2, 6.4
 */
import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { RULE_TARGETS } from '@medora/shared/logic/rules';
import type { AutoAcceptRules, HospitalStatus, RuleTarget } from '@medora/shared/logic/types';
import { pick } from '../../src/i18n/t';
import { PATHWAYS } from '@medora/shared/logic/pathways';
import { setAutoAcceptRules } from '../../src/services/data';
import { useApp, useT } from '../../src/state/AppProvider';
import { Button } from '../../src/ui/Button';
import { Field } from '../../src/ui/Field';
import { StatusReminder } from '../../src/components/StatusReminder';
import { Card } from '../../src/ui/Card';
import { Notice } from '../../src/ui/Notice';
import { Page } from '../../src/ui/Page';
import { SkeletonCard } from '../../src/ui/Skeleton';
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

  const label = (target: RuleTarget): string => (target === 'visit' ? t('staff.rules.target.visit') : pick(PATHWAYS[target].name, lang));

  const save = async (): Promise<void> => {
    // Never save before the hospital's real rules have loaded: the defaults shown until then would overwrite them.
    if (!loaded.current) return;
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
    <Page title={t('staff.rules.title')} subtitle={t('staff.rules.intro')} width="readable">
      <StatusReminder audience="admin" />
      {!stored ? (
        <SkeletonCard lines={4} />
      ) : (
        <Card padding="lg">
          <View style={styles.list}>
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
            <Field
              label={t('staff.rules.minBeds')}
              hint={t('staff.rules.minBedsHint')}
              value={minBeds}
              onChangeText={(v) => { setMinBeds(v); setState('idle'); }}
              keyboardType="number-pad"
              maxLength={3}
            />
            {state === 'error' ? <Notice tone="danger">{t('staff.rules.saveError')}</Notice> : null}
            {state === 'saved' ? <Notice tone="success">{t('staff.rules.saved')}</Notice> : null}
            <Button icon="save" label={t('staff.rules.save')} busy={state === 'busy'} onPress={() => void save()} />
          </View>
        </Card>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: 44 },
  label: { flex: 1, fontSize: fontSizes.md, fontFamily: fonts.medium },
  list: { gap: spacing.md },
});
