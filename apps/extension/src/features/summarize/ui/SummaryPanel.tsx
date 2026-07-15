import { i18n } from '#i18n'
import { Button } from '@/src/components/ui/button'
import { TooltipProvider } from '@/src/components/ui/tooltip'
import { assessFeasibility } from '@/src/inference/hardware'
import { cn } from '@/src/lib/utils'
import {
  getModelSpec,
  isCloudModel,
  isLocalModel,
  type CloudProvider
} from '@/src/shared/models'
import { AlertTriangle, ArrowLeftRight, Download, Sparkles } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { deriveEntryState } from '../entry-state'
import { formatModelSize } from '../format'
import { useDownloadedModelIds } from '../model-cache'
import { canSummarize, isBusy, type SummaryState } from '../state'
import { useActiveTabUrl } from '../useActiveTabUrl'
import { useHardwareProfile } from '../useHardwareProfile'
import { useModelSelection } from '../useModelSelection'
import { useProviderApiKey } from '../useProviderSettings'
import { useSummarize } from '../useSummarize'
import { CloudKeyPanel } from './CloudKeyPanel'
import { HardwareInfoBar } from './HardwareInfoBar'
import { ModelCard } from './ModelCard'
import { ModelChooser } from './ModelChooser'
import { StatusView } from './StatusView'
import { SummaryResultSkeleton } from './SummaryResultSkeleton'

// Defer the result view (and its react-markdown dependency) until a summary exists, keeping it
// out of the panel's initial bundle.
const SummaryResult = lazy(() =>
  import('./SummaryResult').then((m) => ({ default: m.SummaryResult }))
)

/** The provider whose API key the panel must resolve, from the raw tri-state selection. */
function cloudProviderOf(
  id: string | null | undefined
): CloudProvider | undefined {
  if (typeof id !== 'string') return undefined
  const spec = getModelSpec(id)
  return isCloudModel(spec) ? spec.provider : undefined
}

/** Colour of the header status dot, derived from the current state. */
function dotClass(status: SummaryState['status']): string {
  if (status === 'unsupported') return 'bg-destructive'
  if (status === 'checking-backend' || status === 'downloading')
    return 'bg-warning animate-pulse'
  if (status === 'needs-download') return 'bg-warning'
  return 'bg-primary'
}

/** Short live status word for the header. */
function statusLabel(status: SummaryState['status']): string {
  switch (status) {
    case 'checking-backend':
      return i18n.t('status.checking')
    case 'downloading':
      return i18n.t('status.downloading')
    case 'ready':
      return i18n.t('status.ready')
    case 'needs-download':
      return i18n.t('status.needsDownload')
    // (chooser has no SummaryState — the header special-cases it before reaching here)
    case 'needs-key':
      return i18n.t('status.needsKey')
    case 'extracting':
      return i18n.t('status.extracting')
    case 'summarizing':
      return i18n.t('status.summarizing')
    case 'done':
      return i18n.t('status.ready')
    case 'error':
      return i18n.t('status.error')
    case 'unsupported':
      return i18n.t('status.unsupported')
  }
}

