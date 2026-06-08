import 'server-only';
import { Agent, fetch as undiciFetch } from 'undici';

const connectTimeoutMs = Number(process.env.SUPABASE_CONNECT_TIMEOUT_MS ?? 25_000);

const dispatcher = new Agent({
  connect: { timeout: connectTimeoutMs },
});

/** Node fetch defaults to 10s connect timeout; slow DNS/network needs more on some hosts. */
export const supabaseServerFetch: typeof fetch = (input, init) =>
  undiciFetch(input as Parameters<typeof undiciFetch>[0], {
    ...(init as object),
    dispatcher,
  }) as unknown as Promise<Response>;

export const supabaseGlobalFetch = { fetch: supabaseServerFetch };
