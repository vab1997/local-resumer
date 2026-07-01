import { Button } from '@/src/components/ui/button'
import { TooltipProvider } from '@/src/components/ui/tooltip'
import { cn } from '@/src/lib/utils'
import { getModelSpec, isCloudModel } from '@/src/shared/models'
import { Sparkles } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { canSummarize, isBusy, type SummaryState } from '../state'
import { useActiveTabUrl } from '../useActiveTabUrl'
import { useHardwareProfile } from '../useHardwareProfile'
import { useCachedModelIds, useModelSelection } from '../useModelSelection'
import { useProviderApiKey } from '../useProviderSettings'
import { useSummarize } from '../useSummarize'
import { CloudKeyPanel } from './CloudKeyPanel'
import { HardwareInfoBar } from './HardwareInfoBar'
import { ModelCard } from './ModelCard'
import { ModelSelector } from './ModelSelector'
import { StatusView } from './StatusView'
import { SummaryResultSkeleton } from './SummaryResultSkeleton'

// Defer the result view (and its react-markdown dependency) until a summary exists, keeping it
// out of the panel's initial bundle.
const SummaryResult = lazy(() =>
  import('./SummaryResult').then((m) => ({ default: m.SummaryResult }))
)

/** Colour of the header status dot, derived from the current state. */
function dotClass(status: SummaryState['status']): string {
  if (status === 'unsupported') return 'bg-destructive'
  if (status === 'checking-backend' || status === 'downloading')
    return 'bg-warning animate-pulse'
  return 'bg-primary'
}

/** Short live status word for the header. */
function statusLabel(status: SummaryState['status']): string {
  switch (status) {
    case 'checking-backend':
      return 'Checking device…'
    case 'downloading':
      return 'Downloading model…'
    case 'ready':
      return 'Ready'
    case 'needs-key':
      return 'API key needed'
    case 'extracting':
      return 'Reading article…'
    case 'summarizing':
      return 'Summarizing…'
    case 'done':
      return 'Ready'
    case 'error':
      return 'Error'
    case 'unsupported':
      return 'Not supported'
  }
}

/** Root side-panel view: a slim header (what's running), the state-driven body, and the action. */
export function SummaryPanel() {
  const { selectedModelId, setSelectedModelId } = useModelSelection()
  const hardware = useHardwareProfile()
  const cachedIds = useCachedModelIds()
  const activeSpec = getModelSpec(selectedModelId ?? '')
  const cloud = isCloudModel(activeSpec) ? activeSpec : undefined
  const { apiKey, setApiKey, clearApiKey } = useProviderApiKey(cloud?.provider)
  const { state, summarize, cancel, modelSizeBytes } = useSummarize(
    selectedModelId,
    apiKey
  )
  const activeUrl = useActiveTabUrl()

  const isStale =
    state.status === 'done' &&
    activeUrl !== undefined &&
    activeUrl !== state.source.url
  const busy = isBusy(state)

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              dotClass(state.status)
            )}
          />
          <span className="text-sm font-medium">
            {statusLabel(state.status)}
          </span>
        </header>

        <main className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {/* Hardware bar is local-only (cloud doesn't run on the GPU). Model selection always shows. */}
          {!cloud && <HardwareInfoBar hardware={hardware} />}
          <ModelSelector
            selectedModelId={selectedModelId ?? activeSpec.id}
            onSelect={setSelectedModelId}
            hardware={hardware}
            cachedIds={cachedIds}
            disabled={busy}
          />
          {cloud && (
            <CloudKeyPanel
              provider={cloud.provider}
              hasKey={!!apiKey}
              disabled={busy}
              onSave={(value) => void setApiKey(value)}
              onClear={() => void clearApiKey()}
            />
          )}
          <ModelCard spec={activeSpec} modelSizeBytes={modelSizeBytes} />

          {/* Keyed on status so each state crossfades in on change (not on every progress tick). */}
          <div key={state.status} className="animate-in duration-200 fade-in">
            {state.status === 'done' ? (
              <Suspense fallback={<SummaryResultSkeleton />}>
                <SummaryResult
                  summary={state.summary}
                  source={state.source}
                  capped={state.capped}
                  elapsedMs={state.elapsedMs}
                  tokens={state.tokens}
                  costUsd={state.costUsd}
                  stale={isStale}
                  currentUrl={activeUrl}
                />
              </Suspense>
            ) : (
              <StatusView state={state} />
            )}
          </div>
        </main>

        {state.status !== 'unsupported' && (
          <footer className="border-t border-border p-3">
            {state.status === 'summarizing' ? (
              <Button variant="outline" className="w-full" onClick={cancel}>
                Cancel
              </Button>
            ) : (
              <Button
                className="w-full"
                onClick={() => void summarize()}
                disabled={busy || !canSummarize(state)}
              >
                {!busy && <Sparkles className="size-4" />}
                {busy
                  ? 'Working…'
                  : state.status === 'done' && !isStale
                    ? 'Summarize again'
                    : 'Summarize this page'}
              </Button>
            )}
          </footer>
        )}
      </div>
    </TooltipProvider>
  )
}
