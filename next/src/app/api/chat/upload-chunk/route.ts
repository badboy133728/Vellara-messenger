import { requireAuth } from '@/lib/auth';
import {
  MAX_DOCUMENT_BYTES,
  MAX_VIDEO_BYTES,
  contentTypeForExtension,
  resolveFileType,
} from '@/lib/chat/attachmentTypes';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

const CHUNK_PREFIX = '_chunks';
const MAX_CHUNKS = 24;
const MAX_CHUNK_BYTES = 3 * 1024 * 1024;

function parsePositiveInt(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user } = auth;

  const formData = await request.formData();
  const uploadId = (formData.get('upload_id') as string | null)?.trim();
  const chunkIndex = parsePositiveInt(formData.get('chunk_index'));
  const totalChunks = parsePositiveInt(formData.get('total_chunks'));
  const fileName = (formData.get('file_name') as string | null)?.trim() || 'file';
  const contentTypeRaw = (formData.get('content_type') as string | null)?.trim() || '';
  const chunk = formData.get('chunk');

  if (!uploadId || !/^[0-9a-f-]{36}$/i.test(uploadId)) {
    return Response.json({ message: 'Некорректный идентификатор загрузки' }, { status: 422 });
  }
  if (chunkIndex === null || totalChunks === null || totalChunks < 1 || totalChunks > MAX_CHUNKS) {
    return Response.json({ message: 'Некорректные параметры частей файла' }, { status: 422 });
  }
  if (chunkIndex >= totalChunks) {
    return Response.json({ message: 'Некорректный номер части' }, { status: 422 });
  }
  if (!(chunk instanceof File) || chunk.size === 0) {
    return Response.json({ message: 'Пустая часть файла' }, { status: 422 });
  }
  if (chunk.size > MAX_CHUNK_BYTES) {
    return Response.json({ message: 'Часть файла слишком большая' }, { status: 422 });
  }

  const ext = fileName.split('.').pop()?.toLowerCase() ?? 'bin';
  const fileType = resolveFileType(contentTypeRaw, fileName);
  const maxBytes = fileType === 'video' ? MAX_VIDEO_BYTES : MAX_DOCUMENT_BYTES;

  const admin = createAdminClient();
  const chunkKey = `${CHUNK_PREFIX}/${user.id}/${uploadId}/${chunkIndex}`;

  const { error: chunkError } = await admin.storage.from('messages').upload(chunkKey, Buffer.from(await chunk.arrayBuffer()), {
    contentType: 'application/octet-stream',
    upsert: true,
  });

  if (chunkError) {
    return Response.json({ message: chunkError.message || 'Не удалось сохранить часть файла' }, { status: 500 });
  }

  if (chunkIndex < totalChunks - 1) {
    return Response.json({ ok: true, chunk_index: chunkIndex });
  }

  const parts: Buffer[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const key = `${CHUNK_PREFIX}/${user.id}/${uploadId}/${i}`;
    const { data, error } = await admin.storage.from('messages').download(key);
    if (error || !data) {
      return Response.json({ message: 'Не удалось собрать файл' }, { status: 500 });
    }
    parts.push(Buffer.from(await data.arrayBuffer()));
  }

  const body = Buffer.concat(parts);
  if (!body.byteLength) {
    return Response.json({ message: 'Пустой файл' }, { status: 422 });
  }
  if (body.byteLength > maxBytes) {
    return Response.json({ message: 'Файл слишком большой' }, { status: 422 });
  }

  const contentType = contentTypeRaw || contentTypeForExtension(ext);
  const finalKey = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error: uploadError } = await admin.storage.from('messages').upload(finalKey, body, {
    contentType,
    upsert: false,
  });

  const chunkKeys = Array.from({ length: totalChunks }, (_, i) => `${CHUNK_PREFIX}/${user.id}/${uploadId}/${i}`);
  void admin.storage.from('messages').remove(chunkKeys);

  if (uploadError) {
    return Response.json({ message: uploadError.message || 'Не удалось загрузить файл' }, { status: 500 });
  }

  return Response.json({
    path: `messages/${finalKey}`,
    fileType,
    originalName: fileName,
  });
}
