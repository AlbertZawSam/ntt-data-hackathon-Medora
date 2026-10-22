/**
 * Specialists and clinic slots for the admin's own hospital. The server fixes the hospital from the
 * admin's token and checks every field. Requirements: 11.1, 8.5
 */
import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { LANGUAGES, SPECIALTIES, validateSpecialistInput, type Slot } from '@medora/shared/logic/specialists';
import type { StringKey } from '../../src/i18n/t';
import { deleteSpecialist, saveSpecialist } from '../../src/services/data';
import { useApp, useT } from '../../src/state/AppProvider';
import { Button } from '../../src/ui/Button';
import { Field } from '../../src/ui/Field';
import { Screen } from '../../src/ui/Screen';
import { fonts, fontSizes, radii, spacing, useTheme } from '../../src/ui/theme';

/** The stored record: the schema calls the name field `name`. */
interface Row {
  id: string;
  name: string;
  specialty: string;
  slots: unknown;
}

const parseSlots = (text: string): Slot[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [day = '', time = ''] = line.split(/\s+/);
      return { id: `${day}${time}`.replace(/[^0-9]/g, ''), day, time, booked: false };
    });

export default function AdminSpecialistsScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { data, session } = useApp();
  const rows = (data.specialists as unknown as Row[]).filter((r) => (r as unknown as { hospitalId: string }).hospitalId === session?.hospitalId);
  const [name, setName] = React.useState('');
  const [specialty, setSpecialty] = React.useState<string>(SPECIALTIES[0]);
  const [languages, setLanguages] = React.useState<string[]>(['th']);
  const [namePublic, setNamePublic] = React.useState(true);
  const [slotsText, setSlotsText] = React.useState('');
  const [state, setState] = React.useState<'idle' | 'busy' | 'saved' | 'error'>('idle');

  const toggle = (l: string): void => setLanguages((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]));

  const save = async (): Promise<void> => {
    const checked = validateSpecialistInput({ name, specialty, languages, namePublic, slots: parseSlots(slotsText) });
    if (!checked.ok) return setState('error');
    setState('busy');
    try {
      await saveSpecialist(checked.value);
      setName('');
      setSlotsText('');
      setState('saved');
    } catch {
      setState('error');
    }
  };

  return (
    <Screen title={t('admin.specialists.title')}>
      {rows.length === 0 ? <Text style={[styles.note, { color: theme.textMuted }]}>{t('admin.specialists.empty')}</Text> : null}
      {rows.map((r) => (
        <View key={r.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.name, { color: theme.text }]}>{r.name}</Text>
          <Text style={[styles.note, { color: theme.textMuted }]}>{t(`specialty.${r.specialty}` as StringKey)}</Text>
          <Button variant="secondary" label={t('admin.specialists.deleteButton')} onPress={() => void deleteSpecialist(r.id)} />
        </View>
      ))}
      <Text style={[styles.name, { color: theme.text }]}>{t('admin.specialists.addButton')}</Text>
      <Field label={t('admin.specialists.nameLabel')} value={name} onChangeText={(v) => { setName(v); setState('idle'); }} maxLength={120} />
      <View style={styles.chips}>
        {SPECIALTIES.map((s) => (
          <Button key={s} label={t(`specialty.${s}` as StringKey)} variant={specialty === s ? 'primary' : 'secondary'} onPress={() => setSpecialty(s)} />
        ))}
      </View>
      <Text style={[styles.label, { color: theme.text }]}>{t('admin.specialists.languagesLabel')}</Text>
      <View style={styles.chips}>
        {LANGUAGES.map((l) => (
          <Button key={l} label={t(`lang.${l}` as StringKey)} variant={languages.includes(l) ? 'primary' : 'secondary'} onPress={() => toggle(l)} />
        ))}
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.text }]}>{t('admin.specialists.namePublic')}</Text>
        <Switch accessibilityLabel={t('admin.specialists.namePublic')} value={namePublic} onValueChange={setNamePublic} />
      </View>
      <Field label={t('admin.specialists.slotsLabel')} value={slotsText} onChangeText={(v) => { setSlotsText(v); setState('idle'); }} multiline textAlignVertical="top" inputStyle={styles.multiline} />
      {state === 'saved' ? <Text accessibilityLiveRegion="polite" style={[styles.note, { color: theme.success }]}>{t('admin.specialists.saved')}</Text> : null}
      {state === 'error' ? <Text accessibilityLiveRegion="polite" style={[styles.note, { color: theme.emergency }]}>{t('admin.specialists.saveError')}</Text> : null}
      <Button label={t('admin.specialists.addButton')} busy={state === 'busy'} onPress={() => void save()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  name: { fontSize: fontSizes.lg, fontFamily: fonts.semibold },
  label: { fontSize: fontSizes.md, fontFamily: fonts.semibold, flexShrink: 1 },
  note: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
  chips: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  multiline: { minHeight: 96, paddingTop: 12 },
});
