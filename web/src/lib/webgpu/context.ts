/**
 * WebGPU Context — stub module
 *
 * Provides a no-op useWebGPU hook so components that import it
 * compile in environments without WebGPU support (tests, Storybook).
 */

export function useWebGPU() {
  return {
    reportHover: () => {},
  }
}
