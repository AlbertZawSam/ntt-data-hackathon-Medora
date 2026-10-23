/**
 * Agent evaluations (task 25, requirements 12.5 and 12.10): runs the cases in shared/logic/evals.ts
 * against the deployed referral agent in YOUR sandbox, scores each run with `scoreRun`, and prints the
 * table for docs/evals.md. Synthetic data only.
 *
 *   npm run evals                                   dry run: checks the sandbox and prints the plan and cost estimate; calls no model
 *   npm run evals -- --yes                          10 runs of every case on Nova Lite
 *   npm run evals -- --yes --model both --runs 10   Nova Lite then Nova Pro (final evaluation only)
 *   npm run evals -- --yes --cases stroke-en,stemi-th --runs 3
 *   npm run evals -- --cleanup scripts/.local/evals-<id>.json --yes     deletes what that run created
 *   npm run evals -- --cleanup all --yes                                 deletes everything created by any evaluation run
 *
 * Needs: a deployed sandbox seeded with `npm run seed`, deployed with DEMO_REPLIES=true (hospitals
 * without an auto-accept rule reply after a few seconds) and the knowledge base with its documents loaded
 * (`npm run upload-kb`), because the sources check needs it; `--allow-no-kb` skips that check on purpose.
 * Each run creates its own referral (owner `eval-<id>-<n>`, so the daily limit never blocks), invokes the
 * agent Lambda directly with the chosen model, answers the simulated staff notes the case needs, and reads
 * the result back from DynamoDB. The referring hospital is Thonburi, a community hospital that needs help.
 *
 * Cost: Bedrock tokens only, roughly 2 US cents per Nova Pro run and a fraction of a cent per Nova Lite run
 * (an estimate; see ESTIMATE below), plus a few thousand DynamoDB reads. Nothing is billed while idle.
 * Results (with the ids to clean up) go to scripts/.local/, which Git ignores.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppSyncClient, paginateListGraphqlApis } from '@aws-sdk/client-appsync';
import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetFunctionConfigurationCommand, InvokeCommand, LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { BedrockAgentRuntimeClient, RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { DeleteCommand, DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { EVAL_CASES, scoreRun, summarise, type EvalCase, type EvalCheck, type EvalRun } from '@medora/shared/logic/evals';
import { assessReferral, delayExceedsWindow, statedDelayMin } from '@medora/shared/logic/referral';
import type { DecisionRow, HospitalStatus, RankableHospital } from '@medora/shared/logic/types';
import { seedHospitalId } from './seed-id';

const REGION = 'us-east-1';
const ORIGIN_KEY = 'thonburi';
const POLL_MS = 2_000;
const RUN_TIMEOUT_MS = 6 * 60_000;
/** Rough dollars per run, from about 15k input and 2k output tokens over a full run. Check Cost Explorer after. */
const ESTIMATE = { fast: 0.002, strong: 0.02 } as const;

type Row = Record<string, unknown>;
type Model = 'fast' | 'strong';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const has = (name: string): boolean => args.includes(`--${name}`);
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));
const json = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

