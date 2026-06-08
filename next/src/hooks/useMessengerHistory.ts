'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  DEFAULT_MESSENGER_NAV,
  MESSENGER_NAV_KEY,
  type MessengerNavState,
} from '@/lib/messengerNav';

type Options = {
  isMobile: boolean;
  getState: () => MessengerNavState;
  applyState: (state: MessengerNavState) => void;
};

function readNavState(event: PopStateEvent): MessengerNavState | null {
  const next = (event.state as Record<string, unknown> | null)?.[MESSENGER_NAV_KEY];
  if (!next || typeof next !== 'object') return null;
  return next as MessengerNavState;
}

function isRootNav(state: MessengerNavState): boolean {
  return (
    state.tab === DEFAULT_MESSENGER_NAV.tab &&
    state.activeId === null &&
    state.profileUserId === null &&
    !state.showGroupSettings &&
    !state.showGroupPanel &&
    !state.showCreateGroup
  );
}

export function useMessengerHistory({ isMobile, getState, applyState }: Options) {
  const applyingRef = useRef(false);
  const getStateRef = useRef(getState);
  const applyStateRef = useRef(applyState);
  getStateRef.current = getState;
  applyStateRef.current = applyState;

  const writeHistory = useCallback((mode: 'push' | 'replace', state?: MessengerNavState) => {
    if (!isMobile || applyingRef.current) return;
    const payload = { [MESSENGER_NAV_KEY]: state ?? getStateRef.current() };
    if (mode === 'push') {
      window.history.pushState(payload, '', '/main');
    } else {
      window.history.replaceState(payload, '', '/main');
    }
  }, [isMobile]);

  const navigate = useCallback(
    (mutate: () => void, mode: 'push' | 'replace' | 'none' = 'push') => {
      mutate();
      if (mode === 'push') writeHistory('push');
      else if (mode === 'replace') writeHistory('replace');
    },
    [writeHistory],
  );

  const goBack = useCallback(() => {
    if (!isMobile) return;
    window.history.back();
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) return;

    writeHistory('replace');

    const onPopState = (event: PopStateEvent) => {
      applyingRef.current = true;
      try {
        const next = readNavState(event);
        if (next) {
          applyStateRef.current(next);
          if (window.location.pathname !== '/main') {
            writeHistory('replace', next);
          }
          return;
        }

        const current = getStateRef.current();
        if (window.location.pathname !== '/main') {
          writeHistory('replace', current);
          window.history.forward();
          return;
        }

        if (isRootNav(current)) {
          writeHistory('push', current);
          return;
        }

        applyStateRef.current(DEFAULT_MESSENGER_NAV);
        writeHistory('replace', DEFAULT_MESSENGER_NAV);
      } finally {
        applyingRef.current = false;
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isMobile, writeHistory]);

  return { navigate, goBack, writeHistory };
}

export function isMessengerNavState(value: unknown): value is MessengerNavState {
  if (!value || typeof value !== 'object') return false;
  const v = value as MessengerNavState;
  return typeof v.tab === 'string';
}

export { DEFAULT_MESSENGER_NAV };
