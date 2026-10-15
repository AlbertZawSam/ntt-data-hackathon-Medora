import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { StringKey } from '@/i18n/t';
import { SIAM } from '@/logic/places';
import type { LatLng, PathwayKey, Place } from '@/logic/types';
import { getGpsLocation } from '@/services/location';
import { useT } from '@/state/language';

// The patient's chosen location and last Find care need, shared by Home, Find care and
// Find a specialist. Held in memory only: the location never leaves the phone except
// inside a request (requirement 3.6).

export type LocationSource = 'default' | 'gps' | 'search' | 'pick';

export type PatientLocation = {
  point: LatLng;
  source: LocationSource;
  // The searched place, for its name.
  place?: Place;
  // GPS was outside the demo area, so point is Siam (requirement 3.5).
  outside?: boolean;
};

type Value = {
  location: PatientLocation;
  setLocation: (next: PatientLocation) => void;
  // Suggests a specialty in Find a specialist (requirement 8.2).
  lastNeed: PathwayKey | null;
  setLastNeed: (need: PathwayKey | null) => void;
};

const PatientLocationContext = createContext<Value>({
  location: { point: SIAM, source: 'default' },
  setLocation: () => {},
  lastNeed: null,
  setLastNeed: () => {},
});

export function PatientLocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<PatientLocation>({ point: SIAM, source: 'default' });
  const [lastNeed, setLastNeed] = useState<PathwayKey | null>(null);
  const value = useMemo(() => ({ location, setLocation, lastNeed, setLastNeed }), [location, lastNeed]);
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

export type LocationNotice = { key: StringKey; settings?: boolean } | null;

// "Use my location" (requirement 3.1): reads GPS into the shared location and
// returns a notice explaining a refusal, a failure or the Siam fallback (3.4, 3.5).
export function useLocateMe() {
  const { setLocation } = usePatientLocation();
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<LocationNotice>(null);

  const locate = async () => {
    setLocating(true);
    setNotice(null);
    const result = await getGpsLocation();
    setLocating(false);
    if (result.kind === 'ok') {
      setLocation({ point: result.point, source: 'gps', outside: result.outside });
      if (result.outside) setNotice({ key: 'location.outside' });
    } else if (result.kind === 'denied') {
      setNotice({ key: 'location.denied', settings: !result.canAskAgain });
    } else {
      setNotice({ key: 'location.unavailable' });
    }
  };

  return { locate, locating, notice, setNotice };
}
