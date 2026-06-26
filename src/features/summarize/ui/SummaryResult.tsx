import { Button } from '@/src/components/ui/button'
import type { Summary } from '@/src/shared/types'
import { Download } from 'lucide-react'
import Markdown from 'react-markdown'
import { summaryToFilename, summaryToMarkdown } from '../markdown'
import type { SummarySource } from '../state'

const MD_CLASS =
  'text-sm leading-relaxed [&_p]:m-0 [&_p+p]:mt-2 [&_a]:text-primary [&_a]:underline ' +
  '[&_strong]:font-semibold [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs ' +
  '[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5'

/** Render a small block of model text as inline markdown. */
function Md({ children }: { children: string }) {
  return (
    <div className={MD_CLASS}>
      <Markdown>{children}</Markdown>
    </div>
  )
}

/** Renders a finished summary, plus the source it belongs to and any drift/format warnings. */
export function SummaryResult({
  summary,
  source,
  truncated,
  stale,
  currentUrl
}: {
  summary: Summary
  source: SummarySource
  truncated: boolean
  stale: boolean
  currentUrl?: string
}) {
  const markdown = summary.parsedOk ? summaryToMarkdown(summary) : summary.raw

  const download = () => {
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = summary.parsedOk ? summaryToFilename(summary) : 'summary.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex animate-in flex-col gap-3 duration-300 fade-in">
      {stale && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
          You’ve switched pages. This summary is for{' '}
          <span className="font-mono break-all">{source.url}</span>
          {currentUrl ? (
            <>
              {' '}
              — you’re now on{' '}
              <span className="font-mono break-all">{currentUrl}</span>
            </>
          ) : null}
          . Summarize this page to refresh.
        </div>
      )}

      {truncated && (
        <div className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          The article was long, so only the beginning was summarized.
        </div>
      )}

      {summary.parsedOk ? (
        <>
          <h2 className="text-[17px] leading-snug font-bold">
            {summary.title}
          </h2>

          <section>
            <h3 className="mb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              TL;DR
            </h3>
            <Md>{summary.tldr}</Md>
          </section>

          {summary.points.length > 0 && (
            <section>
              <h3 className="mb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                Key points
              </h3>
              <div className="flex flex-col gap-3">
                {summary.points.map((point, i) => (
                  <div
                    key={`${point.heading}-${i}`}
                    className="animate-in duration-300 fill-mode-both fade-in slide-in-from-bottom-1"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    {point.heading ? (
                      <div className="text-sm font-semibold">
                        {point.heading}
                      </div>
                    ) : null}
                    {point.detail ? <Md>{point.detail}</Md> : null}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            The model didn’t return the expected format, so here’s its raw
            output.
          </div>
          {/* Raw text verbatim (NOT through markdown — that would strip the literal tags). */}
          <pre className="rounded-lg border border-border bg-muted p-3 font-mono text-xs leading-relaxed wrap-break-word whitespace-pre-wrap">
            {summary.raw}
          </pre>
        </>
      )}

      <footer className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-3">
        <Button variant="outline" size="sm" onClick={download}>
          <Download className="size-4" />
          Download .md
        </Button>
        <span
          className="min-w-0 truncate text-xs text-muted-foreground"
          title={source.url}
        >
          Summary for: {source.title || source.url}
        </span>
      </footer>
    </div>
  )
}
