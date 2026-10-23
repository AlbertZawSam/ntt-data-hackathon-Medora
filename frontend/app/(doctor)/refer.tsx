import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { pick } from '../../src/i18n/t';
import { DataServiceError, confirmReferral, setAsideReferral, startReferral } from '../../src/services/data';
import type { StringKey } from '../../src/i18n/t';
import { MapView, type MapMarker } from '../../src/components/MapView';
import type { DecisionRow } from '@medora/shared/logic/types';
import { useApp, useT } from '../../src/state/AppProvider';
import { Button } from '../../src/ui/Button';
import { Field } from '../../src/ui/Field';
import { Screen } from '../../src/ui/Screen';
import { fonts, fontSizes, radii, spacing, useTheme } from '../../src/ui/theme';

/** Synthetic cases the doctor can tap to fill the form (task 20). Onset is minutes since symptoms began. */
const SAMPLES: Array<{ key: 'stroke' | 'stemi' | 'preterm'; onset: string }> = [
  { key: 'stroke', onset: '45' },
  { key: 'stemi', onset: '40' },
  { key: 'preterm', onset: '' },
];

/** Live doctor view for the asynchronous, bounded referral coordinator. */
export default function DoctorReferScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { data, lang, session } = useApp();
  const [description, setDescription] = React.useState('');
  const [onset, setOnset] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [deciding, setDeciding] = React.useState(false);
  const [decisionError, setDecisionError] = React.useState(false);

  const referral = React.useMemo(() => {
    const owned = data.referrals.filter((item) => item.ownerId === session?.userId);
    if (activeId) return owned.find((item) => item.id === activeId) ?? null;
    return [...owned].sort((left, right) => right.startedAtMs - left.startedAtMs)[0] ?? null;
  }, [activeId, data.referrals, session?.userId]);
  const trace = React.useMemo(
    () => (referral ? data.traceSteps.filter((step) => step.referralId === referral.id).sort((left, right) => left.n - right.n) : []),
    [data.traceSteps, referral],
  );

  const submit = (): void => {
    if (!session || !description.trim()) {
      setError(t('doctor.refer.enterDescription'));
      return;
    }
    const onsetMin = onset.trim() === '' ? undefined : Number(onset.trim());
    if (onsetMin !== undefined && (!Number.isInteger(onsetMin) || onsetMin < 0)) {
      setError(t('doctor.refer.invalidOnset'));
      return;
    }
    setBusy(true);
    setError(null);
    void startReferral(session, { text: description, onsetMin, lang })
      .then((id) => {
        setActiveId(id);
        setDescription('');
        setOnset('');
      })
      .catch((cause: unknown) => setError(cause instanceof DataServiceError ? t('doctor.refer.startError') : t('doctor.refer.startError')))
      .finally(() => setBusy(false));
  };

  const asked = React.useMemo(
    () => (referral ? data.careRequests.filter((r) => r.referralId === referral.id) : []),
    [data.careRequests, referral],
  );

  const origin = data.hospitalProfiles.find((p) => p.hospitalId === session?.hospitalId);
  const rows = (Array.isArray(referral?.rows) ? referral?.rows : []) as DecisionRow[];
  const markers: MapMarker[] = [
    ...(origin ? [{ id: 'origin', point: origin, kind: 'me' as const, label: pick(origin.name, lang) }] : []),
    ...rows.map((r): MapMarker => ({
      id: r.hospitalId,
      point: r,
      kind: r.hospitalId === referral?.chosenId ? 'chosen' : r.status === 'accepted' ? 'accepted' : r.status === 'waiting' ? 'asked' : 'declined',
      label: pick(r.name, lang),
    })),
  ];
  const chosen = rows.find((r) => r.hospitalId === referral?.chosenId);

  /** Only the doctor decides: confirming or setting aside is their action, never the agent's. */
  const decide = (action: 'confirm' | 'aside'): void => {
    if (!referral) return;
    setDeciding(true);
    setDecisionError(false);
    void (action === 'confirm' ? confirmReferral(referral) : setAsideReferral(referral.id))
      .catch(() => setDecisionError(true))
      .finally(() => setDeciding(false));
  };

  const recommendationSeconds =
    referral?.recommendedAtMs === undefined ? undefined : Math.max(0, Math.round((referral.recommendedAtMs - referral.startedAtMs) / 1_000));

  return (
    <Screen title={t('doctor.refer.title')}>
      <View style={[styles.badge, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
        <Text style={[styles.badgeText, { color: theme.primary }]}>{t('doctor.refer.agentBadge')}</Text>
      </View>
      <Text style={[styles.copy, { color: theme.textMuted }]}>{t('doctor.refer.agentPrinciple')}</Text>
      <Text style={[styles.copy, { color: theme.textMuted }]}>{t('doctor.refer.samplesTitle')}</Text>
      <View style={styles.samples}>
        {SAMPLES.map((sample) => (
          <Button
            key={sample.key}
            variant="secondary"
            label={t(`doctor.refer.sample.${sample.key}` as StringKey)}
            onPress={() => {
              setDescription(t(`doctor.refer.sample.${sample.key}.text` as StringKey));
              setOnset(sample.onset);
              setError(null);
            }}
          />
        ))}
      </View>
      <Field
        label={t('doctor.refer.descriptionPlaceholder')}
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={2_000}
        textAlignVertical="top"
        inputStyle={styles.description}
      />
      <Field
        label={t('doctor.refer.onsetPlaceholder')}
        hint={t('doctor.refer.onsetHint')}
        value={onset}
        onChangeText={setOnset}
        keyboardType="number-pad"
        maxLength={5}
      />
      <Text style={[styles.copy, { color: theme.textMuted }]}>{t('doctor.refer.startHint')}</Text>
      {error ? <Text style={[styles.error, { color: theme.emergency }]}>{error}</Text> : null}
      <Button label={t('doctor.refer.startButton')} busy={busy} onPress={submit} />

      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('doctor.refer.traceTitle')}</Text>
        {referral?.status === 'running' ? <Text style={[styles.status, { color: theme.warning }]}>{t('doctor.refer.running')}</Text> : null}
        {referral?.status === 'awaiting' ? <Text style={[styles.status, { color: theme.success }]}>{t('doctor.refer.awaiting')}</Text> : null}
        {referral?.status === 'failed' ? <Text style={[styles.status, { color: theme.emergency }]}>{t('doctor.refer.failed')}</Text> : null}
        {trace.length === 0 ? <Text style={[styles.copy, { color: theme.textMuted }]}>{t('doctor.refer.noTrace')}</Text> : null}
        {trace.map((step) => (
          <View key={step.id} style={[styles.traceRow, { borderTopColor: theme.border }]}>
            <Text style={[styles.traceTitle, { color: theme.text }]}>{pick(step.title, lang)}</Text>
            <Text style={[styles.copy, { color: theme.textMuted }]}>{pick(step.detail, lang)}</Text>
          </View>
        ))}
      </View>

      {rows.length > 0 ? (
        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('doctor.refer.mapTitle')}</Text>
          <MapView accessibilityLabel={t('map.alt.referral')} markers={markers} route={origin && chosen ? [origin, chosen] : undefined} />
        </View>
      ) : null}
      {referral?.status === 'awaiting' ? (
        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('doctor.refer.recommendationTitle')}</Text>
          <Text style={[styles.traceTitle, { color: theme.text }]}>{referral.chosenName ? pick(referral.chosenName, lang) : t('doctor.refer.noHospital')}</Text>
          {referral.why ? <Text style={[styles.copy, { color: theme.textMuted }]}>{pick(referral.why, lang)}</Text> : null}
          {recommendationSeconds !== undefined ? <Text style={[styles.copy, { color: theme.textMuted }]}>{t('doctor.refer.timeToRecommendation', { seconds: recommendationSeconds })}</Text> : null}
          {referral.etaMin !== undefined ? <Text style={[styles.copy, { color: theme.textMuted }]}>{t('doctor.refer.etaMin', { min: referral.etaMin })}</Text> : null}
          {decisionError ? <Text style={[styles.error, { color: theme.emergency }]}>{t('doctor.refer.confirmError')}</Text> : null}
          <Button label={t('doctor.refer.confirmTransfer')} busy={deciding} disabled={!referral.chosenId} onPress={() => decide('confirm')} />
          <Button variant="secondary" label={t('doctor.refer.notThisOne')} disabled={deciding} onPress={() => decide('aside')} />
        </View>
      ) : null}
      {referral?.status === 'confirmed' ? <Text style={[styles.status, { color: theme.success }]}>{t('doctor.refer.confirmed')}</Text> : null}
      {referral?.status === 'set_aside' ? <Text style={[styles.copy, { color: theme.textMuted }]}>{t('doctor.refer.setAsideDone')}</Text> : null}
      {asked.length > 0 ? (
        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('doctor.refer.decisionTitle')}</Text>
          {asked.map((r) => (
            <Text key={r.id} style={[styles.copy, { color: theme.textMuted }]}>
              {t('doctor.refer.decisionRow', { name: r.hospitalName ? pick(r.hospitalName, lang) : r.hospitalId, status: t(`request.status.${r.status}` as StringKey) })}
            </Text>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: { borderWidth: 1, borderRadius: radii.lg, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  badgeText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm },
  copy: { fontFamily: fonts.regular, fontSize: fontSizes.sm, textAlign: 'center' },
  description: { minHeight: 112, paddingTop: spacing.sm },
  error: { fontFamily: fonts.medium, fontSize: fontSizes.sm, textAlign: 'center' },
  samples: { gap: spacing.xs },
  panel: { alignSelf: 'stretch', borderWidth: 1, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.lg },
  status: { fontFamily: fonts.semibold, fontSize: fontSizes.md },
  traceRow: { borderTopWidth: 1, paddingTop: spacing.sm, gap: spacing.xs },
  traceTitle: { fontFamily: fonts.medium, fontSize: fontSizes.md },
});
