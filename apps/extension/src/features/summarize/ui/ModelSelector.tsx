import { i18n } from '#i18n'
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
  CLOUD_PROVIDER_LABEL,
  getModelSpec,
  isFreeModel,
  isLocalModel,
  LOCAL_MODELS,
  type CloudModelSpec,
  type CloudProvider,
  type LocalModelSpec
} from '@/src/shared/models'
import { AlertTriangle } from 'lucide-react'

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
        {cached ? i18n.t('selector.cached') : `${spec.downloadGB} GB`}
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

function CloudRow({ spec }: { spec: CloudModelSpec }) {
  return (
    <span className="flex w-full items-center justify-between gap-3">
      <span className="font-medium">{spec.label}</span>
      <span className="text-xs text-muted-foreground">
        {isFreeModel(spec) ? (
          i18n.t('selector.free')
        ) : (
          <>
            ${spec.inputCostPer1M}/${spec.outputCostPer1M}{' '}
            {i18n.t('selector.per1M')}
          </>
        )}
      </span>
    </span>
  )
}

/**
 * Cloud models are grouped per provider so it's obvious which API key each model needs.
 * OpenRouter gets its own label calling out that its models are free but still need a key.
 */
function cloudGroupLabel(provider: CloudProvider): string {
  return provider === 'openrouter'
    ? i18n.t('selector.openrouterGroup')
    : i18n.t('selector.cloudProviderGroup', [CLOUD_PROVIDER_LABEL[provider]])
}

interface ModelSelectorProps {
  selectedModelId: string
  onSelect: (id: string) => void
  hardware?: HardwareProfile
  cachedIds: Set<string>
  /** True while a run is in flight — the whole selector is locked (no swap mid-run). */
  disabled: boolean
}

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
        <SelectTrigger aria-label={i18n.t('selector.aria')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-black">
          <SelectGroup>
            <SelectLabel>{i18n.t('selector.onDevice')}</SelectLabel>
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
          {(Object.keys(CLOUD_PROVIDER_LABEL) as CloudProvider[]).map(
            (provider) => {
              const models = CLOUD_MODELS.filter((m) => m.provider === provider)
              if (models.length === 0) return null
              return (
                <SelectGroup key={provider}>
                  <SelectLabel>{cloudGroupLabel(provider)}</SelectLabel>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id} textValue={m.label}>
                      <CloudRow spec={m} />
                    </SelectItem>
                  ))}
                </SelectGroup>
              )
            }
          )}
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
          <span>{i18n.t('selector.memoryWarning', [selectedFeas.reason])}</span>
        </p>
      ) : null}
    </div>
  )
}
