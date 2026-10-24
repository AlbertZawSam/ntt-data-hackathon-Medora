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

/** How many times a turn with no tool call is answered with a reminder before the run is handed to the fixed rules. */
export const MAX_NUDGES = 2;

/**
 * A fixed reminder, never built from patient or staff text. Nova Lite sometimes ends a turn with words only
 * (for example right after the knowledge base search); this keeps the run going without inventing anything.
 */
export const NUDGE_TEXT =
  'Continue by calling a tool: ask_hospitals for the hospitals assess_case returned as able to help, then recommend or report_no_placement once hospitals have replied.';

/** What the loop does after a turn: carry on with the tool results, remind the model, or stop and use the fixed rules. */
export function afterTurn(turn: { toolResults: number; nudges: number }): 'go-on' | 'nudge' | 'stop' {
  if (turn.toolResults > 0) return 'go-on';
  return turn.nudges < MAX_NUDGES ? 'nudge' : 'stop';
}
