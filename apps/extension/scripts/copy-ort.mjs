// Copies the ONNX Runtime Web WASM binaries into public/ort/ so they are served from the
// extension origin. The default extension CSP blocks Transformers.js from fetching these from
// a CDN, so they must be bundled locally and pointed at via env.backends.onnx.wasm.wasmPaths.
import { cpSync, mkdirSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(root, '..')

// Resolve onnxruntime-web through the transformers dependency chain (it is a transitive dep,
// not a direct one, so we resolve relative to @huggingface/transformers).
const require = createRequire(import.meta.resolve('@huggingface/transformers'))
// onnxruntime-web blocks the ./package.json subpath via exports, so resolve its main entry
// (which lives in dist/) and use that directory.
const ortDist = dirname(require.resolve('onnxruntime-web'))

const outDir = join(projectRoot, 'public', 'ort')
mkdirSync(outDir, { recursive: true })

// ORT resolves both the .wasm binary AND its .mjs glue loader from wasmPaths, so both must be
// shipped — copying only .wasm causes "no available backend: Failed to fetch ...mjs" at runtime.
const ortFiles = readdirSync(ortDist).filter((f) =>
  /^ort-wasm-.*\.(mjs|wasm)$/.test(f)
)
if (ortFiles.length === 0) {
  console.error(`[copy-ort] No ORT runtime files found in ${ortDist}`)
  process.exit(1)
}
for (const file of ortFiles) {
  cpSync(join(ortDist, file), join(outDir, file))
}
console.log(
  `[copy-ort] Copied ${ortFiles.length} ORT runtime files (.mjs + .wasm) to public/ort/`
)
