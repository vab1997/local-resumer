/**
 * WebGPU capability gate. v1 requires WebGPU: if it's unavailable we block with a clear
 * message rather than falling into the unproven (likely very slow / OOM) WASM path.
 *
 * Runs inside the worker, where WebGPU is also exposed on `navigator.gpu`. Typed structurally
 * so we don't depend on @webgpu/types being in the lib set.
 */
interface WebGPULike {
  requestAdapter: () => Promise<unknown>
}

export async function checkWebGPU(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  const gpu = (navigator as unknown as { gpu?: WebGPULike }).gpu
  if (!gpu) {
    return {
      ok: false,
      reason:
        'This browser does not support WebGPU, which ArticleLens needs to run local models.'
    }
  }
  try {
    const adapter = await gpu.requestAdapter()
    if (!adapter) {
      return {
        ok: false,
        reason:
          'No WebGPU adapter is available on this device. ArticleLens needs WebGPU to run local models.'
      }
    }
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      reason: `WebGPU could not be initialized: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}
