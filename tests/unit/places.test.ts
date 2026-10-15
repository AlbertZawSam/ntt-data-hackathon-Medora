import { describe, expect, it } from 'vitest';

import { hospitals, places } from '../../src/logic/data';
import { inBangkok, resolveLocation, searchPlaces, SIAM } from '../../src/logic/places';

const ids = (query: string) => searchPlaces(query).map((p) => p.id);

describe('inBangkok', () => {
  it('includes every seeded hospital and every built-in place', () => {
    for (const h of hospitals) expect(inBangkok(h), h.id).toBe(true);
    for (const p of places) expect(inBangkok(p), p.id).toBe(true);
  });

  it('excludes Chiang Mai, Pattaya and Ayutthaya', () => {
    expect(inBangkok({ lat: 18.7883, lng: 98.9853 })).toBe(false);
    expect(inBangkok({ lat: 12.9236, lng: 100.8825 })).toBe(false);
    expect(inBangkok({ lat: 14.3532, lng: 100.5689 })).toBe(false);
  });
});

describe('resolveLocation', () => {
  it('keeps a Bangkok position', () => {
    const point = { lat: 13.75, lng: 100.5 };
    expect(resolveLocation(point)).toEqual({ point, outside: false });
  });

  it('uses Siam and says so outside the demo area', () => {
    expect(resolveLocation({ lat: 18.7883, lng: 98.9853 })).toEqual({ point: SIAM, outside: true });
  });
});

describe('searchPlaces', () => {
  it('finds places in English, ignoring case', () => {
    expect(ids('victory')[0]).toBe('victory');
    expect(ids('SILOM')[0]).toBe('silom');
  });

  it('finds places in Thai, including inside a longer name', () => {
    expect(ids('สยาม')[0]).toBe('siam');
    expect(ids('จตุจักร')[0]).toBe('chatuchak');
    expect(ids('ดอนเมือง')[0]).toBe('dmk');
  });

  it('finds places by alias', () => {
    expect(ids('asoke')).toContain('asok');
    expect(ids('jatujak')).toContain('chatuchak');
  });

  it('puts a whole-name match before one inside a longer name', () => {
    // "Siam" itself before ICONSIAM and Siam Paragon.
    expect(ids('siam')[0]).toBe('siam');
    expect(ids('siam')).toContain('iconsiam');
  });

  it('returns nothing for an empty or unknown query', () => {
    expect(searchPlaces('')).toEqual([]);
    expect(searchPlaces('   ')).toEqual([]);
    expect(searchPlaces('chiang mai')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(searchPlaces('a', places, 3)).toHaveLength(3);
  });

  it('has unique ids and both languages for every place', () => {
    expect(new Set(places.map((p) => p.id)).size).toBe(places.length);
    for (const p of places) {
      expect(p.name.en.trim(), p.id).not.toBe('');
      expect(p.name.th.trim(), p.id).not.toBe('');
    }
  });
});
