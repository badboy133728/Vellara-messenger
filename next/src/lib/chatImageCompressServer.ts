import sharp from 'sharp';

const MAX_BYTES = 3.5 * 1024 * 1024;
const MAX_EDGE = 2048;

/** Сжимает фото на сервере (HEIC/JPEG/PNG → JPEG, EXIF rotation). */
export async function compressMessageImageBuffer(
  input: Buffer,
): Promise<{ buffer: Buffer; ext: string; contentType: string } | null> {
  if (!input.byteLength) return null;

  try {
    let pipeline = sharp(input, { failOn: 'none', animated: false }).rotate();
    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) return null;

    if (Math.max(meta.width, meta.height) > MAX_EDGE) {
      pipeline = pipeline.resize(MAX_EDGE, MAX_EDGE, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    let quality = 88;
    let buffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
    while (buffer.length > MAX_BYTES && quality > 52) {
      quality -= 8;
      buffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
    }

    if (buffer.length > MAX_BYTES) return null;

    return { buffer, ext: 'jpg', contentType: 'image/jpeg' };
  } catch {
    return null;
  }
}