/** Root side-panel view: a slim header (what's running), the state-driven body, and the action. */
export function SummaryPanel() {
  const { selectedModelId, setSelectedModelId } = useModelSelection()
  const hardware = useHardwareProfile()
  const downloadedIds = useDownloadedModelIds()

  // Entry routing (v13): once selection + cache check + hardware have all resolved, the pure
  // entry-state module decides chooser vs panel and whether to adopt a downloaded model as the
  // implicit selection (migration). Until then, render a neutral loading shell — deciding on
  // partial inputs would flash the wrong view at the user.
  const entryReady =
    selectedModelId !== undefined &&
    downloadedIds !== undefined &&
    hardware !== undefined
  const { apiKey, setApiKey, clearApiKey } = useProviderApiKey(
    cloudProviderOf(selectedModelId)
  )
  const entry = entryReady
    ? deriveEntryState({
        selectedModelId: selectedModelId ?? undefined,
        downloadedModelIds: downloadedIds,
        hasWebGpu: hardware.webgpu,
        hasApiKey: !!apiKey
      })
    : undefined
  const adoptModelId = entry?.adoptModelId
  useEffect(() => {
    if (adoptModelId) setSelectedModelId(adoptModelId)
  }, [adoptModelId, setSelectedModelId])
  // Only the chooser/adoption outputs are consumed here — the local/cloud view kinds are
  // re-derived live by the backend hooks (which also track mid-session transitions the pure
  // module can't see). They still document + test the full routing table.
  // The chooser also reopens on demand ("Change model or provider", ticket 05) — same view,
  // with the active model marked.
  const [chooserOpen, setChooserOpen] = useState(false)
  const showChooser = entry?.view.kind === 'chooser' || chooserOpen
  // The normal body needs a concrete selection; during the one-render adoption gap keep loading.
  const showPanel = !showChooser && typeof selectedModelId === 'string'

  // The backends follow the SELECTION, not the visible view: while the reopened chooser
  // overlays the panel the selection is unchanged, so the loaded worker (and a done summary)
  // must survive — picking the current model again just closes the overlay, no VRAM reload.
  const activeModelId =
    typeof selectedModelId === 'string' ? selectedModelId : undefined
  const activeSpec = getModelSpec(activeModelId ?? '')
  const cloud = isCloudModel(activeSpec) ? activeSpec : undefined
  // Tri-state on purpose: undefined while the cache check runs, so the backend holds the
  // neutral spinner instead of flashing the download CTA at a user who has the model.
  const downloaded =
    activeModelId && isLocalModel(activeSpec)
      ? downloadedIds?.has(activeSpec.id)
      : undefined
  const selectedFeas =
    showPanel && hardware && isLocalModel(activeSpec)
      ? assessFeasibility(activeSpec, hardware)
      : undefined
  const {
    state,
    summarize,
    cancel,
    requestDownload,
    cancelDownload,
    modelSizeBytes
  } = useSummarize(activeModelId, apiKey, downloaded)
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
              showChooser ? 'bg-primary' : dotClass(state.status)
            )}
          />
          <span className="text-sm font-medium">
            {showChooser
              ? i18n.t('status.chooseModel')
              : statusLabel(state.status)}
          </span>
        </header>

        <main className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {showChooser && entryReady ? (
            // First run (or nothing usable selected): the chooser IS the panel (v13). Reopened
            // on demand it additionally marks the active model.
            <ModelChooser
              hardware={hardware}
              downloadedIds={downloadedIds}
              currentModelId={
                chooserOpen ? (selectedModelId ?? undefined) : undefined
              }
              onSelect={(id) => {
                setSelectedModelId(id)
                setChooserOpen(false)
              }}
            />
          ) : !showPanel ? (
            // Selection / cache check / hardware still resolving (or a one-render adoption gap).
            <StatusView state={{ status: 'checking-backend' }} />
          ) : (
            <>
              {/* Hardware bar is local-only (cloud doesn't run on the GPU). */}
              {!cloud && <HardwareInfoBar hardware={hardware} />}
              {/* The chooser is the single selection entry (v13 — the dropdown selector is
                  gone). No swap mid-run/mid-download: same rule that locked the dropdown. */}
              <Button
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={() => setChooserOpen(true)}
              >
                <ArrowLeftRight className="size-4" />
                {i18n.t('chooser.change')}
              </Button>
              {cloud && (
                <CloudKeyPanel
                  provider={cloud.provider}
                  hasKey={!!apiKey}
                  disabled={busy}
                  onSave={(value) => void setApiKey(value)}
                  onClear={() => void clearApiKey()}
                />
              )}
              <ModelCard
                spec={activeSpec}
                modelSizeBytes={modelSizeBytes}
                downloaded={downloaded}
              />
              {/* Memory-feasibility warning, relocated from the deleted dropdown selector. */}
              {selectedFeas &&
                (selectedFeas.tier === 'risky' ||
                  selectedFeas.tier === 'too-heavy') && (
                  <p className="flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="mt-px size-3.5 shrink-0" />
                    <span>
                      {i18n.t('selector.memoryWarning', [selectedFeas.reason])}
                    </span>
                  </p>
                )}

              {/* Keyed on status so each state crossfades in on change (not on every progress tick). */}
              <div
                key={state.status}
                className="animate-in duration-200 fade-in"
              >
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
                  <StatusView state={state} cacheLoad={downloaded === true} />
                )}
              </div>
            </>
          )}
        </main>

        {state.status !== 'unsupported' && (
          <footer className="border-t border-border p-3">
            {showChooser || !showPanel ? (
              // Chooser / loading shell: the primary action exists but nothing is runnable yet.
              <Button className="w-full" disabled>
                <Sparkles className="size-4" />
                {i18n.t('footer.summarize')}
              </Button>
            ) : state.status === 'summarizing' ? (
              <Button variant="outline" className="w-full" onClick={cancel}>
                {i18n.t('footer.cancel')}
              </Button>
            ) : state.status === 'needs-download' ? (
              // v13: the model is chosen but not downloaded — the primary action IS the
              // download (with its size up front), never an implicit fetch.
              <Button className="w-full" onClick={requestDownload}>
                <Download className="size-4" />
                {i18n.t('footer.download', [
                  formatModelSize(activeSpec, modelSizeBytes) ?? ''
                ])}
              </Button>
            ) : state.status === 'downloading' && downloaded !== true ? (
              // Cancellable only for a real network download — `downloading` also covers the
              // VRAM load of an already-cached model, where cancelling is a no-op.
              <Button
                variant="outline"
                className="w-full"
                onClick={cancelDownload}
              >
                {i18n.t('footer.cancelDownload')}
              </Button>
            ) : (
              <Button
                className="w-full"
                onClick={() => void summarize()}
                disabled={busy || !canSummarize(state)}
              >
                {!busy && <Sparkles className="size-4" />}
                {busy
                  ? i18n.t('footer.working')
                  : state.status === 'done' && !isStale
                    ? i18n.t('footer.summarizeAgain')
                    : i18n.t('footer.summarize')}
              </Button>
            )}
          </footer>
        )}
      </div>
    </TooltipProvider>
  )
}
