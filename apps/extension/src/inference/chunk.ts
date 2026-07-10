import { countTokens, type Tokenizer } from './tokenizer'

export interface ChunkOptions {
  /** Target tokens per chunk (leaves headroom for the map prompt + output). */
  chunkTokens: number
  /** Hard cap on chunks; beyond it the article is summarized only up to here. */
  maxChunks: number
  /** Units (paragraphs/sentences) carried from the previous chunk to preserve context. */
  overlapUnits?: number
}

export interface ChunkResult {
  chunks: string[]
  /** True when the article exceeded `maxChunks` and was cut. */
  capped: boolean
}

/**
 * Break text into units (paragraphs; a paragraph larger than the budget is split by sentences),
 * so chunk boundaries never fall mid-sentence.
 */
function splitUnits(
  text: string,
  tokenizer: Tokenizer,
  chunkTokens: number
): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  const units: string[] = []
  for (const para of paragraphs) {
    if (countTokens(tokenizer, para) <= chunkTokens) {
      units.push(para)
      continue
    }
    // Oversized paragraph → split into sentences, packing up to the budget.
    let buffer = ''
    for (const sentence of para.split(/(?<=[.!?])\s+/)) {
      const candidate = buffer ? `${buffer} ${sentence}` : sentence
      if (buffer && countTokens(tokenizer, candidate) > chunkTokens) {
        units.push(buffer)
        buffer = sentence
      } else {
        buffer = candidate
      }
    }
    if (buffer) units.push(buffer)
  }
  return units
}

/**
 * Token-accurate chunking with a small overlap. Sized by the model's real tokenizer so each chunk
 * fits a comfortable per-pass budget. Caps at `maxChunks` (returns `capped`).
 */
export function chunkArticle(
  text: string,
  tokenizer: Tokenizer,
  { chunkTokens, maxChunks, overlapUnits = 1 }: ChunkOptions
): ChunkResult {
  const units = splitUnits(text, tokenizer, chunkTokens)

  const chunks: string[] = []
  let current: string[] = []
  let currentTokens = 0

  for (const unit of units) {
    const unitTokens = countTokens(tokenizer, unit)
    if (current.length > 0 && currentTokens + unitTokens > chunkTokens) {
      chunks.push(current.join('\n\n'))
      const overlap = overlapUnits > 0 ? current.slice(-overlapUnits) : []
      current = [...overlap]
      currentTokens = overlap.reduce(
        (sum, u) => sum + countTokens(tokenizer, u),
        0
      )
    }
    current.push(unit)
    currentTokens += unitTokens
  }
  if (current.length > 0) chunks.push(current.join('\n\n'))

  const capped = chunks.length > maxChunks
  return { chunks: capped ? chunks.slice(0, maxChunks) : chunks, capped }
}
