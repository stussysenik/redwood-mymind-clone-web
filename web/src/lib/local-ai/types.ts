/**
 * Local AI Types
 *
 * Types for in-browser classification via Transformers.js + WebGPU.
 */

import type { CardType } from '../types'

/** Result from in-browser Gemma 3 1B classification */
export interface ClientClassification {
  type: CardType
  title: string
  tags: string[]
  summary: string
  source: 'local-ai'
}

/** Messages sent TO the worker */
export type WorkerInMessage =
  | { type: 'load' }
  | { type: 'classify'; id: string; url: string; content: string }
  | { type: 'dispose' }
  | { type: 'clear-cache' }

/** Messages sent FROM the worker */
export type WorkerOutMessage =
  | { type: 'progress'; progress: number; status: string }
  | { type: 'model-ready' }
  | { type: 'model-error'; error: string }
  | { type: 'classify-result'; id: string; result: ClientClassification }
  | { type: 'classify-error'; id: string; error: string }

/** Local AI status */
export type LocalAIStatus = 'idle' | 'loading' | 'ready' | 'error' | 'classifying'
