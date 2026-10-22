import { RESERVATION_MS, activeHolds, contradictsHolds, kindForNeed, newReservation, reservationKind, withHolds, type Reservation } from '../logic/reservations';
import { failsFor, freeBeds } from '../logic/ranking';
import { PATHWAYS } from '../logic/pathways';
import { NOW_MS, openStatus } from './generators';

const r = (over: Partial<Reservation>): Reservation => ({
  id: 'x', requestId: 'q', hospitalId: 'H1', kind: 'bed', state: 'held', createdAtMs: NOW_MS, expiresAtMs: NOW_MS + RESERVATION_MS, ...over,
});

describe('reservationKind', () => {
  it('holds a NICU cot for preterm, a bed for bed pathways, and nothing for a plain visit', () => {
    expect(reservationKind('preterm')).toBe('nicu');
    expect(reservationKind('stroke')).toBe('bed');
    expect(kindForNeed('general')).toBeNull();
    expect(kindForNeed('child')).toBe(reservationKind('peds'));
  });
});

describe('activeHolds', () => {
  it('counts only held, unexpired reservations of that hospital', () => {
    const list = [
      r({ id: '1' }), r({ id: '2', kind: 'nicu' }), r({ id: '3', state: 'released' }), r({ id: '4', state: 'converted' }),
      r({ id: '5', expiresAtMs: NOW_MS - 1 }), r({ id: '6', hospitalId: 'H2' }),
    ];
    expect(activeHolds(list, 'H1', NOW_MS)).toEqual({ beds: 1, nicu: 1 });
  });
  it('lets a hold expire after two hours by itself', () => {
    const list = [r({})];
    expect(activeHolds(list, 'H1', NOW_MS + RESERVATION_MS - 1).beds).toBe(1);
    expect(activeHolds(list, 'H1', NOW_MS + RESERVATION_MS).beds).toBe(0);
  });
});

describe('withHolds', () => {
  it('makes held beds count as not free, so a full hospital fails the pathway', () => {
    const status = openStatus({ beds: 1 });
    expect(failsFor(status, PATHWAYS.stroke)).toEqual([]);
    const held = withHolds(status, { beds: 1, nicu: 0 });
    expect(freeBeds(held)).toBe(0);
    expect(failsFor(held, PATHWAYS.stroke)).toContainEqual({ kind: 'beds' });
  });
});

describe('contradictsHolds', () => {
  it('flags a count below what is already promised', () => {
    expect(contradictsHolds({ beds: 1, nicu: 2 }, { beds: 2, nicu: 1 })).toEqual({ beds: true, nicu: false });
    expect(contradictsHolds({ beds: 2, nicu: 1 }, { beds: 2, nicu: 1 })).toEqual({ beds: false, nicu: false });
  });
});

describe('newReservation', () => {
  it('expires in two hours', () => {
    expect(newReservation('q', 'H1', 'bed', NOW_MS)).toMatchObject({ state: 'held', expiresAtMs: NOW_MS + RESERVATION_MS });
  });
});
