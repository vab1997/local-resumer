import { i18n } from '#i18n'
import { Button } from '@/src/components/ui/button'
import { Input } from '@/src/components/ui/input'
import { CLOUD_PROVIDER_LABEL, type CloudProvider } from '@/src/shared/models'
import { ChevronRight, Eye, EyeOff, ShieldAlert, Trash2 } from 'lucide-react'
import { useState } from 'react'

/** Where each provider issues API keys (shown as a hint under the input). */
const KEY_HELP: Record<CloudProvider, string> = {
  openai: 'platform.openai.com/api-keys',
  anthropic: 'console.anthropic.com → API keys',
  openrouter: 'openrouter.ai/keys'
}

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
        <span>{i18n.t('keyPanel.privacy', [providerLabel])}</span>
      </p>

      {hasKey ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {i18n.t('keyPanel.saved', [providerLabel])}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={onClear}
            disabled={disabled}
          >
            <Trash2 className="size-3.5" />
            {i18n.t('keyPanel.delete')}
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
                placeholder={i18n.t('keyPanel.placeholder', [providerLabel])}
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={
                  reveal
                    ? i18n.t('keyPanel.hideKey')
                    : i18n.t('keyPanel.showKey')
                }
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
              {i18n.t('keyPanel.save')}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {i18n.t('keyPanel.stored', [KEY_HELP[provider]])}
          </p>
        </form>
      )}

      {provider === 'openai' && <OpenAiAccessGuide />}
    </div>
  )
}

function OpenAiAccessGuide() {
  return (
    <details className="group rounded-md border border-border bg-muted/40 px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
        {i18n.t('openaiAccess.summary')}
      </summary>
      <div className="mt-2 flex flex-col gap-1.5 text-xs leading-relaxed text-muted-foreground">
        <p>{i18n.t('openaiAccess.intro')}</p>
        <ol className="flex list-decimal flex-col gap-1 pl-4">
          <li>
            {i18n.t('openaiAccess.step1')}{' '}
            <a
              href="https://platform.openai.com/"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              platform.openai.com
            </a>
          </li>
          <li>{i18n.t('openaiAccess.step2')}</li>
          <li>{i18n.t('openaiAccess.step3')}</li>
          <li>{i18n.t('openaiAccess.step4')}</li>
        </ol>
      </div>
    </details>
  )
}
