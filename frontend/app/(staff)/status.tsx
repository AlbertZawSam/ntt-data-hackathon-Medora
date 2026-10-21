/**
 * My unit: a nurse or technologist sees and changes only the items their unit owns, and answers
 * "Still correct?". The server checks the unit again on every change. Requirements: 9.1 to 9.4, 19.8
 */
import React from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { dataAgeMin, isStale } from '@medora/shared/logic/ranking';
import { MAX_NOTE, changeFor, controlsForUnit, type UnitControl } from '@medora/shared/logic/statusUpdate';
import type { HospitalStatus } from '@medora/shared/logic/types';
import { LanguageToggle } from '../../src/components/LanguageToggle';
import type { StringKey } from '../../src/i18n/t';
import { updateStatus } from '../../src/services/data';
import { useApp, useT } from '../../src/state/AppProvider';
import { Button } from '../../src/ui/Button';
import { Field } from '../../src/ui/Field';
import { fonts, fontSizes, radii, spacing, useTheme } from '../../src/ui/theme';

const STEP_MIN = 5;

export default function StaffStatusScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { session, data, signOut } = useApp();
  const [now, setNow] = React.useState(Date.now());
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const unit = session?.unit;
  const controls = controlsForUnit(unit);
  const status: HospitalStatus | undefined = data.hospitalStatuses.find((s) => s.hospitalId === session?.hospitalId)?.status;

  const send = async (change: ReturnType<typeof changeFor> | { kind: 'confirm' } | { kind: 'cathlabBusy'; minutes: number | null }): Promise<void> => {
    if (!change || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await updateStatus(change, change.kind === 'confirm' ? undefined : note);
      setNote('');
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const never = !status || Date.parse(status.updatedAt) <= 0;
  const stale = !status || never || isStale(status, now);
  const age = status && !never ? Math.floor(dataAgeMin(status, now)) : 0;

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.column}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>{t('staff.status.title')}</Text>
          <LanguageToggle />
        </View>
        {unit ? <Text style={[styles.sub, { color: theme.textMuted }]}>{t('staff.status.unitLabel', { unit: t(`unit.name.${unit}` as StringKey) })}</Text> : null}

        {!status ? (
          <Text style={[styles.sub, { color: theme.warning }]}>{t('staff.status.noStatus')}</Text>
        ) : controls.length === 0 ? (
          <Text style={[styles.sub, { color: theme.warning }]}>{t('staff.status.noUnit')}</Text>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: stale ? theme.warning : theme.border }]}>
              <Text accessibilityLiveRegion="polite" style={[styles.fresh, { color: stale ? theme.warning : theme.success }]}>
                {never ? t('staff.status.neverUpdated') : stale ? `${t('staff.status.outdated')} · ${t('staff.status.updatedAgo', { min: age })}` : t('staff.status.updatedAgo', { min: age })}
              </Text>
              <Text style={[styles.sub, { color: theme.text }]}>{t('staff.status.confirmAccurate')}</Text>
              <Button label={t('staff.status.yesCorrect')} busy={busy} onPress={() => void send({ kind: 'confirm' })} />
            </View>

            {controls.map((control) => (
              <ControlRow key={control.id} control={control} status={status} busy={busy} onSend={(change) => void send(change)} />
            ))}

            <Field
              label={t('staff.status.noteLabel')}
              hint={t('staff.status.noteHint')}
              value={note}
              onChangeText={setNote}
              maxLength={MAX_NOTE}
            />
            {failed ? (
              <Text accessibilityLiveRegion="polite" style={[styles.sub, { color: theme.emergency }]}>
                {t('staff.status.saveError')}
              </Text>
            ) : null}
          </>
        )}
        <Button variant="link" label={t('common.signOut')} onPress={() => void signOut()} />
      </View>
    </ScrollView>
  );
}

