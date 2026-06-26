import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Local Resumer',
    description: 'Summarize the current article with an AI model running locally in your browser.',
    permissions: ['sidePanel', 'tabs'],
    // Clicking the toolbar icon opens the side panel (wired in the background script).
    action: { default_title: 'Open Local Resumer' },
    // Transformers.js compiles ONNX Runtime to WebAssembly: the extension CSP must allow
    // wasm. Model weights are fetched from the Hugging Face Hub on first run, so connect-src
    // must allow it (CDN fetches are otherwise blocked by the default extension CSP).
    content_security_policy: {
      // Weights + tokenizer redirect from huggingface.co to HF's regional Xet CDN
      // (e.g. us.aws.cdn.hf.co), so *.hf.co must be allowed or the browser blocks the fetch
      // under CSP and the model never loads. Verified via the resolve redirect chain.
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; " +
        "connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co;",
    },
  },
});
