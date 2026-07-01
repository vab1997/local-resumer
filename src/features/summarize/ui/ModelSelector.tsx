import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/src/components/ui/select'
import {
  assessFeasibility,
  type FeasibilityTier,
  type HardwareProfile
} from '@/src/inference/hardware'
import { cn } from '@/src/lib/utils'
import {
  CLOUD_MODELS,
  getModelSpec,
  isLocalModel,
  LOCAL_MODELS,
  type CloudModelSpec,
  type LocalModelSpec
} from '@/src/shared/models'
import { AlertTriangle } from 'lucide-react'

/** Text colour per feasibility tier (no destructive badge variant exists; colour the label). */
function tierClass(tier: FeasibilityTier): string {
  switch (tier) {
    case 'recommended':
      return 'text-primary'
    case 'should-run':
      return 'text-foreground'
    case 'risky':
    case 'too-heavy':
      return 'text-warning'
  }
}

/** A local row: name · (cached | download size) · feasibility for the detected hardware. */
function LocalRow({
  spec,
  hardware,
  cached
}: {
  spec: LocalModelSpec
  hardware?: HardwareProfile
  cached: boolean
}) {
  const feas = hardware ? assessFeasibility(spec, hardware) : undefined
  return (
    <span className="flex w-full items-center justify-between gap-3">
      <span className="font-medium">{spec.label}</span>
      <span className="text-xs text-muted-foreground">
        {cached ? 'cached' : `${spec.downloadGB} GB`}
        {feas ? (
          <>
            {' · '}
            <span className={tierClass(feas.tier)}>{feas.label}</span>
          </>
        ) : null}
      </span>
    </span>
  )
}

/** A cloud row: name · list price (no hardware feasibility — it runs on the provider). */
function CloudRow({ spec }: { spec: CloudModelSpec }) {
  return (
    <span className="flex w-full items-center justify-between gap-3">
      <span className="font-medium">{spec.label}</span>
      <span className="text-xs text-muted-foreground">
        ${spec.inputCostPer1M}/${spec.outputCostPer1M} per 1M
      </span>
    </span>
  )
}

interface ModelSelectorProps {
  selectedModelId: string
  onSelect: (id: string) => void
  hardware?: HardwareProfile
  cachedIds: Set<string>
  /** True while a run is in flight — the whole selector is locked (no swap mid-run). */
  disabled: boolean
}

/**
 * Model picker, grouped into On-device and Cloud. Local rows show size + feasibility for the
 * detected hardware (over-budget picks are warned about but never blocked). Cloud rows show price.
 */
export function ModelSelector({
  selectedModelId,
  onSelect,
  hardware,
  cachedIds,
  disabled
}: ModelSelectorProps) {
  const selectedSpec = getModelSpec(selectedModelId)
  const selectedFeas =
    hardware && isLocalModel(selectedSpec)
      ? assessFeasibility(selectedSpec, hardware)
      : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <Select
        value={selectedModelId}
        onValueChange={onSelect}
        disabled={disabled}
      >
        <SelectTrigger aria-label="Model">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-black">
          <SelectGroup>
            <SelectLabel>On-device</SelectLabel>
            {LOCAL_MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id} textValue={m.label}>
                <LocalRow
                  spec={m}
                  hardware={hardware}
                  cached={cachedIds.has(m.id)}
                />
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Cloud (sends text to the provider)</SelectLabel>
            {CLOUD_MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id} textValue={m.label}>
                <CloudRow spec={m} />
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      {selectedFeas &&
      (selectedFeas.tier === 'risky' || selectedFeas.tier === 'too-heavy') ? (
        <p
          className={cn(
            'flex items-start gap-1.5 text-xs text-warning',
            disabled && 'opacity-60'
          )}
        >
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          <span>
            This model may exceed your device&rsquo;s estimated memory (
            {selectedFeas.reason}). It will still try to load.
          </span>
        </p>
      ) : null}
    </div>
  )
}
