'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { setupKeyBackup } from '@/lib/crypto/identity';

export function E2EBackupSection({ userId }: { userId: string }) {
  const [hasBackup, setHasBackup] = useState<boolean | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ has_backup: boolean }>('/api/user/e2e-key')
      .then((data) => setHasBackup(Boolean(data.has_backup)))
      .catch(() => setHasBackup(false));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const code = passphrase.trim();
    if (code.length < 6) {
      setError('Минимум 6 символов');
      return;
    }
    if (code !== confirm.trim()) {
      setError('Коды не совпадают');
      return;
    }
    setSaving(true);
    try {
      await setupKeyBackup(userId, code);
      setHasBackup(true);
      setPassphrase('');
      setConfirm('');
      setMessage('Код сохранён. Теперь можно войти с другого устройства.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  if (hasBackup === null) return null;

  return (
    <section className="settings-card settings-card--e2e">
      <h2>Код восстановления шифрования</h2>
      <p className="settings-hint">
        {hasBackup
          ? 'Код задан — переписку можно восстановить на другом устройстве.'
          : 'Задайте код, чтобы читать переписку при входе с телефона или другого браузера.'}
      </p>
      <form onSubmit={save} className="settings-e2e-form">
        <label className="settings-field">
          <span>{hasBackup ? 'Новый код' : 'Код восстановления'}</span>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoComplete="new-password"
            disabled={saving}
          />
        </label>
        <label className="settings-field">
          <span>Повторите код</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            disabled={saving}
          />
        </label>
        {error && <p className="settings-error">{error}</p>}
        {message && <p className="settings-success">{message}</p>}
        <button type="submit" className="btn btn--secondary" disabled={saving}>
          {saving ? 'Сохранение…' : hasBackup ? 'Обновить код' : 'Сохранить код'}
        </button>
      </form>
    </section>
  );
}
