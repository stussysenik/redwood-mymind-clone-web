/**
 * Barrel file for shared utility modules.
 *
 * Re-exports all lib utilities so consumers can import from a single path:
 *   import { detectPlatform, decodeHtmlEntities } from 'src/lib'
 */

export * from './platforms'
export * from './textUtils'
export * from './enrichment-timing'
export * from './image-config'
export * from './color-utils'
export * from './pagination-config'