function ControlRow({
  control,
  status,
  busy,
  onSend,
}: {
  control: UnitControl;
  status: HospitalStatus;
  busy: boolean;
  onSend: (change: ReturnType<typeof changeFor> | { kind: 'cathlabBusy'; minutes: number | null }) => void;
}): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const label = t(control.labelKey as StringKey);

  let body: React.ReactNode;
  if (control.kind === 'count') {
    const value = control.item === 'beds' ? status.beds : control.item === 'icu' ? status.icu ?? 0 : status.nicu;
    const reserved = control.item === 'beds' ? status.reservedBeds ?? 0 : control.item === 'nicu' ? status.reservedNicu ?? 0 : 0;
    body = (
      <View>
        <View style={styles.stepper}>
          <Button label="−" variant="secondary" disabled={busy || value <= 0} onPress={() => onSend(changeFor(control, value - 1))} />
          <Text style={[styles.value, { color: theme.text }]} accessibilityLabel={`${label}: ${value}`}>
            {value}
          </Text>
          <Button label="+" variant="secondary" disabled={busy} onPress={() => onSend(changeFor(control, value + 1))} />
        </View>
        {reserved > 0 ? <Text style={[styles.hint, { color: theme.textMuted }]}>{t('staff.status.reserved', { n: reserved })}</Text> : null}
      </View>
    );
  } else if (control.kind === 'cathlab') {
    const working = status.equip.cathlab === true;
    const busyMin = status.cathlabBusyMin;
    const state = !working ? 'down' : busyMin !== undefined ? 'busy' : 'ready';
    body = (
      <View style={styles.gap}>
        <View style={styles.row}>
          <Button label={t('staff.status.cathReady')} variant={state === 'ready' ? 'primary' : 'secondary'} disabled={busy} onPress={() => onSend(changeFor(control, true))} />
          <Button label={t('staff.status.cathBusy')} variant={state === 'busy' ? 'primary' : 'secondary'} disabled={busy} onPress={() => onSend({ kind: 'cathlabBusy', minutes: busyMin ?? 15 })} />
          <Button label={t('staff.status.cathDown')} variant={state === 'down' ? 'primary' : 'secondary'} disabled={busy} onPress={() => onSend(changeFor(control, false))} />
        </View>
        {state === 'busy' && busyMin !== undefined ? (
          <View style={styles.stepper}>
            <Button label="−" variant="secondary" disabled={busy || busyMin <= 0} onPress={() => onSend({ kind: 'cathlabBusy', minutes: Math.max(0, busyMin - STEP_MIN) })} />
            <Text style={[styles.value, { color: theme.text }]}>{t('staff.status.freeInAbout', { min: busyMin })}</Text>
            <Button label="+" variant="secondary" disabled={busy} onPress={() => onSend({ kind: 'cathlabBusy', minutes: busyMin + STEP_MIN })} />
          </View>
        ) : null}
      </View>
    );
  } else {
    const on =
      control.kind === 'dept' ? status.depts[control.item] === 'open' : control.kind === 'equip' ? status.equip[control.item] === true : status.oncall[control.item] === true;
    const stateText =
      control.kind === 'dept' ? t(on ? 'staff.status.open' : 'staff.status.diverting') : control.kind === 'equip' ? t(on ? 'staff.status.working' : 'staff.status.down') : t(on ? 'staff.status.onDuty' : 'staff.status.offDuty');
    body = (
      <View style={styles.row}>
        <Text style={[styles.value, { color: on ? theme.success : theme.warning }]}>{stateText}</Text>
        <Switch
          value={on}
          disabled={busy}
          accessibilityLabel={label}
          onValueChange={(next) => onSend(changeFor(control, control.kind === 'dept' ? (next ? 'open' : 'diverting') : next))}
        />
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, alignItems: 'center', padding: spacing.lg, paddingTop: spacing.xl * 1.5 },
  column: { width: '100%', maxWidth: 480, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: fontSizes.xxl, fontFamily: fonts.bold },
  sub: { fontSize: fontSizes.sm, fontFamily: fonts.medium },
  fresh: { fontSize: fontSizes.md, fontFamily: fonts.semibold },
  card: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  label: { fontSize: fontSizes.lg, fontFamily: fonts.semibold },
  value: { fontSize: fontSizes.xl, fontFamily: fonts.bold, flexShrink: 1, textAlign: 'center' },
  hint: { fontSize: fontSizes.xs, fontFamily: fonts.regular, marginTop: spacing.xs },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  gap: { gap: spacing.sm },
});
