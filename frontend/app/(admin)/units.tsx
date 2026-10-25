/**
 * Who owns what: the hospital admin assigns each status item (beds, departments, equipment, doctors on
 * duty) to the unit that keeps it up to date. Only that unit's staff can then change it; the server
 * enforces the choice (`update-status`, `ownerOfItem`). Requirements: 19.1, 19.2
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { UNITS, type Unit } from '@medora/shared/logic/access';
import { allControls, controlItemId, ownerOfItem } from '@medora/shared/logic/statusUpdate';
import type { HospitalStatus } from '@medora/shared/logic/types';
import type { StringKey } from '../../src/i18n/t';
import { updateStatus } from '../../src/services/data';
import { useApp, useT } from '../../src/state/AppProvider';
import { Badge, Chip } from '../../src/ui/Badge';
import { Card } from '../../src/ui/Card';
import { EmptyState } from '../../src/ui/EmptyState';
import { Icon } from '../../src/ui/Icon';
import { Notice } from '../../src/ui/Notice';
import { Page } from '../../src/ui/Page';
import { focusRing, pointer } from '../../src/ui/web';
import { fonts, fontSizes, spacing, useTheme } from '../../src/ui/theme';
import { ITEM_ICON } from '../(staff)/unit';

export default function AdminUnitsScreen(): React.JSX.Element {
  const t = useT();
  const theme = useTheme();
  const { session, data } = useApp();
  const [open, setOpen] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const status: HospitalStatus | undefined = data.hospitalStatuses.find((s) => s.hospitalId === session?.hospitalId)?.status;

  const assign = async (item: string, unit: Unit): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      await updateStatus({ kind: 'owner', item, unit });
      setOpen(null);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={t('admin.units.title')} subtitle={t('admin.units.sub')} width="readable">
      {failed ? <Notice tone="danger">{t('staff.status.saveError')}</Notice> : null}
      {!status ? (
        <Card padding="lg">
          <EmptyState icon="cloud-offline-outline" title={t('staff.status.noStatus')} />
        </Card>
      ) : (
        <Card padding="lg">
          {allControls().map((control) => {
            const item = controlItemId(control);
            const owner = ownerOfItem(status, item);
            const expanded = open === item;
            return (
              <View key={item} style={[styles.row, { borderTopColor: theme.border }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityLabel={`${t(control.labelKey as StringKey)}: ${owner ? t(`unit.name.${owner}` as StringKey) : '-'}`}
                  onPress={() => setOpen(expanded ? null : item)}
                  style={(state) => [styles.line, pointer, focusRing(theme.primary, (state as { focused?: boolean }).focused === true)]}
                >
                  <Icon name={ITEM_ICON[control.item] ?? 'ellipse'} size={20} color={theme.primary} />
                  <Text style={[styles.name, { color: theme.text }]}>{t(control.labelKey as StringKey)}</Text>
                  {owner ? <Badge tone="primary" label={t(`unit.name.${owner}` as StringKey)} /> : null}
                  <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textMuted} />
                </Pressable>
                {expanded ? (
                  <View style={styles.chips}>
                    {UNITS.map((unit) => (
                      <Chip key={unit} label={t(`unit.name.${unit}` as StringKey)} selected={unit === owner} onPress={() => { if (!busy && unit !== owner) void assign(item, unit); }} />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  row: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.sm, gap: spacing.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  name: { flex: 1, fontFamily: fonts.semibold, fontSize: fontSizes.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingBottom: spacing.xs },
});
