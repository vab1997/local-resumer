import { MODEL_ID } from '@/src/shared/types';
import { useSummarize } from '../useSummarize';
import { useActiveTabUrl } from '../useActiveTabUrl';
import { canSummarize, isBusy } from '../state';
import { StatusView } from './StatusView';
import { SummaryResult } from './SummaryResult';

/** Root side-panel view: header (model + state), body (state-driven), and the action button. */
export function SummaryPanel() {
  const { state, summarize } = useSummarize();
  const activeUrl = useActiveTabUrl();

  const isStale = state.status === 'done' && activeUrl !== undefined && activeUrl !== state.source.url;
  const busy = isBusy(state);

  return (
    <div className="panel">
      <header className="panel__header">
        <h1 className="panel__title">Local Resumer</h1>
        <span className="panel__model" title="Model running locally in your browser">
          {MODEL_ID}
        </span>
      </header>

      <main className="panel__body">
        {state.status === 'done' ? (
          <SummaryResult
            summary={state.summary}
            source={state.source}
            truncated={state.truncated}
            stale={isStale}
            currentUrl={activeUrl}
          />
        ) : (
          <StatusView state={state} />
        )}
      </main>

      {state.status !== 'unsupported' && (
        <footer className="panel__footer">
          <button
            type="button"
            className="panel__button"
            onClick={() => void summarize()}
            disabled={busy || !canSummarize(state)}
          >
            {busy
              ? 'Working…'
              : state.status === 'done'
                ? isStale
                  ? 'Summarize this page'
                  : 'Summarize again'
                : 'Summarize this page'}
          </button>
        </footer>
      )}
    </div>
  );
}
