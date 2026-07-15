import { afterEach, describe, expect, it } from 'vitest'
import { LOCAL_MODELS, type LocalModelSpec } from '../../../shared/models'
import { isModelDownloaded } from '../model-cache'

const LLAMA = LOCAL_MODELS.find(
  (m) => m.id === 'onnx-community/Llama-3.2-3B-Instruct'
) as LocalModelSpec

const BASE = `https://huggingface.co/${LLAMA.id}/resolve/main/`

/** Minimal CacheStorage fake: a set of cached URLs plus a config.json body. */
function stubCaches(urls: string[], configBody?: unknown) {
  const entries = new Map<string, Response>()
  for (const u of urls) entries.set(u, new Response('x'))
  if (configBody !== undefined) {
    entries.set(BASE + 'config.json', Response.json(configBody))
  }
  globalThis.caches = {
    open: async () => ({
      match: async (url: string) => entries.get(url)
    })
  } as unknown as CacheStorage
}

function fullSet(chunks: number): string[] {
  const files = [
    'tokenizer.json',
    'tokenizer_config.json',
    'onnx/model_q4f16.onnx'
  ]
  for (let i = 0; i < chunks; i++) {
    files.push(`onnx/model_q4f16.onnx_data${i === 0 ? '' : `_${i}`}`)
  }
  return files.map((f) => BASE + f)
}

const originalCaches = globalThis.caches

afterEach(() => {
  globalThis.caches = originalCaches
})

describe('isModelDownloaded', () => {
  it('is true when config + tokenizer + onnx + every chunk are cached (numeric form)', async () => {
    stubCaches(fullSet(2), {
      'transformers.js_config': { use_external_data_format: 2 }
    })
    await expect(isModelDownloaded(LLAMA)).resolves.toBe(true)
  })

  it('is true with the boolean form (true = one chunk)', async () => {
    stubCaches(fullSet(1), {
      'transformers.js_config': { use_external_data_format: true }
    })
    await expect(isModelDownloaded(LLAMA)).resolves.toBe(true)
  })

  it('is true with the per-file object form', async () => {
    stubCaches(fullSet(1), {
      'transformers.js_config': {
        use_external_data_format: { 'model_q4f16.onnx': true }
      }
    })
    await expect(isModelDownloaded(LLAMA)).resolves.toBe(true)
  })

  it("is true with the object form keyed by the 'model' base name (fallback)", async () => {
    stubCaches(fullSet(2), {
      'transformers.js_config': { use_external_data_format: { model: 2 } }
    })
    await expect(isModelDownloaded(LLAMA)).resolves.toBe(true)
  })

  it('is true with no external-data declaration (single-file onnx)', async () => {
    stubCaches(fullSet(0), {})
    await expect(isModelDownloaded(LLAMA)).resolves.toBe(true)
  })

  it('is false when a data chunk is missing', async () => {
    stubCaches(fullSet(1), {
      'transformers.js_config': { use_external_data_format: 2 }
    })
    await expect(isModelDownloaded(LLAMA)).resolves.toBe(false)
  })

  it('is false when a tokenizer file is missing', async () => {
    const urls = fullSet(0).filter((u) => !u.endsWith('tokenizer.json'))
    stubCaches(urls, {})
    await expect(isModelDownloaded(LLAMA)).resolves.toBe(false)
  })

  it('is false when config.json is not cached (nothing relevant is)', async () => {
    stubCaches(fullSet(2))
    await expect(isModelDownloaded(LLAMA)).resolves.toBe(false)
  })

  it('is false (never throws) on an unreadable config.json', async () => {
    stubCaches(fullSet(0))
    const entries = new Response('not json')
    const open = async () => ({
      match: async (url: string) =>
        url.endsWith('config.json') ? entries : new Response('x')
    })
    globalThis.caches = { open } as unknown as CacheStorage
    await expect(isModelDownloaded(LLAMA)).resolves.toBe(false)
  })

  it('is false (never throws) when the Cache API is unavailable', async () => {
    // @ts-expect-error simulating an environment without caches
    delete globalThis.caches
    await expect(isModelDownloaded(LLAMA)).resolves.toBe(false)
  })

  it('is false (never throws) when caches.open itself rejects', async () => {
    globalThis.caches = {
      open: async () => {
        throw new Error('SecurityError')
      }
    } as unknown as CacheStorage
    await expect(isModelDownloaded(LLAMA)).resolves.toBe(false)
  })
})
