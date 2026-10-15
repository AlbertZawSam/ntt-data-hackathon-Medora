import { StyleSheet, Text, View } from 'react-native';

import { availability, freshness, skipReason } from '@/logic/publicLabels';
import type { Evaluation } from '@/logic/ranking';
import type { Pathway } from '@/logic/types';
import { useT } from '@/state/language';
import { fonts, radius, spacing, useTheme } from '@/ui/theme';

type Props = { row: Evaluation; pathway: Pathway; nowMs: number; best?: boolean };

// A hospital in the patient's results. Public labels only (safety rule 6):
// availability, distance, data freshness and a plain reason when it can't help.
export function HospitalCard({ row, pathway, nowMs, best = false }: Props) {
  const { colors } = useTheme();
  const { t, tr } = useT();
  const avail = availability(row, pathway, nowMs);
  const fresh = freshness(row, nowMs);
  const reason = skipReason(row.fails);

  const availColor = avail === 'available' ? colors.primary : avail === 'limited' ? colors.accent : colors.danger;
  const availText = avail === 'limited' ? colors.onAccent : avail === 'available' ? colors.onPrimary : colors.onDanger;
  const freshText =
    fresh.kind === 'fresh' ? (fresh.minutes < 1 ? t('fresh.justNow') : t('fresh.minutes', { min: fresh.minutes }))
    : fresh.kind === 'stale' ? t('fresh.stale')
    : t('fresh.unknown');

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: best ? colors.primary : colors.border, borderWidth: best ? 2 : 1 },
      ]}>
      {best && <Text style={[styles.best, { color: colors.primary }]}>{t('care.best')}</Text>}
      <View style={styles.header}>
        <Text
          style={[
            styles.name,
            { color: row.canHelp ? colors.text : colors.textMuted },
            !row.canHelp && styles.crossed,
          ]}>
          {tr(row.hospital.name)}
        </Text>
        <View style={[styles.badge, { backgroundColor: availColor }]}>
          <Text style={[styles.badgeText, { color: availText }]}>{t(`avail.${avail}` as const)}</Text>
        </View>
      </View>
      <Text style={[styles.meta, { color: colors.textMuted }]}>
        {t('care.trip', { km: row.km.toFixed(1), min: row.driveMin })}
      </Text>
      {row.canHelp ? (
        <Text style={[styles.meta, { color: fresh.kind === 'fresh' ? colors.textMuted : colors.text }]}>{freshText}</Text>
      ) : (
        reason && <Text style={[styles.meta, { color: colors.text }]}>{capitalize(t(`skip.${reason}` as const))}</Text>
      )}
    </View>
  );
}

// Skip reasons also sit mid-sentence, so they're stored in lower case.
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, padding: spacing.md, gap: 2 },
  best: { fontFamily: fonts.bold, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  name: { flex: 1, fontFamily: fonts.semiBold, fontSize: 17, lineHeight: 24 },
  crossed: { textDecorationLine: 'line-through' },
  badge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, marginTop: 2 },
  badgeText: { fontFamily: fonts.semiBold, fontSize: 12 },
  meta: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
});
