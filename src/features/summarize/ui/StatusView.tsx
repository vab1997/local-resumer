import { Badge } from '@/src/components/ui/badge'
import { FileText, KeyRound } from 'lucide-react'
import { formatBytes, formatCost, formatTokens } from '../format'
import type { SummaryState } from '../state'
import { WebGpuActivationSteps } from './WebGpuInfo'

/** Renders the non-result states with clear, specific copy for each. */
export function StatusView({
  state
}: {
  state: Exclude<SummaryState, { status: 'done' }>
}) {
  switch (state.status) {
    case 'checking-backend':
      return (
        <Status
          spinner
          title="Checking your device…"
          detail="Verifying WebGPU support."
        />
      )

    case 'unsupported':
      return (
        <div className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold text-warning">
            Device not supported yet
          </h2>
          <p className="text-sm text-muted-foreground">{state.reason}</p>
          <p className="text-sm text-muted-foreground">
            Local Resumer runs the model on your GPU via WebGPU. To enable it:
          </p>
          <WebGpuActivationSteps />
          <p className="mt-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            No WebGPU? Pick a <span className="font-medium">Cloud</span> model
            above — those run on a provider with your API key and don&rsquo;t
            need WebGPU (the article text is sent to the provider).
          </p>
        </div>
      )

    case 'downloading': {
      const pct =
        typeof state.progress === 'number'
          ? Math.min(100, Math.round(state.progress))
          : undefined
      const bytes =
        state.loadedBytes !== undefined && state.totalBytes !== undefined
          ? `${formatBytes(state.loadedBytes)} / ${formatBytes(state.totalBytes)}`
          : undefined
      return (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Spinner />
            <h2 className="text-[15px] font-semibold">
              Downloading the model…
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            First run only — cached for next time.
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200 ease-linear"
              style={{ width: pct !== undefined ? `${pct}%` : '15%' }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {bytes ?? 'Starting…'}
            {pct !== undefined ? ` · ${pct}%` : ''}
          </p>
        </div>
      )
    }

    case 'ready':
      return (
        <Badge
          variant="outline"
          className="gap-1.5 py-1 font-normal text-muted-foreground"
        >
          <FileText className="size-3.5" />
          Open an article, then summarize it.
        </Badge>
      )

    case 'needs-key':
      return (
        <Badge
          variant="outline"
          className="gap-1.5 py-1 font-normal text-muted-foreground"
        >
          <KeyRound className="size-3.5" />
          Add your API key above to use this model.
        </Badge>
      )

    case 'extracting':
      return (
        <Status
          spinner
          title="Reading the article…"
          detail="Extracting the main content."
        />
      )

    case 'summarizing': {
      const { phase, done, total, partials, streamingText } = state
      // Cloud streaming: show the answer typing in as raw text (parsed to a clean layout on done).
      if (typeof streamingText === 'string') {
        const { estTokens, estCostUsd } = state
        return (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Spinner />
                <h2 className="text-[15px] font-semibold">
                  Summarizing the article…
                </h2>
              </div>
              {estTokens !== undefined && (
                <span
                  className="shrink-0 text-xs text-muted-foreground"
                  title="Estimated for this run — cancel below if it's too much. Actual shows on completion."
                >
                  ~{formatTokens(estTokens)}
                  {estCostUsd !== undefined
                    ? ` · ~${formatCost(estCostUsd)}`
                    : ''}
                </span>
              )}
            </div>
            {streamingText ? (
              <pre className="rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed wrap-break-word whitespace-pre-wrap text-muted-foreground">
                {streamingText}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">
                Waiting for the provider…
              </p>
            )}
          </div>
        )
      }
      const hasProgress = typeof total === 'number' && total > 0
      const pct = hasProgress
        ? Math.round(((done ?? 0) / total) * 100)
        : undefined
      const title =
        phase === 'reduce'
          ? 'Combining the summary…'
          : hasProgress
            ? 'Summarizing the article…'
            : 'Summarizing…'
      return (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Spinner />
            <h2 className="text-[15px] font-semibold">{title}</h2>
          </div>
          {hasProgress ? (
            <>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200 ease-linear"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {phase === 'reduce' ? 'Combining' : 'Chunk'} {done ?? 0} /{' '}
                {total}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Running the model locally on your GPU.
            </p>
          )}
          {partials && partials.length > 0 ? (
            <div className="flex flex-col gap-2">
              {partials.map((notes, i) => (
                <div
                  key={i}
                  className="animate-in rounded-md border border-border bg-muted/40 p-2 text-xs whitespace-pre-wrap text-muted-foreground duration-300 fill-mode-both fade-in slide-in-from-bottom-1"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  {notes}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )
    }

    case 'error':
      return (
        <div className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold text-destructive">
            Something went wrong
          </h2>
          <p className="text-sm text-muted-foreground">{state.message}</p>
        </div>
      )
  }
}

function Status({
  title,
  detail,
  spinner
}: {
  title: string
  detail: string
  spinner?: boolean
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      {spinner && <Spinner />}
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{detail}</p>
    </div>
  )
}

function Spinner() {
  return (
    <div
      className="size-5 animate-spin rounded-full border-2 border-border border-t-primary"
      aria-label="loading"
    />
  )
}
