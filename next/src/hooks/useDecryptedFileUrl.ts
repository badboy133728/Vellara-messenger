'use client';

import { useEffect, useState } from 'react';
import { decryptBlob } from '@/lib/crypto/message';
import { getConversationKey, type ConversationKeyContext } from '@/lib/crypto/conversationKey';
import { isE2EFileName } from '@/lib/crypto/message';
import {
  getCachedDecryptedMediaUrl,
  mediaUrlCacheKey,
  setCachedDecryptedMediaUrl,
} from '@/lib/e2e/mediaUrlCache';
import { storageProxyUrl } from '@/lib/storage';

export function useDecryptedFileUrl(
  userId: string | null | undefined,
  ctx: ConversationKeyContext | null,
  filePath: string | null | undefined,
  fileOriginalName: string | null | undefined,
  mimeHint?: string,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const convId = ctx?.conversationId ?? 0;
  const partnerId = ctx?.partnerUserId ?? '';
  const convType = ctx?.conversationType ?? '';

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;

    const run = async () => {
      const proxy = storageProxyUrl(filePath);
      if (!proxy || !userId || !ctx) {
        setUrl(proxy);
        return;
      }

      const encrypted = isE2EFileName(fileOriginalName) || filePath?.endsWith('.e2e');
      if (!encrypted) {
        setUrl(proxy);
        return;
      }

      const cacheKey = mediaUrlCacheKey(filePath!, fileOriginalName);
      const cached = getCachedDecryptedMediaUrl(cacheKey);
      if (cached) {
        setUrl(cached);
        return;
      }

      try {
        const res = await fetch(proxy, { credentials: 'include' });
        if (!res.ok) throw new Error('fetch failed');
        const blob = await res.blob();
        const key = await getConversationKey(userId, ctx);
        const plain = await decryptBlob(key, blob, mimeHint);
        revoked = URL.createObjectURL(plain);
        setCachedDecryptedMediaUrl(cacheKey, revoked);
        if (!cancelled) setUrl(revoked);
      } catch {
        if (!cancelled) setUrl(proxy);
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (revoked) {
        const cacheKey = filePath ? mediaUrlCacheKey(filePath, fileOriginalName) : '';
        const cached = cacheKey ? getCachedDecryptedMediaUrl(cacheKey) : null;
        if (cached !== revoked) URL.revokeObjectURL(revoked);
      }
    };
  }, [userId, convId, partnerId, convType, filePath, fileOriginalName, mimeHint]);

  return url;
}
