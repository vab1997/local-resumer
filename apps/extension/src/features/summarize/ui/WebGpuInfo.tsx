import { i18n } from '#i18n'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/src/components/ui/tooltip'
import { Info } from 'lucide-react'

/** Always-available "what's running" explainer, shown behind an info icon. */
export function WebGpuInfoTooltip() {
  return (
    <Tooltip>
      <TooltipTrigger
        className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={i18n.t('webgpuInfo.aria')}
      >
        <Info className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>{i18n.t('webgpuInfo.tooltip')}</TooltipContent>
    </Tooltip>
  )
}

/** Steps shown in the unsupported state to help the user enable WebGPU. */
export function WebGpuActivationSteps() {
  return (
    <ul className="mt-1 flex flex-col gap-1.5 text-sm text-muted-foreground">
      <li>• {i18n.t('unsupported.step1')}</li>
      <li>• {i18n.t('unsupported.step2')}</li>
      <li>
        • {i18n.t('unsupported.step3')}{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
          chrome://flags/#enable-unsafe-webgpu
        </code>
        .
      </li>
    </ul>
  )
}
