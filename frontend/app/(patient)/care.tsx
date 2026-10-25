/**
 * Find care. Layer 1 of the emergency check runs here on the phone, before anything is sent; the
 * server runs layer 2, then the intake agent and the ranking engine, and returns hospitals as simple
 * labels only (never counts or equipment). Requirements: 4.1 to 4.4, 5.1 to 5.7, 6.1, 6.2
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ARRIVAL_MODES, type ArrivalMode, type PublicHospital } from '@medora/shared/logic/care';
import type { Bi, NeedKey } from '@medora/shared/logic/types';
import { bedsText, bedsTone } from '../../src/i18n/beds';
import { pick, type StringKey } from '../../src/i18n/t';
import { suggestedDepartment, type Department } from '@medora/shared/logic/departments';
import { HospitalDetailsView } from '../../src/components/HospitalDetailsView';
import { LocationChip } from '../../src/components/LocationChip';
import { MapView, type MapMarker } from '../../src/components/MapView';
import { findCare, submitRequest } from '../../src/services/data';
import { setLastResults } from '../../src/services/lastResults';
import { setLastNeed } from '../../src/services/lastNeed';
import { checkEmergency, logEmergencyCheck } from '../../src/services/emergency';
import { useChosenLocation } from '../../src/services/location';
import { forget, recall, remember } from '../../src/services/tabMemory';
import { useApp, useT } from '../../src/state/AppProvider';
import { Badge, Chip } from '../../src/ui/Badge';
import { Button } from '../../src/ui/Button';
import { Card, type Tone } from '../../src/ui/Card';
import { Field } from '../../src/ui/Field';
import { Icon, type IconName } from '../../src/ui/Icon';
import { Notice } from '../../src/ui/Notice';
import { Page } from '../../src/ui/Page';
import { Reveal } from '../../src/ui/Reveal';
import { Segmented } from '../../src/ui/Segmented';
import { SectionHeader } from '../../src/ui/SectionHeader';
import { SkeletonCard } from '../../src/ui/Skeleton';
import { fonts, fontSizes, spacing, useBreakpoint, useTheme } from '../../src/ui/theme';

type Phase = 'describe' | 'searching' | 'unclear' | 'results';

const LABEL_KEY: Record<PublicHospital['label'], StringKey> = {
  available: 'availability.available',
  limited: 'availability.limited',
  notAvailable: 'availability.notAvailable',
  outdated: 'availability.outdated',
};

const LABEL_LOOK: Record<PublicHospital['label'], { tone: Tone; icon: IconName }> = {
  available: { tone: 'success', icon: 'checkmark-circle' },
  limited: { tone: 'warning', icon: 'time' },
  outdated: { tone: 'neutral', icon: 'help-circle' },
  notAvailable: { tone: 'danger', icon: 'close-circle' },
};

const MODE_ICON: Record<ArrivalMode, IconName> = { car: 'car', taxi: 'car-sport', ambulance: 'medkit', walking: 'walk' };
const DEPARTMENT_ICON: Record<Department, IconName> = { cardiology: 'heart', surgery: 'bandage', obstetrics: 'woman' };
const EXAMPLES = ['patient.care.example1', 'patient.care.example2', 'patient.care.example3'] as const;

/** The last search of this browser tab, so a reload brings the results back (tabMemory). */
interface SavedSearch {
  text: string;
  atMs: number;
}
const SAVED_SEARCH_MS = 60 * 60_000;
const LIVE_REFRESH_EVERY_MS = 20_000;
const LIVE_REFRESH_FOR_MS = 10 * 60_000;

