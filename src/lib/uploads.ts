/**
 * Storage for uploaded files: the S3 bucket in UPLOADS_BUCKET when set (Lambda),
 * otherwise ./uploads on disk (local development and docker compose).
 * @since 2026-11-10
 */

import 'server-only';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { S3Client } from '@aws-sdk/client-s3';

const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET;
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

/**
 * MIME type for an uploaded file, from its extension
 * @param name - File name
 * @returns The MIME type, or application/octet-stream if unknown
 */
export const contentTypeFor = (name: string): string =>
  CONTENT_TYPES[path.extname(name).toLowerCase()] ?? 'application/octet-stream';

// Loaded only when UPLOADS_BUCKET is set (Lambda), not in local development or tests
const loadS3 = () => import('@aws-sdk/client-s3');
let s3: S3Client | undefined;
const getS3 = async (): Promise<S3Client> => (s3 ??= new (await loadS3()).S3Client({}));

/**
 * Stores an uploaded file
 * @param name - File name (also the S3 object key)
 * @param data - File contents
 */
export async function saveUpload(name: string, data: Buffer): Promise<void> {
  if (UPLOADS_BUCKET) {
    const { PutObjectCommand } = await loadS3();
    await (
      await getS3()
    ).send(
      new PutObjectCommand({
        Bucket: UPLOADS_BUCKET,
        Key: name,
        Body: data,
        ContentType: contentTypeFor(name)
      })
    );
    return;
  }
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, name), data);
}

/**
 * Reads an uploaded file
 * @param name - File name (also the S3 object key)
 * @returns The file contents, or null if there is no such file
 */
export async function readUpload(name: string): Promise<Uint8Array | null> {
  if (UPLOADS_BUCKET) {
    const { GetObjectCommand, NoSuchKey } = await loadS3();
    try {
      const object = await (
        await getS3()
      ).send(new GetObjectCommand({ Bucket: UPLOADS_BUCKET, Key: name }));
      return (await object.Body?.transformToByteArray()) ?? null;
    } catch (error) {
      if (error instanceof NoSuchKey) {
        return null;
      }
      throw error;
    }
  }
  try {
    return await fs.readFile(path.join(UPLOADS_DIR, name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
