'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { ensureRealtimeAuth, prepareRealtime, resetRealtimeBoot } from '@/lib/realtime/ready';
import { reconnectSupabaseRealtime } from '@/lib/realtime/clientAuth';

type RealtimeBindFactory = () => Promise<RealtimeChannel[]> | RealtimeChannel[];

const AUTH_REFRESH_INTERVAL_MS = 3 * 60 * 1000;

class RealtimeManager {
  private readonly supabase = createClient();
  private authUsers = 0;
  private refreshAuthTimer: number | null = null;

  async prepare(hardReconnect = false): Promise<boolean> {
    return prepareRealtime(this.supabase, hardReconnect);
  }

  get client() {
    return this.supabase;
  }

  retainAuthLifecycle() {
    this.authUsers += 1;
    if (this.authUsers !== 1) return;

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void ensureRealtimeAuth(this.supabase);
    };
    document.addEventListener('visibilitychange', onVisible);

    this.refreshAuthTimer = window.setInterval(() => {
      void ensureRealtimeAuth(this.supabase);
    }, AUTH_REFRESH_INTERVAL_MS);

    this.cleanupAuthLifecycle = () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (this.refreshAuthTimer != null) {
        window.clearInterval(this.refreshAuthTimer);
        this.refreshAuthTimer = null;
      }
    };
  }

  releaseAuthLifecycle() {
    this.authUsers = Math.max(0, this.authUsers - 1);
    if (this.authUsers === 0) {
      this.cleanupAuthLifecycle();
      this.cleanupAuthLifecycle = () => {};
    }
  }

  async reconnectAfterOnline() {
    resetRealtimeBoot();
    await reconnectSupabaseRealtime(this.supabase);
    await this.prepare(false);
  }

  async bindWithRetry(
    bindFactory: RealtimeBindFactory,
    isDisposed: () => boolean,
  ): Promise<{ channels: RealtimeChannel[]; hardReconnect: boolean }> {
    let hardReconnect = false;
    while (!isDisposed()) {
      const ok = await this.prepare(hardReconnect);
      if (!ok) {
        hardReconnect = true;
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        continue;
      }
      const channels = await bindFactory();
      return { channels, hardReconnect };
    }
    return { channels: [], hardReconnect };
  }

  async removeChannels(channels: RealtimeChannel[]) {
    await Promise.all(channels.map((ch) => this.supabase.removeChannel(ch)));
  }

  private cleanupAuthLifecycle: () => void = () => {};
}

let realtimeManager: RealtimeManager | null = null;

export function getRealtimeManager(): RealtimeManager {
  if (!realtimeManager) {
    realtimeManager = new RealtimeManager();
  }
  return realtimeManager;
}
