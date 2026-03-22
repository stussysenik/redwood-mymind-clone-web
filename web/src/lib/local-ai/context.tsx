/**
 * Local AI React Context
 *
 * Provides in-browser AI classification via Gemma 3 1B + WebGPU/WASM.
 * - Lazy init via requestIdleCallback (zero First Paint impact)
 * - Persists enabled state to localStorage
 * - Worker auto-detects WebGPU vs WASM fallback
 *
 * The worker is created when the user has enabled local AI.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'

import { supabase } from '../supabaseClient'
import type { ClientClassification, WorkerOutMessage, LocalAIStatus } from './types'

interface LocalAIContextValue {
  /** Current status of the local AI system */
  status: LocalAIStatus
  /** Whether the model is loaded and ready for inference */
  isReady: boolean
  /** Whether local AI is enabled by the user */
  enabled: boolean
  /** Toggle local AI on/off (persisted to localStorage) */
  setEnabled: (v: boolean) => void
  /** Run classification on content. Returns null on any failure. */
  classify: (url: string, content: string) => Promise<ClientClassification | null>
  /** Model download progress (0-100) */
  downloadProgress: number
  /** Status message during loading */
  downloadStatus: string
  /** Brief success indicator after model loads (auto-dismisses) */
  showSuccess: boolean
  /** Whether the model was previously cached (fast reload expected) */
  modelCached: boolean
  /** Release GPU memory */
  dispose: () => void
}

const STORAGE_KEY = 'mymind-local-ai-enabled'
const MODEL_CACHED_KEY = 'mymind-local-ai-model-cached'
const CLASSIFY_TIMEOUT_MS = 8000
const SUCCESS_DISMISS_MS = 3000

const LocalAIContext = createContext<LocalAIContextValue | undefined>(undefined)

export function LocalAIProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LocalAIStatus>('idle')
  const [enabled, setEnabledState] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadStatus, setDownloadStatus] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [modelCached, setModelCached] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef<Map<string, { resolve: (v: ClientClassification | null) => void; timer: ReturnType<typeof setTimeout> }>>(new Map())

  // Load user preference + cached model flag
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'true') setEnabledState(true)
      const cached = localStorage.getItem(MODEL_CACHED_KEY)
      if (cached === 'true') setModelCached(true)
    } catch { /* no localStorage */ }
  }, [])

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v)
    try { localStorage.setItem(STORAGE_KEY, String(v)) } catch { /* noop */ }
  }, [])

  // Handle worker messages
  const handleWorkerMessage = useCallback((event: MessageEvent<WorkerOutMessage>) => {
    const msg = event.data
    switch (msg.type) {
      case 'progress':
        setDownloadProgress(msg.progress)
        setDownloadStatus(msg.status)
        break
      case 'model-ready':
        setStatus('ready')
        setDownloadProgress(100)
        setDownloadStatus('Ready')
        setShowSuccess(true)
        setModelCached(true)
        try { localStorage.setItem(MODEL_CACHED_KEY, 'true') } catch { /* noop */ }
        setTimeout(() => setShowSuccess(false), SUCCESS_DISMISS_MS)
        break
      case 'model-error':
        console.error('[LocalAI] Model load failed:', msg.error)
        setStatus('error')
        setDownloadStatus(msg.error)
        break
      case 'classify-result': {
        const pending = pendingRef.current.get(msg.id)
        if (pending) {
          clearTimeout(pending.timer)
          pendingRef.current.delete(msg.id)
          pending.resolve(msg.result)
        }
        setStatus('ready')
        break
      }
      case 'classify-error': {
        console.error('[LocalAI] Classification failed:', msg.error)
        const pending = pendingRef.current.get(msg.id)
        if (pending) {
          clearTimeout(pending.timer)
          pendingRef.current.delete(msg.id)
          pending.resolve(null)
        }
        setStatus('ready')
        break
      }
    }
  }, [])

  // Create/destroy worker based on enabled state
  useEffect(() => {
    const shouldRun = enabled

    if (shouldRun && !workerRef.current) {
      const init = async () => {
        try {
          // Refresh auth session BEFORE starting model download.
          // On mobile, the download takes 8-10s — stale tokens during this
          // window cause redirects. Fresh tokens give us a full session
          // lifetime to complete the download.
          try {
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
              await supabase.auth.refreshSession()
            }
          } catch {
            // Auth refresh is best-effort — don't block model load
          }

          const worker = new Worker(
            new URL('./worker.ts', import.meta.url),
            { type: 'module' }
          )
          worker.addEventListener('message', handleWorkerMessage)
          workerRef.current = worker
          setStatus('loading')
          // If model was previously cached, show friendlier status
          if (modelCached) {
            setDownloadStatus('Loading cached model...')
            setDownloadProgress(50)
          }
          worker.postMessage({ type: 'load' })
        } catch (err) {
          console.error('[LocalAI] Failed to create worker:', err)
          setStatus('error')
        }
      }

      // Lazy init: defer to idle time
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => { init() })
      } else {
        setTimeout(() => { init() }, 100)
      }
    }

    if (!shouldRun && workerRef.current) {
      workerRef.current.postMessage({ type: 'dispose' })
      workerRef.current.terminate()
      workerRef.current = null
      // Clear browser cache for model files
      if (typeof caches !== 'undefined') {
        caches.delete('transformers-cache').catch(() => {})
        caches.delete('transformers-meta').catch(() => {})
      }
      pendingRef.current.forEach(p => {
        clearTimeout(p.timer)
        p.resolve(null)
      })
      pendingRef.current.clear()
      setStatus('idle')
      setDownloadProgress(0)
      setDownloadStatus('')
    }
  }, [enabled, handleWorkerMessage, modelCached])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'dispose' })
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [])

  const classify = useCallback(
    (url: string, content: string): Promise<ClientClassification | null> => {
      if (status !== 'ready' || !workerRef.current) {
        return Promise.resolve(null)
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setStatus('classifying')

      return new Promise<ClientClassification | null>((resolve) => {
        const timer = setTimeout(() => {
          console.warn('[LocalAI] Classification timed out after', CLASSIFY_TIMEOUT_MS, 'ms for', id)
          pendingRef.current.delete(id)
          setStatus('ready')
          resolve(null)
        }, CLASSIFY_TIMEOUT_MS)

        pendingRef.current.set(id, { resolve, timer })
        workerRef.current!.postMessage({ type: 'classify', id, url, content })
      })
    },
    [status],
  )

  const disposeWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'dispose' })
      workerRef.current.terminate()
      workerRef.current = null
    }
    // Clear browser cache for model files
    if (typeof caches !== 'undefined') {
      caches.delete('transformers-cache').catch(() => {})
      caches.delete('transformers-meta').catch(() => {})
    }
    try { localStorage.removeItem(MODEL_CACHED_KEY) } catch { /* noop */ }
    setModelCached(false)
    pendingRef.current.forEach(p => {
      clearTimeout(p.timer)
      p.resolve(null)
    })
    pendingRef.current.clear()
    setStatus('idle')
    setDownloadProgress(0)
  }, [])

  const isReady = status === 'ready'

  const value: LocalAIContextValue = {
    status,
    isReady,
    enabled,
    setEnabled,
    classify,
    downloadProgress,
    downloadStatus,
    showSuccess,
    modelCached,
    dispose: disposeWorker,
  }

  return (
    <LocalAIContext.Provider value={value}>
      {children}
    </LocalAIContext.Provider>
  )
}

export function useLocalAI() {
  const ctx = useContext(LocalAIContext)
  if (!ctx) throw new Error('useLocalAI must be used within LocalAIProvider')
  return ctx
}
