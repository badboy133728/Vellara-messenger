import { canvasToFile, loadOrientedImage } from '@/lib/imageOrientation';

const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024;
const MAX_EDGE = 2048;

function isChatImage(file: File) {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(file.name);
}

function resizeCanvas(source: HTMLCanvasElement, maxEdge: number): HTMLCanvasElement {
  const { width, height } = source;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  if (scale >= 1) return source;

  const out = document.createElement('canvas');
  out.width = Math.round(width * scale);
  out.height = Math.round(height * scale);
  const ctx = out.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, out.width, out.height);
  }
  return out;
}

/** Сжимает фото для отправки (Vercel лимит ~4.5MB, EXIF orientation). */
export async function prepareChatImageFile(file: File): Promise<File> {
  if (!isChatImage(file)) return file;

  const oriented = await loadOrientedImage(file);
  const resized = resizeCanvas(oriented, MAX_EDGE);

  let quality = 0.88;
  let result = await canvasToFile(resized, 'photo.jpg', 'image/jpeg', quality);

  while (result.size > MAX_UPLOAD_BYTES && quality > 0.52) {
    quality -= 0.08;
    result = await canvasToFile(resized, 'photo.jpg', 'image/jpeg', quality);
  }

  if (result.size > MAX_UPLOAD_BYTES) {
    throw new Error('Фото слишком большое. Попробуйте другое изображение.');
  }

  return result;
}
