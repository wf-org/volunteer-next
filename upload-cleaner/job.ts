import { Pool } from 'pg';
import fs from 'fs';
import fsPromise from 'fs/promises';
import path from 'path';
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const readSecret = (name: string, defaultValue?: string): string => {
  const secretPath = path.join('/run/secrets', name);
  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, 'utf-8').trimEnd();
  }
  return process.env[name] || defaultValue || '';
};

const POSTGRES_HOST = process.env.POSTGRES_HOST || 'localhost';
const POSTGRES_USER = process.env.POSTGRES_USER || 'postgres';
const POSTGRES_PASSWORD = readSecret('POSTGRES_PASSWORD', 'example');
const POSTGRES_DB = process.env.POSTGRES_DB || 'postgres';
const POSTGRES_PORT = Number(process.env.POSTGRES_PORT) || 5432;
// UPLOADS_BUCKET (S3, on Lambda) takes precedence over UPLOADS_DIR (docker compose)
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET;
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(import.meta.dirname, '..', 'uploads');
const FILE_AGE_THRESHOLD_SECONDS = Number(process.env.FILE_AGE_THRESHOLD_SECONDS) || 3600;

console.log(`Connecting to PostgreSQL at ${POSTGRES_HOST}:${POSTGRES_PORT} as ${POSTGRES_USER}...`);

const pool = new Pool({
  host: POSTGRES_HOST,
  user: POSTGRES_USER,
  password: POSTGRES_PASSWORD,
  database: POSTGRES_DB,
  port: POSTGRES_PORT,
  // One query per run; on Lambda, one connection per instance
  max: 1
});

const s3 = UPLOADS_BUCKET ? new S3Client({}) : undefined;

type Upload = { name: string; modified: Date };

const listUploads = async (): Promise<Upload[]> => {
  if (s3) {
    const uploads: Upload[] = [];
    let ContinuationToken: string | undefined;
    do {
      const page = await s3.send(
        new ListObjectsV2Command({ Bucket: UPLOADS_BUCKET, ContinuationToken })
      );
      for (const object of page.Contents ?? []) {
        if (object.Key && object.LastModified) {
          uploads.push({ name: object.Key, modified: object.LastModified });
        }
      }
      ContinuationToken = page.NextContinuationToken;
    } while (ContinuationToken);
    return uploads;
  }
  const files = await fsPromise.readdir(UPLOADS_DIR);
  return Promise.all(
    files.map(async (file) => ({
      name: file,
      modified: (await fsPromise.stat(path.join(UPLOADS_DIR, file))).mtime
    }))
  );
};

const deleteUpload = async (name: string): Promise<void> => {
  if (s3) {
    await s3.send(new DeleteObjectCommand({ Bucket: UPLOADS_BUCKET, Key: name }));
  } else {
    await fsPromise.unlink(path.join(UPLOADS_DIR, name));
  }
};

export const cleanUploads = async (): Promise<void> => {
  try {
    // Remove any uploaded files that aren't referenced in the database
    const result = await pool.query(`SELECT logo, logo_dark, favicon FROM event`);
    const referencedFiles = new Set<string>(
      result.rows.flatMap((row) => {
        const files: string[] = [];
        if (row.logo) {
          files.push(row.logo);
        }
        if (row.logo_dark) {
          files.push(row.logo_dark);
        }
        if (row.favicon) {
          files.push(row.favicon);
        }
        return files;
      })
    );
    const uploads = await listUploads();
    console.log(
      `Found ${uploads.length} uploaded files, ${referencedFiles.size} are referenced in the database.`
    );
    await Promise.all(
      uploads.map((upload) => {
        const apiPath = `/api/image/${path.basename(upload.name)}`;
        if (!referencedFiles.has(apiPath)) {
          return deleteUploadIfOld(upload);
        }
      })
    );
  } catch (error) {
    console.error('Error cleaning uploads:', error);
  }
};

const deleteUploadIfOld = async ({ name, modified }: Upload) => {
  try {
    const fileAge = (Date.now() - modified.getTime()) / 1000; // Age in seconds
    if (fileAge > FILE_AGE_THRESHOLD_SECONDS) {
      await deleteUpload(name);
      console.log(`Deleted old file: ${name}`);
    } else {
      console.log(`File ${name} is not old enough to delete (age: ${fileAge} seconds).`);
    }
  } catch (error) {
    console.error(`Error deleting file ${name}:`, error);
  }
};
