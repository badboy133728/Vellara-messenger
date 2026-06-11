'use client';

import { useState } from 'react';
import { VellaraIcon } from '@/components/icons/VellaraIcon';

export function E2ERecoveryModal({
  mode,
  error,
  onRestore,
}: {
  mode: 'recovery' | 'no_backup';
  error?: string;
  onRestore: (passphrase: string) => Promise<void>;
}) {
  const [passphrase, setPassphrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    const code = passphrase.trim();
    if (code.length < 6) {
      setLocalError('Минимум 6 символов');
      return;
    }
    setLoading(true);
    try {
      await onRestore(code);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Не удалось восстановить ключи');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop e2e-recovery-backdrop" role="presentation">
      <div className="modal modal--e2e-recovery" role="dialog" aria-labelledby="e2e-recovery-title">
        <header className="modal-card__head">
          <h2 id="e2e-recovery-title">
            <VellaraIcon name="settings" size={20} className="modal-card__head-icon" />
            {mode === 'no_backup' ? 'Ключи на другом устройстве' : 'Восстановление шифрования'}
          </h2>
        </header>

        <div className="modal-card__body">
          {mode === 'no_backup' ? (
            <p className="e2e-recovery__hint">
              Сообщения зашифрованы ключом, который есть только на устройстве, где вы уже входили.
              Откройте мессенджер там, зайдите в <strong>Настройки → Код восстановления</strong> и
              задайте код. Затем введите его здесь.
            </p>
          ) : (
            <p className="e2e-recovery__hint">
              Введите код восстановления, чтобы прочитать переписку на этом устройстве.
            </p>
          )}

          <form onSubmit={submit} className="e2e-recovery__form">
            <label className="e2e-recovery__field">
              <span>Код восстановления</span>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoComplete="off"
                placeholder="Ваш код"
                disabled={loading}
              />
            </label>
            {(localError || error) && (
              <p className="e2e-recovery__error" role="alert">
                {localError || error}
              </p>
            )}
            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? 'Восстановление…' : 'Восстановить'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
