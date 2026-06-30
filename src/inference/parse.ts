import type { Summary, SummaryPoint } from '@/src/shared/types'

const MAX_POINTS = 12

/** Pull the inner text of the first <tag>...</tag> occurrence, case-insensitive. */
function extractTag(raw: string, tag: string): string | null {
  const match = raw.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  return match ? match[1].trim() : null
}

/**
 * The TL;DR, with any leaked point tags stripped. A weak model sometimes spills `<points>` /
 * `<point>` into the <result> body; cut the result at the first such tag so the TL;DR stays clean.
 */
function cleanResult(result: string): string {
  const tagStart = result.search(/<\/?points?\b/i)
  return (tagStart >= 0 ? result.slice(0, tagStart) : result).trim()
}

/**
 * Collect the unique key points from across the whole output, deduped and capped. Scanning all
 * <point> tags (rather than one <points> block) is robust to the failures seen on the 1B: the
 * block gets repeated, and sometimes a stray <points> leaks into <result>. Dedupe collapses the
 * repeats; the cap bounds the result.
 */
function extractPoints(raw: string): SummaryPoint[] {
  const points: SummaryPoint[] = []
  const seen = new Set<string>()
  for (const match of raw.matchAll(/<point[^>]*>([\s\S]*?)<\/point>/gi)) {
    const inner = match[1]
    const heading = extractTag(inner, 'heading') ?? ''
    const detail = extractTag(inner, 'detail') ?? ''
    if (!heading && !detail) continue

    const key = `${heading}|${detail}`.toLowerCase()
    if (seen.has(key)) continue // drop repeated points
    seen.add(key)

    points.push({ heading, detail })
    if (points.length >= MAX_POINTS) break
  }
  return points
}

/**
 * Parse the model's XML output into a Summary. A 1B model will sometimes break format, so a
 * missing title/result never yields a blank panel: we fall back to showing the raw output and
 * flag it. Points are best-effort — a clean title + TL;DR with no points still renders.
 */
export function parseSummary(raw: string): Summary {
  // Safety net for reasoning models (e.g. SmolLM3): even with thinking disabled, a stray
  // <think>…</think> block can slip in before the schema. Drop it so it never pollutes parsing.
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const title = extractTag(cleaned, 'title')
  const tldr = extractTag(cleaned, 'result')
  // Scan for points OUTSIDE the result block, so a stray point leaked into <result> can't
  // pollute them (the real points block lives after </result>).
  const points = extractPoints(
    cleaned.replace(/<result[^>]*>[\s\S]*?<\/result>/i, '')
  )

  if (title && tldr) {
    return {
      title,
      tldr: cleanResult(tldr),
      points,
      raw: cleaned,
      parsedOk: true
    }
  }

  return {
    title: title ?? '',
    tldr: tldr ? cleanResult(tldr) : '',
    points,
    raw: cleaned,
    parsedOk: false
  }
}
