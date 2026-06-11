const envFlag = process.env.NEXT_PUBLIC_REALTIME_V2;

/**
 * Realtime v2 is enabled by default after cutover.
 * Set NEXT_PUBLIC_REALTIME_V2=0 to temporarily fall back.
 */
export const realtimeV2Enabled = envFlag !== '0';
