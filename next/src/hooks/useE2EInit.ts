'use client';

import { useEffect } from 'react';
import { ensureIdentityKeys } from '@/lib/crypto/identity';

export function useE2EInit(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId) return;
    void ensureIdentityKeys(userId).catch(() => {
      /* ключи создадутся при первой отправке */
    });
  }, [userId]);
}
