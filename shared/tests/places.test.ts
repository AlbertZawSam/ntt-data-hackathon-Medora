import { DEFAULT_PLACE, distanceKm, isInBangkok, nearestPlace, PLACES, searchPlaces } from '../logic/places';

describe('places', () => {
  it('defaults to Siam', () => {
    expect(DEFAULT_PLACE.key).toBe('siam');
  });

  it('keeps every built-in place inside Bangkok with both names', () => {
    for (const place of PLACES) {
      expect(isInBangkok(place)).toBe(true);
      expect(place.name.en.trim()).not.toBe('');
      expect(place.name.th.trim()).not.toBe('');
    }
  });
});

describe('isInBangkok', () => {
  it('accepts central Bangkok and rejects other cities and bad numbers', () => {
    expect(isInBangkok({ lat: 13.7563, lng: 100.5018 })).toBe(true);
    expect(isInBangkok({ lat: 18.7883, lng: 98.9853 })).toBe(false); // Chiang Mai
    expect(isInBangkok({ lat: NaN, lng: 100.5 })).toBe(false);
  });
});

describe('searchPlaces', () => {
  it('returns nothing for an empty or blank query', () => {
    expect(searchPlaces('')).toEqual([]);
    expect(searchPlaces('   ')).toEqual([]);
  });

  it('finds places in English regardless of case', () => {
    expect(searchPlaces('SILOM').map((p) => p.key)).toEqual(['silom']);
  });

  it('finds places in Thai', () => {
    expect(searchPlaces('สยาม').map((p) => p.key)).toEqual(['siam']);
  });

  it('lists names that start with the query before names that only contain it', () => {
    expect(searchPlaces('bang').map((p) => p.key).sort()).toEqual(['banglamphu', 'bangna', 'bangsue']);
    const keys = searchPlaces('ra').map((p) => p.key);
    expect(keys[0]).toBe('rama9'); // starts with "ra"
    expect(keys).toContain('ladprao'); // "Lat Phrao" only contains it
    expect(keys.indexOf('rama9')).toBeLessThan(keys.indexOf('ladprao'));
  });

  it('returns nothing when nothing matches', () => {
    expect(searchPlaces('zzzz')).toEqual([]);
  });
});

describe('distance and nearest place', () => {
  it('measures zero for the same point and a plausible distance across the city', () => {
    expect(distanceKm(DEFAULT_PLACE, DEFAULT_PLACE)).toBeCloseTo(0, 5);
    const km = distanceKm(DEFAULT_PLACE, { lat: 13.6682, lng: 100.6047 }); // Siam to Bang Na
    expect(km).toBeGreaterThan(8);
    expect(km).toBeLessThan(15);
  });

  it('picks the closest built-in place to a point', () => {
    expect(nearestPlace({ lat: 13.7457, lng: 100.5342 }).key).toBe('siam');
    expect(nearestPlace({ lat: 13.9, lng: 100.6 }).key).toBe('donmueang');
  });
});
