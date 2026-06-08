'use client';

import { useEffect, useState } from 'react';
import { getPushSupport, isPushSubscribed, subscribeToPush } from '@/lib/push/client';

const DISMISS_KEY = 'vellara_push_banner_dismissed';

export function PushNotificationBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const support = getPushSupport();
      if (!support.supported) return;
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
      if (await isPushSubscribed()) return;
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return;
      setVisible(true);
    })();
  }, []);

  if (!visible) return null;

  const enable = async () => {
    setBusy(true);
    const result = await subscribeToPush();
    setBusy(false);
    if (result.ok) {
      setVisible(false);
      localStorage.setItem(DISMISS_KEY, '1');
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };

  return (
    <div className="push-banner" role="status">
      <div className="push-banner__body">
        <strong>Уведомления о сообщениях</strong>
        <span>Получайте сообщения на телефон, даже когда сайт закрыт</span>
      </div>
      <div className="push-banner__actions">
        <button
          type="button"
          className="profile-btn profile-btn--gold"
          disabled={busy}
          onClick={enable}
        >
          {busy ? '…' : 'Включить'}
        </button>
        <button type="button" className="profile-btn profile-btn--outline" onClick={dismiss}>
          Позже
        </button>
      </div>
    </div>
  );
}
