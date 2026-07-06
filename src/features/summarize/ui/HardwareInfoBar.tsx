import { i18n } from '#i18n'
import { Badge } from '@/src/components/ui/badge'
import type { HardwareProfile } from '@/src/inference/hardware'
import type { LucideIcon } from 'lucide-react'
import { Activity, Cpu, MemoryStick, Microchip, Zap } from 'lucide-react'

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

export function HardwareInfoBar({ hardware }: { hardware?: HardwareProfile }) {
  if (!hardware) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {i18n.t('hardware.detecting')}
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
        <Stat
          icon={Microchip}
          value={hardware.gpuLabel}
          label={i18n.t('hardware.gpu')}
        />
        <Stat
          icon={MemoryStick}
          value={vram ? `~${vram} GB` : undefined}
          label={i18n.t('hardware.vram')}
        />
        <Stat
          icon={Activity}
          value={estBandwidthGBs ? `~${estBandwidthGBs} GB/s` : undefined}
          label={i18n.t('hardware.bw')}
        />
        <Stat
          icon={Zap}
          value={deviceMemoryGB ? `${deviceMemoryGB} GB` : undefined}
          label={i18n.t('hardware.ram')}
        />
        <Stat
          icon={Cpu}
          value={
            hardware.logicalCores ? String(hardware.logicalCores) : undefined
          }
          label={i18n.t('hardware.cores')}
        />
        <Badge variant={hardware.webgpu ? 'success' : 'warning'}>
          {hardware.webgpu
            ? i18n.t('hardware.webgpu')
            : i18n.t('hardware.noWebgpu')}
        </Badge>
      </div>
      <p className="text-[10px] text-muted-foreground">
        {i18n.t('hardware.disclaimer')}
      </p>
    </div>
  )
}
