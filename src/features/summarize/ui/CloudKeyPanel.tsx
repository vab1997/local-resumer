import { Button } from '@/src/components/ui/button'
import { Input } from '@/src/components/ui/input'
import { CLOUD_PROVIDER_LABEL, type CloudProvider } from '@/src/shared/models'
import { Eye, EyeOff, ShieldAlert, Trash2 } from 'lucide-react'
import { useState } from 'react'

/** Where each provider issues API keys (shown as a hint under the input). */
const KEY_HELP: Record<CloudProvider, string> = {
  openai: 'platform.openai.com/api-keys',
  anthropic: 'console.anthropic.com → API keys'
}

/**
 * Cloud-model controls: the privacy notice (article text leaves the device), plus either the API-key
 * input (no key yet) or a "key saved" row with a delete button. Rendered only when a cloud model is
 * selected. The key lives in chrome.storage.local (see useProviderApiKey).
 */
export function CloudKeyPanel({
  provider,
  hasKey,
  disabled,
  onSave,
  onClear
}: {
  provider: CloudProvider
  hasKey: boolean
  disabled: boolean
  onSave: (value: string) => void
  onClear: () => void
}) {
  const [draft, setDraft] = useState('')
  const [reveal, setReveal] = useState(false)
  const providerLabel = CLOUD_PROVIDER_LABEL[provider]

  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-warning/40 bg-warning/10 p-3">
      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-warning">
        <ShieldAlert className="mt-px size-3.5 shrink-0" />
        <span>
          Cloud mode sends the article text to {providerLabel}. Use a local
          model to keep everything on your device.
        </span>
      </p>

      {hasKey ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {providerLabel} API key saved.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={onClear}
            disabled={disabled}
          >
            <Trash2 className="size-3.5" />
            Delete key
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (draft.trim()) {
              onSave(draft)
              setDraft('')
            }
          }}
        >
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Input
                type={reveal ? 'text' : 'password'}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`${providerLabel} API key`}
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={reveal ? 'Hide key' : 'Show key'}
                tabIndex={-1}
              >
                {reveal ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={disabled || !draft.trim()}
            >
              Save
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Stored locally in this browser only. Get one at {KEY_HELP[provider]}
            .
          </p>
        </form>
      )}
    </div>
  )
}
