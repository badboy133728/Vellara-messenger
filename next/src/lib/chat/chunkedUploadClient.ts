import { api } from '@/lib/api';

const CHUNK_BYTES = 2.5 * 1024 * 1024;

export type UploadedMessageFile = {
  path: string;
  fileType: string;
  originalName: string;
};

export async function uploadBlobInChunks(
  blob: Blob,
  fileName: string,
  contentType: string,
): Promise<UploadedMessageFile> {
  const uploadId = crypto.randomUUID();
  const totalChunks = Math.max(1, Math.ceil(blob.size / CHUNK_BYTES));

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_BYTES;
    const chunk = blob.slice(start, start + CHUNK_BYTES);
    const form = new FormData();
    form.append('upload_id', uploadId);
    form.append('chunk_index', String(chunkIndex));
    form.append('total_chunks', String(totalChunks));
    form.append('file_name', fileName);
    form.append('content_type', contentType);
    form.append('chunk', chunk, `part-${chunkIndex}`);

    try {
      const result = await api<{ ok?: boolean; path?: string; fileType?: string; originalName?: string }>(
        '/api/chat/upload-chunk',
        { method: 'POST', body: form, headers: {} },
      );

      if (result.path && result.fileType) {
        return {
          path: result.path,
          fileType: result.fileType,
          originalName: result.originalName ?? fileName,
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Не удалось загрузить файл';
      if (/failed|reset|network|fetch/i.test(msg)) {
        throw new Error('Нет связи с сервером. Проверьте интернет и попробуйте снова.');
      }
      throw err;
    }
  }

  throw new Error('Не удалось загрузить файл');
}
