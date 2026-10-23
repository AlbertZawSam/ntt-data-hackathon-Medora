import { operationalText } from '@medora/shared/logic/agentText';
import { decisionRows } from '@medora/shared/logic/decisionTable';
import { DEMO_REPLY_AFTER_SEC, demoReply } from '@medora/shared/logic/demoReplies';
import { PATHWAYS } from '@medora/shared/logic/pathways';
import { DEMO_REPLY_DELAY_SEC, assessReferral, delayExceedsWindow, demoReplyFor, nextHospitals, statedDelayMin, type ReferralAssessment } from '@medora/shared/logic/referral';
import { ruleAccepts } from '@medora/shared/logic/rules';
import type {
  Bi,
  CareRequest,
  HospitalStatus,
  PathwayKey,
  RankableHospital,
  RankedHospital,
} from '@medora/shared/logic/types';


export const TOOL_NAMES = [
  'assess_case',
  'search_knowledge_base',
  'ask_hospitals',
  'check_replies',
  'recommend',
  'report_no_placement',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface ReferralRun {
  id: string;
  ownerId: string;
  fromHospitalId: string;
  text: string;
  onsetMin?: number;
  lang: 'en' | 'th';
  requestIds: string[];
  startedAtMs: number;
}

export interface AgentHospital extends RankableHospital {}

export interface ReferralStore {
  hospitals(): Promise<AgentHospital[]>;
  routeMinutes(origin: { lat: number; lng: number }, destinations: AgentHospital[]): Promise<Record<string, number>>;
  requests(referralId: string): Promise<CareRequest[]>;
  createRequest(request: Omit<CareRequest, 'id'>): Promise<CareRequest>;
  updateRequest(id: string, changes: Partial<CareRequest>): Promise<void>;
  updateReferral(id: string, changes: Record<string, unknown>): Promise<void>;
  trace(kind: string, title: Bi, detail: Bi): Promise<void>;
  activity(text: Bi): Promise<void>;
  knowledgeSearch(query: string): Promise<Array<{ hospitalId: string; text: string; source: string }>>;
  /** The demo hospital key when demo replies are switched on (task 21), else null. */
  demoHospitalKey(hospitalId: string): string | null;
  now(): number;
  /** Demo stage only: hospitals without an auto-accept rule reply after a few seconds with preset notes. */
  demoReplies?(): boolean;
}

const POLL_MS = 2_000;

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface AssessmentState {
  assessment: ReferralAssessment;
  hospitals: AgentHospital[];
}

function toolError(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asPathway(value: unknown): PathwayKey | null {
  return typeof value === 'string' && value in PATHWAYS ? (value as PathwayKey) : null;
}

function asHospitalIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.some((id) => typeof id !== 'string')) return null;
  return [...new Set(value)];
}

function asWait(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 5 && value <= 60 ? value : null;
}

/**
 * Implements the only operations the model can invoke. No method confirms a transfer, alters
 * hospital status, or classifies emergencies. Every input is checked before it reaches data.
 */
export class ReferralTools {
  private state: AssessmentState | null = null;
  private readonly asked = new Set<string>();
  private rounds = 0;

  constructor(
    private readonly referral: ReferralRun,
    private readonly store: ReferralStore,
  ) {}

  async execute(name: string, rawInput: unknown): Promise<Record<string, unknown>> {
    const input = asRecord(rawInput);
    if (!input) return toolError('Tool input must be an object.');
    let result: Record<string, unknown>;
    switch (name) {
      case 'assess_case':
        result = await this.assessCase(input);
        break;
      case 'search_knowledge_base':
        result = await this.searchKnowledgeBase(input);
        break;
      case 'ask_hospitals':
        result = await this.askHospitals(input);
        break;
      case 'check_replies':
        result = await this.checkReplies(input);
        break;
      case 'recommend':
        result = await this.recommend(input);
        break;
      case 'report_no_placement':
        result = await this.reportNoPlacement(input);
        break;
      default:
        return toolError('Unknown tool. Use one of the documented tools only.');
    }
    await this.store.activity({ en: `Agent ran ${name}`, th: `เอเจนต์เรียกใช้ ${name}` });
    return result;
  }

