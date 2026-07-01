import {
  DEFAULT_MODEL_ID,
  getModelSpec,
  MODEL_REGISTRY
} from '@/src/shared/models'
import { useCallback, useEffect, useState } from 'react'

const SELECTED_MODEL_KEY = 'selectedModelId'

/**
 * Owns the user's model choice, persisted in chrome.storage.local. Returns `undefined` while the
 * stored value is still loading so the caller can wait before creating the worker (avoids loading
 * the default and then immediately swapping).
 */
export function useModelSelection() {
  const [selectedModelId, setSelected] = useState<string | undefined>(undefined)

  useEffect(() => {
    chrome.storage.local.get(SELECTED_MODEL_KEY).then((stored) => {
      const id = stored[SELECTED_MODEL_KEY]
      // getModelSpec falls back to the default for an unknown/stale stored id.
      setSelected(
        typeof id === 'string' ? getModelSpec(id).id : DEFAULT_MODEL_ID
      )
    })
  }, [])

  const setSelectedModelId = useCallback((id: string) => {
    const resolved = getModelSpec(id).id
    setSelected(resolved)
    void chrome.storage.local.set({ [SELECTED_MODEL_KEY]: resolved })
  }, [])

  return { selectedModelId, setSelectedModelId }
}

/** Storage key holding a model's measured download size (present ⇒ it was downloaded before). */
export function modelCacheKey(id: string): string {
  return `modelSize:${id}`
}

/**
 * The set of model ids whose weights have already been downloaded (a measured size is cached).
 * Reactive to storage changes, so a model flips to "cached" the moment its download completes.
 */
export function useCachedModelIds(): Set<string> {
  const [cached, setCached] = useState<Set<string>>(new Set())

  useEffect(() => {
    const keys = MODEL_REGISTRY.map((m) => modelCacheKey(m.id))
    const read = () =>
      chrome.storage.local.get(keys).then((stored) => {
        const next = new Set<string>()
        for (const m of MODEL_REGISTRY) {
          const size = stored[modelCacheKey(m.id)]
          if (typeof size === 'number' && size > 0) next.add(m.id)
        }
        setCached(next)
      })
    void read()
    chrome.storage.local.onChanged.addListener(read)
    return () => chrome.storage.local.onChanged.removeListener(read)
  }, [])

  return cached
}
