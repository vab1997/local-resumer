import { i18n } from '#i18n'
import { Badge } from '@/src/components/ui/badge'
import { Card, CardContent } from '@/src/components/ui/card'
import {
  CLOUD_PROVIDER_LABEL,
  isCloudModel,
  type ModelSpec
} from '@/src/shared/models'
import { memo } from 'react'
import { formatBytes } from '../format'
import { WebGpuInfoTooltip } from './WebGpuInfo'

export const ModelCard = memo(function ModelCard({
  spec,
  modelSizeBytes
}: {
  spec: ModelSpec
  modelSizeBytes?: number
}) {
  const cloud = isCloudModel(spec)
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold">{spec.label}</div>
            <div
              className="truncate font-mono text-xs text-muted-foreground"
              title={spec.id}
            >
              {spec.id}
            </div>
          </div>
          {!cloud && <WebGpuInfoTooltip />}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {cloud ? (
            <>
              <Badge variant="outline">
                {CLOUD_PROVIDER_LABEL[spec.provider]} ·{' '}
                {i18n.t('card.cloudBadge')}
              </Badge>
              <Badge variant="outline">
                ${spec.inputCostPer1M}/${spec.outputCostPer1M}{' '}
                {i18n.t('card.per1MTok')}
              </Badge>
            </>
          ) : (
            <>
              <Badge variant="success">{i18n.t('card.localBadge')}</Badge>
              {modelSizeBytes ? (
                <Badge variant="outline">{formatBytes(modelSizeBytes)}</Badge>
              ) : null}
            </>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          {cloud
            ? i18n.t('card.cloudDesc', [CLOUD_PROVIDER_LABEL[spec.provider]])
            : i18n.t('card.localDesc')}
        </p>
      </CardContent>
    </Card>
  )
})
