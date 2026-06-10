'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  DEFAULT_MESSENGER_NAV,
  MESSENGER_NAV_KEY,
  type MessengerNavState,
} from '@/lib/messengerNav';

export type NavigatePatch =
  | Partial<MessengerNavState>
  | ((prev: MessengerNavState) => Partial<MessengerNavState>);

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
    !state.showCreateGroup &&
    !state.showCreateChannel
  );
}

export function useMessengerHistory({ isMobile, getState, applyState }: Options) {
  const applyingRef = useRef(false);
  const desktopStackRef = useRef<MessengerNavState[]>([]);
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
    (patch: NavigatePatch, mode: 'push' | 'replace' | 'none' = 'push') => {
      const prev = getStateRef.current();
      const delta = typeof patch === 'function' ? patch(prev) : patch;
      const next: MessengerNavState = { ...prev, ...delta };

      if (!isMobile && mode === 'push') {
        desktopStackRef.current.push({ ...prev });
      } else if (!isMobile && mode === 'replace') {
        desktopStackRef.current = [];
      }

      applyStateRef.current(next);

      if (mode === 'push') writeHistory('push', next);
      else if (mode === 'replace') writeHistory('replace', next);
    },
    [writeHistory, isMobile],
  );

  const goBack = useCallback(() => {
    if (isMobile) {
      window.history.back();
      return;
    }

    const prev = desktopStackRef.current.pop();
    if (prev) {
      applyingRef.current = true;
      try {
        applyStateRef.current(prev);
      } finally {
        applyingRef.current = false;
      }
      return;
    }

    const current = getStateRef.current();
    if (current.showGroupSettings) {
      applyStateRef.current({ ...current, showGroupSettings: false });
    } else if (current.showGroupPanel) {
      applyStateRef.current({ ...current, showGroupPanel: false });
    } else if (current.showCreateGroup) {
      applyStateRef.current({ ...current, showCreateGroup: false });
    } else if (current.profileUserId) {
      applyStateRef.current({ ...current, profileUserId: null });
    } else if (current.activeId != null) {
      applyStateRef.current({ ...current, activeId: null });
    }
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
