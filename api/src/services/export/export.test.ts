import { startExport, exportJob } from './export'
import { db } from 'src/lib/db'
import * as r2 from 'src/lib/r2'

jest.mock('src/lib/db', () => ({
  db: {
    card: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}))

jest.mock('src/lib/r2', () => ({
  uploadToR2: jest.fn().mockResolvedValue('https://r2.com/export.zip'),
}))

// Mock node-fetch
jest.mock('node-fetch', () => jest.fn())
const fetch = require('node-fetch')

describe('export service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset global context for test
    global.context = { currentUser: { id: 'user-1' } }
  })

  it('starts an export job', async () => {
    const options = {
      categories: ['CORE'],
      format: 'JSON',
      includeArchived: false,
    }

    const job = await startExport({ options })
    expect(job.jobId).toBeDefined()
    expect(job.status).toBe('QUEUED')

    const polled = exportJob({ jobId: job.jobId })
    expect(polled.jobId).toBe(job.jobId)
  })

  it('processes a full export (mocked)', async () => {
    const mockCards = [
      {
        id: 'card-1',
        type: 'image',
        title: 'Test Card',
        url: 'https://example.com',
        tags: ['test'],
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
      }
    ]

    ;(db.card.findMany as jest.Mock).mockResolvedValue(mockCards)

    const options = {
      categories: ['CORE'],
      format: 'JSON',
      includeArchived: false,
    }

    const job = await startExport({ options })

    // Wait for background task to finish (it's async)
    // In tests we can just wait a bit or use a helper
    // Since we can't easily await the background task, we'll poll until it's COMPLETE or FAILED
    let currentJob = job
    let attempts = 0
    while (currentJob.status !== 'COMPLETE' && currentJob.status !== 'FAILED' && attempts < 10) {
      await new Promise(r => setTimeout(r, 100))
      currentJob = exportJob({ jobId: job.jobId })
      attempts++
    }

    expect(currentJob.status).toBe('COMPLETE')
    expect(currentJob.progress).toBe(100)
    expect(currentJob.downloadUrl).toBe('https://r2.com/export.zip')
    expect(db.card.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-1' })
    }))
  })
})
