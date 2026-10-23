/**
 * The doctor's decision table for one referral: every hospital the agent considered, whether it can
 * help, why not, and what each asked hospital replied. Built by the agent from its ranking and the
 * requests it sent, saved on the referral, and read by the doctor screen. Only reason codes and a
 * stated delay are kept, never raw status data or staff note text. Pure TypeScript.
 * Requirements: 12.6, 13.1
 */
import { statedDelayMin } from './referral';
import type { Bi, CareRequest, Failure, RankedHospital } from './types';

export type RowReply = 'notAsked' | 'waiting' | 'accepted' | 'acceptedByRule' | 'declined' | 'noReply' | 'cancelled';

export type WhyNot = Failure['kind'];

export interface DecisionRow {
  hospitalId: string;
  name: Bi;
  driveMin: number;
  canHelp: boolean;
  /** Reason codes only (department closed, equipment down, no specialist, no bed, too far). */
  whyNot: WhyNot[];
  stale: boolean;
  reply: RowReply;
  /** The decline reason code staff picked, when declined. */
  declineReason?: string;
  /** A delay in minutes the staff note states, when it states one. */
  delayMin?: number;
  chosen: boolean;
}

/** Rows kept for the screen: the asked hospitals plus the nearest others, up to this many. */
export const MAX_ROWS = 10;

const WHY_NOT: readonly WhyNot[] = ['dept', 'equip', 'onDuty', 'beds', 'nicu', 'tooFar'];
const REPLIES: readonly RowReply[] = ['notAsked', 'waiting', 'accepted', 'acceptedByRule', 'declined', 'noReply', 'cancelled'];

function replyFor(request: CareRequest | undefined): RowReply {
  if (!request) return 'notAsked';
  switch (request.status) {
    case 'accepted':
    case 'completed':
      return request.auto ? 'acceptedByRule' : 'accepted';
    case 'declined':
      return 'declined';
    case 'no_reply':
      return 'noReply';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'waiting';
  }
}

/** Builds the table from the agent's ranking (already in rank order) and the referral's requests. */
export function decisionRows(ranked: readonly RankedHospital[], requests: readonly CareRequest[], chosenId?: string): DecisionRow[] {
  const byHospital = new Map<string, CareRequest>();
  for (const request of requests) {
    const known = byHospital.get(request.hospitalId);
    if (!known || request.createdAtMs >= known.createdAtMs) byHospital.set(request.hospitalId, request);
  }
  const rows = ranked.map((row): DecisionRow => {
    const request = byHospital.get(row.hospital.id);
    const delay = request?.note ? statedDelayMin(request.note) : null;
    return {
      hospitalId: row.hospital.id,
      name: row.hospital.name,
      driveMin: Math.round(row.driveMin),
      canHelp: row.eligible,
      whyNot: [...new Set(row.failures.map((failure) => failure.kind))],
      stale: row.stale,
      reply: replyFor(request),
      ...(request?.status === 'declined' && request.reason ? { declineReason: request.reason } : {}),
      ...(delay !== null ? { delayMin: delay } : {}),
      chosen: row.hospital.id === chosenId,
    };
  });
  const asked = rows.filter((row) => row.reply !== 'notAsked');
  const others = rows.filter((row) => row.reply === 'notAsked').slice(0, Math.max(0, MAX_ROWS - asked.length));
  const keep = new Set([...asked, ...others]);
  return rows.filter((row) => keep.has(row));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates rows read from the API (AWSJSON); malformed rows are dropped. */
export function parseDecisionRows(raw: unknown): DecisionRow[] {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((row): DecisionRow[] => {
    if (!isRecord(row) || !isRecord(row.name)) return [];
    const { hospitalId, driveMin, canHelp, stale, reply, chosen, whyNot } = row;
    if (
      typeof hospitalId !== 'string' ||
      typeof row.name.en !== 'string' ||
      typeof row.name.th !== 'string' ||
      typeof driveMin !== 'number' ||
      typeof canHelp !== 'boolean' ||
      typeof stale !== 'boolean' ||
      typeof chosen !== 'boolean' ||
      !REPLIES.includes(reply as RowReply) ||
      !Array.isArray(whyNot)
    ) {
      return [];
    }
    return [
      {
        hospitalId,
        name: { en: row.name.en, th: row.name.th },
        driveMin,
        canHelp,
        whyNot: whyNot.filter((kind): kind is WhyNot => WHY_NOT.includes(kind as WhyNot)),
        stale,
        reply: reply as RowReply,
        ...(typeof row.declineReason === 'string' ? { declineReason: row.declineReason } : {}),
        ...(typeof row.delayMin === 'number' ? { delayMin: row.delayMin } : {}),
        chosen,
      },
    ];
  });
}