  async assessCase(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this.state) return toolError('assess_case may be called only once per referral.');
    const pathway = asPathway(input.pathway);
    if (!pathway) return toolError('pathway must be stroke, stemi, preterm, peds, maternity, injury, or general.');
    const hospitals = await this.store.hospitals();
    const origin = hospitals.find((hospital) => hospital.id === this.referral.fromHospitalId);
    if (!origin) return toolError('The referring hospital is not registered with a current profile and status.');
    const driveMinById = await this.store.routeMinutes(origin, hospitals.filter((hospital) => hospital.id !== origin.id));
    this.state = {
      hospitals,
      assessment: assessReferral(hospitals.filter((hospital) => hospital.id !== origin.id), origin, pathway, this.store.now(), this.referral.onsetMin, driveMinById),
    };
    const { assessment } = this.state;
    await this.store.updateReferral(this.referral.id, { pathway, rows: decisionRows(assessment.ranked, []) });
    await this.store.trace(
      'assess_case',
      { en: 'Case assessed', th: 'ประเมินเคสแล้ว' },
      { en: `Found ${assessment.ranked.filter((row) => row.eligible).length} hospitals that can help.`, th: `พบโรงพยาบาลที่ช่วยได้ ${assessment.ranked.filter((row) => row.eligible).length} แห่ง` },
    );
    return {
      ok: true,
      pathway,
      remaining_min: Number.isFinite(assessment.remainingMin) ? assessment.remainingMin : null,
      suggested_parallel_requests: assessment.askCount,
      wait_seconds: assessment.waitSeconds,
      hospitals: assessment.ranked.map((row) => this.publicRow(row)),
    };
  }

  async searchKnowledgeBase(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const query = typeof input.query === 'string' ? input.query.trim().slice(0, 500) : '';
    if (!query) return toolError('query must be a non-empty string up to 500 characters.');
    const matches = await this.store.knowledgeSearch(query);
    await this.store.trace(
      'search_knowledge_base',
      { en: 'Capability sources checked', th: 'ตรวจสอบแหล่งข้อมูลความสามารถแล้ว' },
      { en: `${matches.length} matching source(s) found.`, th: `พบแหล่งข้อมูลที่ตรงกัน ${matches.length} แหล่ง` },
    );
    return { ok: true, matches };
  }

  async askHospitals(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const ids = asHospitalIds(input.hospital_ids);
    const waitSeconds = asWait(input.wait_seconds);
    if (!ids) return toolError('hospital_ids must be a non-empty array of unique hospital ids.');
    if (waitSeconds === null) return toolError('wait_seconds must be an integer from 5 to 60.');
    if (!this.state) return toolError('Call assess_case before asking hospitals.');
    if (this.rounds >= 2) return toolError('At most two hospital asking rounds are allowed.');
    const allowed = new Set(nextHospitals(this.state.assessment, this.asked).map((row) => row.hospital.id));
    if (ids.some((id) => !allowed.has(id))) return toolError('A hospital is unknown, cannot help, was already asked, or is outside the next allowed round.');

    const rows = this.state.assessment.ranked.filter((row) => ids.includes(row.hospital.id));
    this.rounds += 1;
    const created: CareRequest[] = [];
    for (const row of rows) {
      this.asked.add(row.hospital.id);
      const auto = ruleAccepts(row.hospital.status, PATHWAYS[this.state.assessment.pathway]);
      const request = await this.store.createRequest({
        type: 'referral',
        hospitalId: row.hospital.id,
        ownerId: this.referral.ownerId,
        needKey: this.state.assessment.pathway,
        etaMin: Math.round(row.driveMin),
        status: auto ? 'accepted' : 'waiting',
        auto,
        reason: auto ? 'accepted_by_rule' : undefined,
        overrideUntil: auto ? this.store.now() + 60_000 : undefined,
        hospitalName: row.hospital.name,
        patient: { mode: 'ambulance', description: this.referral.text },
        fromHospitalId: this.referral.fromHospitalId,
        referralId: this.referral.id,
        createdAtMs: this.store.now(),
      });
      created.push(request);
      if (auto) await this.store.activity({ en: 'Referral accepted by hospital rule', th: 'คำขอส่งต่อได้รับการตอบรับตามกฎของโรงพยาบาล' });
    }
    await this.store.trace(
      'ask_hospitals',
      { en: 'Hospitals asked', th: 'ส่งคำขอไปยังโรงพยาบาลแล้ว' },
      { en: `Asked ${ids.length} hospital(s); waiting up to ${waitSeconds} seconds for staff replies.`, th: `ส่งคำขอ ${ids.length} แห่ง; รอการตอบกลับจากเจ้าหน้าที่ไม่เกิน ${waitSeconds} วินาที` },
    );

    // The Lambda is asynchronous. It waits at most the bounded policy interval and returns as soon
    // as every asked hospital has replied. It never invents a staff reply, except preset replies from
    // demo hospitals when the demo switch is on (requirement 17.2).
    await this.saveRows();
    await this.waitForReplies(ids, waitSeconds);
    await this.saveRows();
    return { ok: true, replies: await this.replies() };
  }

  /** What the doctor sees for each hospital asked: place, drive and answer. Never counts or equipment faults. */
  private async decisionRows(): Promise<Array<Record<string, unknown>>> {
    const requests = await this.store.requests(this.referral.id);
    return requests.flatMap((request) => {
      const row = this.state?.assessment.ranked.find((candidate) => candidate.hospital.id === request.hospitalId);
      return row
        ? [{ hospitalId: request.hospitalId, name: row.hospital.name, lat: row.hospital.lat, lng: row.hospital.lng, driveMin: Math.round(row.driveMin), status: request.status, auto: request.auto }]
        : [];
    });
  }

  async checkReplies(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const waitSeconds = asWait(input.wait_seconds);
    if (waitSeconds === null) return toolError('wait_seconds must be an integer from 5 to 60.');
    if (input.give_up_on_pending !== undefined && typeof input.give_up_on_pending !== 'boolean') {
      return toolError('give_up_on_pending must be true or false.');
    }
    if (input.give_up_on_pending === true) return { ok: true, replies: await this.replies() };
    await this.waitForReplies([...this.asked], waitSeconds);
    await this.saveRows();
    return { ok: true, replies: await this.replies() };
  }

  async recommend(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const hospitalId = typeof input.hospital_id === 'string' ? input.hospital_id : '';
    const reasonEn = this.withNames(typeof input.reason_en === 'string' ? input.reason_en.trim().slice(0, 500) : '', 'en');
    const reasonTh = this.withNames(typeof input.reason_th === 'string' ? input.reason_th.trim().slice(0, 500) : '', 'th');
    if (!hospitalId || !reasonEn || !reasonTh) return toolError('hospital_id, reason_en, and reason_th are required.');
    const requests = await this.store.requests(this.referral.id);
    const accepted = requests.find((request) => request.hospitalId === hospitalId && request.status === 'accepted');
    if (!accepted) return toolError('A recommendation requires an accepted request for that hospital.');
    const row = this.state?.assessment.ranked.find((candidate) => candidate.hospital.id === hospitalId);
    if (this.state && row && delayExceedsWindow(this.state.assessment, row, statedDelayMin(accepted.note))) {
      return toolError('The accepted hospital has a stated delay that exceeds the remaining treatment window.');
    }
    for (const request of requests) {
      if (request.id !== accepted.id && request.status === 'waiting') await this.store.updateRequest(request.id, { status: 'cancelled' });
    }
    const finalRequests = requests.map((request) => (request.id !== accepted.id && request.status === 'waiting' ? { ...request, status: 'cancelled' as const } : request));
    await this.store.updateReferral(this.referral.id, {
      status: 'awaiting',
      ...(this.state ? { rows: decisionRows(this.state.assessment.ranked, finalRequests, hospitalId) } : {}),
      chosenId: hospitalId,
      chosenName: row?.hospital.name,
      etaMin: Math.round(row?.driveMin ?? accepted.etaMin),
      why: { en: reasonEn, th: reasonTh },
      requestIds: requests.map((request) => request.id),
      rows: await this.decisionRows(),
      recommendedAtMs: this.store.now(),
      elapsedSec: Math.max(0, Math.round((this.store.now() - this.referral.startedAtMs) / 1_000)),
    });
    await this.store.trace(
      'recommend',
      { en: 'Hospital recommended', th: 'แนะนำโรงพยาบาลแล้ว' },
      { en: reasonEn, th: reasonTh },
    );
    await this.store.activity({ en: 'Agent recommendation is awaiting doctor confirmation', th: 'คำแนะนำจากเอเจนต์กำลังรอการยืนยันจากแพทย์' });
    return { ok: true, hospital_id: hospitalId };
  }

  async reportNoPlacement(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const reasonEn = this.withNames(typeof input.reason_en === 'string' ? input.reason_en.trim().slice(0, 500) : '', 'en');
    const reasonTh = this.withNames(typeof input.reason_th === 'string' ? input.reason_th.trim().slice(0, 500) : '', 'th');
    if (!reasonEn || !reasonTh) return toolError('reason_en and reason_th are required.');
    await this.store.updateReferral(this.referral.id, {
      status: 'failed',
      ...(this.state ? { rows: decisionRows(this.state.assessment.ranked, await this.store.requests(this.referral.id)) } : {}),
      why: { en: reasonEn, th: reasonTh },
      recommendedAtMs: this.store.now(),
    });
    await this.store.trace('report_no_placement', { en: 'No placement found', th: 'ไม่พบที่รับผู้ป่วย' }, { en: reasonEn, th: reasonTh });
    await this.store.activity({ en: 'No accepted hospital placement was found', th: 'ไม่พบโรงพยาบาลที่ตอบรับผู้ป่วย' });
    return { ok: true };
  }

  async ruleBasedBackup(): Promise<void> {
    const pathway = this.state?.assessment.pathway ?? 'general';
    if (!this.state) await this.execute('assess_case', { pathway });
    let accepted: CareRequest | undefined;
    while (this.rounds < 2 && !accepted) {
      const candidates = this.state ? nextHospitals(this.state.assessment, this.asked) : [];
      if (candidates.length === 0) break;
      await this.execute('ask_hospitals', { hospital_ids: candidates.map((row) => row.hospital.id), wait_seconds: this.state!.assessment.waitSeconds });
      const requests = await this.store.requests(this.referral.id);
      accepted = this.state?.assessment.ranked
        .filter((row) => row.eligible)
        .map((row) => requests.find((request) => request.hospitalId === row.hospital.id && request.status === 'accepted'))
        .find((request): request is CareRequest => request !== undefined);
    }
    if (!accepted) {
      await this.execute('report_no_placement', {
        reason_en: 'No hospital accepted the referral in the available time.',
        reason_th: 'ไม่มีโรงพยาบาลตอบรับคำขอส่งต่อภายในเวลาที่กำหนด',
      });
      return;
    }
    await this.execute('recommend', {
      hospital_id: accepted.hospitalId,
      reason_en: 'This hospital accepted and has the best eligible travel time.',
      reason_th: 'โรงพยาบาลนี้ตอบรับและมีเวลาเดินทางที่เหมาะสมที่สุดในกลุ่มที่รับได้',
    });
  }

  /** Store a short operational update, never raw chain-of-thought. */
  async progress(summary: string): Promise<void> {
    const clean = operationalText(summary);
    if (!clean) return;
    await this.store.trace(
      'agent_progress',
      { en: 'Agent update', th: 'อัปเดตจากเอเจนต์' },
      { en: clean, th: clean },
    );
  }

  private async waitForReplies(ids: string[], waitSeconds: number): Promise<void> {
    const started = this.store.now();
    const deadline = started + waitSeconds * 1_000;
    let demoDone = false;
    for (;;) {
      const pending = (await this.store.requests(this.referral.id)).filter((request) => ids.includes(request.hospitalId) && request.status === 'waiting');
      if (pending.length === 0 || this.store.now() >= deadline) return;
      if (!demoDone && this.store.now() - started >= DEMO_REPLY_AFTER_SEC * 1_000) {
        demoDone = true;
        await this.demoReplies(pending);
        continue;
      }
      await sleep(Math.min(POLL_MS, Math.max(0, deadline - this.store.now())));
    }
  }

  private async demoReplies(pending: CareRequest[]): Promise<void> {
    if (!this.state) return;
    let replied = 0;
    for (const request of pending) {
      const key = this.store.demoHospitalKey(request.hospitalId);
      if (!key) continue;
      const reply = demoReply(key, this.state.assessment.pathway);
      await this.store.updateRequest(request.id, {
        status: reply.status,
        ...(reply.reason ? { reason: reply.reason } : {}),
        ...(reply.note ? { note: reply.note } : {}),
      });
      replied += 1;
    }
    if (replied > 0) {
      await this.store.trace(
        'demo_replies',
        { en: 'Demo replies', th: 'การตอบกลับสำหรับสาธิต' },
        { en: `${replied} demo hospital(s) replied with preset answers.`, th: `โรงพยาบาลสาธิต ${replied} แห่งตอบกลับด้วยคำตอบที่ตั้งไว้` },
      );
    }
  }

  /** Saves the doctor's decision table: reason codes and replies only, never notes or raw status. */
  private async saveRows(): Promise<void> {
    if (!this.state) return;
    const requests = await this.store.requests(this.referral.id);
    await this.store.updateReferral(this.referral.id, { rows: decisionRows(this.state.assessment.ranked, requests) });
  }

  /** The doctor reads hospital names, not ids: replaces any hospital id in the model's text. */
  private withNames(text: string, lang: 'en' | 'th'): string {
    let out = text;
    for (const hospital of this.state?.hospitals ?? []) out = out.split(hospital.id).join(hospital.name[lang]);
    return out;
  }

  private async replies(): Promise<Array<Record<string, unknown>>> {
    const requests = await this.store.requests(this.referral.id);
    return requests.map((request) => ({
      hospital_id: request.hospitalId,
      status: request.status,
      answered_by: request.auto ? 'rule' : request.status === 'waiting' ? 'pending' : 'staff',
      decline_reason: request.reason ?? null,
      staff_note: request.note ? `<staff_note>${request.note.slice(0, 200)}</staff_note>` : null,
      drive_min: request.etaMin,
    }));
  }

  private publicRow(row: RankedHospital): Record<string, unknown> {
    return {
      hospital_id: row.hospital.id,
      name: row.hospital.name.en,
      drive_min: Math.round(row.driveMin),
      score: Math.round(row.score * 10) / 10,
      can_help: row.eligible,
      why_not: row.failures.map((failure) => failure.kind),
      data_freshness: row.stale ? 'may_be_outdated' : 'current',
    };
  }
}
