/**
 * My unit: a nurse or technologist sees and changes only the items their unit owns, and answers
 * "Still correct?". The server checks the unit again on every change. Requirements: 9.1 to 9.4, 19.8
 */
import { agoText } from '../../src/i18n/ago';
import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { dataAgeMin, isStale } from '@medora/shared/logic/ranking';
import { isDepartment } from '@medora/shared/logic/departments';
import { MAX_NOTE, changeFor, controlsForUnit, type UnitControl } from '@medora/shared/logic/statusUpdate';
import { activeHolds, contradictsHolds, withHolds } from '@medora/shared/logic/reservations';
import type { HospitalStatus } from '@medora/shared/logic/types';
import { StatusReminder } from '../../src/components/StatusReminder';
import type { StringKey } from '../../src/i18n/t';
import { updateStatus } from '../../src/services/data';
import { useApp, useT } from '../../src/state/AppProvider';
import { Badge } from '../../src/ui/Badge';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { EmptyState } from '../../src/ui/EmptyState';
import { Field } from '../../src/ui/Field';
import { Icon, type IconName } from '../../src/ui/Icon';
import { IconButton } from '../../src/ui/IconButton';
import { Notice } from '../../src/ui/Notice';
import { Page } from '../../src/ui/Page';
import { Reveal } from '../../src/ui/Reveal';
import { Segmented } from '../../src/ui/Segmented';
import { fonts, fontSizes, radii, spacing, useBreakpoint, useTheme } from '../../src/ui/theme';

const STEP_MIN = 5;

type Send = (change: ReturnType<typeof changeFor> | { kind: 'confirm' } | { kind: 'cathlabBusy'; minutes: number | null }) => void;

const ITEM_ICON: Record<string, IconName> = {
  beds: 'bed',
  icu: 'pulse',
  nicu: 'happy',
  ed: 'medkit',
  er: 'medkit',
  neuro: 'pulse',
  cardio: 'heart',
  pediatrics: 'happy',
  ortho: 'body',
  obstetrics: 'woman',
  ct: 'scan',
  mri: 'scan-circle',
  cathlab: 'heart-circle',
};

export default function StaffStatusScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const wide = useBreakpoint() !== 'compact';
  const { session, data } = useApp();
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
  const stored: HospitalStatus | undefined = data.hospitalStatuses.find((s) => s.hospitalId === session?.hospitalId)?.status;
  // Held beds (accepted patients who haven't arrived) are shown separately and count as not free.
  const holds = activeHolds(data.reservations, session?.hospitalId ?? '', now);
  const status: HospitalStatus | undefined = stored ? withHolds(stored, holds) : undefined;
  const conflict = stored ? contradictsHolds(stored, holds) : { beds: false, nicu: false };

  const send: Send = async (change) => {
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
  const updatedText = t('staff.status.updatedAgo', { ago: agoText(t, now - age * 60_000, now) });
  const freshText = never ? t('staff.status.neverUpdated') : stale ? `${t('staff.status.outdated')} · ${updatedText}` : updatedText;

  return (
    <Page
      title={t('staff.status.title')}
      subtitle={unit ? t('staff.status.unitLabel', { unit: t(`unit.name.${unit}` as StringKey) }) : undefined}
      actions={status ? <Badge tone={stale ? 'warning' : 'success'} icon={stale ? 'time' : 'checkmark-circle'} label={freshText} /> : undefined}
    >
      <StatusReminder audience="unit" />
      {!status ? (
        <Card padding="lg">
          <EmptyState icon="cloud-offline-outline" title={t('staff.status.noStatus')} />
        </Card>
      ) : controls.length === 0 ? (
        <Card padding="lg">
          {/* A unit without status items: department staff with no equipment answer requests in the Inbox. */}
          {isDepartment(unit) ? (
            <EmptyState icon="file-tray-full-outline" title={t('staff.status.departmentUnit')} />
          ) : (
            <EmptyState icon="lock-closed-outline" title={t('staff.status.noUnit')} />
          )}
        </Card>
      ) : (
        <>
          {/* Department staff switch only their own equipment; confirming the whole status stays with the units. */}
          {!isDepartment(unit) ? (
          <Reveal>
            <Card padding="lg" tone={stale ? 'warning' : 'success'}>
              <View style={styles.confirmRow}>
                <View style={[styles.confirmIcon, { backgroundColor: theme.surface }]}>
                  <Icon name={stale ? 'time' : 'checkmark-circle'} size={30} color={stale ? theme.warning : theme.success} />
                </View>
                <View style={styles.flex}>
                  <Text accessibilityLiveRegion="polite" style={[styles.confirmTitle, { color: theme.text }]}>{freshText}</Text>
                  <Text style={[styles.hint, { color: theme.textMuted }]}>{t('staff.status.confirmAccurate')}</Text>
                </View>
              </View>
              <Button icon="checkmark-done" label={t('staff.status.yesCorrect')} busy={busy} onPress={() => void send({ kind: 'confirm' })} />
            </Card>
          </Reveal>
          ) : null}

          {conflict.beds || conflict.nicu ? <Notice tone="warning">{t('staff.status.holdConflict')}</Notice> : null}

          <View style={[styles.grid, wide && styles.gridWide]}>
            {controls.map((control, index) => (
              <Reveal key={control.id} index={index} style={wide ? styles.cell : undefined}>
                <ControlCard control={control} status={status} busy={busy} onSend={(change) => void send(change)} />
              </Reveal>
            ))}
          </View>

          <Card padding="lg">
            <Field label={t('staff.status.noteLabel')} hint={t('staff.status.noteHint')} icon="create-outline" value={note} onChangeText={setNote} maxLength={MAX_NOTE} />
          </Card>
          {failed ? <Notice tone="danger">{t('staff.status.saveError')}</Notice> : null}
        </>
      )}
    </Page>
  );
}

