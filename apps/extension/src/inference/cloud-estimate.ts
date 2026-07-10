/**
 * Cheap, SDK-free cost estimation for cloud runs.
 *
 * Split out from `cloud.ts` so the estimate path stays in the eager panel bundle while the
 * SDK-heavy `CloudBackend` (which pulls the Vercel AI SDK) is dynamically imported only when a
 * cloud run actually starts. These are pure functions — no network, no tokenizer, no SDK.
 */
import type { CloudModelSpec } from '@/src/shared/models'

/** Rough token estimate (~4 chars/token) for the pre-run cost hint — no tokenizer download. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

/** USD cost from token counts and a model's list prices. */
export function estimateCost(
  spec: CloudModelSpec,
  inputTokens: number,
  outputTokens: number
): number {
  return (
    (inputTokens / 1_000_000) * spec.inputCostPer1M +
    (outputTokens / 1_000_000) * spec.outputCostPer1M
  )
}
