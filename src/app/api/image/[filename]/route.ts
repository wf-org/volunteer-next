import { NextRequest } from 'next/server';
import path from 'node:path';
import { contentTypeFor, readUpload } from '@/lib/uploads';

export const GET = async (
  request: NextRequest,
  { params }: RouteContext<'/api/image/[filename]'>
): Promise<Response> => {
  const filename = (await params).filename;
  if (filename !== path.basename(filename)) {
    return new Response('Invalid filename', { status: 400 });
  }
  try {
    const file = await readUpload(filename);
    if (!file) {
      return new Response('File not found', { status: 404 });
    }
    return new Response(Buffer.from(file), {
      headers: { 'Content-Type': contentTypeFor(filename) }
    });
  } catch (error) {
    console.error('Error reading file:', error);
    return new Response('File not found', { status: 404 });
  }
};
