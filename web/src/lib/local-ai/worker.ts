/**
 * Local AI Web Worker
 *
 * Runs Gemma 3 1B IT inference off the main thread via Transformers.js + WebGPU.
 * Uses singleton pattern: pipeline created once, reused for all classify calls.
 *
 * Message protocol:
 * - `load` -> downloads model, emits progress -> `model-ready` / `model-error`
 * - `classify { id, url, content }` -> inference -> `classify-result` / `classify-error`
 * - `dispose` -> releases GPU memory
 */

import { pipeline, env } from '@huggingface/transformers'
import { buildLocalClassificationMessage, parseClassificationJSON } from './prompt'
import type { WorkerInMessage, WorkerOutMessage } from './types'

// Disable local model check — always fetch from HF CDN
env.allowLocalModels = false

const MODEL_ID = 'onnx-community/gemma-3-1b-it-ONNX-GQA'
const MODEL_VERSION = 'gemma-3-1b-v2' // bump when changing model or transformers.js version

// Singleton pipeline — typed as `any` because @huggingface/transformers
// pipeline() returns a union type too complex for TS to represent
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let generatorPipeline: any = null

function post(msg: WorkerOutMessage) {
  self.postMessage(msg)
}

async function clearCache() {
  if ('caches' in self) {
    await caches.delete('transformers-cache')
    await caches.delete('transformers-meta')
    console.log('[LocalAI Worker] Cache cleared')
  }
}

async function loadModel() {
  try {
    // Check if model is already cached — skip download progress on cache hit
    let modelCached = false
    try {
      const cache = await caches.open('transformers-cache')
      const keys = await cache.keys()
      modelCached = keys.length > 5 // model has multiple chunks
    } catch { /* ignore */ }

    post({ type: 'progress', progress: modelCached ? 50 : 0, status: modelCached ? 'Loading cached model...' : 'Checking GPU support...' })

    // Clear stale cache if model version changed
    try {
      const metaCache = await caches.open('transformers-meta')
      const stored = await metaCache.match('model-version')
      const storedVersion = stored ? await stored.text() : null
      if (storedVersion && storedVersion !== MODEL_VERSION) {
        await caches.delete('transformers-cache')
        post({ type: 'progress', progress: 0, status: 'Clearing stale model cache...' })
      }
      await metaCache.put('model-version', new Response(MODEL_VERSION))
    } catch { /* ignore cache errors */ }

    // Detect best available device — WebGPU preferred, WASM fallback
    const hasWebGPU = typeof navigator !== 'undefined'
      && 'gpu' in navigator
      && !!(await (navigator as unknown as { gpu?: { requestAdapter?: () => Promise<unknown> } }).gpu?.requestAdapter?.())

    let device: 'webgpu' | 'wasm' = hasWebGPU ? 'webgpu' : 'wasm'
    // q4f16 requires GPU compute shaders; q4 works on WASM
    let dtype = hasWebGPU ? 'q4f16' : 'q4'

    const progressCb = (progress: { progress?: number; status?: string }) => {
      if (typeof progress.progress === 'number') {
        post({
          type: 'progress',
          progress: Math.round(progress.progress),
          status: progress.status || 'Downloading...',
        })
      }
    }

    post({ type: 'progress', progress: 0, status: `Downloading model (${device})...` })

    try {
      generatorPipeline = await (pipeline as Function)('text-generation', MODEL_ID, {
        dtype, device, progress_callback: progressCb,
      })
    } catch (gpuErr) {
      if (device === 'webgpu') {
        console.warn('[LocalAI Worker] WebGPU failed, falling back to WASM:', gpuErr)
        device = 'wasm'
        dtype = 'q4'
        post({ type: 'progress', progress: 0, status: 'WebGPU unavailable — trying WASM...' })
        generatorPipeline = await (pipeline as Function)('text-generation', MODEL_ID, {
          dtype, device, progress_callback: progressCb,
        })
      } else {
        throw gpuErr
      }
    }

    post({ type: 'model-ready' })
  } catch (err) {
    console.error('[LocalAI Worker] Model load error:', err)
    const message = err instanceof Error
      ? err.message
      : `Model init failed: ${String(err)}`
    post({ type: 'model-error', error: message })
  }
}

async function classify(id: string, url: string, content: string) {
  if (!generatorPipeline) {
    post({ type: 'classify-error', id, error: 'Model not loaded' })
    return
  }

  try {
    const prompt = buildLocalClassificationMessage(url, content)

    const messages = [
      { role: 'user' as const, content: prompt },
    ]

    const output = await generatorPipeline(messages, {
      max_new_tokens: 256,
      temperature: 0.1,
      do_sample: false,
    })

    // Extract generated text from output
    const generated = Array.isArray(output)
      ? (output[0] as { generated_text?: string | Array<{ role: string; content: string }> })
          ?.generated_text
      : null

    let text = ''
    if (typeof generated === 'string') {
      text = generated
    } else if (Array.isArray(generated)) {
      // Chat-style output: last message is the assistant's response
      const assistantMsg = generated.filter(m => m.role === 'assistant').pop()
      text = assistantMsg?.content || ''
    }

    const result = parseClassificationJSON(text)
    if (result) {
      post({ type: 'classify-result', id, result })
    } else {
      post({ type: 'classify-error', id, error: `Failed to parse model output: ${text.slice(0, 200)}` })
    }
  } catch (err) {
    console.error('[LocalAI Worker] Classification error:', err)
    const message = err instanceof Error ? err.message : 'Classification failed'
    post({ type: 'classify-error', id, error: message })
  }
}

async function dispose() {
  if (generatorPipeline) {
    try {
      await (generatorPipeline as unknown as { dispose?: () => Promise<void> }).dispose?.()
    } catch { /* ignore */ }
    generatorPipeline = null
  }
}

self.addEventListener('message', (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data
  switch (msg.type) {
    case 'load':
      loadModel()
      break
    case 'classify':
      classify(msg.id, msg.url, msg.content)
      break
    case 'dispose':
      dispose()
      break
    case 'clear-cache':
      clearCache()
      break
  }
})
