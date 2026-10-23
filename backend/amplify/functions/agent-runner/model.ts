/**
 * Which Bedrock model the referral agent uses (AGENTS.md 4a): Nova Lite while developing, Nova Pro on the
 * demo stage. The ids come from the environment, never from code. `override` lets the evaluation runner
 * (scripts/run-evals.ts) compare both models; it can only arrive in a direct Lambda invoke, because
 * AppSync forwards just the arguments the schema defines.
 */
export type ModelChoice = 'fast' | 'strong';

export function pickModel(env: Record<string, string | undefined>, override?: unknown): string | undefined {
  // No guardrails, no model: the run takes the rule-based backup path.
  if (!env.GUARDRAIL_ID || !env.AGENT_GUARDRAIL_ID) return undefined;
  const choice: ModelChoice = override === 'fast' || override === 'strong' ? override : env.AWS_BRANCH === 'demo' ? 'strong' : 'fast';
  return choice === 'strong' ? (env.MODEL_ID_STRONG ?? env.MODEL_ID_FAST) : env.MODEL_ID_FAST;
}
