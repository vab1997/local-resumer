import { cn } from '@/src/lib/utils'
import * as React from 'react'

/** shadcn Skeleton — a pulsing placeholder block. */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
}
