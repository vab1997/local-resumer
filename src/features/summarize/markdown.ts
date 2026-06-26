import type { Summary } from '@/src/shared/types'

/**
 * Build the canonical Markdown document for a summary — the single source of truth for both the
 * rendered panel and the downloaded .md file, so they never diverge.
 */
export function summaryToMarkdown(summary: Summary): string {
  const lines: string[] = [`# ${summary.title}`, '', '## TL;DR', summary.tldr]

  if (summary.points.length > 0) {
    lines.push('', '## Key points')
    for (const point of summary.points) {
      if (point.heading) lines.push('', `### ${point.heading}`)
      if (point.detail)
        lines.push(point.heading ? point.detail : `- ${point.detail}`)
    }
  }

  return lines.join('\n') + '\n'
}

/** Slugified `{title}.md` filename for the download. */
export function summaryToFilename(summary: Summary): string {
  const slug = summary.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'summary'}.md`
}
