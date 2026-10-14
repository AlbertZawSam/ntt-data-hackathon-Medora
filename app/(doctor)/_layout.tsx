import { RoleTabs } from '@/components/RoleTabs';

export default function DoctorLayout() {
  return (
    <RoleTabs
      tabs={[
        { name: 'refer', title: 'doctor.refer', icon: { ios: 'arrow.triangle.branch', android: 'alt_route', web: 'alt_route' } },
        { name: 'transfers', title: 'doctor.transfers', icon: { ios: 'car.fill', android: 'ambulance', web: 'ambulance' } },
      ]}
    />
  );
}
