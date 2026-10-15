import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmergencyCard } from '@/components/EmergencyCard';
import { HospitalCard } from '@/components/HospitalCard';
import { MapView, type MapPin, type MapRoute } from '@/components/MapView';
import { hospitals, pathways, redFlagExamples } from '@/logic/data';
import type { PatientNeed } from '@/logic/need';
import { skippedNearest, skipReason } from '@/logic/publicLabels';
import { evaluate, type Evaluation } from '@/logic/ranking';
import { redFlag, type RedFlagMatch } from '@/logic/redFlags';
import type { LatLng } from '@/logic/types';
import { understandNeed } from '@/services/understand';
import { useT } from '@/state/language';
import { useLocationLabel, usePatientLocation } from '@/state/patientLocation';
import { fonts, minTouch, radius, spacing, useTheme } from '@/ui/theme';

// Find care now (task 10, requirement 5). The red-flag check runs first, on the phone,
// before anything else (requirement 4.1, safety rule 1); an emergency never reaches the
// need classifier or any model.

const MAX_LENGTH = 500;
const THAI = /[฀-๿]/;

type Result =
  | { kind: 'emergency'; match: RedFlagMatch; from: LatLng }
  | { kind: 'ranked'; need: PatientNeed; rows: Evaluation[]; from: LatLng; nowMs: number };

export default function CareScreen() {
  const { colors } = useTheme();
  const { t, tr, lang } = useT();
  const { location, setLastNeed } = usePatientLocation();
  const locationLabel = useLocationLabel();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const samples = redFlagExamples.safe.filter((s) => THAI.test(s) === (lang === 'th'));

  const submit = async () => {
    const description = text.trim();
    if (!description) return;
    const from = location.point;

    // Activity logging of this check arrives with the activity service (task 7.3, requirement 4.4).
    const match = redFlag(description);
    if (match) {
      setResult({ kind: 'emergency', match, from });
      return;
    }

    setBusy(true);
    const { need } = await understandNeed(description);
    setLastNeed(need);
    const now = new Date();
    setResult({ kind: 'ranked', need, from, nowMs: now.getTime(), rows: evaluate(hospitals, pathways[need], from, { at: now }) });
    setBusy(false);
  };

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];

  if (!result) {
    return (
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.heading, { color: colors.text }]}>{t('care.prompt')}</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('care.placeholder')}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={t('care.prompt')}
          multiline
          maxLength={MAX_LENGTH}
          textAlignVertical="top"
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
        <Text style={[styles.label, { color: colors.textMuted }]}>{t('care.samples')}</Text>
        <View style={styles.chips}>
          {samples.map((sample) => (
            <Pressable
              key={sample}
              onPress={() => setText(sample)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.chip, { borderColor: colors.primary, opacity: pressed ? 0.6 : 1 }]}>
              <Text style={[styles.chipText, { color: colors.primary }]}>{sample}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.body, { color: colors.textMuted }]}>{t('care.from', { place: locationLabel })}</Text>
        <Pressable
          onPress={submit}
          disabled={!text.trim() || busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: !text.trim() || busy }}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colors.primary, opacity: !text.trim() || busy ? 0.5 : pressed ? 0.85 : 1 },
          ]}>
          {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.primaryText, { color: colors.onPrimary }]}>{t('care.submit')}</Text>}
        </Pressable>
        <Text style={[styles.disclaimer, { color: colors.textMuted }]}>{t('common.disclaimer')}</Text>
      </ScrollView>
    );
  }

  const editButton = (
    <Pressable onPress={() => setResult(null)} accessibilityRole="button" hitSlop={8} style={styles.edit}>
      <Text style={[styles.link, { color: colors.primary }]}>{t('care.edit')}</Text>
    </Pressable>
  );

  if (result.kind === 'emergency') {
    return (
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
        <EmergencyCard match={result.match} from={result.from} />
        {editButton}
        <Text style={[styles.disclaimer, { color: colors.textMuted }]}>{t('common.disclaimer')}</Text>
      </ScrollView>
    );
  }

  const pathway = pathways[result.need];
  const canHelp = result.rows.filter((r) => r.canHelp);
  const cantHelp = result.rows.filter((r) => !r.canHelp);
  const top = canHelp.slice(0, 3);
  const skipped = skippedNearest(result.rows);
  const skippedReason = skipped && skipReason(skipped.fails);

  const pins: MapPin[] = result.rows.map((r) => ({
    id: r.hospital.id,
    point: r.hospital,
    label: tr(r.hospital.name),
    tone: r.canHelp ? (top.includes(r) ? 'primary' : 'muted') : 'danger',
    crossed: !r.canHelp,
    selected: r === canHelp[0],
  }));
  const routes: MapRoute[] = top.map((r, i) => ({ id: r.hospital.id, from: result.from, to: r.hospital, tone: i === 0 ? 'primary' : 'muted' }));

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <View style={card}>
        <Text style={[styles.quote, { color: colors.text }]} numberOfLines={3}>“{text.trim()}”</Text>
        {editButton}
      </View>

      <View style={[card, styles.trace]}>
        {[
          t('care.stepRedFlags'),
          t('care.stepNeed', { need: tr(pathway.name) }),
          t('care.stepHospitals', { total: result.rows.length, count: canHelp.length }),
        ].map((step) => (
          <View key={step} style={styles.step}>
            <Text style={[styles.check, { color: colors.primary }]}>✓</Text>
            <Text style={[styles.body, styles.stepText, { color: colors.text }]}>{step}</Text>
          </View>
        ))}
      </View>

      {skipped && skippedReason && (
        <View style={[card, { borderColor: colors.accent }]}>
          <Text style={[styles.body, { color: colors.text }]}>
            {t('care.skipped', { name: tr(skipped.hospital.name), reason: t(`skip.${skippedReason}` as const) })}
          </Text>
        </View>
      )}

      <MapView height={300} user={result.from} pins={pins} routes={routes} />

      <Text style={[styles.section, { color: colors.text }]}>{t('care.canHelp')}</Text>
      {canHelp.length === 0 ? (
        <View style={[card, { borderColor: colors.danger }]}>
          <Text style={[styles.body, { color: colors.text }]}>{t('care.noneCanHelp')}</Text>
        </View>
      ) : (
        canHelp.map((row, i) => <HospitalCard key={row.hospital.id} row={row} pathway={pathway} nowMs={result.nowMs} best={i === 0} />)
      )}

      {cantHelp.length > 0 && <Text style={[styles.section, { color: colors.text }]}>{t('care.cantHelp')}</Text>}
      {cantHelp.map((row) => (
        <HospitalCard key={row.hospital.id} row={row} pathway={pathway} nowMs={result.nowMs} />
      ))}

      <Text style={[styles.disclaimer, { color: colors.textMuted }]}>{t('common.disclaimer')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  heading: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 30 },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  label: { fontFamily: fonts.medium, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: -spacing.sm },
  chip: { borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: minTouch, justifyContent: 'center' },
  chipText: { fontFamily: fonts.medium, fontSize: 14 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  primary: { minHeight: minTouch + 8, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fonts.bold, fontSize: 17 },
  card: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  quote: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 24 },
  edit: { alignSelf: 'flex-start', minHeight: minTouch, justifyContent: 'center' },
  link: { fontFamily: fonts.semiBold, fontSize: 15 },
  trace: { gap: spacing.xs },
  step: { flexDirection: 'row', gap: spacing.sm },
  check: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 22 },
  stepText: { flex: 1 },
  section: { fontFamily: fonts.bold, fontSize: 18, marginTop: spacing.sm },
  disclaimer: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
