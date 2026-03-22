/**
 * Local AI — stub module
 *
 * Provides a no-op useLocalAI hook so components that import it
 * compile in environments without WebGPU/local model support (tests, Storybook).
 */

export type LocalAIStatus = 'idle' | 'loading' | 'ready' | 'error' | 'classifying'

export function useLocalAI() {
  return {
    status: 'idle' as LocalAIStatus,
    enabled: false,
    isReady: false,
    setEnabled: (_enabled: boolean) => {},
    classify: async (_url: string, _content: string) => null,
    downloadProgress: 0,
    downloadStatus: '',
  }
}
