export type ApiOptions = RequestInit & {
  /** Не бросать ошибку на 401 (для проверки сессии) */
  allowUnauthorized?: boolean;
};

export const AUTH_UNAUTHORIZED_EVENT = 'vellara:unauthorized';

function notifyUnauthorized() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));
  }
}

export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { allowUnauthorized, ...fetchOptions } = options;

  const res = await fetch(path, {
    credentials: 'include',
    cache: 'no-store',
    ...fetchOptions,
    headers: {
      Accept: 'application/json',
      ...(fetchOptions.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...fetchOptions.headers,
    },
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    if (allowUnauthorized) return null as T;
    notifyUnauthorized();
    throw new Error('Unauthorized');
  }

  if (allowUnauthorized && res.status === 404) {
    return null as T;
  }

  if (!res.ok) {
    const payload = data as { message?: string; error?: { message?: string; code?: string } };
    const message =
      payload.message ??
      payload.error?.message ??
      (res.status === 413 ? 'Файл слишком большой для отправки' : `HTTP ${res.status}`);
    throw new Error(message);
  }
  return data as T;
}
