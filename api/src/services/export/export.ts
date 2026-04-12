import { v4 as uuidv4 } from 'uuid'
import archiver from 'archiver'
import stream from 'stream'
import fetch from 'node-fetch'
import { db } from 'src/lib/db'
import { logger } from 'src/lib/logger'
import { uploadToR2 } from 'src/lib/r2'

// In-memory job tracker (per-instance)
// In production, this should be in Redis or DB
const jobs: Record<string, any> = {}

export const exportJob = ({ jobId }) => {
  return jobs[jobId] || null
}

export const startExport = async ({ options }) => {
  const jobId = uuidv4()
  const userId = context.currentUser.id

  jobs[jobId] = {
    jobId,
    status: 'QUEUED',
    progress: 0,
    fileCount: 0,
    totalSize: 0,
    createdAt: new Date().toISOString(),
  }

  // Start the background process
  // No await here
  runExportTask(jobId, userId, options).catch((err) => {
    logger.error(`Export ${jobId} failed: ${err.message}`)
    jobs[jobId] = { ...jobs[jobId], status: 'FAILED', error: err.message }
  })

  return jobs[jobId]
}

async function runExportTask(jobId, userId, options) {
  jobs[jobId].status = 'PROCESSING'
  jobs[jobId].progress = 5

  try {
    // 1. Fetch matching cards
    const where: any = {
      userId,
      deletedAt: null,
    }

    if (!options.includeArchived) {
      where.archivedAt = null
    }

    if (options.tag) {
      where.tags = { has: options.tag }
    }

    if (options.dateFrom) {
      where.createdAt = { ...where.createdAt, gte: new Date(options.dateFrom) }
    }
    if (options.dateTo) {
      where.createdAt = { ...where.createdAt, lte: new Date(options.dateTo) }
    }

    const cards = await db.card.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    jobs[jobId].fileCount = cards.length
    jobs[jobId].progress = 10

    if (cards.length === 0) {
      throw new Error('No cards found matching export criteria')
    }

    // 2. Setup Archiver
    const archive = archiver('zip', { zlib: { level: 9 } })
    const buffers: Buffer[] = []
    const outputStream = new stream.PassThrough()

    outputStream.on('data', (chunk) => buffers.push(chunk))
    const uploadPromise = new Promise((resolve, reject) => {
      outputStream.on('end', () => resolve(Buffer.concat(buffers)))
      outputStream.on('error', reject)
    })

    archive.pipe(outputStream)

    // 3. Serialize cards
    const format = options.format.toLowerCase()
    let cardsContent = ''
    const includeContent = options.categories.includes('CONTENT')
    const includeMetadata = options.categories.includes('METADATA')

    if (format === 'json') {
      cardsContent = JSON.stringify(cards.map(c => serializeCard(c, options.categories)), null, 2)
      archive.append(cardsContent, { name: `cards.json` })
    } else if (format === 'jsonl') {
      cardsContent = cards.map(c => JSON.stringify(serializeCard(c, options.categories))).join('\n')
      archive.append(cardsContent, { name: `cards.jsonl` })
    } else if (format === 'csv') {
      cardsContent = serializeToCsv(cards, includeContent)
      archive.append(cardsContent, { name: `cards.csv` })
    } else if (format === 'markdown') {
      // For markdown, we might want individual files or one big file.
      // Spec says: cards.md at root.
      cardsContent = cards.map(c => serializeToMarkdown(c, includeContent, includeMetadata)).join('\n\n---\n\n')
      archive.append(cardsContent, { name: `cards.md` })
    }

    jobs[jobId].progress = 30

    // 4. Handle Media
    if (options.categories.includes('MEDIA')) {
      const mediaStep = 60 / cards.length
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i]
        if (card.imageUrl) {
          try {
            const response = await fetch(card.imageUrl, { signal: AbortSignal.timeout(10000) })
            if (response.ok) {
              const buffer = await response.buffer()
              const ext = getExtension(card.imageUrl, response.headers.get('content-type'))
              archive.append(buffer, { name: `media/${card.id}.${ext}` })
            }
          } catch (err) {
            logger.warn(`Failed to fetch image for card ${card.id}: ${err.message}`)
          }
        }

        // Check for carousel images in metadata
        const metadata = (card.metadata as any) || {}
        if (Array.isArray(metadata.images)) {
          for (let j = 0; j < metadata.images.length; j++) {
            const imgUrl = metadata.images[j]
            try {
              const response = await fetch(imgUrl, { signal: AbortSignal.timeout(10000) })
              if (response.ok) {
                const buffer = await response.buffer()
                const ext = getExtension(imgUrl, response.headers.get('content-type'))
                archive.append(buffer, { name: `media/${card.id}_${j + 1}.${ext}` })
              }
            } catch (err) {
              logger.warn(`Failed to fetch carousel image ${j} for card ${card.id}: ${err.message}`)
            }
          }
        }
        jobs[jobId].progress = Math.floor(30 + (i + 1) * mediaStep)
      }
    }

    // 5. Manifest
    const manifest = {
      exportDate: new Date().toISOString(),
      cardCount: cards.length,
      categories: options.categories,
      format: options.format,
    }
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })

    // 6. Finalize
    await archive.finalize()
    const finalBuffer = (await uploadPromise) as Buffer
    jobs[jobId].totalSize = finalBuffer.length
    jobs[jobId].progress = 95

    // 7. Upload to R2
    const fileName = `export-${userId}-${jobId}.zip`
    const downloadUrl = await uploadToR2(fileName, finalBuffer, 'application/zip')

    jobs[jobId].status = 'COMPLETE'
    jobs[jobId].progress = 100
    jobs[jobId].downloadUrl = downloadUrl
    jobs[jobId].expiresAt = new Date(Date.now() + 3600000).toISOString()

  } catch (error) {
    logger.error(`Export error: ${error.message}`)
    jobs[jobId].status = 'FAILED'
    jobs[jobId].error = error.message
  }
}

