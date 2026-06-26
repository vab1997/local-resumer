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
        aria-label="About local execution"
      >
        <Info className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>
        Runs entirely on your device using{' '}
        <strong className="font-semibold">WebGPU</strong> (your GPU). The
        article and the summary never leave your browser.
      </TooltipContent>
    </Tooltip>
  )
}

/** Steps shown in the unsupported state to help the user enable WebGPU. */
export function WebGpuActivationSteps() {
  return (
    <ul className="mt-1 flex flex-col gap-1.5 text-sm text-muted-foreground">
      <li>
        • Turn on hardware acceleration: Settings → System → “Use hardware
        acceleration”.
      </li>
      <li>• Update your browser to the latest version, then restart it.</li>
      <li>
        • Still off? Enable the flag at{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
          chrome://flags/#enable-unsafe-webgpu
        </code>
        .
      </li>
    </ul>
  )
}
