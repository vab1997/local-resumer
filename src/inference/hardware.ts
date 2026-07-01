/**
 * Best-effort hardware profiling for the model selector. Runs on the MAIN thread (the side panel),
 * because the dropdown needs feasibility before any worker exists and the signals (UA Client Hints,
 * a WebGL canvas) live there.
 *
 * Hard reality (all honored below):
 *  - VRAM and memory bandwidth are NOT exposed by any browser API (anti-fingerprinting) → estimated.
 *  - `navigator.userAgentData.getHighEntropyValues` is the reliable architecture signal (Chromium).
 *  - `navigator.platform` lies ("MacIntel" on ARM Macs) — never trusted here.
 *  - `navigator.deviceMemory` is coarse GB (sometimes accurate, sometimes capped) — Chromium-only.
 *  - WebGL `UNMASKED_RENDERER` is spoofable; on Apple Silicon it always says "Apple M2" → fallback.
 *
 * Every number this produces is an ESTIMATE; `isEstimate` is always true and the UI says so.
 */
import type { LocalModelSpec } from '@/src/shared/models'

export type HardwareClass =
  | 'apple-silicon-unified'
  | 'integrated'
  | 'discrete'
  | 'mobile'
  | 'unknown'

export interface HardwareProfile {
  webgpu: boolean
  hwClass: HardwareClass
  /** Display label for the GPU, e.g. "Apple Silicon (arm64)" or a vendor/renderer string. */
  gpuLabel: string
  vendor?: string
  /** navigator.hardwareConcurrency — reliable. */
  logicalCores?: number
  /** navigator.deviceMemory in GB — coarse. */
  deviceMemoryGB?: number
  /** WebGPU adapter buffer limit in MB — a desktop-vs-mobile tier proxy, NOT real VRAM. */
  maxBufferSizeMB?: number
  /** Estimated GB of memory available to the model. The single number feasibility consumes. */
  estAvailableMemoryGB: number
  /** Rough estimated memory bandwidth (GB/s), shown for parity with the mockup. Estimate. */
  estBandwidthGBs?: number
  /** Everything here is an estimate. */
  isEstimate: true
}

// --- Structural types so we don't depend on @webgpu/types or experimental lib.dom additions -----

interface GPUAdapterLike {
  info?: { vendor?: string; architecture?: string; description?: string }
  requestAdapterInfo?: () => Promise<{
    vendor?: string
    architecture?: string
    description?: string
  }>
  limits?: { maxBufferSize?: number; maxStorageBufferBindingSize?: number }
}

interface GPULike {
  requestAdapter: () => Promise<GPUAdapterLike | null>
}

interface HighEntropyValues {
  architecture?: string
  bitness?: string
  model?: string
  platform?: string
  platformVersion?: string
  mobile?: boolean
}

interface UADataLike {
  mobile?: boolean
  getHighEntropyValues?: (hints: string[]) => Promise<HighEntropyValues>
}

/** Read the WebGL unmasked renderer string (fallback GPU name). Returns undefined if blocked. */
function readWebGLRenderer(): string | undefined {
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return undefined
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = ext
      ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string)
      : undefined
    return typeof renderer === 'string' && renderer ? renderer : undefined
  } catch {
    return undefined
  }
}

/** Map a hardware class + signals to an estimated available-memory budget (GB). Conservative. */
function estimateAvailableMemoryGB(
  hwClass: HardwareClass,
  deviceMemoryGB: number | undefined,
  maxBufferSizeMB: number | undefined
): number {
  const ram = deviceMemoryGB ?? 8 // coarse default when deviceMemory is absent (Firefox/Safari)
  switch (hwClass) {
    case 'apple-silicon-unified':
      // Unified memory: the GPU draws from system RAM. Leave headroom for OS + browser.
      return Math.max(2, ram * 0.6)
    case 'discrete': {
      // Separate VRAM pool; deviceMemory is system RAM, not VRAM. Infer a bucket from the buffer
      // tier (desktop discrete typically exposes a 4 GB max buffer).
      const buf = maxBufferSizeMB ?? 0
      if (buf >= 4096) return 8
      if (buf >= 2048) return 4
      return 3
    }
    case 'integrated':
      return Math.max(1.5, ram * 0.4)
    case 'mobile':
      return 1.5
    case 'unknown':
    default:
      return Math.min(ram * 0.4, 3)
  }
}

/** Crude bandwidth estimate (GB/s) for display only. */
function estimateBandwidth(hwClass: HardwareClass): number | undefined {
  switch (hwClass) {
    case 'apple-silicon-unified':
      return 200
    case 'discrete':
      return 400
    case 'integrated':
      return 60
    case 'mobile':
      return 40
    default:
      return undefined
  }
}

/**
 * Detect the hardware profile. Async because UA Client Hints and the WebGPU adapter are async.
 * Never throws — degrades to an `unknown` class with conservative estimates.
 */
