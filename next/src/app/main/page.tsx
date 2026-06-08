'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { MessengerApp } from '@/components/messenger/MessengerApp';

export default function MainPage() {
  const router = useRouter();
  const { initialized, isAuthenticated } = useAuth();

  useEffect(() => {
    if (initialized && !isAuthenticated) {
      router.replace('/login?reason=auth_required&redirect=%2Fmain');
      return;
    }
    if (initialized && isAuthenticated && window.location.search) {
      router.replace('/main');
    }
  }, [initialized, isAuthenticated, router]);

  if (!initialized) {
    return <div className="loading-screen">Загрузка…</div>;
  }

  if (!isAuthenticated) {
    return <div className="loading-screen">Перенаправление…</div>;
  }

  return <MessengerApp />;
}
