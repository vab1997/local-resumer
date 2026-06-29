/** Human-readable elapsed time, e.g. 2400 -> "2.4 s", 72000 -> "1m 12s". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s}s`
}

/** Token count with thousands grouping, e.g. 3420 -> "3,420 tokens". */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  return `${n.toLocaleString('en-US')} tokens`
}

/** Human-readable byte size, e.g. 2_013_265_920 -> "1.9 GB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const decimals = unit >= 2 && value < 100 ? 1 : 0
  return `${value.toFixed(decimals)} ${units[unit]}`
}
