import Markdown from 'react-markdown';
import type { Summary } from '@/src/shared/types';
import type { SummarySource } from '../state';
import { summaryToFilename, summaryToMarkdown } from '../markdown';

/** Renders a finished summary, plus the source it belongs to and any drift/format warnings. */
export function SummaryResult({
  summary,
  source,
  truncated,
  stale,
  currentUrl,
}: {
  summary: Summary;
  source: SummarySource;
  truncated: boolean;
  stale: boolean;
  currentUrl?: string;
}) {
  const markdown = summary.parsedOk ? summaryToMarkdown(summary) : summary.raw;

  const download = () => {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = summary.parsedOk ? summaryToFilename(summary) : 'summary.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="result">
      {stale && (
        <div className="banner banner--stale">
          You’ve switched pages. This summary is for{' '}
          <span className="banner__url">{source.url}</span>
          {currentUrl ? <> — you’re now on <span className="banner__url">{currentUrl}</span></> : null}.
          Summarize this page to refresh.
        </div>
      )}

      {truncated && (
        <div className="banner banner--note">
          The article was long, so only the beginning was summarized.
        </div>
      )}

      {!summary.parsedOk && (
        <div className="banner banner--note">
          The model didn’t return the expected format, so here’s its raw output.
        </div>
      )}

      <div className="markdown">
        <Markdown>{markdown}</Markdown>
      </div>

      <div className="result__footer">
        <button type="button" className="result__download" onClick={download}>
          Download .md
        </button>
        <span className="result__source" title={source.url}>
          Summary for: {source.title || source.url}
        </span>
      </div>
    </div>
  );
}
