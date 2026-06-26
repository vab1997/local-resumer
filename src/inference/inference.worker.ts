/**
 * Inference worker. Loads the model once (WebGPU) and runs stateless summarizations.
 * Runs off the UI thread so model load + generation never block the side panel.
 */
import { pipeline, env, type TextGenerationPipeline } from '@huggingface/transformers';
import { MODEL_ID } from '@/src/shared/types';
import { buildMessages } from './prompt';
import { checkWebGPU } from './backend';
import type { WorkerRequest, WorkerEvent } from '@/src/shared/messages';

// Serve the ONNX Runtime wasm binaries from the extension origin (the default extension CSP
// blocks fetching them from a CDN). copy-ort.mjs places them in public/ort/.
const wasmBackend = env.backends?.onnx?.wasm;
if (wasmBackend) wasmBackend.wasmPaths = '/ort/';
// Model weights are fetched from the Hugging Face Hub on first run and cached by the browser.
env.allowRemoteModels = true;
env.allowLocalModels = false;

// The worker global, typed structurally so we don't need the WebWorker lib (which clashes with
// DOM types used elsewhere).
const ctx = self as unknown as {
  postMessage: (msg: WorkerEvent) => void;
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
};

function post(msg: WorkerEvent): void {
  ctx.postMessage(msg);
}

let generatorPromise: Promise<TextGenerationPipeline> | null = null;

/** Load (or reuse) the cached pipeline. First load downloads + compiles; later loads are fast. */
function loadModel(): Promise<TextGenerationPipeline> {
  if (!generatorPromise) {
    generatorPromise = pipeline('text-generation', MODEL_ID, {
      device: 'webgpu',
      dtype: 'q4f16',
      progress_callback: (p: Record<string, unknown>) => {
        post({
          type: 'PROGRESS',
          status: String(p.status ?? ''),
          file: typeof p.file === 'string' ? p.file : undefined,
          progress: typeof p.progress === 'number' ? p.progress : undefined,
          loaded: typeof p.loaded === 'number' ? p.loaded : undefined,
          total: typeof p.total === 'number' ? p.total : undefined,
        });
      },
    }) as Promise<TextGenerationPipeline>;
  }
  return generatorPromise;
}

/** Pull the assistant's text out of a text-generation result produced from chat messages. */
function extractGeneratedText(output: unknown): string {
  const first = Array.isArray(output) ? output[0] : output;
  const gen = (first as { generated_text?: unknown })?.generated_text;
  if (Array.isArray(gen)) {
    const last = gen[gen.length - 1] as { content?: unknown };
    return typeof last?.content === 'string' ? last.content : String(last ?? '');
  }
  return typeof gen === 'string' ? gen : String(gen ?? '');
}

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'LOAD_MODEL') {
      const gpu = await checkWebGPU();
      if (!gpu.ok) {
        post({ type: 'UNSUPPORTED', reason: gpu.reason });
        return;
      }
      await loadModel();
      post({ type: 'MODEL_READY' });
      return;
    }

    if (msg.type === 'SUMMARIZE') {
      const generator = await loadModel();
      // Stateless: a fresh message list every run so a prior article never bleeds in.
      const messages = buildMessages(msg.text);
      const output = await generator(messages as never, {
        // Room for title + TL;DR + 3-5 detailed points.
        max_new_tokens: 1024,
        do_sample: false,
        // Stop as soon as the points block closes — otherwise the model keeps re-emitting it.
        // (No n-gram repetition guard: the 3B doesn't loop, and forbidding repeated n-grams
        // mangled repeated proper nouns like "MoEBius" and suppressed similar-starting points.)
        stop_strings: ['</points>'],
      } as never);
      post({ type: 'RESULT', requestId: msg.requestId, raw: extractGeneratedText(output) });
      return;
    }
  } catch (err) {
    post({
      type: 'ERROR',
      requestId: msg.type === 'SUMMARIZE' ? msg.requestId : undefined,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