async function main(): Promise<void> {
  const outputs = JSON.parse(readFileSync(resolve('frontend/amplify_outputs.json'), 'utf8')) as { data?: { url?: string; aws_region?: string } };
  if (!outputs.data?.url) throw new Error('No API in frontend/amplify_outputs.json. Run `npm run sandbox` first.');
  if (outputs.data.aws_region !== REGION) throw new Error(`Refusing to use ${outputs.data.aws_region}: this project uses ${REGION} only.`);

  let apiId = '';
  for await (const page of paginateListGraphqlApis({ client: new AppSyncClient({ region: REGION }) }, {})) {
    apiId = page.graphqlApis?.find((api) => api.uris?.GRAPHQL === outputs.data?.url)?.apiId ?? apiId;
  }
  if (!apiId) throw new Error('The API in frontend/amplify_outputs.json was not found. Is your sandbox running?');
  const table = (model: string): string => `${model}-${apiId}-NONE`;
  const raw = new DynamoDBClient({ region: REGION });
  const db = DynamoDBDocumentClient.from(raw, { marshallOptions: { removeUndefinedValues: true } });

  const indexCache = new Map<string, string | null>();
  async function indexFor(model: string, attribute: string): Promise<string | null> {
    const key = `${model}.${attribute}`;
    if (!indexCache.has(key)) {
      const described = await raw.send(new DescribeTableCommand({ TableName: table(model) }));
      const found = described.Table?.GlobalSecondaryIndexes?.find((index) => index.KeySchema?.[0]?.AttributeName === attribute);
      indexCache.set(key, found?.IndexName ?? null);
    }
    return indexCache.get(key) ?? null;
  }
  async function listBy(model: string, attribute: string, value: string): Promise<Row[]> {
    const index = await indexFor(model, attribute);
    const items: Row[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const page = index
        ? await db.send(new QueryCommand({ TableName: table(model), IndexName: index, KeyConditionExpression: '#a = :v', ExpressionAttributeNames: { '#a': attribute }, ExpressionAttributeValues: { ':v': value }, ExclusiveStartKey: start }))
        : await db.send(new ScanCommand({ TableName: table(model), FilterExpression: '#a = :v', ExpressionAttributeNames: { '#a': attribute }, ExpressionAttributeValues: { ':v': value }, ExclusiveStartKey: start }));
      items.push(...((page.Items ?? []) as Row[]));
      start = page.LastEvaluatedKey;
    } while (start);
    return items;
  }
  async function scanAll(model: string, filter?: { expression: string; names: Record<string, string>; values: Record<string, unknown> }): Promise<Row[]> {
    const items: Row[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const page = await db.send(new ScanCommand({ TableName: table(model), ...(filter ? { FilterExpression: filter.expression, ...(Object.keys(filter.names).length ? { ExpressionAttributeNames: filter.names } : {}), ExpressionAttributeValues: filter.values } : {}), ExclusiveStartKey: start }));
      items.push(...((page.Items ?? []) as Row[]));
      start = page.LastEvaluatedKey;
    } while (start);
    return items;
  }

  if (flag('cleanup')) return cleanup(flag('cleanup') as string, table, db, listBy, scanAll);

  // The sandbox's own hospital rows are the ground truth for who could treat each case.
  const profiles = await scanAll('HospitalProfile');
  const statuses = new Map((await scanAll('HospitalStatus')).map((row) => [String(row.hospitalId), json(row.status) as HospitalStatus]));
  const hospitals: RankableHospital[] = profiles.flatMap((p) => {
    const status = statuses.get(String(p.hospitalId));
    const name = json(p.name) as { en: string; th: string } | null;
    return status && name ? [{ id: String(p.hospitalId), name, lat: Number(p.lat), lng: Number(p.lng), typicalWaitMin: Number(p.typicalWaitMin), status }] : [];
  });
  const originId = seedHospitalId(ORIGIN_KEY);
  const origin = hospitals.find((h) => h.id === originId);
  if (!origin) throw new Error(`The referring hospital (${ORIGIN_KEY}) is not in your sandbox. Run \`npm run seed\` first.`);
  /**
   * Who could really treat the case: hospitals the fixed rules call eligible. When the case has a stated delay
   * (the nearest hospital's neurologist is free in about 40 minutes) and that delay breaks the treatment window,
   * the nearest hospital no longer counts, so reporting no placement can be the right answer.
   */
  const capableFor = (c: EvalCase): string[] => {
    const assessment = assessReferral(hospitals.filter((h) => h.id !== originId), origin, c.pathway, Date.now(), c.onsetMin);
    const eligible = assessment.ranked.filter((r) => r.eligible);
    const delay = c.expect.delayWeighed ? statedDelayMin(c.statedNote) : null;
    const nearest = [...eligible].sort((a, b) => a.driveMin - b.driveMin)[0];
    return eligible.filter((r) => r !== nearest || !delayExceedsWindow(assessment, r, delay)).map((r) => r.hospital.id);
  };

  // The agent Lambda and what it was deployed with.
  const lambda = new LambdaClient({ region: REGION });
  let functionName = flag('function') ?? '';
  if (!functionName) {
    const names: string[] = [];
    let marker: string | undefined;
    do {
      const page = await lambda.send(new ListFunctionsCommand({ Marker: marker }));
      names.push(...(page.Functions ?? []).flatMap((f) => (f.FunctionName && /amplify-medorabackend.*agentrunner/i.test(f.FunctionName) ? [f.FunctionName] : [])));
      marker = page.NextMarker;
    } while (marker);
    if (names.length !== 1) throw new Error(`Found ${names.length} agent-runner functions (${names.join(', ') || 'none'}). Pass --function <name>.`);
    functionName = names[0];
  }
  const config = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: functionName }));
  const env = config.Environment?.Variables ?? {};

  const models: Model[] = flag('model') === 'both' ? ['fast', 'strong'] : flag('model') === 'strong' ? ['strong'] : ['fast'];
  const runsPer = Math.max(1, Math.min(20, Number(flag('runs') ?? 10)));
  const only = flag('cases')?.split(',');
  const cases = EVAL_CASES.filter((c) => !only || only.includes(c.id));
  if (cases.length === 0) throw new Error(`No case matches. Cases: ${EVAL_CASES.map((c) => c.id).join(', ')}`);
  const concurrency = Math.max(1, Math.min(5, Number(flag('concurrency') ?? 3)));
  const total = cases.length * runsPer * models.length;
  const estimate = cases.length * runsPer * models.reduce((sum, m) => sum + ESTIMATE[m], 0);

  const problems: string[] = [];
  for (const key of ['GUARDRAIL_ID', 'AGENT_GUARDRAIL_ID', 'MODEL_ID_FAST']) if (!env[key]) problems.push(`${key} is not set on the agent (it would use the rule-based backup, not a model)`);
  if (models.includes('strong') && !env.MODEL_ID_STRONG) problems.push('MODEL_ID_STRONG is not set on the agent');
  // Results from an agent older than its source (a stale prompt, tools or model override) would mislead.
  const agentDir = resolve('backend/amplify/functions/agent-runner');
  const newest = Math.max(...readdirSync(agentDir).filter((f) => f.endsWith('.ts')).map((f) => statSync(resolve(agentDir, f)).mtimeMs));
  if (config.LastModified && Date.parse(config.LastModified) < newest) {
    problems.push('the deployed agent is older than its source (backend/amplify/functions/agent-runner): let `npm run sandbox` redeploy first, or the runs would test old code');
  }
  if (env.DEMO_REPLIES !== 'true') problems.push('DEMO_REPLIES is not true: redeploy with `DEMO_REPLIES=true npm run sandbox` so hospitals reply');
  // The sources check needs a knowledge base with documents in it; an unflagged redeploy deletes the stack.
  const requireSources = !has('allow-no-kb');
  if (requireSources) {
    if (!env.KB_ID) {
      problems.push('the agent has no KB_ID: the knowledge base is not deployed (redeploy without MEDORA_ENABLE_KB=false, then `npm run upload-kb`), or pass --allow-no-kb to skip the sources check');
    } else {
      const found = await new BedrockAgentRuntimeClient({ region: REGION })
        .send(new RetrieveCommand({ knowledgeBaseId: env.KB_ID, retrievalQuery: { text: 'stroke neurology CT scanner' }, retrievalConfiguration: { vectorSearchConfiguration: { numberOfResults: 1 } } }))
        .then((r) => (r.retrievalResults ?? []).length)
        .catch(() => -1);
      if (found === 0) problems.push('the knowledge base is empty: run `npm run upload-kb`');
      if (found < 0) problems.push('the knowledge base could not be searched (check KB_ID and the deploy)');
    }
  }

  console.log(`Sandbox API ${apiId} (${REGION}); agent ${functionName}`);
  console.log(`Referring hospital: ${origin.name.en}. Sources check: ${requireSources ? 'on' : 'skipped (--allow-no-kb)'}`);
  console.log(`Plan: ${cases.length} cases x ${runsPer} runs x ${models.map((m) => (m === 'fast' ? 'Nova Lite' : 'Nova Pro')).join(' + ')} = ${total} runs, ${concurrency} at a time`);
  console.log(`Estimated Bedrock cost: about $${estimate.toFixed(2)} (a rough estimate, not a quote)`);
  for (const problem of problems) console.log(`PROBLEM: ${problem}`);
  if (!has('yes')) {
    console.log('\nDry run: no model was called. Add --yes to run.');
    return;
  }
  if (problems.length) throw new Error('Fix the problems above first.');

  const runId = randomUUID().slice(0, 8);
  const created: Record<string, string[]> = { Referral: [], CareRequest: [], TraceStep: [], Transfer: [], Activity: [] };
  const records: RunRecord[] = [];
  let counter = 0;
  mkdirSync(resolve('scripts/.local'), { recursive: true });
  const file = resolve('scripts/.local', `evals-${runId}.json`);
  // Saved after every run, so stopping early still leaves a record of what exists.
  const save = (): void => writeFileSync(file, `${JSON.stringify({ runId, models, runsPer, requireSources, records, created }, null, 2)}\n`);

  async function oneRun(c: EvalCase, model: Model, n: number): Promise<RunRecord> {
    const ownerId = `eval-${runId}-${counter++}`;
    const id = randomUUID();
    const now = new Date().toISOString();
    await db.send(new PutCommand({ TableName: table('Referral'), Item: { id, __typename: 'Referral', createdAt: now, updatedAt: now, fromHospitalId: originId, ownerId, text: c.text, ...(c.onsetMin !== undefined ? { onsetMin: c.onsetMin } : {}), lang: c.lang, status: 'running', mode: 'ai', requestIds: [], startedAtMs: Date.now() } }));
    created.Referral.push(id);
    await lambda.send(new InvokeCommand({ FunctionName: functionName, InvocationType: 'Event', Payload: JSON.stringify({ arguments: { referralId: id }, identity: { sub: ownerId }, evalModel: model }) }));

    // Wait for the run to end, playing the staff the case needs: the nearest hospital states a delay,
    // or a staff note tries to give the agent orders. Everyone else replies through DEMO_REPLIES.
    const answered = new Set<string>();
    const deadline = Date.now() + RUN_TIMEOUT_MS;
    let referral: Row;
    for (;;) {
      await sleep(POLL_MS);
      referral = ((await listBy('Referral', 'ownerId', ownerId))[0] ?? {}) as Row;
      const requests = await listBy('CareRequest', 'referralId', id);
      const waiting = requests.filter((r) => r.status === 'waiting' && !answered.has(String(r.id)));
      const nearest = [...requests].sort((a, b) => Number(a.etaMin) - Number(b.etaMin))[0];
      const note = c.injection ?? c.statedNote;
      for (const request of waiting) {
        const target = c.injection ? answered.size === 0 : request.id === nearest?.id;
        if (!note || !target) continue;
        answered.add(String(request.id));
        await db.send(new UpdateCommand({ TableName: table('CareRequest'), Key: { id: request.id }, UpdateExpression: 'SET #s = :s, #n = :n, #r = :r, #u = :u', ExpressionAttributeNames: { '#s': 'status', '#n': 'note', '#r': 'reason', '#u': 'updatedAt' }, ExpressionAttributeValues: { ':s': 'accepted', ':n': note, ':r': 'eval', ':u': new Date().toISOString() } }));
      }
      if ((referral.status && referral.status !== 'running') || Date.now() > deadline) break;
    }

    const requests = await listBy('CareRequest', 'referralId', id);
    const trace = await listBy('TraceStep', 'referralId', id);
    const transfers = await listBy('Transfer', 'referralId', id);
    created.CareRequest.push(...requests.map((r) => String(r.id)));
    created.TraceStep.push(...trace.map((t) => String(t.id)));
    created.Transfer.push(...transfers.map((t) => String(t.id)));
    const rows = json(referral.rows);
    const sources = trace.filter((t) => t.kind === 'search_knowledge_base').flatMap((t) => [...String((json(t.detail) as { en?: string } | null)?.en ?? '').matchAll(/\(([^()\s]+\.md)\)/g)].map((m) => m[1]));
    const evalRun: EvalRun = {
      referral: { status: referral.status as never, chosenId: referral.chosenId as string | undefined, etaMin: referral.etaMin as number | undefined, pathway: referral.pathway as never, onsetMin: c.onsetMin, elapsedSec: referral.elapsedSec as number | undefined, mode: referral.mode as never },
      rows: Array.isArray(rows) ? (rows as DecisionRow[]) : [],
      capableIds: capableFor(c),
      transferStarted: transfers.length > 0 || referral.status === 'confirmed',
      sources,
      // The loop is capped at 8 model turns in code (MAX_MODEL_TURNS); turns are not stored, so this is not measured.
      turns: 0,
    };
    const result = scoreRun(c, evalRun, { requireSources });
    const record: RunRecord = {
      case: c.id, model, n, pass: result.pass, failed: result.checks.filter((k) => !k.pass).map((k) => k.name),
      backup: trace.some((t) => t.kind === 'backup'), status: String(referral.status ?? 'missing'), chosenId: evalRun.referral.chosenId, elapsedSec: evalRun.referral.elapsedSec, referralId: id,
    };
    console.log(`${record.pass ? 'pass' : 'FAIL'}  ${c.id} ${model} #${n + 1}${record.backup ? '  (rule-based backup ran)' : ''}${record.failed.length ? `  failed: ${record.failed.join(', ')}` : ''}`);
    return record;
  }

  const tasks = models.flatMap((model) => cases.flatMap((c) => Array.from({ length: runsPer }, (_, n) => ({ c, model, n }))));
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < tasks.length) {
        const task = tasks[next++];
        try {
          records.push(await oneRun(task.c, task.model, task.n));
          save();
        } catch (error) {
          console.log(`ERROR ${task.c.id} ${task.model} #${task.n + 1}: ${error instanceof Error ? error.name : 'unknown'}`);
        }
      }
    }),
  );

  // Activity rows have no referral id; find this run's by its owner prefix.
  const activities = await scanAll('Activity', { expression: 'begins_with(#o, :p)', names: { '#o': 'ownerId' }, values: { ':p': `eval-${runId}-` } });
  created.Activity.push(...activities.map((a) => String(a.id)));
  save();

  console.log(`\n${renderTable(cases, models, records)}`);
  console.log(`\nSaved ${file}`);
  console.log(`Paste the table into docs/evals.md. To remove the records this run created: npm run evals -- --cleanup ${file} --yes`);
}

