export const LOCAL_AI_RUNTIME = {
  modelId:
    import.meta.env.VITE_LOCAL_AI_MODEL_ID || 'google/gemma-4-E2B-it',
  modelLabel: import.meta.env.VITE_LOCAL_AI_MODEL_LABEL || 'Gemma 4',
  modelVersion:
    import.meta.env.VITE_LOCAL_AI_MODEL_VERSION || 'gemma-4-e2b-runtime-v1',
  downloadLabel:
    import.meta.env.VITE_LOCAL_AI_MODEL_DOWNLOAD_LABEL ||
    'large model download',
} as const
