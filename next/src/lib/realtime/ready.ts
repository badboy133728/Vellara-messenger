import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ensureRealtimeConnected,
  reconnectSupabaseRealtime,
  syncSupabaseRealtimeAuth,
} from '@/lib/realtime/clientAuth';

let bootPromise: Promise<boolean> | null = null;

/** Один soft-connect при старте; не рвёт WebSocket. */
export function ensureRealtimeBoot(supabase: SupabaseClient): Promise<boolean> {
  if (!bootPromise) {
    bootPromise = ensureRealtimeConnected(supabase);
  }
  return bootPromise;
}

export function resetRealtimeBoot() {
  bootPromise = null;
}

/** Мягкая синхронизация JWT без разрыва сокета. */
export function ensureRealtimeAuth(supabase: SupabaseClient): Promise<boolean> {
  return syncSupabaseRealtimeAuth(supabase);
}

/** Подготовка перед подпиской: boot один раз, hard — только при сбое сокета. */
export async function prepareRealtime(
  supabase: SupabaseClient,
  hard = false,
): Promise<boolean> {
  if (hard) {
    resetRealtimeBoot();
    const ok = await reconnectSupabaseRealtime(supabase);
    if (ok) {
      bootPromise = Promise.resolve(true);
    }
    return ok;
  }
  return ensureRealtimeBoot(supabase);
}
