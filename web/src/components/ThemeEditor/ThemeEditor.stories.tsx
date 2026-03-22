import type { Meta, StoryObj } from '@storybook/react'

import { ThemeEditor } from './ThemeEditor'

const meta: Meta<typeof ThemeEditor> = {
  title: 'Tools/ThemeEditor',
  component: ThemeEditor,
  parameters: { layout: 'fullscreen' },
}
export default meta

export const Default: StoryObj<typeof ThemeEditor> = {}