export default function PatientCareScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const wide = useBreakpoint() === 'expanded';
  const { session, lang, data } = useApp();
  const location = useChosenLocation();
  const [text, setText] = React.useState('');
  const [phase, setPhase] = React.useState<Phase>('describe');
  const [error, setError] = React.useState<StringKey | null>(null);
  const [need, setNeed] = React.useState<NeedKey>('general');
  const [aiUsed, setAiUsed] = React.useState(true);
  const [summary, setSummary] = React.useState<Bi | undefined>(undefined);
  const [hospitals, setHospitals] = React.useState<PublicHospital[]>([]);
  const [selected, setSelected] = React.useState<PublicHospital | null>(null);
  const [detailsFor, setDetailsFor] = React.useState<string | null>(null);
  const [department, setDepartment] = React.useState<Department | undefined>(undefined);
  const [mode, setMode] = React.useState<ArrivalMode>('car');
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  // After a reload of the web app, bring back the last search of this tab (under an hour old) and run it
  // again, so the results show live bed counts instead of an empty form.
  React.useEffect(() => {
    const saved = recall<SavedSearch>('care');
    if (!saved?.text || Date.now() - saved.atMs > SAVED_SEARCH_MS) return;
    setText(saved.text);
    void search(saved.text);
    // Only once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Results stay live: free beds change when a ward updates its count or another patient asks for a bed.
  // A refresh sends the care type already found, so it makes no model call; failures keep the last results.
  const searchedAtMs = React.useRef(0);
  const refresh = React.useRef<() => Promise<void>>(async () => {});
  refresh.current = async () => {
    if (phase !== 'results' || !text.trim()) return;
    try {
      const result = await findCare({ description: text.trim(), lat: location.lat, lng: location.lng, need });
      if ('emergency' in result) return;
      setHospitals(result.hospitals);
      setLastResults(result.hospitals);
    } catch {
      // keep showing the last results
    }
  };
  // A ward's change arrives at once through the live public directory.
  const directory = React.useRef(data.publicDirectory);
  React.useEffect(() => {
    if (directory.current === data.publicDirectory) return;
    directory.current = data.publicDirectory;
    void refresh.current();
  }, [data.publicDirectory]);
  // Beds held by other patients' requests send no update: check again every 20 s for 10 minutes after a search.
  React.useEffect(() => {
    if (phase !== 'results') return;
    const timer = setInterval(() => {
      if (Date.now() - searchedAtMs.current < LIVE_REFRESH_FOR_MS) void refresh.current();
    }, LIVE_REFRESH_EVERY_MS);
    return () => clearInterval(timer);
  }, [phase]);

  const emergency = (key: string): void => router.push({ pathname: '/(patient)/emergency', params: { flag: key } } as unknown as Href);

  const search = async (input: string = text): Promise<void> => {
    if (!input.trim()) return;
    setError(null);
    const match = checkEmergency(input); // layer 1: on the phone, offline, before anything is sent
    void logEmergencyCheck(session, match);
    if (match) return emergency(match.key);
    setPhase('searching');
    try {
      const result = await findCare({ description: input.trim(), lat: location.lat, lng: location.lng });
      if ('emergency' in result) return emergency(result.emergency.key); // layer 2
      setNeed(result.need);
      setLastNeed(result.need);
      setAiUsed(result.aiUsed);
      setSummary(result.summary);
      setHospitals(result.hospitals);
      setLastResults(result.hospitals);
      // Not a health problem ("how is the weather?"): ask again, with hospitals one tap away, never blocked.
      if (result.unclear) {
        setPhase('unclear');
        return;
      }
      setPhase('results');
      searchedAtMs.current = Date.now();
      remember('care', { text: input.trim(), atMs: Date.now() } satisfies SavedSearch);
    } catch {
      setError('patient.care.findError');
      setPhase('describe');
    }
  };

  const send = async (hospital: PublicHospital): Promise<void> => {
    setSending(true);
    setError(null);
    try {
      await submitRequest({
        hospitalId: hospital.id,
        needKey: need,
        etaMin: hospital.driveMin,
        mode,
        description: text.trim(),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(department ? { department } : {}),
      });
      setSent(true);
      setSelected(null);
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      setError(code === 'already-open' ? 'patient.care.alreadyOpen' : code === 'bad-phone' ? 'patient.care.badPhone' : 'patient.care.requestError');
    } finally {
      setSending(false);
    }
  };

  const canHelp = hospitals.some((h) => h.label !== 'notAvailable');
  const best = hospitals.find((h) => h.label !== 'notAvailable');
  const markers: MapMarker[] = [
    { id: 'me', point: location, kind: 'me', label: t('map.you') },
    ...hospitals.map((h): MapMarker => ({ id: h.id, point: h, kind: h.label === 'available' ? 'ok' : h.label === 'notAvailable' ? 'no' : 'limited', label: pick(h.name, lang) })),
  ];

  if (phase !== 'results') {
    return (
      <Page title={t('patient.care.title')} width="readable">
        <Reveal>
          <Card padding="lg">
            <LocationChip />
            <Field
              label={t('patient.care.descriptionLabel')}
              value={text}
              onChangeText={setText}
              hint={t('patient.care.characters', { n: text.length })}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              inputStyle={styles.multiline}
              maxLength={1000}
              editable={phase !== 'searching'}
            />
            {text.length === 0 ? (
              <View style={styles.examples}>
                <Text style={[styles.exampleTitle, { color: theme.textMuted }]}>{t('patient.care.examplesTitle')}</Text>
                <View style={styles.chips}>
                  {EXAMPLES.map((key) => (
                    <Chip key={key} label={t(key)} icon="chatbubble-ellipses-outline" selected={false} onPress={() => setText(t(key))} />
                  ))}
                </View>
              </View>
            ) : null}
            {phase === 'unclear' ? (
              <View style={styles.stack}>
                <Notice tone="warning" title={t('patient.care.unclearTitle')}>
                  {t('patient.care.unclearBody')}
                </Notice>
                <View style={styles.chips}>
                  {EXAMPLES.map((key) => (
                    <Chip key={key} label={t(key)} icon="chatbubble-ellipses-outline" selected={false} onPress={() => { setText(t(key)); setPhase('describe'); }} />
                  ))}
                </View>
                <Button variant="ghost" icon="list" label={t('patient.care.showAnyway')} onPress={() => setPhase('results')} />
              </View>
            ) : null}
            {error ? <Notice tone="danger">{t(error)}</Notice> : null}
            <Button size="lg" icon="search" label={phase === 'searching' ? t('patient.care.finding') : t('patient.care.submitButton')} busy={phase === 'searching'} disabled={!text.trim()} onPress={() => void search()} />
          </Card>
        </Reveal>
        {phase === 'searching' ? (
          <View style={styles.stack} accessibilityLiveRegion="polite">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </View>
        ) : null}
        <Notice tone="neutral">{t('patient.care.disclaimer')}</Notice>
      </Page>
    );
  }

  const list = (
    <View style={styles.stack}>
      {!canHelp ? (
        <Notice tone="danger" title={t('patient.care.noMatchTitle')}>
          {t('patient.care.nobodyHelp')}
        </Notice>
      ) : null}
      {hospitals.map((h, index) => {
        const look = LABEL_LOOK[h.label];
        const isBest = best?.id === h.id;
        const unavailable = h.label === 'notAvailable';
        return (
          <Reveal key={h.id} index={index}>
            <Card selected={isBest} padding="lg" style={unavailable ? styles.dim : undefined}>
              <Text style={[styles.hospital, { color: theme.text }]}>{pick(h.name, lang)}</Text>
              <View style={styles.row}>
                <Icon name="car-outline" size={16} color={theme.textMuted} />
                <Text style={[styles.meta, { color: theme.textMuted }]}>{t('patient.care.drive', { min: h.driveMin, km: h.distanceKm.toFixed(1) })}</Text>
              </View>
              <View style={styles.row}>
                {isBest ? <Badge tone="primary" icon="star" label={t('patient.care.bestMatch')} /> : null}
                <Badge tone={look.tone} icon={look.icon} label={t(LABEL_KEY[h.label])} />
                {/* The exact number of free beds; held beds count as taken (AGENTS.md rule 6). */}
                {h.details ? (
                  <Badge
                    tone={bedsTone(h.details.freeBeds)}
                    icon="bed"
                    label={bedsText(t, h.details.freeBeds)}
                  />
                ) : null}
              </View>
              {h.details ? (
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth={false}
                  icon={detailsFor === h.id ? 'chevron-up' : 'chevron-down'}
                  label={t(detailsFor === h.id ? 'details.hide' : 'details.button')}
                  onPress={() => setDetailsFor(detailsFor === h.id ? null : h.id)}
                />
              ) : null}
              {h.details && detailsFor === h.id ? <HospitalDetailsView details={h.details} nowMs={Date.now()} need={need} /> : null}
              {unavailable ? (
                <Text style={[styles.meta, { color: theme.textMuted }]}>{t('patient.care.skippedBecause', { reason: t('failure.simple') })}</Text>
              ) : selected?.id === h.id ? null : (
                <Button
                  variant={isBest ? 'primary' : 'secondary'}
                  icon="paper-plane"
                  label={t('patient.care.requestButton')}
                  onPress={() => {
                    setSelected(h);
                    setSent(false);
                    // Pre-select the department that fits the need when this hospital has it open.
                    const suggested = suggestedDepartment(need);
                    setDepartment(suggested && h.details?.departments.includes(suggested) ? suggested : undefined);
                  }}
                />
              )}
              {selected?.id === h.id ? (
                <Reveal y={6}>
                  <View style={[styles.form, { borderTopColor: theme.border }]}>
                    <Text accessibilityRole="header" style={[styles.formTitle, { color: theme.text }]}>
                      {t('patient.care.requestTitle', { hospital: pick(h.name, lang) })}
                    </Text>
                    {h.details && h.details.departments.length > 0 ? (
                      <>
                        <Text style={[styles.meta, { color: theme.textMuted }]}>{t('patient.care.departmentLabel')}</Text>
                        {/* Two per row so the full department names fit on a phone. */}
                        <View accessibilityRole="radiogroup" accessibilityLabel={t('patient.care.departmentLabel')} style={styles.deptGrid}>
                          {[
                            ...h.details.departments.map((d) => ({ value: d as Department | 'general', label: t(`department.short.${d}` as StringKey), icon: DEPARTMENT_ICON[d] })),
                            { value: 'general' as const, label: t('department.short.general'), icon: 'medkit' as IconName },
                          ].map((option) => (
                            <View key={option.value} style={styles.deptCell}>
                              <Button
                                variant={(department ?? 'general') === option.value ? 'primary' : 'secondary'}
                                icon={option.icon}
                                label={option.label}
                                onPress={() => setDepartment(option.value === 'general' ? undefined : option.value)}
                              />
                            </View>
                          ))}
                        </View>
                      </>
                    ) : null}
                    <Text style={[styles.meta, { color: theme.textMuted }]}>{t('patient.care.arrivalMode')}</Text>
                    <Segmented<ArrivalMode>
                      accessibilityLabel={t('patient.care.arrivalMode')}
                      value={mode}
                      onChange={setMode}
                      options={ARRIVAL_MODES.map((m) => ({ value: m, label: t(`mode.${m}` as StringKey), icon: MODE_ICON[m] }))}
                    />
                    <Field label={t('patient.care.namePlaceholder')} icon="person-outline" value={name} onChangeText={setName} maxLength={80} />
                    <Field label={t('patient.care.phonePlaceholder')} icon="call-outline" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} />
                    <View style={styles.buttons}>
                      <View style={styles.flex}>
                        <Button icon="send" label={sending ? t('patient.care.sending') : t('patient.care.sendRequest')} busy={sending} onPress={() => void send(h)} />
                      </View>
                      <Button variant="ghost" fullWidth={false} label={t('common.back')} onPress={() => setSelected(null)} />
                    </View>
                  </View>
                </Reveal>
              ) : null}
            </Card>
          </Reveal>
        );
      })}
    </View>
  );

  return (
    <Page title={t('patient.care.nearbyTitle')} onBack={() => { forget('care'); setPhase('describe'); }} backLabel={t('patient.care.newSearch')}>
      <Card padding="md">
        <View style={styles.row}>
          <Badge tone="primary" icon="search" label={t('patient.care.lookingFor', { need: t(`need.${need}` as StringKey) })} />
          {!aiUsed ? <Badge tone="warning" icon="information-circle" label={t('patient.care.aiUnavailable')} /> : null}
        </View>
        {summary ? <Text style={[styles.meta, { color: theme.textMuted }]}>{t('patient.care.understood', { summary: pick(summary, lang) })}</Text> : null}
      </Card>
      {sent ? <Notice tone="success" title={t('patient.care.requestSent')} actionLabel={t('patient.care.viewRequests')} onAction={() => router.push('/(patient)/requests' as Href)} /> : null}
      {error ? <Notice tone="danger">{t(error)}</Notice> : null}
      {wide ? (
        <View style={styles.columns}>
          <View style={styles.listColumn}>{list}</View>
          <View style={styles.mapColumn}>
            <MapView accessibilityLabel={t('map.alt.results')} height={520} markers={markers} route={best ? [location, best] : undefined} />
            <Text style={[styles.legend, { color: theme.textMuted }]}>{t('map.legend')}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.stack}>
          <MapView accessibilityLabel={t('map.alt.results')} height={240} markers={markers} route={best ? [location, best] : undefined} />
          <Text style={[styles.legend, { color: theme.textMuted }]}>{t('map.legend')}</Text>
          <SectionHeader title={t('patient.care.canHelp')} />
          {list}
        </View>
      )}
      <Notice tone="neutral">{t('patient.care.disclaimer')}</Notice>
    </Page>
  );
}

const styles = StyleSheet.create({
  deptGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  deptCell: { flexBasis: '47%', flexGrow: 1 },
  flex: { flex: 1 },
  stack: { gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  multiline: { minHeight: 120, paddingTop: 12 },
  examples: { gap: spacing.sm },
  exampleTitle: { fontSize: fontSizes.sm, fontFamily: fonts.medium },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  columns: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  listColumn: { flex: 1.1 },
  mapColumn: { flex: 1, gap: spacing.sm },
  hospital: { fontSize: fontSizes.lg, fontFamily: fonts.bold, lineHeight: 24 },
  meta: { fontSize: fontSizes.sm, fontFamily: fonts.regular, lineHeight: 20 },
  legend: { fontSize: fontSizes.xs, fontFamily: fonts.regular },
  dim: { opacity: 0.7 },
  form: { gap: spacing.md, paddingTop: spacing.md, marginTop: spacing.xs, borderTopWidth: 1 },
  formTitle: { fontSize: fontSizes.lg, fontFamily: fonts.bold },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
