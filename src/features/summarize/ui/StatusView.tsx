import { Badge } from '@/src/components/ui/badge'
import { FileText } from 'lucide-react'
import { formatBytes } from '../format'
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

    case 'extracting':
      return (
        <Status
          spinner
          title="Reading the article…"
          detail="Extracting the main content."
        />
      )

    case 'summarizing':
      return (
        <Status
          spinner
          title="Summarizing…"
          detail="Running the model locally on your GPU."
        />
      )

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