export async function detectHardware(): Promise<HardwareProfile> {
  let hwClass: HardwareClass = 'unknown'
  let gpuLabel = 'Unknown GPU'
  let vendor: string | undefined
  let isAppleSilicon = false

  // 1. UA Client Hints — the reliable architecture signal (Chromium only).
  const uaData = (navigator as unknown as { userAgentData?: UADataLike })
    .userAgentData
  let highEntropy: HighEntropyValues | undefined
  if (uaData?.getHighEntropyValues) {
    try {
      highEntropy = await uaData.getHighEntropyValues([
        'architecture',
        'bitness',
        'model',
        'platform',
        'platformVersion'
      ])
    } catch {
      highEntropy = undefined
    }
  }
  if (highEntropy) {
    const isMobile = uaData?.mobile === true || highEntropy.mobile === true
    if (isMobile) {
      hwClass = 'mobile'
      gpuLabel = highEntropy.model || 'Mobile GPU'
    } else if (
      highEntropy.architecture === 'arm' &&
      highEntropy.platform === 'macOS'
    ) {
      hwClass = 'apple-silicon-unified'
      isAppleSilicon = true
      gpuLabel = 'Apple Silicon (arm64)'
      vendor = 'apple'
    }
  }

  // 2. WebGPU adapter — presence + info + limits (the desktop/mobile tier proxy).
  const gpu = (navigator as unknown as { gpu?: GPULike }).gpu
  let webgpu = false
  let maxBufferSizeMB: number | undefined
  if (gpu) {
    try {
      const adapter = await gpu.requestAdapter()
      if (adapter) {
        webgpu = true
        const info =
          adapter.info ?? (await adapter.requestAdapterInfo?.()) ?? undefined
        if (info?.vendor && !vendor) vendor = info.vendor
        const limit =
          adapter.limits?.maxBufferSize ??
          adapter.limits?.maxStorageBufferBindingSize
        if (typeof limit === 'number' && limit > 0) {
          maxBufferSizeMB = Math.round(limit / (1024 * 1024))
        }
        // Refine an unknown class from the buffer tier when UA-CH gave us nothing.
        if (hwClass === 'unknown') {
          hwClass =
            maxBufferSizeMB && maxBufferSizeMB >= 2048
              ? 'discrete'
              : 'integrated'
        }
        // Label fallback when not Apple Silicon: prefer adapter info, then WebGL renderer.
        if (!isAppleSilicon) {
          const fromInfo = [info?.vendor, info?.architecture]
            .filter(Boolean)
            .join(' ')
          gpuLabel = fromInfo || readWebGLRenderer() || gpuLabel
        }
      }
    } catch {
      webgpu = false
    }
  }
  if (!isAppleSilicon && gpuLabel === 'Unknown GPU') {
    gpuLabel = readWebGLRenderer() ?? gpuLabel
  }

  const logicalCores =
    typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : undefined
  const deviceMemoryGB = (navigator as unknown as { deviceMemory?: number })
    .deviceMemory

  const estAvailableMemoryGB = estimateAvailableMemoryGB(
    hwClass,
    deviceMemoryGB,
    maxBufferSizeMB
  )

  return {
    webgpu,
    hwClass,
    gpuLabel,
    vendor,
    logicalCores,
    deviceMemoryGB,
    maxBufferSizeMB,
    estAvailableMemoryGB,
    estBandwidthGBs: estimateBandwidth(hwClass),
    isEstimate: true
  }
}

// --- Feasibility ---------------------------------------------------------------------------------

export type FeasibilityTier =
  | 'recommended'
  | 'should-run'
  | 'risky'
  | 'too-heavy'

export interface Feasibility {
  tier: FeasibilityTier
  label: string
  reason: string
}

/**
 * Judge whether a model is viable on the detected hardware. Coarse and conservative; never blocks —
 * `too-heavy` stays selectable (warn-but-allow). All reasons carry "(est.)" to stay honest.
 */
export function assessFeasibility(
  spec: LocalModelSpec,
  hw: HardwareProfile
): Feasibility {
  if (!hw.webgpu) {
    return {
      tier: 'too-heavy',
      label: 'Needs WebGPU',
      reason: 'WebGPU is unavailable on this device.'
    }
  }
  const avail = hw.estAvailableMemoryGB
  const fmt = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)} GB`
  const ctx = `needs ~${fmt(spec.recommendedMemoryGB)}, device has ~${fmt(avail)} (est.)`

  if (avail >= spec.recommendedMemoryGB) {
    return { tier: 'recommended', label: 'Recommended', reason: ctx }
  }
  if (avail >= spec.minMemoryGB) {
    return {
      tier: 'should-run',
      label: 'Should run',
      reason: `should fit; ${ctx}`
    }
  }
  if (avail >= spec.minMemoryGB * 0.8) {
    return {
      tier: 'risky',
      label: 'Risky',
      reason: `may run out of GPU memory; ${ctx}`
    }
  }
  return {
    tier: 'too-heavy',
    label: 'Too heavy',
    reason: `likely won't fit; ${ctx}`
  }
}
