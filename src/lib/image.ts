import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs/promises';

const DEFAULT_MAX_IMAGE_SIZE_BYTES = 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico']);
const BYTE_SIZE_REGEX = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i;

const parseByteSize = (value?: string, fallback = DEFAULT_MAX_IMAGE_SIZE_BYTES): number => {
  if (!value?.trim()) {
    return fallback;
  }

  const match = value.trim().match(BYTE_SIZE_REGEX);
  if (!match) {
    return fallback;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return fallback;
  }

  const unit = (match[2] ?? 'b').toLowerCase();
  const multiplier =
    unit === 'gb' ? 1024 * 1024 * 1024 : unit === 'mb' ? 1024 * 1024 : unit === 'kb' ? 1024 : 1;
  return Math.floor(amount * multiplier);
};

export const getMaxImageSizeBytes = (): number =>
  parseByteSize(process.env.MAX_IMAGE_SIZE_BYTES, DEFAULT_MAX_IMAGE_SIZE_BYTES);

/**
 * Uploads a file to the server and returns its accessible filename
 * @param file - The image file to upload
 * @returns A Promise resolving to the uploaded filename
 */
export async function uploadImageAction(file: File): Promise<string> {
  'use server';
  const maxImageSizeBytes = getMaxImageSizeBytes();

  const extension = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error('Invalid file type');
  }

  if (file.size > maxImageSizeBytes) {
    throw new Error('File size exceeds the limit');
  }

  const destinationName = randomUUID() + extension;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.mkdir(path.join(process.cwd(), 'uploads'), { recursive: true });
  await fs.writeFile(path.join(process.cwd(), 'uploads', destinationName), buffer);
  return destinationName;
}