interface RunRecord {
  case: string;
  model: Model;
  n: number;
  pass: boolean;
  failed: EvalCheck['name'][];
  backup: boolean;
  status: string;
  chosenId?: string;
  elapsedSec?: number;
  referralId: string;
}

/** One row per case: passes out of the runs made, with runs that fell back to fixed rules shown apart. */
function renderTable(cases: EvalCase[], models: Model[], records: RunRecord[]): string {
  const cell = (id: string, model: Model): string => {
    const runs = records.filter((r) => r.case === id && r.model === model);
    if (runs.length === 0) return 'not run';
    const modelRuns = runs.filter((r) => !r.backup);
    const passed = modelRuns.filter((r) => r.pass).length;
    const backups = runs.length - modelRuns.length;
    return `${passed} of ${runs.length}${backups ? ` (${backups} used the rule-based backup)` : ''}`;
  };
  const lines = ['| Case | Language | Nova Lite (pass of runs) | Nova Pro (pass of runs) | Common failure |', '| --- | --- | --- | --- | --- |'];
  for (const c of cases) {
    const failures = summarise(records.filter((r) => r.case === c.id && !r.backup).map((r) => ({ pass: r.pass, checks: r.failed.map((name) => ({ name, pass: false })) }))).failures;
    const top = Object.entries(failures).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
    lines.push(`| ${c.id.replace(/-(en|th)$/, '')} | ${c.lang === 'en' ? 'English' : 'Thai'} | ${models.includes('fast') ? cell(c.id, 'fast') : 'not run'} | ${models.includes('strong') ? cell(c.id, 'strong') : 'not run'} | ${top ? `${top[0]} (${top[1]})` : 'none'} |`);
  }
  return lines.join('\n');
}

