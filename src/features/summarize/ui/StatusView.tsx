import type { SummaryState } from '../state';

/** Renders the non-result states with clear, specific copy for each. */
export function StatusView({ state }: { state: SummaryState }) {
  switch (state.status) {
    case 'checking-backend':
      return <Status spinner title="Checking your device…" detail="Verifying WebGPU support." />;

    case 'unsupported':
      return (
        <div className="status status--blocked">
          <h2 className="status__title">Device not supported yet</h2>
          <p className="status__detail">{state.reason}</p>
          <p className="status__detail">
            Local Resumer runs the model on your GPU via WebGPU. Try a recent Chrome on a device
            with WebGPU enabled.
          </p>
        </div>
      );

    case 'downloading': {
      const pct = typeof state.progress === 'number' ? Math.round(state.progress) : undefined;
      return (
        <div className="status">
          <Spinner />
          <h2 className="status__title">Downloading the model…</h2>
          <p className="status__detail">
            First run only — weights are cached for next time.
            {state.file ? ` (${state.file})` : ''}
          </p>
          <div className="progress">
            <div
              className="progress__bar"
              style={{ width: pct !== undefined ? `${pct}%` : '100%' }}
              data-indeterminate={pct === undefined}
            />
          </div>
          {pct !== undefined && <p className="status__detail">{pct}%</p>}
        </div>
      );
    }

    case 'ready':
      return (
        <Status
          title="Ready"
          detail="Open an article or blog post, then summarize this page."
        />
      );

    case 'extracting':
      return <Status spinner title="Reading the article…" detail="Extracting the main content." />;

    case 'summarizing':
      return (
        <Status spinner title="Summarizing…" detail="Running the model locally on your GPU." />
      );

    case 'error':
      return (
        <div className="status status--error">
          <h2 className="status__title">Something went wrong</h2>
          <p className="status__detail">{state.message}</p>
        </div>
      );
  }
}

function Status({
  title,
  detail,
  spinner,
}: {
  title: string;
  detail: string;
  spinner?: boolean;
}) {
  return (
    <div className="status">
      {spinner && <Spinner />}
      <h2 className="status__title">{title}</h2>
      <p className="status__detail">{detail}</p>
    </div>
  );
}

function Spinner() {
  return <div className="spinner" aria-label="loading" />;
}
