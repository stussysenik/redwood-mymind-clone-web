export interface SkinInfo {
  name: string
  label: string
  description: string
}

export const SKINS: SkinInfo[] = [
  { name: 'default', label: 'Default', description: 'Classic polished design' },
  { name: 'shadcn', label: 'shadcn/ui', description: 'Clean, minimal, bordered' },
  { name: 'material', label: 'Material', description: 'Elevation, rounded, depth' },
  { name: 'brutalist', label: 'Brutalist', description: 'Raw, thick borders, sharp' },
  { name: 'glassmorphic', label: 'Glass', description: 'Frosted, translucent, blur' },
  { name: 'native', label: 'Native', description: 'System-native, zero overhead' },
]

export function getSkins(): SkinInfo[] {
  return SKINS
}

export function getSkin(name: string): SkinInfo | undefined {
  return SKINS.find((s) => s.name === name)
}
