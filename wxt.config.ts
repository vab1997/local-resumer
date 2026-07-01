import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'wxt'

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()]
  }),
  manifest: {
    name: 'Local Resumer',
    description:
      'Summarize the current article with an AI model running locally in your browser.',
    permissions: ['sidePanel', 'tabs', 'storage'],
    // Clicking the toolbar icon opens the side panel (wired in the background script).
    action: { default_title: 'Open Local Resumer' },
    // Transformers.js compiles ONNX Runtime to WebAssembly: the extension CSP must allow
    // wasm. Model weights are fetched from the Hugging Face Hub on first run, so connect-src
    // must allow it (CDN fetches are otherwise blocked by the default extension CSP).
    content_security_policy: {
      // connect-src hosts:
      //  - huggingface.co + *.hf.co: local model weights + tokenizer (redirect to HF's regional
      //    Xet CDN, e.g. us.aws.cdn.hf.co), or the browser blocks the fetch and the model never loads.
      //  - api.openai.com + api.anthropic.com: cloud-provider inference via the AI SDK (v6). Anthropic
      //    additionally needs the `anthropic-dangerous-direct-browser-access` request header (set in
      //    cloud.ts) to allow a browser-origin call.
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; " +
        "connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co " +
        'https://api.openai.com https://api.anthropic.com;'
    }
  }
})
