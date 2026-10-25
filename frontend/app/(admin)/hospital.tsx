/**
 * Hospital set-up: the hospital admin keeps the bed counts (ready beds, ICU, NICU) and which departments
 * are open, with the same controls unit staff use. Held beds show next to the count. Equipment and
 * on-duty doctors stay with the unit that owns them (Units tab). The server checks the admin's group and
 * hospital on every change (`update-status`). Requirements: 9.1, 19.1
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { activeHolds, withHolds } from '@medora/shared/logic/reservations';
import { controlsForAdmin } from '@medora/shared/logic/statusUpdate';
import type { HospitalStatus } from '@medora/shared/logic/types';
import { updateStatus } from '../../src/services/data';
import { useApp, useT } from '../../src/state/AppProvider';
import { Card } from '../../src/ui/Card';
import { EmptyState } from '../../src/ui/EmptyState';
import { Notice } from '../../src/ui/Notice';
import { Page } from '../../src/ui/Page';
import { Reveal } from '../../src/ui/Reveal';
import { spacing, useBreakpoint } from '../../src/ui/theme';
import { ControlCard, type Send } from '../(staff)/unit';

export default function AdminHospitalScreen(): React.JSX.Element {
  const t = useT();
  const wide = useBreakpoint() !== 'compact';
  const { session, data } = useApp();
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const stored: HospitalStatus | undefined = data.hospitalStatuses.find((s) => s.hospitalId === session?.hospitalId)?.status;
  const status = stored ? withHolds(stored, activeHolds(data.reservations, session?.hospitalId ?? '', Date.now())) : undefined;

  const send: Send = async (change) => {
    if (!change || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await updateStatus(change);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={t('admin.hospital.title')} subtitle={t('admin.hospital.sub')}>
      {failed ? <Notice tone="danger">{t('staff.status.saveError')}</Notice> : null}
      {!status ? (
        <Card padding="lg">
          <EmptyState icon="cloud-offline-outline" title={t('staff.status.noStatus')} />
        </Card>
      ) : (
        <View style={[styles.grid, wide && styles.gridWide]}>
          {controlsForAdmin().map((control, index) => (
            <Reveal key={control.id} index={index} style={wide ? styles.cell : undefined}>
              <ControlCard control={control} status={status} busy={busy} onSend={(change) => void send(change)} />
            </Reveal>
          ))}
        </View>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.md },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { flexBasis: '48%', flexGrow: 1 },
});
