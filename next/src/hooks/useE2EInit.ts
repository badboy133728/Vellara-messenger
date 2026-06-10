'use client';

import { useCallback, useEffect, useState } from 'react';
import { clearConversationKeyCache } from '@/lib/crypto/conversationKey';
import {
  E2ENoBackupError,
  E2ERecoveryRequiredError,
  clearIdentityCache,
  ensureIdentityKeys,
} from '@/lib/crypto/identity';

export type E2EStatus = 'loading' | 'ready' | 'recovery' | 'no_backup' | 'error';

export function useE2EInit(userId: string | null | undefined) {
  const [status, setStatus] = useState<E2EStatus>('loading');
  const [error, setError] = useState('');

  const init = useCallback(
    async (recoveryPassphrase?: string) => {
      if (!userId) return;
      setStatus('loading');
      setError('');
      try {
        await ensureIdentityKeys(
          userId,
          recoveryPassphrase ? { recoveryPassphrase } : undefined,
        );
        setStatus('ready');
      } catch (err) {
        if (err instanceof E2ERecoveryRequiredError) {
          setStatus('recovery');
        } else if (err instanceof E2ENoBackupError) {
          setStatus('no_backup');
        } else {
          setError(err instanceof Error ? err.message : 'Ошибка ключей шифрования');
          setStatus('error');
        }
      }
    },
    [userId],
  );

  useEffect(() => {
    void init();
  }, [init]);

  const restoreE2E = useCallback(
    async (passphrase: string) => {
      if (!userId) return;
      clearIdentityCache();
      clearConversationKeyCache();
      setStatus('loading');
      setError('');
      try {
        await ensureIdentityKeys(userId, { recoveryPassphrase: passphrase });
        setStatus('ready');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Не удалось восстановить ключи';
        setError(message);
        setStatus('recovery');
        throw err;
      }
    },
    [userId],
  );

  return { e2eStatus: status, e2eError: error, restoreE2E, retryE2E: init };
}
