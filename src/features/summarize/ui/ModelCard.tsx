import { Badge } from '@/src/components/ui/badge'
import { Card, CardContent } from '@/src/components/ui/card'
import { MODEL_ID, MODEL_LABEL } from '@/src/shared/types'
import { memo } from 'react'
import { formatBytes } from '../format'
import { WebGpuInfoTooltip } from './WebGpuInfo'

/**
 * The model/info card, always mounted. Memoized so it only re-renders when the model size
 * changes — not on every state transition of the parent panel.
 */
export const ModelCard = memo(function ModelCard({
  modelSizeBytes
}: {
  modelSizeBytes?: number
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold">{MODEL_LABEL}</div>
            <div
              className="truncate font-mono text-xs text-muted-foreground"
              title={MODEL_ID}
            >
              {MODEL_ID}
            </div>
          </div>
          <WebGpuInfoTooltip />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success">Local · WebGPU</Badge>
          {modelSizeBytes ? (
            <Badge variant="outline">{formatBytes(modelSizeBytes)}</Badge>
          ) : null}
        </div>

        <p className="text-sm text-muted-foreground">
          Reads the article on your GPU. Nothing leaves your device.
        </p>
      </CardContent>
    </Card>
  )
})
