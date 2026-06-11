'use client';

import { useMemo } from 'react';
import { storageDisplayUrl } from '@/lib/storage';

/** Same-origin URL для файла в Storage. */
export function useStorageImageUrl(path: string | null | undefined) {
  return useMemo(() => storageDisplayUrl(path), [path]);
}