/** One thing the unit owns: its name and icon, its state in words, and the control to change it. */
function ControlCard({ control, status, busy, onSend }: { control: UnitControl; status: HospitalStatus; busy: boolean; onSend: Send }): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const label = t(control.labelKey as StringKey);
  const icon = ITEM_ICON[control.item] ?? 'ellipse';

  let body: React.ReactNode;
  if (control.kind === 'count') {
    const value = control.item === 'beds' ? status.beds : control.item === 'icu' ? status.icu ?? 0 : status.nicu;
    const reserved = control.item === 'beds' ? status.reservedBeds ?? 0 : control.item === 'nicu' ? status.reservedNicu ?? 0 : 0;
    body = (
      <View style={styles.gap}>
        <View style={styles.stepper}>
          <IconButton size="lg" icon="remove" label={`${label} −`} disabled={busy || value <= 0} onPress={() => onSend(changeFor(control, value - 1))} />
          <Text style={[styles.bigNumber, { color: theme.text }]} accessibilityLabel={`${label}: ${value}`}>{value}</Text>
          <IconButton size="lg" variant="filled" icon="add" label={`${label} +`} disabled={busy} onPress={() => onSend(changeFor(control, value + 1))} />
        </View>
        {/* Patients see ready minus held, so the two numbers always add up. */}
        {reserved > 0 ? <Badge tone="info" icon="lock-closed" label={t('staff.status.reserved', { n: reserved, free: Math.max(0, value - reserved) })} /> : null}
      </View>
    );
  } else if (control.kind === 'cathlab') {
    const working = status.equip.cathlab === true;
    const busyMin = status.cathlabBusyMin;
    const state: 'ready' | 'busy' | 'down' = !working ? 'down' : busyMin !== undefined ? 'busy' : 'ready';
    body = (
      <View style={styles.gap}>
        <Segmented<'ready' | 'busy' | 'down'>
          accessibilityLabel={label}
          value={state}
          onChange={(next) => {
            if (busy || next === state) return;
            if (next === 'ready') onSend(changeFor(control, true));
            else if (next === 'down') onSend(changeFor(control, false));
            else onSend({ kind: 'cathlabBusy', minutes: busyMin ?? 15 });
          }}
          options={[
            { value: 'ready', label: t('staff.status.cathReady'), icon: 'checkmark-circle' },
            { value: 'busy', label: t('staff.status.cathBusy'), icon: 'time' },
            { value: 'down', label: t('staff.status.cathDown'), icon: 'close-circle' },
          ]}
        />
        {state === 'busy' && busyMin !== undefined ? (
          <View style={styles.stepper}>
            <IconButton icon="remove" label={`${label} −`} disabled={busy || busyMin <= 0} onPress={() => onSend({ kind: 'cathlabBusy', minutes: Math.max(0, busyMin - STEP_MIN) })} />
            <Text style={[styles.mid, { color: theme.text }]}>{t('staff.status.freeInAbout', { min: busyMin })}</Text>
            <IconButton variant="filled" icon="add" label={`${label} +`} disabled={busy} onPress={() => onSend({ kind: 'cathlabBusy', minutes: busyMin + STEP_MIN })} />
          </View>
        ) : null}
      </View>
    );
  } else {
    const on = control.kind === 'dept' ? status.depts[control.item] === 'open' : control.kind === 'equip' ? status.equip[control.item] === true : status.oncall[control.item] === true;
    const stateText = control.kind === 'dept' ? t(on ? 'staff.status.open' : 'staff.status.diverting') : control.kind === 'equip' ? t(on ? 'staff.status.working' : 'staff.status.down') : t(on ? 'staff.status.onDuty' : 'staff.status.offDuty');
    body = (
      <View style={styles.toggleRow}>
        <Badge tone={on ? 'success' : 'warning'} dot label={stateText} />
        <Switch
          value={on}
          disabled={busy}
          accessibilityLabel={label}
          trackColor={{ false: theme.border, true: theme.primary }}
          thumbColor="#FFFFFF"
          onValueChange={(next) => onSend(changeFor(control, control.kind === 'dept' ? (next ? 'open' : 'diverting') : next))}
        />
      </View>
    );
  }

  return (
    <Card padding="lg">
      <View style={styles.cardHead}>
        <View style={[styles.itemIcon, { backgroundColor: theme.primarySoft }]}>
          <Icon name={icon} size={22} color={theme.primary} />
        </View>
        <Text accessibilityRole="header" style={[styles.label, { color: theme.text }]}>{label}</Text>
      </View>
      {body}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grid: { gap: spacing.md },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '48.8%' },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  confirmIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  confirmTitle: { fontSize: fontSizes.lg, fontFamily: fonts.bold },
  hint: { fontSize: fontSizes.sm, fontFamily: fonts.regular, lineHeight: 20 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  itemIcon: { width: 40, height: 40, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: fontSizes.lg, fontFamily: fonts.bold },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  bigNumber: { fontSize: 48, fontFamily: fonts.bold, letterSpacing: -1, textAlign: 'center', minWidth: 80 },
  mid: { flex: 1, fontSize: fontSizes.lg, fontFamily: fonts.semibold, textAlign: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  gap: { gap: spacing.sm },
});
