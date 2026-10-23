/**
 * Doctor referral: describe the patient (or tap a sample case), watch the agent's live trace and
 * decision table, then confirm the recommended hospital or set it aside with a reason. The agent
 * coordinates; only the doctor confirms (AGENTS.md rule 2). Requirements: 12.6, 13.1, 13.2, 17.3
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { parseDecisionRows, type DecisionRow } from '@medora/shared/logic/decisionTable';
import type { Referral } from '@medora/shared/logic/types';
import { pick, type StringKey } from '../../src/i18n/t';
import {
  confirmReferral,
  SET_ASIDE_REASONS,
  setAsideReferral,
  startReferral,
  type SetAsideReason,
} from '../../src/services/data';
import { useApp, useT } from '../../src/state/AppProvider';
import { Button } from '../../src/ui/Button';
import { Field } from '../../src/ui/Field';
import { FormScreen } from '../../src/ui/FormScreen';
import { fonts, fontSizes, radii, spacing, useTheme } from '../../src/ui/theme';

const SAMPLES = [
  { key: 'stemi', onset: '40' },
  { key: 'stroke', onset: '50' },
  { key: 'preterm', onset: '' },
] as const;

const RECENT = 5;

export default function DoctorReferScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const { data, lang, session, signOut } = useApp();
  const [description, setDescription] = React.useState('');
  const [onset, setOnset] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [deciding, setDeciding] = React.useState(false);
  const [askReason, setAskReason] = React.useState(false);
  const [now, setNow] = React.useState(Date.now());

  const owned = React.useMemo(
    () => data.referrals.filter((item) => item.ownerId === session?.userId).sort((left, right) => right.startedAtMs - left.startedAtMs),
    [data.referrals, session?.userId],
  );
  const referral = activeId ? (owned.find((item) => item.id === activeId) ?? null) : (owned[0] ?? null);
  const trace = React.useMemo(
    () => (referral ? data.traceSteps.filter((step) => step.referralId === referral.id).sort((left, right) => left.n - right.n) : []),
    [data.traceSteps, referral],
  );
  const rows = React.useMemo(() => parseDecisionRows(referral?.rows), [referral?.rows]);
  const byRules = trace.some((step) => step.kind === 'backup');
  const running = referral?.status === 'running';

  // The elapsed counter ticks while the agent works.
  React.useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [running]);

  React.useEffect(() => setAskReason(false), [referral?.id]);

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
        setNow(Date.now());
      })
      .catch(() => setError(t('doctor.refer.startError')))
      .finally(() => setBusy(false));
  };

  const confirm = (target: Referral): void => {
    if (!session) return;
    setDeciding(true);
    setError(null);
    void confirmReferral(session, target)
      .catch(() => setError(t('doctor.refer.transferError')))
      .finally(() => setDeciding(false));
  };

  const setAside = (target: Referral, reason: SetAsideReason): void => {
    if (!session) return;
    setDeciding(true);
    setError(null);
    void setAsideReferral(session, target, reason, data.careRequests)
      .then(() => setAskReason(false))
      .catch(() => setError(t('doctor.refer.setAsideError')))
      .finally(() => setDeciding(false));
  };

  const elapsedSeconds = referral
    ? Math.max(0, Math.round(((referral.recommendedAtMs ?? (running ? now : referral.startedAtMs)) - referral.startedAtMs) / 1_000))
    : 0;

  return (
    <FormScreen title={t('doctor.refer.title')} subtitle={t('doctor.refer.agentPrinciple')}>
      <View style={[styles.badge, { borderColor: theme.primary }]}>
        <Text style={[styles.badgeText, { color: theme.primary }]}>{t('doctor.refer.agentBadge')}</Text>
      </View>

      <Text style={[styles.label, { color: theme.text }]}>{t('doctor.refer.samplesTitle')}</Text>
      <View style={styles.chips}>
        {SAMPLES.map((sample) => (
          <Chip
            key={sample.key}
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
      <Text style={[styles.muted, { color: theme.textMuted }]}>{t('doctor.refer.startHint')}</Text>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.error, { color: theme.emergency }]}>
          {error}
        </Text>
      ) : null}
      <Button label={t('doctor.refer.startButton')} busy={busy} disabled={running} onPress={submit} />

      {referral ? (
        <>
          <Panel>
            <View style={styles.rowBetween}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('doctor.refer.traceTitle')}</Text>
              <Text style={[styles.muted, { color: theme.textMuted }]}>{t('doctor.refer.elapsed', { seconds: elapsedSeconds })}</Text>
            </View>
            <StatusLine referral={referral} />
            <Text style={[styles.muted, { color: theme.textMuted }]}>{t(byRules ? 'doctor.refer.byRules' : 'doctor.refer.byAgent')}</Text>
            {trace.length === 0 ? <Text style={[styles.muted, { color: theme.textMuted }]}>{t('doctor.refer.noTrace')}</Text> : null}
            {trace.map((step) => (
              <View key={step.id} style={[styles.traceRow, { borderTopColor: theme.border }]}>
                <Text style={[styles.stepNo, { color: theme.primary }]}>{step.n}</Text>
                <View style={styles.flex}>
                  <Text style={[styles.itemTitle, { color: theme.text }]}>{pick(step.title, lang)}</Text>
                  <Text style={[styles.muted, { color: theme.textMuted }]}>{pick(step.detail, lang)}</Text>
                </View>
              </View>
            ))}
          </Panel>

          <Panel>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('doctor.refer.tableTitle')}</Text>
            {rows.length === 0 ? <Text style={[styles.muted, { color: theme.textMuted }]}>{t('doctor.refer.tableEmpty')}</Text> : null}
            {rows.map((row) => (
              <DecisionLine key={row.hospitalId} row={row} />
            ))}
          </Panel>

          {referral.status === 'awaiting' ? (
            <Panel highlight>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('doctor.refer.recommendationTitle')}</Text>
              <Text style={[styles.chosenName, { color: theme.text }]}>{referral.chosenName ? pick(referral.chosenName, lang) : t('doctor.refer.noHospital')}</Text>
              {referral.etaMin !== undefined && referral.etaMin !== null ? (
                <Text style={[styles.muted, { color: theme.textMuted }]}>{t('doctor.refer.eta', { min: referral.etaMin })}</Text>
              ) : null}
              {referral.why ? <Text style={[styles.body, { color: theme.text }]}>{pick(referral.why, lang)}</Text> : null}
              {referral.recommendedAtMs !== undefined && referral.recommendedAtMs !== null ? (
                <Text style={[styles.muted, { color: theme.textMuted }]}>{t('doctor.refer.timeToRecommendation', { seconds: elapsedSeconds })}</Text>
              ) : null}
              <Text style={[styles.muted, { color: theme.textMuted }]}>{t('doctor.refer.decisionNote')}</Text>
              <Button label={t('doctor.refer.confirmTransfer')} busy={deciding} onPress={() => confirm(referral)} />
              {askReason ? (
                <>
                  <Text style={[styles.label, { color: theme.text }]}>{t('doctor.refer.setAsideTitle')}</Text>
                  <View style={styles.chips}>
                    {SET_ASIDE_REASONS.map((reason) => (
                      <Chip key={reason} label={t(`doctor.refer.setAside.${reason}` as StringKey)} disabled={deciding} onPress={() => setAside(referral, reason)} />
                    ))}
                  </View>
                  <Button variant="link" label={t('common.back')} onPress={() => setAskReason(false)} />
                </>
              ) : (
                <Button variant="secondary" label={t('doctor.refer.notThisOne')} disabled={deciding} onPress={() => setAskReason(true)} />
              )}
            </Panel>
          ) : null}

          {referral.status === 'confirmed' ? (
            <Panel highlight>
              <Text style={[styles.chosenName, { color: theme.text }]}>{referral.chosenName ? pick(referral.chosenName, lang) : ''}</Text>
              <Text style={[styles.body, { color: theme.success }]}>{t('doctor.refer.confirmed')}</Text>
              <Button label={t('doctor.refer.viewTransfers')} onPress={() => router.push('/(doctor)/transfers' as Href)} />
            </Panel>
          ) : null}

          {referral.status === 'set_aside' ? (
            <Panel>
              <Text style={[styles.body, { color: theme.text }]}>{t('doctor.refer.setAsideDone')}</Text>
            </Panel>
          ) : null}

          {referral.status === 'failed' && referral.why ? (
            <Panel>
              <Text style={[styles.body, { color: theme.text }]}>{pick(referral.why, lang)}</Text>
            </Panel>
          ) : null}
        </>
      ) : null}

      {owned.length > 1 ? (
        <Panel>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('doctor.refer.recentTitle')}</Text>
          {owned.slice(0, RECENT).map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => setActiveId(item.id)}
              style={[styles.recent, { borderTopColor: theme.border, opacity: item.id === referral?.id ? 1 : 0.75 }]}
            >
              <Text numberOfLines={1} style={[styles.flex, styles.body, { color: theme.text }]}>
                {item.text}
              </Text>
              <Text style={[styles.muted, { color: theme.textMuted }]}>{t(`doctor.refer.status.${item.status}` as StringKey)}</Text>
            </Pressable>
          ))}
        </Panel>
      ) : null}

      <Button variant="link" label={t('doctor.refer.viewTransfers')} onPress={() => router.push('/(doctor)/transfers' as Href)} />
      <Button variant="link" label={t('common.signOut')} onPress={() => void signOut()} />
    </FormScreen>
  );
}

function StatusLine({ referral }: { referral: Referral }): React.JSX.Element | null {
  const t = useT();
  const theme = useTheme();
  const tone: Record<string, string> = {
    running: theme.warning,
    awaiting: theme.success,
    confirmed: theme.success,
    set_aside: theme.textMuted,
    failed: theme.emergency,
  };
  const key: Record<string, StringKey> = {
    running: 'doctor.refer.running',
    awaiting: 'doctor.refer.awaiting',
    confirmed: 'doctor.refer.status.confirmed',
    set_aside: 'doctor.refer.status.set_aside',
    failed: 'doctor.refer.failed',
  };
  const label = key[referral.status];
  if (!label) return null;
  return <Text style={[styles.status, { color: tone[referral.status] }]}>{t(label)}</Text>;
}

function DecisionLine({ row }: { row: DecisionRow }): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { lang } = useApp();
  const replyTone =
    row.reply === 'accepted' || row.reply === 'acceptedByRule'
      ? theme.success
      : row.reply === 'declined' || row.reply === 'noReply'
        ? theme.emergency
        : theme.textMuted;
  return (
    <View style={[styles.decision, { borderTopColor: theme.border }]}>
      <View style={styles.rowBetween}>
        <Text style={[styles.itemTitle, styles.flex, { color: theme.text }]}>{pick(row.name, lang)}</Text>
        <Text style={[styles.muted, { color: theme.textMuted }]}>{t('doctor.refer.driveMin', { min: row.driveMin })}</Text>
      </View>
      {row.chosen ? <Text style={[styles.tag, { color: theme.onPrimary, backgroundColor: theme.primary }]}>{t('doctor.refer.chosen')}</Text> : null}
      {row.canHelp ? (
        <Text style={[styles.muted, { color: replyTone }]}>{t(`doctor.refer.reply.${row.reply}` as StringKey)}</Text>
      ) : (
        <Text style={[styles.muted, { color: theme.textMuted }]}>{row.whyNot.slice(0, 2).map((kind) => t(`doctor.refer.whyNot.${kind}` as StringKey)).join(' · ')}</Text>
      )}
      {row.delayMin !== undefined ? <Text style={[styles.muted, { color: theme.warning }]}>{t('doctor.refer.delay', { min: row.delayMin })}</Text> : null}
      {row.stale ? <Text style={[styles.muted, { color: theme.warning }]}>{t('doctor.refer.stale')}</Text> : null}
    </View>
  );
}

function Panel({ children, highlight = false }: { children: React.ReactNode; highlight?: boolean }): React.JSX.Element {
  const theme = useTheme();
  return <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: highlight ? theme.primary : theme.border }]}>{children}</View>;
}

function Chip({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }): React.JSX.Element {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, { borderColor: theme.primary, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }]}
    >
      <Text style={[styles.chipText, { color: theme.primary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'center', borderWidth: 1, borderRadius: radii.lg, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  badgeText: { fontFamily: fonts.semibold, fontSize: fontSizes.sm },
  body: { fontFamily: fonts.regular, fontSize: fontSizes.md },
  chip: { borderWidth: 1, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, minHeight: 36, justifyContent: 'center' },
  chipText: { fontFamily: fonts.medium, fontSize: fontSizes.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chosenName: { fontFamily: fonts.bold, fontSize: fontSizes.xl },
  decision: { borderTopWidth: 1, paddingTop: spacing.sm, gap: spacing.xs },
  description: { minHeight: 112, paddingTop: spacing.sm },
  error: { fontFamily: fonts.medium, fontSize: fontSizes.sm, textAlign: 'center' },
  flex: { flex: 1 },
  itemTitle: { fontFamily: fonts.medium, fontSize: fontSizes.md },
  label: { fontFamily: fonts.medium, fontSize: fontSizes.sm },
  muted: { fontFamily: fonts.regular, fontSize: fontSizes.sm },
  panel: { alignSelf: 'stretch', borderWidth: 1, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm },
  recent: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, paddingTop: spacing.sm, minHeight: 44 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.lg },
  status: { fontFamily: fonts.semibold, fontSize: fontSizes.md },
  stepNo: { fontFamily: fonts.bold, fontSize: fontSizes.md, minWidth: 20 },
  tag: { alignSelf: 'flex-start', borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, fontFamily: fonts.semibold, fontSize: fontSizes.xs, overflow: 'hidden' },
  traceRow: { flexDirection: 'row', gap: spacing.sm, borderTopWidth: 1, paddingTop: spacing.sm },
});
