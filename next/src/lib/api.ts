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
    throw new Error((data as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  return data as T;
}
