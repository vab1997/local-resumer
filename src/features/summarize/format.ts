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
