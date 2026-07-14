/**
 * First-open model chooser (v13, approved prototype "variante C — selector como puerta").
 *
 * Replaces the panel body while no model is selected: three groups in a FIXED order —
 * on-device (private, free, one-time download) → OpenRouter (free models, free key) → paid
 * cloud (fastest, your key) — one "Recommended" per group. Picking a row persists the
 * selection and drops the user into the normal panel flow (local → needs-download CTA,
 * cloud → API-key panel). Without WebGPU the on-device group stays visible but disabled,
 * with cloud fully usable.
 */
import { i18n } from '#i18n'
import { Badge } from '@/src/components/ui/badge'
import { Button } from '@/src/components/ui/button'
import {
  assessFeasibility,
  type HardwareProfile
} from '@/src/inference/hardware'
import {
  CLOUD_MODELS,
  CLOUD_PROVIDER_LABEL,
  isFreeModel,
  LOCAL_MODELS,
  type CloudModelSpec,
  type LocalModelSpec
} from '@/src/shared/models'

/** "Current" (reopened chooser) or "Recommended" — same treatment, current wins. */
function HighlightBadge({ current }: { current: boolean }) {
  return (
    <Badge variant="outline" className="border-primary/40 text-primary">
      {i18n.t(current ? 'chooser.current' : 'chooser.recommended')}
    </Badge>
  )
}

function ChooserRow({
  label,
  detail,
  recommended,
  current,
  disabled,
  onPick
}: {
  label: string
  detail: React.ReactNode
  recommended: boolean
  /** True for the active model when the chooser is reopened to switch (v13 ticket 05). */
  current?: boolean
  disabled?: boolean
  onPick: () => void
}) {
  return (
    <Button
      variant="outline"
      className="h-auto w-full justify-between gap-3 px-3 py-2"
      disabled={disabled}
      onClick={onPick}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">{label}</span>
        {(current || recommended) && <HighlightBadge current={!!current} />}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{detail}</span>
    </Button>
  )
}

function Group({
  title,
  note,
  children
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {children}
    </div>
  )
}

export function ModelChooser({
  hardware,
  downloadedIds,
  currentModelId,
  onSelect
}: {
  hardware: HardwareProfile
  downloadedIds: Set<string>
  /** Set when reopened via "Change model or provider" — marks the active model (badge). */
  currentModelId?: string
  onSelect: (id: string) => void
}) {
  const webgpu = hardware.webgpu

  // "Recommended" per group: the registry's `recommended` flag for cloud; for on-device it is
  // the reference model (first in LOCAL_MODELS) ONLY when the hardware looks apt for it.
  const localRecommendedId = (() => {
    const reference = LOCAL_MODELS[0]
    if (!webgpu) return undefined
    const feas = assessFeasibility(reference, hardware)
    return feas.tier === 'recommended' || feas.tier === 'should-run'
      ? reference.id
      : undefined
  })()

  const localDetail = (m: LocalModelSpec) =>
    downloadedIds.has(m.id) ? i18n.t('selector.cached') : `${m.downloadGB} GB`

  const cloudDetail = (m: CloudModelSpec) =>
    isFreeModel(m)
      ? i18n.t('selector.free')
      : `${CLOUD_PROVIDER_LABEL[m.provider]} · $${m.inputCostPer1M}/$${m.outputCostPer1M} ${i18n.t('selector.per1M')}`

  const openrouter = CLOUD_MODELS.filter((m) => m.provider === 'openrouter')
  const paid = CLOUD_MODELS.filter((m) => m.provider !== 'openrouter')
  const paidRecommendedId = paid.find((m) => m.recommended)?.id
  const openrouterRecommendedId = openrouter.find((m) => m.recommended)?.id

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[15px] font-semibold">{i18n.t('chooser.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {i18n.t('chooser.intro')}
        </p>
      </div>

      <Group
        title={`🔒 ${i18n.t('chooser.onDeviceGroup')}`}
        note={webgpu ? undefined : i18n.t('chooser.noWebGpu')}
      >
        {LOCAL_MODELS.map((m) => (
          <ChooserRow
            key={m.id}
            label={m.label}
            detail={localDetail(m)}
            recommended={m.id === localRecommendedId}
            current={m.id === currentModelId}
            disabled={!webgpu}
            onPick={() => onSelect(m.id)}
          />
        ))}
      </Group>

      <Group
        title={`☁️ ${i18n.t('chooser.openrouterGroup')}`}
        note={i18n.t('chooser.openrouterNote')}
      >
        {openrouter.map((m) => (
          <ChooserRow
            key={m.id}
            label={m.label}
            detail={cloudDetail(m)}
            recommended={m.id === openrouterRecommendedId}
            current={m.id === currentModelId}
            onPick={() => onSelect(m.id)}
          />
        ))}
      </Group>

      <Group title={`⚡ ${i18n.t('chooser.paidGroup')}`}>
        {paid.map((m) => (
          <ChooserRow
            key={m.id}
            label={m.label}
            detail={cloudDetail(m)}
            recommended={m.id === paidRecommendedId}
            current={m.id === currentModelId}
            onPick={() => onSelect(m.id)}
          />
        ))}
      </Group>
    </div>
  )
}
