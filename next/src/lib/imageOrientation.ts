/** Загружает файл с учётом EXIF Orientation (iPhone и др.). */
export async function loadOrientedImage(file: File): Promise<HTMLCanvasElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(bitmap, 0, 0);
      bitmap.close?.();
      return canvas;
    } catch {
      /* fallback */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/jpeg',
  quality = 0.92,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Не удалось сохранить изображение'))),
      type,
      quality,
    );
  });
}

export function canvasToFile(
  canvas: HTMLCanvasElement,
  filename = 'avatar.jpg',
  type = 'image/jpeg',
  quality = 0.92,
): Promise<File> {
  return canvasToBlob(canvas, type, quality).then(
    (blob) => new File([blob], filename, { type }),
  );
}
