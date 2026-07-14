import { getModelSpec, MODEL_REGISTRY } from '@/src/shared/models'
import { useCallback, useEffect, useState } from 'react'

const SELECTED_MODEL_KEY = 'selectedModelId'

/**
 * Owns the user's model choice, persisted in chrome.storage.local.
 *
 * Tri-state (v13 — no automatic fallback to a default model):
 *  - `undefined` — still loading from storage; callers wait before rendering anything.
 *  - `null` — no explicit choice yet (fresh install, or a stale stored id whose model left the
 *    registry). The panel routes this to the model chooser; adoption of an already-downloaded
 *    model (implicit migration) is the entry-state module's call, persisted via
 *    `setSelectedModelId`.
 *  - a registry id — the user's (or adoption's) explicit choice.
 */
export function useModelSelection() {
  const [selectedModelId, setSelected] = useState<string | null | undefined>(
    undefined
  )

  useEffect(() => {
    chrome.storage.local.get(SELECTED_MODEL_KEY).then((stored) => {
      const id = stored[SELECTED_MODEL_KEY]
      const valid =
        typeof id === 'string' && MODEL_REGISTRY.some((m) => m.id === id)
      setSelected(valid ? id : null)
    })
  }, [])

  const setSelectedModelId = useCallback((id: string) => {
    const resolved = getModelSpec(id).id
    setSelected(resolved)
    void chrome.storage.local.set({ [SELECTED_MODEL_KEY]: resolved })
  }, [])

  return { selectedModelId, setSelectedModelId }
}
