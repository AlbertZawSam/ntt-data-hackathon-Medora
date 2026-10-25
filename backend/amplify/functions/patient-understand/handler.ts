import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { AppSyncResolverHandler } from 'aws-lambda';
import { cleanDescription, looksLikeInjection, parseUnderstanding, safetyGate, understandByRules, type UnderstandResult } from '@medora/shared/logic/understand';
import { descriptionMessage, UNDERSTAND_SYSTEM_PROMPT } from './prompt';

interface Args {
  text: string;
  lang?: string | null;
}

const bedrock = new BedrockRuntimeClient({});

/**
 * One Nova Lite turn with the guardrail. Returns null (the caller then uses the keyword rules) when
 * the model isn't configured, fails, is blocked by the guardrail or answers in the wrong shape.
 */
async function understandWithModel(description: string): Promise<UnderstandResult | null> {
  const modelId = process.env.MODEL_ID_FAST;
  const guardrailId = process.env.GUARDRAIL_ID;
  // Guardrails on every model call (AGENTS.md 4b.7): no guardrail, no model.
  if (!modelId || !guardrailId) return null;
  try {
    const response = await bedrock.send(
      new ConverseCommand({
        modelId,
        system: [{ text: UNDERSTAND_SYSTEM_PROMPT }],
        messages: [{ role: 'user', content: [{ text: descriptionMessage(description) }] }],
        // Greedy decoding: the same description always gets the same answer.
        inferenceConfig: { maxTokens: 300, temperature: 0 },
        additionalModelRequestFields: { inferenceConfig: { topK: 1 } },
        guardrailConfig: { guardrailIdentifier: guardrailId, guardrailVersion: process.env.GUARDRAIL_VERSION ?? 'DRAFT', trace: 'disabled' },
      }),
    );
    if (response.stopReason === 'guardrail_intervened') {
      console.warn('patient-understand: guardrail intervened');
      // Blocked as a prompt attack: not a description, so the app asks again (hospitals stay one tap away).
      return { emergency: false, need: 'general', source: 'ai', unclear: true };
    }
    const text = (response.output?.message?.content ?? []).map((block) => ('text' in block && typeof block.text === 'string' ? block.text : '')).join('');
    const parsed = parseUnderstanding(text);
    if (!parsed) console.warn('patient-understand: model answer had the wrong shape');
    return parsed;
  } catch (error) {
    // Error names only: messages can echo the input.
    console.warn(`patient-understand: model unavailable (${error instanceof Error ? error.name : 'unknown'})`);
    return null;
  }
}

/**
 * `understandNeed` query. Order matters: the fixed red-flag rules run first and an emergency never
 * reaches the model. Logs only outcomes, never the description (AGENTS.md 4b.5).
 */
export const handler: AppSyncResolverHandler<Args, UnderstandResult> = async (event) => {
  const description = cleanDescription(event.arguments.text);
  let result: UnderstandResult;
  if (!description) {
    result = understandByRules('');
  } else {
    // Red flags first, then text that tries to instruct the AI (fixed rules, no model call), then the model.
    result = safetyGate(description) ?? (looksLikeInjection(description) ? understandByRules(description) : null) ?? (await understandWithModel(description)) ?? understandByRules(description);
  }
  console.info(result.emergency ? `patient-understand: red flag ${result.flag}` : `patient-understand: need=${result.need} source=${result.source}`);
  // AppSync serialises the object for the AWSJSON return type; returning a string would encode it twice.
  return result;
};
