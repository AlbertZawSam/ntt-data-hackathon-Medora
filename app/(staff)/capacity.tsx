import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { StringKey } from '@/i18n/t';
import { hospitals } from '@/logic/data';
import { setBeds, setNicu, toggleDept, toggleEquip, toggleOncall } from '@/logic/statusEdit';
import type { HospitalStatus } from '@/logic/types';
import { useT } from '@/state/language';
import { fonts, minTouch, radius, spacing, useTheme, type Colors } from '@/ui/theme';

// Hospital status board (task 14.1, requirement 9.1). Staff see exact counts; patients never do.
// Until sign-in (task 5) the hospital is fixed; it will come from custom:hospitalId.
// Saving to the backend and the "Still correct?" check-in arrive with tasks 7 and 14.2.
const HOSPITAL_ID = 'H02';

type Pill = { key: string; label: string; good: boolean; state: string };

export default function CapacityScreen() {
  const { colors } = useTheme();
  const { t, tr } = useT();
  const hospital = hospitals.find((h) => h.id === HOSPITAL_ID)!;
  const [status, setStatus] = useState<HospitalStatus>(hospital.status);

  const edit = (fn: (s: HospitalStatus, nowMs: number) => HospitalStatus) => setStatus((s) => fn(s, Date.now()));

  const stepper = (labelKey: StringKey, value: number, total: number, onChange: (n: number) => void) => {
    const label = t(labelKey);
    return (
      <View style={[styles.card, styles.stepperRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.flex}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{label}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>{t('status.ofTotal', { total })}</Text>
        </View>
        <StepButton text="−" a11y={t('status.decrease', { item: label })} disabled={value <= 0} onPress={() => onChange(value - 1)} colors={colors} />
        <Text style={[styles.count, { color: colors.text }]} accessibilityLiveRegion="polite">{value}</Text>
        <StepButton text="+" a11y={t('status.increase', { item: label })} disabled={value >= total} onPress={() => onChange(value + 1)} colors={colors} />
      </View>
    );
  };

  const section = (titleKey: StringKey, pills: Pill[], onToggle: (key: string) => void) =>
    pills.length > 0 && (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{t(titleKey)}</Text>
        <View style={styles.pills}>
          {pills.map((p) => (
            <Pressable
              key={p.key}
              onPress={() => onToggle(p.key)}
              accessibilityRole="switch"
              accessibilityState={{ checked: p.good }}
              accessibilityLabel={`${p.label}: ${p.state}`}
              style={({ pressed }) => [
                styles.pill,
                {
                  backgroundColor: p.good ? colors.primary : colors.surface,
                  borderColor: p.good ? colors.primary : colors.danger,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <Text style={[styles.pillLabel, { color: p.good ? colors.onPrimary : colors.text }]}>{p.label}</Text>
              <Text style={[styles.pillState, { color: p.good ? colors.onPrimary : colors.danger }]}>{p.state}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );

  const depts: Pill[] = Object.entries(status.depts).map(([key, state]) => ({
    key,
    label: t(`dept.${key}` as StringKey),
    good: state === 'open',
    state: t(state === 'open' ? 'status.open' : 'status.diverting'),
  }));
  const equip: Pill[] = Object.entries(status.equip).map(([key, ok]) => ({
    key,
    label: t(`equip.${key}` as StringKey),
    good: ok,
    state: t(ok ? 'status.working' : 'status.down'),
  }));
  const oncall: Pill[] = Object.entries(status.oncall).map(([key, on]) => ({
    key,
    label: t(`oncall.${key}` as StringKey),
    good: on,
    state: t(on ? 'status.onDuty' : 'status.offDuty'),
  }));

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <Text style={[styles.hospital, { color: colors.text }]}>{tr(hospital.name)}</Text>
      <Text style={[styles.meta, { color: colors.textMuted }]}>{t('status.tapToChange')}</Text>

      {stepper('status.beds', status.beds, hospital.totalBeds, (n) => edit((s, now) => setBeds(hospital, s, n, now)))}
      {hospital.nicuTotal > 0 &&
        stepper('status.nicu', status.nicu, hospital.nicuTotal, (n) => edit((s, now) => setNicu(hospital, s, n, now)))}

      {section('status.departments', depts, (key) => edit((s, now) => toggleDept(s, key, now)))}
      {section('status.equipment', equip, (key) => edit((s, now) => toggleEquip(s, key, now)))}
      {section('status.doctors', oncall, (key) => edit((s, now) => toggleOncall(s, key, now)))}
    </ScrollView>
  );
}

function StepButton({ text, a11y, disabled, onPress, colors }: { text: string; a11y: string; disabled: boolean; onPress: () => void; colors: Colors }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.step,
        { borderColor: colors.primary, opacity: disabled ? 0.35 : pressed ? 0.7 : 1 },
      ]}>
      <Text style={[styles.stepText, { color: colors.primary }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  flex: { flex: 1 },
  hospital: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 28 },
  card: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  cardTitle: { fontFamily: fonts.semiBold, fontSize: 16, lineHeight: 22 },
  meta: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginTop: -spacing.sm },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  step: { width: minTouch + 4, height: minTouch + 4, borderRadius: radius.sm, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 28 },
  count: { fontFamily: fonts.bold, fontSize: 26, minWidth: 44, textAlign: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: { borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: minTouch + 8, justifyContent: 'center' },
  pillLabel: { fontFamily: fonts.semiBold, fontSize: 14 },
  pillState: { fontFamily: fonts.regular, fontSize: 12 },
});
