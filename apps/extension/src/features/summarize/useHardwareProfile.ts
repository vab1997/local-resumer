import { detectHardware, type HardwareProfile } from '@/src/inference/hardware'
import { useEffect, useState } from 'react'

/**
 * Detects the hardware profile once on mount (async — UA Client Hints + WebGPU adapter). Returns
 * `undefined` while pending so the selector can show a neutral state before feasibility is known.
 */
export function useHardwareProfile(): HardwareProfile | undefined {
  const [profile, setProfile] = useState<HardwareProfile | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    detectHardware().then((p) => {
      if (!cancelled) setProfile(p)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return profile
}
