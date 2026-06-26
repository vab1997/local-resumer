import type { Summary } from '@/src/shared/types';

/** The page a summary was produced for. */
export interface SummarySource {
  tabId: number;
  url: string;
  title: string;
}

/**
 * The explicit state machine that drives the panel UI. Every state maps to clear copy, so
 * "always tell the user what's happening" is structural rather than ad hoc.
 */
export type SummaryState =
  | { status: 'checking-backend' }
  | { status: 'unsupported'; reason: string }
  | { status: 'downloading'; file?: string; progress?: number }
  | { status: 'ready' }
  | { status: 'extracting' }
  | { status: 'summarizing' }
  | { status: 'done'; summary: Summary; source: SummarySource; truncated: boolean }
  | { status: 'error'; message: string };

/** True while a summarize run is in flight (used to disable the button). */
export function isBusy(state: SummaryState): boolean {
  return (
    state.status === 'checking-backend' ||
    state.status === 'downloading' ||
    state.status === 'extracting' ||
    state.status === 'summarizing'
  );
}

/** True when the user can start a summarize run. */
export function canSummarize(state: SummaryState): boolean {
  return state.status === 'ready' || state.status === 'done' || state.status === 'error';
}
