import React from 'react'
import type { Preview, Decorator } from '@storybook/react'
import { ThemeProvider } from '../src/lib/theme/ThemeProvider'
import '../src/index.css'

import themeManifestRaw from '../src/lib/themes/generated/manifest.json'

const themeManifest = themeManifestRaw as Array<{
  name: string
  label: string
  colorMode: string
  category: string
  preview: string
}>

const withThemeProvider: Decorator = (Story, context) => {
  const themePack = context.globals.themePack || 'default'
  const baseTheme = context.globals.theme || 'light'
  const skin = context.globals.skin || 'default'

  // When a theme pack is selected, use it directly; otherwise fall back to light/dark base
  const effectiveTheme = themePack !== 'default' ? themePack : baseTheme

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme)
    // Set colorScheme so native form controls render correctly
    const manifest = themeManifest.find((t) => t.name === themePack)
    document.documentElement.style.colorScheme =
      manifest?.colorMode || baseTheme
  }, [effectiveTheme, themePack, baseTheme])

  React.useEffect(() => {
    if (skin === 'default') {
      document.documentElement.removeAttribute('data-skin')
    } else {
      document.documentElement.setAttribute('data-skin', skin)
    }
  }, [skin])

  return (
    <ThemeProvider defaultTheme={baseTheme}>
      <div
        data-theme={effectiveTheme}
        data-skin={skin !== 'default' ? skin : undefined}
        style={{ padding: '1rem' }}
      >
        <Story />
      </div>
    </ThemeProvider>
  )
}

const preview: Preview = {
  decorators: [withThemeProvider],
  globalTypes: {
    themePack: {
      description: 'Theme Pack',
      defaultValue: 'default',
      toolbar: {
        title: 'Theme Pack',
        icon: 'paintbrush',
        items: [
          { value: 'default', title: '🎨 Default (BYOA/Riso)' },
          // Custom themes
          ...themeManifest
            .filter((t) => t.category === 'custom')
            .map((t) => ({ value: t.name, title: t.label })),
          // DaisyUI themes
          ...themeManifest
            .filter((t) => t.category === 'daisyui')
            .map((t) => ({ value: t.name, title: `🌼 ${t.label}` })),
        ],
        dynamicTitle: true,
      },
    },
    theme: {
      description: 'Base Mode (when using Default theme)',
      defaultValue: 'light',
      toolbar: {
        title: 'Mode',
        icon: 'circlehollow',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
    skin: {
      description: 'Skin',
      defaultValue: 'default',
      toolbar: {
        title: 'Skin',
        icon: 'component',
        items: [
          { value: 'default', title: 'Default' },
          { value: 'shadcn', title: 'shadcn/ui' },
          { value: 'material', title: 'Material' },
          { value: 'brutalist', title: 'Brutalist' },
          { value: 'glassmorphic', title: 'Glass' },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    layout: 'padded',
  },
}

export default preview
