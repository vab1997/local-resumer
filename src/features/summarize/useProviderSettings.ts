/**
 * Per-provider API keys for cloud models.
 *
 * Storage = `chrome.storage.local`, plaintext, keyed per provider (`apiKey:openai` /
 * `apiKey:anthropic`). This is the right store for an extension (origin-isolated — no web page or
 * other extension can read it). We deliberately do NOT encrypt: any client-side key would have to
 * live locally too, so encryption would be security theater, not security. The user can delete a key
 * at any time (the delete button calls `clearApiKey`).
 *
 * `zod` validates the stored shape so a corrupt/legacy value can never crash the panel.
 */
import type { CloudProvider } from '@/src/shared/models'
import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'

const apiKeySchema = z.string().min(1)

/** Storage key holding a provider's API key. */
function providerKeyStorageKey(provider: CloudProvider): string {
  return `apiKey:${provider}`
}

interface ProviderApiKey {
  /** The stored key, `null` if none, `undefined` while still loading. */
  apiKey: string | null | undefined
  /** Persist a key for the provider (trimmed; empty is treated as a clear). */
  setApiKey: (value: string) => Promise<void>
  /** Remove the stored key. */
  clearApiKey: () => Promise<void>
}

/**
 * Owns the API key for one provider (or none, when the active model is local). Reactive to storage
 * changes so saving/clearing in one place updates everywhere.
 */
export function useProviderApiKey(
  provider: CloudProvider | undefined
): ProviderApiKey {
  // The last value read from storage, tagged with the provider it belongs to. `apiKey` is derived
  // below so we never have to synchronously reset state when `provider` changes (which would be a
  // setState-in-effect); a stale-provider value simply reads as "still loading" until the read lands.
  const [loaded, setLoaded] = useState<{
    provider: CloudProvider
    key: string | null
  } | null>(null)

  useEffect(() => {
    if (!provider) return
    const storageKey = providerKeyStorageKey(provider)

    const read = () =>
      chrome.storage.local.get(storageKey).then((stored) => {
        const parsed = apiKeySchema.safeParse(stored[storageKey])
        setLoaded({ provider, key: parsed.success ? parsed.data : null })
      })

    void read()
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>
    ) => {
      if (storageKey in changes) void read()
    }
    chrome.storage.local.onChanged.addListener(onChange)
    return () => chrome.storage.local.onChanged.removeListener(onChange)
  }, [provider])

  // null = no cloud provider (local model). undefined = loading. string = the stored key.
  const apiKey = !provider
    ? null
    : loaded?.provider === provider
      ? loaded.key
      : undefined

  const setApiKey = useCallback(
    async (value: string) => {
      if (!provider) return
      const trimmed = value.trim()
      const storageKey = providerKeyStorageKey(provider)
      if (!trimmed) {
        await chrome.storage.local.remove(storageKey)
        return
      }
      await chrome.storage.local.set({ [storageKey]: trimmed })
    },
    [provider]
  )

  const clearApiKey = useCallback(async () => {
    if (!provider) return
    await chrome.storage.local.remove(providerKeyStorageKey(provider))
  }, [provider])

  return { apiKey, setApiKey, clearApiKey }
}
