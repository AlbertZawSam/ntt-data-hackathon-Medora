/**
 * Specialists and clinic slots for the admin's own hospital. The server fixes the hospital from the
 * admin's token and checks every field. Requirements: 11.1, 8.5
 */
import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { LANGUAGES, SPECIALTIES, validateSpecialistInput, type Slot } from '@medora/shared/logic/specialists';
import type { StringKey } from '../../src/i18n/t';
import { removeSpecialist, saveSpecialist } from '../../src/services/data';
import { useApp, useT } from '../../src/state/AppProvider';
import { Badge, Chip } from '../../src/ui/Badge';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { ConfirmPanel } from '../../src/ui/ConfirmPanel';
import { EmptyState } from '../../src/ui/EmptyState';
import { Field } from '../../src/ui/Field';
import { Notice } from '../../src/ui/Notice';
import { Page } from '../../src/ui/Page';
import { SectionHeader } from '../../src/ui/SectionHeader';
import { fonts, fontSizes, spacing, useTheme } from '../../src/ui/theme';

/** The stored record: the schema calls the name field `name`. */
interface Row {
  id: string;
  name: string;
  specialty: string;
  languages?: string[] | null;
  slots: unknown;
}

/** Open (unbooked) times in the stored slots, which arrive as a JSON string or an array. */
const openCount = (slots: unknown): number => {
  try {
    const list = (typeof slots === 'string' ? JSON.parse(slots) : slots) as Slot[] | null;
    return Array.isArray(list) ? list.filter((x) => !x.booked).length : 0;
  } catch {
    return 0;
  }
};

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
  // The specialist whose Delete was tapped, waiting for confirmation; and a failed delete.
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteFailed, setDeleteFailed] = React.useState(false);

  const remove = async (id: string): Promise<void> => {
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await removeSpecialist(id);
      setConfirmId(null);
    } catch {
      setDeleteFailed(true);
    } finally {
      setDeleting(false);
    }
  };

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
    <Page title={t('admin.specialists.title')} subtitle={t('admin.specialists.sub')} width="readable">
      {deleteFailed ? <Notice tone="danger">{t('admin.specialists.deleteError')}</Notice> : null}
      {rows.length === 0 ? (
        <Card padding="lg">
          <EmptyState icon="people-outline" title={t('admin.specialists.empty')} />
        </Card>
      ) : null}
      {rows.map((r) => (
        <Card key={r.id} padding="lg">
          <View style={styles.list}>
            <Text style={[styles.name, { color: theme.text }]}>{r.name}</Text>
            <View style={styles.wrap}>
              <Badge tone="primary" label={t(`specialty.${r.specialty}` as StringKey)} />
              {(r.languages ?? []).map((l) => (
                <Badge key={l} tone="neutral" icon="language" label={t(`lang.${l}` as StringKey)} />
              ))}
              <Badge tone="info" icon="calendar" label={t('admin.specialists.slotCount', { n: openCount(r.slots) })} />
            </View>
            {confirmId === r.id ? (
              <ConfirmPanel
                title={t('admin.specialists.deleteConfirm', { name: r.name })}
                body={t('admin.specialists.deleteBody')}
                confirmLabel={t('admin.specialists.deleteButton')}
                cancelLabel={t('common.keep')}
                busy={deleting}
                onConfirm={() => void remove(r.id)}
                onCancel={() => setConfirmId(null)}
              />
            ) : (
              <Button variant="ghost" icon="trash-outline" fullWidth={false} label={t('admin.specialists.deleteButton')} onPress={() => { setDeleteFailed(false); setConfirmId(r.id); }} />
            )}
          </View>
        </Card>
      ))}
      <SectionHeader title={t('admin.specialists.addTitle')} />
      <Card padding="lg">
        <View style={styles.list}>
          <Field label={t('admin.specialists.nameLabel')} value={name} onChangeText={(v) => { setName(v); setState('idle'); }} maxLength={120} />
          <Text style={[styles.label, { color: theme.text }]}>{t('patient.specialists.specialtyLabel')}</Text>
          <View accessibilityRole="radiogroup" style={styles.wrap}>
            {SPECIALTIES.map((sp) => (
              <Chip key={sp} label={t(`specialty.${sp}` as StringKey)} selected={specialty === sp} onPress={() => setSpecialty(sp)} />
            ))}
          </View>
          <Text style={[styles.label, { color: theme.text }]}>{t('admin.specialists.languagesLabel')}</Text>
          <View style={styles.wrap}>
            {LANGUAGES.map((l) => (
              <Chip key={l} label={t(`lang.${l}` as StringKey)} selected={languages.includes(l)} onPress={() => toggle(l)} />
            ))}
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: theme.text }]}>{t('admin.specialists.namePublic')}</Text>
            <Switch accessibilityLabel={t('admin.specialists.namePublic')} value={namePublic} onValueChange={setNamePublic} />
          </View>
          <Field
            label={t('admin.specialists.slotsLabel')}
            hint={t('admin.specialists.slotsHint')}
            value={slotsText}
            onChangeText={(v) => { setSlotsText(v); setState('idle'); }}
            multiline
            textAlignVertical="top"
            inputStyle={styles.multiline}
          />
          {state === 'saved' ? <Notice tone="success">{t('admin.specialists.saved')}</Notice> : null}
          {state === 'error' ? <Notice tone="danger">{t('admin.specialists.saveError')}</Notice> : null}
          <Button icon="person-add" label={t('admin.specialists.addButton')} busy={state === 'busy'} onPress={() => void save()} />
        </View>
      </Card>
    </Page>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  name: { fontSize: fontSizes.lg, fontFamily: fonts.semibold },
  label: { fontSize: fontSizes.md, fontFamily: fonts.semibold, flexShrink: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  multiline: { minHeight: 120, paddingTop: 12 },
});
