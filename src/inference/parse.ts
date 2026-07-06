import type { Summary, SummaryPoint } from '@/src/shared/types'

const MAX_POINTS = 12

/** A bullet line: `-`/`*`/`•` marker, then the rest of the line. */
const BULLET_RE = /^\s*[-*•]\s+(.*)$/

/**
 * Split one bullet's text into heading + detail. The schema is `**heading** — detail`, but weak
 * models drift: tolerate `–`, `-` or `:` as the separator (with or without surrounding spaces),
 * and a missing bold heading (the whole line becomes the detail).
 */
function splitPoint(text: string): SummaryPoint | null {
  const bold = text.match(/^\*\*(.+?)\*\*\s*(?:[—–:]|-)?\s*(.*)$/)
  if (bold) {
    const heading = bold[1].trim()
    const detail = bold[2].trim()
    if (!heading && !detail) return null
    return { heading, detail }
  }
  const plain = text.trim()
  if (!plain) return null
  return { heading: '', detail: plain }
}

/**
 * Collect the unique key points from the bullet list, deduped and capped. Continuation lines
 * (indented text under a bullet) are folded into the previous point's detail. Dedupe collapses
 * the repeated-output failure mode seen on small models; the cap bounds the result.
 */
function extractPoints(lines: string[], firstBullet: number): SummaryPoint[] {
  const points: SummaryPoint[] = []
  const seen = new Set<string>()

  for (let i = firstBullet; i < lines.length; i++) {
    const line = lines[i]
    const bullet = line.match(BULLET_RE)
    if (bullet) {
      const point = splitPoint(bullet[1])
      if (!point) continue
      const key = `${point.heading}|${point.detail}`.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      points.push(point)
      if (points.length >= MAX_POINTS) break
    } else if (line.trim() && points.length > 0) {
      // Wrapped detail continuation under the last bullet.
      const last = points[points.length - 1]
      last.detail = `${last.detail} ${line.trim()}`.trim()
    }
  }
  return points
}

/** Strip a leading `#`-heading marker (or surrounding bold) from a title line. */
function cleanTitle(line: string): string {
  return line
    .replace(/^#{1,3}\s+/, '')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .trim()
}

/**
 * Parse the model's Markdown output into a Summary. Expected shape: a `# title` heading, a TL;DR
 * paragraph, then a `- **heading** — detail` bullet list. Small models sometimes break format, so
 * a missing title/TL;DR never yields a blank panel: we fall back to showing the raw output and
 * flag it. Points are best-effort — a clean title + TL;DR with no points still renders.
 */
export function parseSummary(raw: string): Summary {
  // Safety net for reasoning models (e.g. SmolLM3): even with thinking disabled, a stray
  // <think>…</think> block can slip in before the output. Drop it so it never pollutes parsing.
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const lines = cleaned.split('\n')

  // Title: the first `#` heading; failing that, the first non-empty non-bullet line.
  let titleIdx = lines.findIndex((l) => /^#{1,3}\s+\S/.test(l))
  let title = ''
  if (titleIdx >= 0) {
    title = cleanTitle(lines[titleIdx])
  } else {
    titleIdx = lines.findIndex((l) => l.trim() && !BULLET_RE.test(l))
    if (titleIdx >= 0) title = cleanTitle(lines[titleIdx])
  }

  // TL;DR: the paragraph lines between the title and the first bullet.
  const firstBullet = lines.findIndex(
    (l, i) => i > titleIdx && BULLET_RE.test(l)
  )
  const tldrEnd = firstBullet >= 0 ? firstBullet : lines.length
  const tldr = lines
    .slice(titleIdx + 1, tldrEnd)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')

  const points = firstBullet >= 0 ? extractPoints(lines, firstBullet) : []

  if (title && tldr) {
    return { title, tldr, points, raw: cleaned, parsedOk: true }
  }

  return {
    title,
    tldr,
    points,
    raw: cleaned,
    parsedOk: false
  }
}
