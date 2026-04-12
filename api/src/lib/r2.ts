import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { logger } from './logger'

const r2Endpoint = process.env.R2_ENDPOINT
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY
const r2BucketName = process.env.R2_BUCKET_NAME

let _r2Client: S3Client | null = null

export function getR2Client(): S3Client {
  if (_r2Client) return _r2Client

  if (!r2Endpoint || !r2AccessKeyId || !r2SecretAccessKey) {
    logger.warn('Missing Cloudflare R2 environment variables (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)')
    throw new Error('Cloudflare R2 not configured')
  }

  _r2Client = new S3Client({
    region: 'auto',
    endpoint: r2Endpoint,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  })

  return _r2Client
}

export async function uploadToR2(
  key: string,
  body: Buffer | string,
  contentType: string
): Promise<string> {
  const client = getR2Client()

  if (!r2BucketName) {
    throw new Error('R2_BUCKET_NAME is not defined')
  }

  const command = new PutObjectCommand({
    Bucket: r2BucketName,
    Key: key,
    Body: body,
    ContentType: contentType,
  })

  await client.send(command)

  // Generate a signed GET URL for download (1 hour expiry)
  const getCommand = new GetObjectCommand({ Bucket: r2BucketName, Key: key })
  return getSignedUrl(client, getCommand, { expiresIn: 3600 })
}

export async function getSignedDownloadUrl(key: string): Promise<string> {
  const client = getR2Client()
  if (!r2BucketName) {
    throw new Error('R2_BUCKET_NAME is not defined')
  }

  const command = new GetObjectCommand({
    Bucket: r2BucketName,
    Key: key,
  })

  return getSignedUrl(client, command, { expiresIn: 3600 })
}
