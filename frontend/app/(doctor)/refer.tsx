/**
 * Doctor referral: describe the patient (or tap a sample case), watch the agent's live trace and
 * decision table, then confirm the recommended hospital or set it aside with a reason. The agent
 * coordinates; only the doctor confirms (AGENTS.md rule 2). Requirements: 12.6, 13.1, 13.2, 17.3
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { parseDecisionRows, type DecisionRow } from '@medora/shared/logic/decisionTable';
import type { CareRequest, Referral } from '@medora/shared/logic/types';
import { MapView, shortLabel, type MapMarker, type MarkerKind } from '../../src/components/MapView';
import { MessageThread } from '../../src/components/MessageThread';
import { ReferPanel } from '../../src/components/ReferPanel';
import { pick, type StringKey } from '../../src/i18n/t';
import {
  answerRequest,
  confirmReferral,
  referPatient,
  SET_ASIDE_REASONS,
  setAsideReferral,
  startReferral,
  type SetAsideReason,
} from '../../src/services/data';
import { useApp, useT } from '../../src/state/AppProvider';
import { Badge, Chip } from '../../src/ui/Badge';
import { Button } from '../../src/ui/Button';
import { Card, type Tone } from '../../src/ui/Card';
import { Field } from '../../src/ui/Field';
import { Icon, type IconName } from '../../src/ui/Icon';
import { Notice } from '../../src/ui/Notice';
import { Page } from '../../src/ui/Page';
import { Reveal } from '../../src/ui/Reveal';
import { SectionHeader } from '../../src/ui/SectionHeader';
import { Timeline, type TimelineStep } from '../../src/ui/Timeline';
import { focusRing, pointer, webTransition } from '../../src/ui/web';
import { fonts, fontSizes, radii, spacing, useBreakpoint, useTheme } from '../../src/ui/theme';

const SAMPLES = [
  { key: 'stemi', onset: '40', icon: 'heart' },
  { key: 'stroke', onset: '50', icon: 'pulse' },
  { key: 'preterm', onset: '', icon: 'happy' },
] as const;

const RECENT = 5;

const STATUS_LOOK: Record<string, { tone: Tone; icon: IconName; key: StringKey }> = {
  running: { tone: 'warning', icon: 'sync', key: 'doctor.refer.running' },
  awaiting: { tone: 'success', icon: 'checkmark-circle', key: 'doctor.refer.awaiting' },
  confirmed: { tone: 'success', icon: 'checkmark-done', key: 'doctor.refer.status.confirmed' },
  set_aside: { tone: 'neutral', icon: 'remove-circle', key: 'doctor.refer.status.set_aside' },
  failed: { tone: 'danger', icon: 'alert-circle', key: 'doctor.refer.failed' },
};

const REPLY_LOOK: Record<DecisionRow['reply'], { tone: Tone; icon: IconName }> = {
  notAsked: { tone: 'neutral', icon: 'ellipse-outline' },
  waiting: { tone: 'warning', icon: 'time' },
  accepted: { tone: 'success', icon: 'checkmark-circle' },
  acceptedByRule: { tone: 'success', icon: 'flash' },
  declined: { tone: 'danger', icon: 'close-circle' },
  noReply: { tone: 'danger', icon: 'help-circle' },
  cancelled: { tone: 'neutral', icon: 'remove-circle' },
};

export default function DoctorReferScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const wide = useBreakpoint() === 'expanded';
  const { data, lang, session } = useApp();
  const [description, setDescription] = React.useState('');
  const [onset, setOnset] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [deciding, setDeciding] = React.useState(false);
  const [askReason, setAskReason] = React.useState(false);
  const [now, setNow] = React.useState(Date.now());
  const [referringId, setReferringId] = React.useState<string | null>(null);
  const [showAi, setShowAi] = React.useState(false);
  const [showOther, setShowOther] = React.useState(false);

  const [showAllPatients, setShowAllPatients] = React.useState(false);
  const [answering, setAnswering] = React.useState<string | null>(null);
  const [declining, setDeclining] = React.useState<string | null>(null);
  const [answerError, setAnswerError] = React.useState(false);

  // Referrals other hospitals' doctors sent to this hospital: this doctor accepts or declines them by hand.
  const incoming = React.useMemo(
    () =>
      data.careRequests
        .filter((r) => r.hospitalId === session?.hospitalId && r.referralId && r.ownerId !== session?.userId && (r.status === 'waiting' || r.status === 'accepted'))
        .sort((a, b) => (a.status === b.status ? b.createdAtMs - a.createdAtMs : a.status === 'waiting' ? -1 : 1)),
    [data.careRequests, session?.hospitalId, session?.userId],
  );
  // Patients' own requests that reached this hospital and are still active (last 24 hours): the doctor can refer one.
  const patients = React.useMemo(
    () =>
      data.careRequests
        .filter((r) => r.hospitalId === session?.hospitalId && !r.referralId && r.type !== 'booking' && (r.status === 'waiting' || r.status === 'accepted') && Date.now() - r.createdAtMs < 24 * 60 * 60_000)
        .sort((a, b) => b.createdAtMs - a.createdAtMs),
    [data.careRequests, session?.hospitalId],
  );
  const shownPatients = showAllPatients ? patients : patients.slice(0, 6);

  const answer = async (r: CareRequest, action: 'accept' | 'decline', reason?: string): Promise<void> => {
    setAnswering(r.id);
    setAnswerError(false);
    try {
      await answerRequest(r.id, action, reason ? { reason } : {});
      setDeclining(null);
    } catch {
      setAnswerError(true);
    } finally {
      setAnswering(null);
    }
  };
  const patientName = (r: CareRequest): string => r.patient.name || t('doctor.patients.unnamed');

  const sendDirect = async (r: CareRequest, toHospitalId: string, department: string | undefined): Promise<void> => {
    const id = await referPatient({ requestId: r.id, toHospitalId, department });
    setActiveId(id);
    setReferringId(null);
  };
  const askAi = async (r: CareRequest): Promise<void> => {
    if (!session) return;
    const id = await startReferral(session, { text: r.patient.description, lang });
    setActiveId(id);
    setReferringId(null);
    setNow(Date.now());
  };

  const owned = React.useMemo(
    () => data.referrals.filter((item) => item.ownerId === session?.userId).sort((left, right) => right.startedAtMs - left.startedAtMs),
    [data.referrals, session?.userId],
  );
  // Only a referral still in progress shows at the top, unless the doctor opens a past one from the list.
  const referral = activeId ? (owned.find((item) => item.id === activeId) ?? null) : (owned.find((item) => item.status === 'running' || item.status === 'awaiting') ?? null);
  const trace = React.useMemo(
    () => (referral ? data.traceSteps.filter((step) => step.referralId === referral.id).sort((left, right) => left.n - right.n) : []),
    [data.traceSteps, referral],
  );
  const rows = React.useMemo(() => parseDecisionRows(referral?.rows), [referral?.rows]);
  const origin = data.hospitalProfiles.find((profile) => profile.hospitalId === referral?.fromHospitalId);
  const markers = React.useMemo(() => referralMarkers(rows, origin, t('doctor.refer.mapYou'), lang), [rows, origin, t, lang]);
  const chosenRow = rows.find((row) => row.chosen && row.lat !== undefined && row.lng !== undefined);
  // The chosen hospital's request carries its staff's messages to the doctor (read-only here).
  const chosenRequest = data.careRequests.find((r) => r.referralId === referral?.id && r.hospitalId === referral?.chosenId);
  const byRules = trace.some((step) => step.kind === 'backup');
  const direct = referral?.mode === 'direct';
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
    setActiveId(target.id); // keep showing it after it's confirmed, with the link to transfer tracking
    void confirmReferral(session, target)
      .catch(() => setError(t('doctor.refer.transferError')))
      .finally(() => setDeciding(false));
  };

  const setAside = (target: Referral, reason: SetAsideReason): void => {
    if (!session) return;
    setDeciding(true);
    setError(null);
    void setAsideReferral(session, target, reason)
      .then(() => setAskReason(false))
      .catch(() => setError(t('doctor.refer.setAsideError')))
      .finally(() => setDeciding(false));
  };

  const elapsedSeconds = referral
    ? Math.max(0, Math.round(((referral.recommendedAtMs ?? (running ? now : referral.startedAtMs)) - referral.startedAtMs) / 1_000))
    : 0;

  /** The agent's steps as a timeline: finished ones, the one in progress, and what is still to come. */
  const steps: TimelineStep[] = trace.map((step, index) => ({
    id: step.id,
    title: pick(step.title, lang),
    detail: pick(step.detail, lang),
    state: referral?.status === 'failed' && index === trace.length - 1 ? 'error' : 'done',
  }));
  if (running) steps.push({ id: 'working', title: t('doctor.refer.running'), state: 'active' });

  const form = (
    <Card padding="lg">
      <Text style={[styles.label, { color: theme.text }]}>{t('doctor.refer.otherPatientHint')}</Text>
      <View style={styles.row}>
        <Badge tone="info" icon="sparkles" label={t('doctor.refer.agentBadge')} />
      </View>
      <Text style={[styles.label, { color: theme.text }]}>{t('doctor.refer.samplesTitle')}</Text>
      <View style={styles.row}>
        {SAMPLES.map((sample) => (
          <Chip
            key={sample.key}
            label={t(`doctor.refer.sample.${sample.key}` as StringKey)}
            icon={sample.icon}
            selected={false}
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
        icon="document-text-outline"
      />
      <Field
        label={t('doctor.refer.onsetPlaceholder')}
        hint={t('doctor.refer.onsetHint')}
        value={onset}
        onChangeText={setOnset}
        keyboardType="number-pad"
        maxLength={5}
        icon="time-outline"
      />
      <Text style={[styles.muted, { color: theme.textMuted }]}>{t('doctor.refer.startHint')}</Text>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button size="lg" icon="rocket" label={t('doctor.refer.startButton')} busy={busy} disabled={running} onPress={submit} />
    </Card>
  );

  const live = referral ? (
    <View style={styles.stack}>
      <Reveal>
        <Card padding="lg">
          <View style={styles.between}>
            <View style={styles.row}>
              {STATUS_LOOK[referral.status] ? <Badge tone={STATUS_LOOK[referral.status].tone} icon={STATUS_LOOK[referral.status].icon} label={t(STATUS_LOOK[referral.status].key)} /> : null}
              <Badge tone="neutral" icon={direct ? 'person' : byRules ? 'git-branch' : 'sparkles'} label={t(direct ? 'doctor.refer.byYou' : byRules ? 'doctor.refer.byRules' : 'doctor.refer.byAgent')} />
            </View>
            <View style={styles.row}>
              <Icon name="stopwatch-outline" size={18} color={theme.textMuted} />
              <Text style={[styles.elapsed, { color: theme.text }]}>{t('doctor.refer.elapsed', { seconds: elapsedSeconds })}</Text>
            </View>
          </View>
          {referral.text ? <Text numberOfLines={2} style={[styles.muted, { color: theme.textMuted }]}>{referral.text}</Text> : null}
          {direct && referral.status === 'running' ? (
            <Notice tone="info" title={t('doctor.refer.waitingFor', {
              hospital: referral.chosenName ? pick(referral.chosenName, lang) : '',
              department: chosenRequest?.department ? t(`department.short.${chosenRequest.department}` as StringKey) : t('department.short.general'),
            })} />
          ) : null}
        </Card>
      </Reveal>

      {referral.status === 'awaiting' ? (
        <Reveal index={1}>
          <Card padding="lg" selected tone="primary">
            <View style={styles.row}>
              <Badge tone="primary" icon={direct ? 'checkmark-circle' : 'star'} label={t(direct ? 'doctor.refer.acceptedReady' : 'doctor.refer.recommendationTitle')} />
            </View>
            <Text accessibilityRole="header" style={[styles.chosenName, { color: theme.text }]}>
              {referral.chosenName ? pick(referral.chosenName, lang) : t('doctor.refer.noHospital')}
            </Text>
            <View style={styles.row}>
              {referral.etaMin !== undefined && referral.etaMin !== null ? <Badge tone="info" icon="car" label={t('doctor.refer.eta', { min: referral.etaMin })} /> : null}
              {!direct && referral.recommendedAtMs !== undefined && referral.recommendedAtMs !== null ? (
                <Badge tone="neutral" icon="flash" label={t('doctor.refer.timeToRecommendation', { seconds: elapsedSeconds })} />
              ) : null}
            </View>
            {referral.why ? <Text style={[styles.body, { color: theme.text }]}>{pick(referral.why, lang)}</Text> : null}
            <Notice tone="info" title={t(direct ? 'doctor.refer.decisionNoteDirect' : 'doctor.refer.decisionNote')} />
            <Button size="lg" icon="checkmark-done" label={t('doctor.refer.confirmTransfer')} busy={deciding} onPress={() => confirm(referral)} />
            {askReason ? (
              <View style={styles.stack}>
                <Text style={[styles.label, { color: theme.text }]}>{t('doctor.refer.setAsideTitle')}</Text>
                <View style={styles.row}>
                  {SET_ASIDE_REASONS.map((reason) => (
                    <Chip key={reason} label={t(`doctor.refer.setAside.${reason}` as StringKey)} selected={false} onPress={() => { if (!deciding) setAside(referral, reason); }} />
                  ))}
                </View>
                <Button variant="ghost" icon="chevron-back" label={t('common.back')} onPress={() => setAskReason(false)} />
              </View>
            ) : (
              <Button variant="secondary" icon="close" label={t('doctor.refer.notThisOne')} disabled={deciding} onPress={() => setAskReason(true)} />
            )}
          </Card>
        </Reveal>
      ) : null}

      {referral.status === 'confirmed' ? (
        <Card padding="lg" tone="success">
          <Text style={[styles.chosenName, { color: theme.text }]}>{referral.chosenName ? pick(referral.chosenName, lang) : ''}</Text>
          <Notice tone="success">{t('doctor.refer.confirmed')}</Notice>
          <Button icon="car" label={t('doctor.refer.viewTransfers')} onPress={() => router.push('/(doctor)/transfers' as Href)} />
        </Card>
      ) : null}
      {chosenRequest && (referral.status === 'awaiting' || referral.status === 'confirmed') ? (
        <Card padding="lg">
          <SectionHeader title={t('doctor.refer.messagesTitle')} />
          <MessageThread requestId={chosenRequest.id} messages={data.messages} me="patient" disabled />
        </Card>
      ) : null}
      {referral.status === 'set_aside' ? <Notice tone="neutral">{t('doctor.refer.setAsideDone')}</Notice> : null}
      {referral.status === 'failed' && referral.why ? <Notice tone="danger">{pick(referral.why, lang)}</Notice> : null}

      {!direct ? (
        <Button variant="ghost" icon={showAi ? 'chevron-up' : 'sparkles-outline'} label={t(showAi ? 'doctor.refer.hideAi' : 'doctor.refer.showAi')} onPress={() => setShowAi(!showAi)} />
      ) : null}
      {!direct && showAi ? (
      <>
      <Card padding="lg">
        <SectionHeader title={t('doctor.refer.traceTitle')} />
        {steps.length === 0 ? <Text style={[styles.muted, { color: theme.textMuted }]}>{t('doctor.refer.noTrace')}</Text> : <Timeline steps={steps} />}
      </Card>

      {markers.length > 1 ? (
        <Card padding="lg">
          <SectionHeader title={t('doctor.refer.mapTitle')} />
          <MapView
            accessibilityLabel={t('map.alt.referral')}
            height={wide ? 320 : 240}
            markers={markers}
            route={origin && chosenRow ? [origin, { lat: chosenRow.lat!, lng: chosenRow.lng! }] : undefined}
          />
          <Text style={[styles.muted, { color: theme.textMuted }]}>{t('doctor.refer.mapLegend')}</Text>
        </Card>
      ) : null}

      <Card padding="lg">
        <SectionHeader title={t('doctor.refer.tableTitle')} />
        {rows.length === 0 ? <Text style={[styles.muted, { color: theme.textMuted }]}>{t('doctor.refer.tableEmpty')}</Text> : null}
        {rows.map((row) => (
          <DecisionLine key={row.hospitalId} row={row} />
        ))}
      </Card>
      </>
      ) : null}
    </View>
  ) : null;

  const incomingSection =
    incoming.length > 0 ? (
      <Card padding="lg" selected={incoming.some((r) => r.status === 'waiting')}>
        <SectionHeader title={t('doctor.incoming.title')} />
        {answerError ? <Notice tone="danger">{t('staff.inbox.answerError')}</Notice> : null}
        {incoming.map((r) => (
          <View key={r.id} style={[styles.patient, { borderColor: r.status === 'waiting' ? theme.warning : theme.border }]}>
            <View style={styles.between}>
              <Text style={[styles.patientName, { color: theme.text }]}>{patientName(r)}</Text>
              <Badge tone={r.status === 'waiting' ? 'warning' : 'success'} label={t(`request.status.${r.status}` as StringKey)} />
            </View>
            <View style={styles.row}>
              {r.patient.referredFrom ? <Badge tone="info" icon="git-network" label={t('staff.inbox.referralFrom', { hospital: pick(r.patient.referredFrom, lang) })} /> : null}
              {r.department ? <Badge tone="primary" icon="medkit" label={t(`department.short.${r.department}` as StringKey)} /> : null}
              {r.patient.phone ? <Badge tone="neutral" icon="call" label={r.patient.phone} /> : null}
              <Badge tone="info" icon="car" label={t('staff.inbox.arriving', { min: r.etaMin, mode: t(`mode.${r.patient.mode}` as StringKey) })} />
            </View>
            {/* Patient text is data, shown as plain text and never interpreted. */}
            <Text style={[styles.body, { color: theme.text }]}>{r.patient.description}</Text>
            {r.status === 'waiting' && declining !== r.id ? (
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Button icon="checkmark" label={t('staff.inbox.accept')} busy={answering === r.id} onPress={() => void answer(r, 'accept')} />
                </View>
                <View style={styles.flex}>
                  <Button variant="secondary" icon="close" label={t('staff.inbox.decline')} onPress={() => setDeclining(r.id)} />
                </View>
              </View>
            ) : null}
            {r.status === 'waiting' && declining === r.id ? (
              <View style={styles.stack}>
                {(['nobed', 'busy', 'equip', 'divert'] as const).map((reason) => (
                  <Button key={reason} variant="secondary" label={t(`request.reason.${reason}` as StringKey)} busy={answering === r.id} onPress={() => void answer(r, 'decline', reason)} />
                ))}
                <Button variant="ghost" icon="chevron-back" label={t('common.back')} onPress={() => setDeclining(null)} />
              </View>
            ) : null}
            {r.status === 'accepted' ? (
              <Notice tone="success">{t('doctor.incoming.accepted')}</Notice>
            ) : null}
          </View>
        ))}
      </Card>
    ) : null;

  const patientsSection = (
    <Card padding="lg">
      <SectionHeader title={t('doctor.patients.title')} />
      {patients.length === 0 ? <Text style={[styles.muted, { color: theme.textMuted }]}>{t('doctor.patients.empty')}</Text> : null}
      {shownPatients.map((r) =>
        referringId === r.id ? (
          <ReferPanel
            key={r.id}
            patientName={patientName(r)}
            onSend={(target, department) => sendDirect(r, target.hospitalId, department)}
            onUseAi={() => askAi(r)}
            onClose={() => setReferringId(null)}
          />
        ) : (
          <View key={r.id} style={[styles.patient, { borderColor: theme.border }]}>
            <View style={styles.between}>
              <Text style={[styles.patientName, { color: theme.text }]}>{patientName(r)}</Text>
              <Badge tone={r.status === 'waiting' ? 'warning' : 'success'} label={t(`request.status.${r.status}` as StringKey)} />
            </View>
            <View style={styles.row}>
              {r.patient.phone ? <Badge tone="neutral" icon="call" label={r.patient.phone} /> : null}
              {r.department ? <Badge tone="primary" icon="medkit" label={t(`department.short.${r.department}` as StringKey)} /> : null}
              {r.patient.referredFrom ? <Badge tone="info" icon="git-network" label={t('staff.inbox.referralFrom', { hospital: pick(r.patient.referredFrom, lang) })} /> : null}
            </View>
            {/* Patient text is data, shown as plain text and never interpreted. */}
            <Text style={[styles.body, { color: theme.text }]}>{r.patient.description}</Text>
            <Button variant="secondary" icon="git-network" label={t('doctor.patients.refer')} onPress={() => setReferringId(r.id)} />
          </View>
        ),
      )}
      {patients.length > 6 ? (
        <Button variant="ghost" icon={showAllPatients ? 'chevron-up' : 'chevron-down'} label={showAllPatients ? t('doctor.patients.showFewer') : t('doctor.patients.showAll', { count: patients.length })} onPress={() => setShowAllPatients(!showAllPatients)} />
      ) : null}
    </Card>
  );

  const other = (
    <View style={styles.stack}>
      <Button variant="ghost" icon={showOther ? 'chevron-up' : 'add-circle-outline'} label={t('doctor.refer.otherPatient')} onPress={() => setShowOther(!showOther)} />
      {showOther ? form : null}
    </View>
  );

  const recent =
    owned.length > 1 ? (
      <Card padding="lg">
        <SectionHeader title={t('doctor.refer.recentTitle')} />
        {owned.slice(0, RECENT).map((item) => {
          const selected = item.id === referral?.id;
          const look = STATUS_LOOK[item.status];
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setActiveId(item.id)}
              style={(state) => [
                styles.recent,
                { backgroundColor: selected ? theme.primarySoft : (state as { hovered?: boolean }).hovered === true ? theme.surfaceAlt : 'transparent' },
                pointer,
                webTransition(),
                focusRing(theme.primary, (state as { focused?: boolean }).focused === true),
              ]}
            >
              <Text numberOfLines={1} style={[styles.flex, styles.body, { color: theme.text }]}>{item.text}</Text>
              <Badge tone={look?.tone ?? 'neutral'} label={t(`doctor.refer.status.${item.status}` as StringKey)} />
            </Pressable>
          );
        })}
      </Card>
    ) : null;

  return (
    <Page title={t('doctor.refer.title')}>
      {wide ? (
        <View style={styles.columns}>
          <View style={styles.sideColumn}>
            {incomingSection}
            {patientsSection}
            {other}
            {recent}
          </View>
          <View style={styles.mainColumn}>
            {live ?? (
              <Card padding="lg">
                <Text style={[styles.muted, { color: theme.textMuted }]}>{t('doctor.refer.noTrace')}</Text>
              </Card>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.stack}>
          {incomingSection}
          {live}
          {patientsSection}
          {other}
          {recent}
        </View>
      )}
      <Button variant="ghost" icon="car" fullWidth={false} label={t('doctor.refer.viewTransfers')} onPress={() => router.push('/(doctor)/transfers' as Href)} />
    </Page>
  );
}

const ROW_KIND: Record<DecisionRow['reply'], MarkerKind> = {
  notAsked: 'ok',
  waiting: 'asked',
  accepted: 'accepted',
  acceptedByRule: 'accepted',
  declined: 'declined',
  noReply: 'declined',
  cancelled: 'place',
};

/** The doctor's map: their hospital, then every hospital in the table that has a known position. */
function referralMarkers(rows: DecisionRow[], origin: { lat: number; lng: number } | undefined, youLabel: string, lang: 'en' | 'th'): MapMarker[] {
  const markers: MapMarker[] = origin ? [{ id: 'origin', point: { lat: origin.lat, lng: origin.lng }, kind: 'me', label: youLabel }] : [];
  for (const row of rows) {
    if (row.lat === undefined || row.lng === undefined) continue;
    const kind: MarkerKind = row.chosen ? 'chosen' : !row.canHelp && row.reply === 'notAsked' ? 'no' : ROW_KIND[row.reply];
    markers.push({ id: row.hospitalId, point: { lat: row.lat, lng: row.lng }, kind, label: row.chosen ? shortLabel(pick(row.name, lang)) : undefined });
  }
  return markers;
}

/** One hospital the agent considered: how far, whether it can help, and what it answered. */
function DecisionLine({ row }: { row: DecisionRow }): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { lang } = useApp();
  const look = REPLY_LOOK[row.reply];
  return (
    <View style={[styles.decision, { borderTopColor: theme.border, backgroundColor: row.chosen ? theme.primarySoft : 'transparent' }]}>
      <View style={styles.between}>
        <Text style={[styles.itemTitle, styles.flex, { color: theme.text }]}>{pick(row.name, lang)}</Text>
        <Badge tone="neutral" icon="car-outline" label={t('doctor.refer.driveMin', { min: row.driveMin })} />
      </View>
      <View style={styles.row}>
        {row.chosen ? <Badge tone="primary" icon="star" label={t('doctor.refer.chosen')} /> : null}
        {row.canHelp ? (
          <Badge tone={look.tone} icon={look.icon} label={t(`doctor.refer.reply.${row.reply}` as StringKey)} />
        ) : (
          row.whyNot.slice(0, 2).map((kind) => <Badge key={kind} tone="danger" icon="close-circle" label={t(`doctor.refer.whyNot.${kind}` as StringKey)} />)
        )}
        {row.delayMin !== undefined ? <Badge tone="warning" icon="hourglass" label={t('doctor.refer.delay', { min: row.delayMin })} /> : null}
        {row.stale ? <Badge tone="neutral" icon="help-circle" label={t('doctor.refer.stale')} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  patient: { borderWidth: 1, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm },
  patientName: { flex: 1, fontSize: fontSizes.md, fontFamily: fonts.semibold },
  flex: { flex: 1 },
  stack: { gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  columns: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  sideColumn: { flex: 0.85, gap: spacing.md },
  mainColumn: { flex: 1.15 },
  description: { minHeight: 112, paddingTop: spacing.sm },
  label: { fontFamily: fonts.semibold, fontSize: fontSizes.sm },
  muted: { fontFamily: fonts.regular, fontSize: fontSizes.sm, lineHeight: 20 },
  body: { fontFamily: fonts.regular, fontSize: fontSizes.md, lineHeight: 24 },
  elapsed: { fontFamily: fonts.semibold, fontSize: fontSizes.sm },
  chosenName: { fontFamily: fonts.bold, fontSize: fontSizes.xxl, letterSpacing: -0.4 },
  itemTitle: { fontFamily: fonts.semibold, fontSize: fontSizes.md },
  decision: { borderTopWidth: 1, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.xs, gap: spacing.sm, borderRadius: radii.md },
  recent: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.sm, borderRadius: radii.md },
});
