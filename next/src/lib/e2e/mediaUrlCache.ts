/** Кэш blob-URL расшифрованных вложений — не качаем файл повторно при каждом рендере. */
const cache = new Map<string, string>();

export function mediaUrlCacheKey(
  filePath: string,
  fileOriginalName?: string | null,
): string {
  return `${filePath}:${fileOriginalName ?? ''}`;
}

export function getCachedDecryptedMediaUrl(key: string): string | undefined {
  return cache.get(key);
}

export function setCachedDecryptedMediaUrl(key: string, url: string): void {
  cache.set(key, url);
}

export function clearDecryptedMediaUrlCache(): void {
  for (const url of cache.values()) {
    URL.revokeObjectURL(url);
  }
  cache.clear();
}
