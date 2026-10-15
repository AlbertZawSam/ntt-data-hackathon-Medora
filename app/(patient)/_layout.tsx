import { RoleTabs } from '@/components/RoleTabs';
import { PatientLocationProvider } from '@/state/patientLocation';

export default function PatientLayout() {
  return (
    <PatientLocationProvider>
      <RoleTabs
        tabs={[
          { name: 'home', title: 'patient.home', icon: { ios: 'house.fill', android: 'home', web: 'home' } },
          { name: 'care', title: 'patient.care', icon: { ios: 'cross.case.fill', android: 'local_hospital', web: 'local_hospital' } },
          { name: 'specialists', title: 'patient.specialists', icon: { ios: 'stethoscope', android: 'stethoscope', web: 'stethoscope' } },
          { name: 'requests', title: 'patient.requests', icon: { ios: 'list.bullet.rectangle', android: 'list_alt', web: 'list_alt' } },
        ]}
      />
    </PatientLocationProvider>
  );
}
