import { RoleTabs } from '@/components/RoleTabs';

export default function StaffLayout() {
  return (
    <RoleTabs
      tabs={[
        { name: 'capacity', title: 'staff.status', icon: { ios: 'bed.double.fill', android: 'bed', web: 'bed' } },
        { name: 'inbox', title: 'staff.inbox', icon: { ios: 'tray.fill', android: 'inbox', web: 'inbox' } },
        { name: 'rules', title: 'staff.rules', icon: { ios: 'checklist', android: 'rule', web: 'rule' } },
      ]}
    />
  );
}
