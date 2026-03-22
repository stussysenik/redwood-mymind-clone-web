import type { StorybookConfig } from '@storybook/react-vite'
import path from 'node:path'

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx|mdx)'],
  addons: ['@storybook/addon-essentials'],
  viteFinal: async (config) => {
    // Flatten and remove RedwoodJS vite plugins that inject entry.client.tsx
    const flatPlugins = (config.plugins || []).flat(Infinity)
    config.plugins = flatPlugins.filter((plugin) => {
      if (!plugin || typeof plugin !== 'object') return true
      const name = 'name' in plugin ? String(plugin.name) : ''
      return (
        !name.includes('redwood') &&
        !name.includes('rw-')
      )
    })

    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...config.resolve.alias,
      src: path.resolve(__dirname, '../src'),
    }

    return config
  },
}

export default config
