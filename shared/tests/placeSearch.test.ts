import { BANGKOK_BOX, cleanPlaceQuery, parseFoundPlaces, parsePlaceResults } from '../logic/placeSearch';
import { isInBangkok } from '../logic/places';

const item = (title: string, lng: number, lat: number, extra: Record<string, unknown> = {}) => ({ Title: title, Position: [lng, lat], ...extra });

describe('BANGKOK_BOX', () => {
  it('is [west, south, east, north] and matches the Bangkok bounds used for GPS', () => {
    const [west, south, east, north] = BANGKOK_BOX;
    expect(west).toBeLessThan(east);
    expect(south).toBeLessThan(north);
    expect(isInBangkok({ lat: (south + north) / 2, lng: (west + east) / 2 })).toBe(true);
    expect(isInBangkok({ lat: south - 0.01, lng: west })).toBe(false);
  });
});

describe('cleanPlaceQuery', () => {
  it('trims and tidies a typed place name, in English or Thai', () => {
    expect(cleanPlaceQuery('  Central   World ')).toBe('Central World');
    expect(cleanPlaceQuery('เซ็นทรัลเวิลด์')).toBe('เซ็นทรัลเวิลด์');
    expect(cleanPlaceQuery('bad\u0000text\nhere')).toBe('bad text here');
  });
  it('refuses text that is missing, too short or too long, or not text', () => {
    for (const bad of [undefined, null, 42, {}, '', ' a ', 'ab', 'x'.repeat(81), '...', ' - - - ', '!?!?']) expect(cleanPlaceQuery(bad)).toBeNull();
    expect(cleanPlaceQuery('ถนน 1')).toBe('ถนน 1');
  });
});

describe('parsePlaceResults', () => {
  it('reads Amazon Location items: title, address, and position as [lng, lat]', () => {
    const [found] = parsePlaceResults([item('CentralWorld', 100.5398, 13.7466, { PlaceId: 'p1', Address: { Label: 'CentralWorld, Pathum Wan, Bangkok' } })]);
    expect(found).toEqual({ id: 'p1', name: 'CentralWorld', detail: 'CentralWorld, Pathum Wan, Bangkok', lat: 13.7466, lng: 100.5398 });
  });
  it('drops places outside Bangkok, swapped or missing coordinates, and items without a title', () => {
    const result = parsePlaceResults([
      item('Chiang Mai', 98.99, 18.79, { PlaceId: 'far' }),
      { Title: 'No position' },
      { Position: [100.5, 13.7] },
      { Title: 'Bad', Position: ['100.5', '13.7'] },
      item('Swapped', 13.75, 100.53, { PlaceId: 'swapped' }),
      item('Siam Paragon', 100.5347, 13.7460, { PlaceId: 'ok' }),
    ]);
    expect(result.map((p) => p.id)).toEqual(['ok']);
  });
  it('removes duplicates, limits the list, and tolerates a missing id or odd input', () => {
    const many = Array.from({ length: 9 }, (_, i) => item(`Place ${i}`, 100.5 + i * 0.001, 13.75, { PlaceId: `p${i % 7}` }));
    expect(parsePlaceResults(many)).toHaveLength(5);
    expect(parsePlaceResults(many, 3)).toHaveLength(3);
    expect(parsePlaceResults([item('No id', 100.5, 13.75)])[0].id).toBe('13.75000,100.50000');
    for (const bad of [undefined, null, 'x', {}, [null, 3, 'x']]) expect(parsePlaceResults(bad)).toEqual([]);
  });
  it('leaves out an address that only repeats the name', () => {
    expect(parsePlaceResults([item('Siam', 100.53, 13.74, { PlaceId: 'a', Address: { Label: 'Siam' } })])[0]).not.toHaveProperty('detail');
  });
});

describe('parseFoundPlaces', () => {
  it('accepts what the Lambda returns and rejects anything that is not a place in Bangkok', () => {
    const ok = { id: 'p1', name: 'CentralWorld', lat: 13.7466, lng: 100.5398 };
    expect(parseFoundPlaces({ places: [ok, { id: 'far', name: 'Far', lat: 18.8, lng: 99 }, { name: 'no id', lat: 13.7, lng: 100.5 }, null] })).toEqual([ok]);
    for (const bad of [undefined, null, 'x', {}, { places: 'x' }]) expect(parseFoundPlaces(bad)).toEqual([]);
  });
});
