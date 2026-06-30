import { Badge } from '@/src/components/ui/badge'
import type { HardwareProfile } from '@/src/inference/hardware'
import type { LucideIcon } from 'lucide-react'
import { Activity, Cpu, MemoryStick, Microchip, Zap } from 'lucide-react'

/** One labelled stat in the bar: icon, value, tiny caption. Shows "—" when the value is unknown. */
function Stat({
  icon: Icon,
  value,
  label
}: {
  icon: LucideIcon
  value: string | undefined
  label: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="flex flex-col leading-tight">
        <span className="font-mono text-xs">{value ?? '—'}</span>
        <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
      </div>
    </div>
  )
}

/**
 * Compact hardware summary above the model card. Every number is an ESTIMATE (the browser does not
 * expose real VRAM/bandwidth) — the disclaimer says so. Unknown fields render as "—".
 */
export function HardwareInfoBar({ hardware }: { hardware?: HardwareProfile }) {
  if (!hardware) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Detecting hardware…
      </div>
    )
  }

  const { hwClass, deviceMemoryGB, estAvailableMemoryGB, estBandwidthGBs } =
    hardware
  // On unified-memory devices "VRAM" is shared system RAM; elsewhere use the estimated budget.
  const vram =
    hwClass === 'apple-silicon-unified' && deviceMemoryGB
      ? deviceMemoryGB
      : Math.round(estAvailableMemoryGB)

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Stat icon={Microchip} value={hardware.gpuLabel} label="GPU" />
        <Stat
          icon={MemoryStick}
          value={vram ? `~${vram} GB` : undefined}
          label="VRAM"
        />
        <Stat
          icon={Activity}
          value={estBandwidthGBs ? `~${estBandwidthGBs} GB/s` : undefined}
          label="BW"
        />
        <Stat
          icon={Zap}
          value={deviceMemoryGB ? `${deviceMemoryGB} GB` : undefined}
          label="RAM"
        />
        <Stat
          icon={Cpu}
          value={
            hardware.logicalCores ? String(hardware.logicalCores) : undefined
          }
          label="Cores"
        />
        <Badge variant={hardware.webgpu ? 'success' : 'warning'}>
          {hardware.webgpu ? 'WebGPU' : 'No WebGPU'}
        </Badge>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Estimates based on browser APIs. Actual specs may vary.
      </p>
    </div>
  )
}
