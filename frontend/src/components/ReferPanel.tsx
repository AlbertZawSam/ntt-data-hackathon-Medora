/**
 * Refer one patient to another hospital: the doctor sees the other hospitals nearest first (drive time,
 * free-bed range, departments), opens one to see its profile, picks a department and sends. The AI agent
 * stays available as the alternative. Only public details are shown (AGENTS.md rule 6).
 * Requirements: 13.1, 13.2
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Department } from '@medora/shared/logic/departments';
import type { ReferralTarget } from '@medora/shared/logic/directReferral';
import { bedsText, bedsTone } from '../i18n/beds';
import { pick, type StringKey } from '../i18n/t';
import { referralTargets } from '../services/data';
import { useApp, useT } from '../state/AppProvider';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import type { IconName } from '../ui/Icon';
import { Notice } from '../ui/Notice';
import { Skeleton } from '../ui/Skeleton';
import { focusRing, pointer, webTransition } from '../ui/web';
import { fonts, fontSizes, radii, spacing, useTheme } from '../ui/theme';
import { HospitalDetailsView } from './HospitalDetailsView';

const DEPARTMENT_ICON: Record<Department, IconName> = { cardiology: 'heart', surgery: 'bandage', obstetrics: 'woman' };

interface Props {
  patientName: string;
  onSend: (target: ReferralTarget, department: Department | undefined) => Promise<void>;
  onUseAi: () => Promise<void>;
  onClose: () => void;
}

export function ReferPanel({ patientName, onSend, onUseAi, onClose }: Props): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { lang } = useApp();
  const [targets, setTargets] = React.useState<ReferralTarget[] | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const [chosen, setChosen] = React.useState<ReferralTarget | null>(null);
  const [department, setDepartment] = React.useState<Department | undefined>(undefined);
  const [busy, setBusy] = React.useState<'send' | 'ai' | null>(null);
  const [sendError, setSendError] = React.useState<StringKey | null>(null);

  React.useEffect(() => {
    let live = true;
    referralTargets()
      .then((list) => live && setTargets(list))
      .catch(() => live && setLoadError(true));
    return () => {
      live = false;
    };
  }, []);

  const run = async (kind: 'send' | 'ai', action: () => Promise<void>): Promise<void> => {
    setBusy(kind);
    setSendError(null);
    try {
      await action();
    } catch (error) {
      setSendError(error instanceof Error && error.message === 'already-referred' ? 'doctor.referPanel.alreadyReferred' : 'doctor.referPanel.sendError');
    } finally {
      setBusy(null);
    }
  };

  // Step 2: the chosen hospital's profile, the department and send.
  if (chosen) {
    return (
      <Card padding="lg" selected tone="primary">
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{pick(chosen.name, lang)}</Text>
        <View style={styles.row}>
          <Badge tone="info" icon="car" label={t('doctor.referPanel.drive', { min: chosen.driveMin })} />
        </View>
        <HospitalDetailsView details={chosen.details} nowMs={Date.now()} showBooking={false} />
        {chosen.details.departments.length > 0 ? (
          <>
            <Text style={[styles.label, { color: theme.textMuted }]}>{t('doctor.referPanel.department')}</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel={t('doctor.referPanel.department')} style={styles.grid}>
              {[...chosen.details.departments.map((d) => ({ value: d as Department | 'general', icon: DEPARTMENT_ICON[d] })), { value: 'general' as const, icon: 'medkit' as IconName }].map((option) => (
                <View key={option.value} style={styles.cell}>
                  <Button
                    variant={(department ?? 'general') === option.value ? 'primary' : 'secondary'}
                    icon={option.icon}
                    label={t(`department.short.${option.value}` as StringKey)}
                    onPress={() => setDepartment(option.value === 'general' ? undefined : option.value)}
                  />
                </View>
              ))}
            </View>
          </>
        ) : null}
        {sendError ? <Notice tone="danger">{t(sendError)}</Notice> : null}
        <Button size="lg" icon="send" label={t('doctor.referPanel.send', { hospital: pick(chosen.name, lang) })} busy={busy === 'send'} onPress={() => void run('send', () => onSend(chosen, department))} />
        <Button variant="ghost" icon="chevron-back" label={t('doctor.referPanel.otherHospital')} onPress={() => setChosen(null)} />
      </Card>
    );
  }

  // Step 1: the other hospitals, nearest first.
  return (
    <Card padding="lg" selected>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{t('doctor.referPanel.title', { name: patientName })}</Text>
      <Text style={[styles.label, { color: theme.textMuted }]}>{t('doctor.referPanel.choose')}</Text>
      {loadError ? <Notice tone="danger">{t('doctor.referPanel.loadError')}</Notice> : null}
      {!targets && !loadError ? <Skeleton height={64} /> : null}
      {(targets ?? []).map((target) => (
        <Pressable
          key={target.hospitalId}
          accessibilityRole="button"
          accessibilityLabel={pick(target.name, lang)}
          onPress={() => {
            setChosen(target);
            setDepartment(target.details.departments[0]);
          }}
          style={(state) => [
            styles.target,
            { borderColor: theme.border, backgroundColor: (state as { hovered?: boolean }).hovered === true ? theme.surfaceAlt : theme.surface },
            pointer,
            webTransition(),
            focusRing(theme.primary, (state as { focused?: boolean }).focused === true),
          ]}
        >
          <View style={styles.between}>
            <Text style={[styles.name, { color: theme.text }]}>{pick(target.name, lang)}</Text>
            <Text style={[styles.meta, { color: theme.textMuted }]}>{t('doctor.referPanel.drive', { min: target.driveMin })}</Text>
          </View>
          <View style={styles.row}>
            <Badge
              tone={bedsTone(target.details.freeBeds)}
              icon="bed"
              label={bedsText(t, target.details.freeBeds)}
            />
            <Badge tone={target.details.edOpen ? 'success' : 'danger'} icon="medkit" label={t(target.details.edOpen ? 'details.er.open' : 'details.er.closed')} />
            {target.details.departments.map((d) => (
              <Badge key={d} tone="primary" icon={DEPARTMENT_ICON[d]} label={t(`department.short.${d}` as StringKey)} />
            ))}
          </View>
        </Pressable>
      ))}
      {sendError ? <Notice tone="danger">{t(sendError)}</Notice> : null}
      <Button variant="secondary" icon="sparkles" label={t('doctor.referPanel.ai')} busy={busy === 'ai'} onPress={() => void run('ai', onUseAi)} />
      <Button variant="ghost" icon="close" label={t('common.back')} onPress={onClose} />
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSizes.lg, fontFamily: fonts.bold },
  label: { fontSize: fontSizes.sm, fontFamily: fonts.semibold },
  name: { flex: 1, fontSize: fontSizes.md, fontFamily: fonts.semibold },
  meta: { fontSize: fontSizes.sm, fontFamily: fonts.regular },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  between: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  target: { borderWidth: 1, borderRadius: radii.md, padding: spacing.md, gap: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: { flexBasis: '47%', flexGrow: 1 },
});