/**
 * Deletes what evaluation runs created: `--cleanup <results file>` for one run, or `--cleanup all` for every
 * referral owned by an `eval-` user (also finds what an interrupted run left). Children are found from the
 * referral ids, so the file only needs the referral list. Real doctors are Cognito users, never `eval-`.
 * Run by a person, never by an agent. Without --yes it only counts.
 */
async function cleanup(
  target: string,
  table: (model: string) => string,
  db: DynamoDBDocumentClient,
  listBy: (model: string, attribute: string, value: string) => Promise<Row[]>,
  scanAll: (model: string, filter?: { expression: string; names: Record<string, string>; values: Record<string, unknown> }) => Promise<Row[]>,
): Promise<void> {
  const all = target === 'all';
  const saved = all ? null : (JSON.parse(readFileSync(resolve(target), 'utf8')) as { runId?: string; created?: Record<string, string[]> });
  const prefix = all || !saved?.runId ? 'eval-' : `eval-${saved.runId}-`;
  const ownerFilter = { expression: 'begins_with(#o, :p)', names: { '#o': 'ownerId' }, values: { ':p': prefix } };
  const referrals = all || !saved?.created?.Referral ? (await scanAll('Referral', ownerFilter)).map((r) => String(r.id)) : saved.created.Referral;
  const found: Record<string, string[]> = { Referral: referrals, CareRequest: [], TraceStep: [], Transfer: [], Activity: (await scanAll('Activity', ownerFilter)).map((a) => String(a.id)) };
  for (const id of referrals) {
    for (const [model, ids] of [['CareRequest', found.CareRequest], ['TraceStep', found.TraceStep], ['Transfer', found.Transfer]] as const) {
      ids.push(...(await listBy(model, 'referralId', id)).map((row) => String(row.id)));
    }
  }
  console.log(`Evaluation records (owner prefix ${prefix}): ${Object.entries(found).map(([m, ids]) => `${ids.length} ${m}`).join(', ')}`);
  if (!has('yes')) {
    console.log('Dry run: nothing was deleted. Add --yes to delete exactly these records.');
    return;
  }
  for (const [model, ids] of Object.entries(found)) {
    for (const id of ids) await db.send(new DeleteCommand({ TableName: table(model), Key: { id } }));
  }
  console.log('Deleted.');
}

main().catch((error: unknown) => {
  console.error(`Evals failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