function serializeCard(card, categories) {
  const result: any = {
    id: card.id,
    type: card.type,
    title: card.title,
    url: card.url,
    tags: card.tags,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  }

  if (categories.includes('CONTENT')) {
    result.content = card.content
    const metadata = (card.metadata as any) || {}
    result.scrapedTitle = metadata.scrapedTitle
    result.scrapedDescription = metadata.scrapedDescription
  }

  if (categories.includes('METADATA')) {
    result.metadata = card.metadata
  }

  return result
}

function serializeToCsv(cards, includeContent) {
  const headers = ['id', 'type', 'title', 'url', 'content', 'note', 'tags', 'created']
  const rows = cards.map(card => {
    const metadata = (card.metadata as any) || {}
    return [
      card.id,
      card.type,
      card.title || '',
      card.url || '',
      includeContent ? (card.content || '') : '',
      includeContent ? (metadata.scrapedDescription || card.content || '') : '',
      (card.tags || []).join(','),
      card.createdAt.toISOString()
    ].map(val => `"${val.toString().replace(/"/g, '""')}"`).join(',')
  })

  return [headers.join(','), ...rows].join('\n')
}

function serializeToMarkdown(card, includeContent, includeMetadata) {
  let md = `---
title: ${card.title || 'Untitled'}
url: ${card.url || ''}
type: ${card.type}
tags: ${(card.tags || []).join(', ')}
created: ${card.createdAt.toISOString()}
---

# ${card.title || 'Untitled'}

`
  if (includeContent && card.content) {
    md += `## Content\n\n${card.content}\n\n`
  }

  if (includeMetadata) {
    md += `## Metadata\n\n\`\`\`json\n${JSON.stringify(card.metadata, null, 2)}\n\`\`\`\n`
  }

  return md
}

function getExtension(url, contentType) {
  if (contentType) {
    const mimeMap = {
      'image/jpeg': 'jpeg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
    }
    if (mimeMap[contentType]) return mimeMap[contentType]
  }

  const parts = url.split('.')
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1].split(/[?#]/)[0]
    if (lastPart.length <= 4) return lastPart
  }
  return 'bin'
}
