import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkerEvent, WorkerRequest } from '@/src/shared/messages';
import { parseSummary } from '@/src/inference/parse';
import { truncateArticle } from '@/src/inference/prompt';
import { extractActiveTabArticle, ExtractionError } from '../article-extraction/extract';
import type { SummaryState, SummarySource } from './state';

/**
 * Owns the inference worker and orchestrates one summarize run end-to-end:
 * extract (pinned tab) -> truncate -> stateless generate -> parse -> done.
 *
 * The worker is created when the panel mounts and terminated on unmount (panel close). The
 * model reloads from the browser cache on reopen, which is fast.
 */
export function useSummarize() {
  const [state, setState] = useState<SummaryState>({ status: 'checking-backend' });
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const sourceRef = useRef<SummarySource | null>(null);
  const truncatedRef = useRef(false);

  useEffect(() => {
    const worker = new Worker(new URL('../../inference/inference.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerEvent>) => {
      const msg = e.data;
      switch (msg.type) {
        case 'UNSUPPORTED':
          setState({ status: 'unsupported', reason: msg.reason });
          break;
        case 'PROGRESS':
          if (msg.status !== 'done' && msg.status !== 'ready') {
            setState({ status: 'downloading', file: msg.file, progress: msg.progress });
          }
          break;
        case 'MODEL_READY':
          setState((prev) =>
            prev.status === 'downloading' || prev.status === 'checking-backend'
              ? { status: 'ready' }
              : prev,
          );
          break;
        case 'RESULT': {
          if (msg.requestId !== requestIdRef.current) break; // ignore superseded runs
          const source = sourceRef.current;
          if (!source) break;
          setState({
            status: 'done',
            summary: parseSummary(msg.raw),
            source,
            truncated: truncatedRef.current,
          });
          break;
        }
        case 'ERROR':
          if (msg.requestId && msg.requestId !== requestIdRef.current) break;
          setState({ status: 'error', message: msg.message });
          break;
      }
    };

    worker.onerror = (e) => {
      setState({ status: 'error', message: e.message || 'The model worker crashed.' });
    };

    const load: WorkerRequest = { type: 'LOAD_MODEL' };
    worker.postMessage(load);

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const summarize = useCallback(async () => {
    const worker = workerRef.current;
    if (!worker) return;

    setState({ status: 'extracting' });
    try {
      const article = await extractActiveTabArticle();
      const { text, truncated } = truncateArticle(article.textContent);

      sourceRef.current = { tabId: article.tabId, url: article.url, title: article.title };
      truncatedRef.current = truncated;

      const requestId = crypto.randomUUID();
      requestIdRef.current = requestId;

      setState({ status: 'summarizing' });
      const req: WorkerRequest = { type: 'SUMMARIZE', requestId, text };
      worker.postMessage(req);
    } catch (err) {
      const message =
        err instanceof ExtractionError || err instanceof Error ? err.message : String(err);
      setState({ status: 'error', message });
    }
  }, []);

  return { state, summarize };
}
