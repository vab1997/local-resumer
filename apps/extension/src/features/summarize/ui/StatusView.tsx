import { i18n } from '#i18n'
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
          title={i18n.t('checking.title')}
          detail={i18n.t('checking.detail')}
        />
      )

    case 'unsupported':
      return (
        <div className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold text-warning">
            {i18n.t('unsupported.title')}
          </h2>
          <p className="text-sm text-muted-foreground">{state.reason}</p>
          <p className="text-sm text-muted-foreground">
            {i18n.t('unsupported.intro')}
          </p>
          <WebGpuActivationSteps />
          <p className="mt-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {i18n.t('unsupported.cloudHint')}
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
              {i18n.t('downloading.title')}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {i18n.t('downloading.note')}
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200 ease-linear"
              style={{ width: pct !== undefined ? `${pct}%` : '15%' }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {bytes ?? i18n.t('downloading.starting')}
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
          {i18n.t('readyHint')}
        </Badge>
      )

    case 'needs-key':
      return (
        <Badge
          variant="outline"
          className="gap-1.5 py-1 font-normal text-muted-foreground"
        >
          <KeyRound className="size-3.5" />
          {i18n.t('needsKeyHint')}
        </Badge>
      )

    case 'extracting':
      return (
        <Status
          spinner
          title={i18n.t('extracting.title')}
          detail={i18n.t('extracting.detail')}
        />
      )

    case 'summarizing':
      // Cloud streams raw text as it arrives; local reports map/reduce progress + partials.
      return typeof state.streamingText === 'string' ? (
        <CloudStreamingStatus state={state} />
      ) : (
        <LocalProgressStatus state={state} />
      )

    case 'error':
      return (
        <div className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold text-destructive">
            {i18n.t('errorTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">{state.message}</p>
        </div>
      )
  }
}

type SummarizingState = Extract<SummaryState, { status: 'summarizing' }>

/** Cloud run: the provider's answer typing in as raw text (parsed to a clean layout on done). */
function CloudStreamingStatus({ state }: { state: SummarizingState }) {
  const { streamingText, estTokens, estCostUsd } = state
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Spinner />
          <h2 className="text-[15px] font-semibold">
            {i18n.t('summarizing.title')}
          </h2>
        </div>
        {estTokens !== undefined && (
          <span
            className="shrink-0 text-xs text-muted-foreground"
            title={i18n.t('summarizing.estimateTitle')}
          >
            ~{formatTokens(estTokens)}
            {estCostUsd !== undefined
              ? ` · ${estCostUsd === 0 ? i18n.t('cost.free') : `~${formatCost(estCostUsd)}`}`
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
          {i18n.t('summarizing.waitingProvider')}
        </p>
      )}
    </div>
  )
}

/** Local run: map/reduce progress bar + streamed per-chunk notes. */
function LocalProgressStatus({ state }: { state: SummarizingState }) {
  const { phase, done, total, partials } = state
  const hasProgress = typeof total === 'number' && total > 0
  const pct = hasProgress ? Math.round(((done ?? 0) / total) * 100) : undefined
  const title =
    phase === 'reduce'
      ? i18n.t('summarizing.combining')
      : hasProgress
        ? i18n.t('summarizing.title')
        : i18n.t('summarizing.short')
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
            {phase === 'reduce'
              ? i18n.t('summarizing.combiningLabel')
              : i18n.t('summarizing.chunk')}{' '}
            {done ?? 0} / {total}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {i18n.t('summarizing.runningLocal')}
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
      aria-label={i18n.t('loading')}
    />
  )
}
