'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getPushSupport,
  isPushSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push/client';

export function PushNotificationsSection() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [blockReason, setBlockReason] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const support = getPushSupport();
      setSupported(support.supported);
      setBlockReason(support.reason ?? null);
      if (support.supported) {
        setSubscribed(await isPushSubscribed());
      }
    } catch {
      setSupported(false);
      setBlockReason('Не удалось проверить push-уведомления');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enable = async () => {
    setBusy(true);
    setMessage('');
    const result = await subscribeToPush();
    if (result.ok) {
      setSubscribed(true);
      setMessage('Уведомления включены');
    } else {
      setMessage(result.message ?? 'Не удалось включить уведомления');
    }
    setBusy(false);
  };

  const disable = async () => {
    setBusy(true);
    setMessage('');
    await unsubscribeFromPush();
    setSubscribed(false);
    setMessage('Уведомления отключены');
    setBusy(false);
  };

  return (
    <section className="settings-card">
      <h2>Уведомления на телефон</h2>
      <p className="settings-hint">
        Сообщения приходят даже когда сайт закрыт. На iPhone: «Поделиться» → «На экран Домой»,
        затем включите уведомления здесь.
      </p>

      {!supported && (
        <p className="settings-hint settings-hint--warn">
          {blockReason ?? 'Браузер не поддерживает push-уведомления'}
        </p>
      )}

      {supported && (
        <div className="settings-push-actions">
          {subscribed ? (
            <button
              type="button"
              className="profile-btn profile-btn--outline"
              disabled={busy}
              onClick={disable}
            >
              Отключить push
            </button>
          ) : (
            <button
              type="button"
              className="profile-btn profile-btn--gold"
              disabled={busy}
              onClick={enable}
            >
              {busy ? 'Подключение…' : 'Включить push-уведомления'}
            </button>
          )}
        </div>
      )}

      {message && <p className="settings-hint settings-hint--status">{message}</p>}
    </section>
  );
}
