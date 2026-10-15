import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { SIAM } from '@/logic/places';
import type { LatLng, Place } from '@/logic/types';
import { useT } from '@/state/language';

// The patient's chosen location, shared by Home, Find care and Find a specialist.
// Held in memory only: it never leaves the phone except inside a request (requirement 3.6).

export type LocationSource = 'default' | 'gps' | 'search' | 'pick';

export type PatientLocation = {
  point: LatLng;
  source: LocationSource;
  // The searched place, for its name.
  place?: Place;
  // GPS was outside the demo area, so point is Siam (requirement 3.5).
  outside?: boolean;
};

type Value = { location: PatientLocation; setLocation: (next: PatientLocation) => void };

const PatientLocationContext = createContext<Value>({
  location: { point: SIAM, source: 'default' },
  setLocation: () => {},
});

export function PatientLocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<PatientLocation>({ point: SIAM, source: 'default' });
  const value = useMemo(() => ({ location, setLocation }), [location]);
  return <PatientLocationContext.Provider value={value}>{children}</PatientLocationContext.Provider>;
}

export function usePatientLocation() {
  return useContext(PatientLocationContext);
}

// How the screens name the current location.
export function useLocationLabel(): string {
  const { location } = usePatientLocation();
  const { t, tr } = useT();
  if (location.source === 'search' && location.place) return tr(location.place.name);
  if (location.source === 'gps' && !location.outside) return t('home.sourceGps');
  if (location.source === 'pick') return t('home.sourcePick');
  return t('home.sourceDefault');
}
