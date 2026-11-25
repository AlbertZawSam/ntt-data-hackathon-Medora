/** Activity log for the user's hospital, newest first. Requirements: 15.2 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { freshItemShare, referralMetrics, requestMetrics } from '@medora/shared/logic/metrics';
import type { HospitalStatus } from '@medora/shared/logic/types';
import { pick } from '../i18n/t';
import { useApp, useT } from '../state/AppProvider';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Page } from '../ui/Page';
import { SectionHeader } from '../ui/SectionHeader';
import { fonts, fontSizes, lineHeights, spacing, useTheme } from '../ui/theme';

/** The schema stores the time as `at`; the shared type calls it `createdAt`. */
const when = (a: { createdAt: string }): string => (a as { at?: string }).at ?? a.createdAt ?? '';

export function ActivityList(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { data, lang, session } = useApp();
  const rows = React.useMemo(
    () => data.activities.filter((a) => a.hospitalId === session?.hospitalId).sort((x, y) => when(y).localeCompare(when(x))).slice(0, 200),
    [data.activities, session?.hospitalId],
  );
  const status = data.hospitalStatuses.find((x) => x.hospitalId === session?.hospitalId)?.status as HospitalStatus | undefined;
  const mine = React.useMemo(() => {
    const requests = data.careRequests.filter((r) => r.hospitalId === session?.hospitalId);
    const referrals = data.referrals.filter((r) => r.fromHospitalId === session?.hospitalId);
    return { req: requestMetrics(requests), ref: referralMetrics(referrals), fresh: status ? freshItemShare(status, Date.now()) : null };
  }, [data.careRequests, data.referrals, session?.hospitalId, status]);
  const pct = (v: number): number => Math.round(v * 100);
  const lines: string[] = [];
  if (mine.req.total > 0) lines.push(t('metrics.requests', { accepted: mine.req.accepted, total: mine.req.total }));
  if (mine.req.medianSecondsToAccept !== null) lines.push(t('metrics.timeToAccept', { sec: mine.req.medianSecondsToAccept }));
  if (mine.req.couldTreatShare !== null) lines.push(t('metrics.couldTreat', { pct: pct(mine.req.couldTreatShare) }));
  if (mine.ref.total > 0) lines.push(t('metrics.referrals', { n: mine.ref.recommended, total: mine.ref.total }));
  if (mine.ref.medianSecondsToRecommendation !== null) lines.push(t('metrics.timeToRecommend', { sec: mine.ref.medianSecondsToRecommendation }));
  if (mine.ref.insideWindowShare !== null) lines.push(t('metrics.insideWindow', { pct: pct(mine.ref.insideWindowShare) }));
  if (mine.fresh !== null) lines.push(t('metrics.fresh', { pct: pct(mine.fresh) }));

  return (
    <Page title={t('activity.title')} subtitle={t('activity.sub')} width="readable">
      <Card padding="lg">
        <Text style={[styles.heading, { color: theme.text }]}>{t('metrics.title')}</Text>
        {lines.length === 0 ? <Text style={[styles.note, { color: theme.textMuted }]}>{t('metrics.none')}</Text> : null}
        {lines.map((line) => (
          <Text key={line} style={[styles.note, { color: theme.text }]}>{line}</Text>
        ))}
      </Card>
      <SectionHeader title={t('activity.listTitle')} />
      {rows.length === 0 ? (
        <Card padding="lg">
          <EmptyState icon="list-outline" title={t('activity.empty')} />
        </Card>
      ) : (
        <Card padding="none">
          {rows.map((a, index) => (
            <View key={a.id} style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
              <Text style={[styles.text, { color: theme.text }]}>{pick(a.text, lang)}</Text>
              <Text style={[styles.note, { color: theme.textMuted }]}>{`${pick(a.actor, lang)} · ${new Date(when(a)).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB')}`}</Text>
            </View>
          ))}
        </Card>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: fontSizes.lg, lineHeight: lineHeights.lg, fontFamily: fonts.semibold },
  row: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + spacing.xs, gap: spacing.xxs },
  text: { fontSize: fontSizes.md, lineHeight: lineHeights.md, fontFamily: fonts.medium },
  note: { fontSize: fontSizes.sm, lineHeight: lineHeights.sm, fontFamily: fonts.regular },
});
