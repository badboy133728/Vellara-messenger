'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useCall } from '@/hooks/useCallManager';
import { ContactAvatar } from '@/components/ContactAvatar';
import { VellaraIcon } from '@/components/icons/VellaraIcon';

type CallItem = {
  id: number;
  type: string;
  status: string;
  direction: string;
  duration: number;
  started_at?: string;
  ended_at?: string;
  created_at?: string;
  peer: { id: string; name: string; last_name: string; avatar?: string | null } | null;
};

type Contact = { id: string; name: string; last_name: string; avatar: string | null };

const STATUS_LABELS: Record<string, string> = {
  completed: 'Завершён',
  missed: 'Пропущен',
  rejected: 'Отклонён',
  ringing: 'Вызов',
};

export function CallsPanel() {
  const { startCall, loadContactIds, phase } = useCall();
  const [history, setHistory] = useState<CallItem[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactIds, setContactIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showNewCall, setShowNewCall] = useState(false);
  const [contactFilter, setContactFilter] = useState('');
  const [callError, setCallError] = useState('');
  const prevPhase = useRef(phase);

  const load = useCallback(async () => {
    const [callList, contactList, ids] = await Promise.all([
      api<CallItem[]>('/api/calls'),
      api<Contact[]>('/api/contacts/my'),
      loadContactIds(),
    ]);
    setHistory(callList);
    setContacts(contactList);
    setContactIds(ids);
  }, [loadContactIds]);

  useEffect(() => {
    load()
      .catch(() => {
        setHistory([]);
        setContacts([]);
      })
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (prevPhase.current !== 'idle' && phase === 'idle') {
      load();
    }
    prevPhase.current = phase;
  }, [phase, load]);

  const filteredContacts = useMemo(() => {
    const q = contactFilter.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => `${c.name} ${c.last_name}`.toLowerCase().includes(q));
  }, [contacts, contactFilter]);

  const dial = async (receiverId: string, type: 'voice' | 'video') => {
    setCallError('');
    try {
      await startCall(receiverId, type, contactIds);
      setShowNewCall(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'CONTACTS_ONLY') setCallError('Звонки только контактам');
      else if (msg === 'NO_MEDIA') setCallError('Нет доступа к микрофону или камере');
      else setCallError(msg || 'Не удалось начать звонок');
    }
  };

  const peerLabel = (item: CallItem) => {
    const p = item.peer;
    return p ? `${p.name || ''} ${p.last_name || ''}`.trim() : 'Контакт';
  };

  const formatWhen = (item: CallItem) => {
    const d = item.ended_at || item.started_at || item.created_at;
    if (!d) return '';
    return new Date(d).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="calls-page">
      <header className="calls-page__head">
        <h1>Звонки</h1>
        <button type="button" className="profile-btn profile-btn--gold" onClick={() => setShowNewCall(true)}>
          Новый звонок
        </button>
      </header>

      {callError && <p className="calls-page__hint calls-page__hint--error">{callError}</p>}

      {loading ? (
        <p className="calls-page__hint">Загрузка…</p>
      ) : history.length === 0 ? (
        <p className="calls-page__hint">История звонков пуста</p>
      ) : (
        <ul className="call-history">
          {history.map((item) => (
            <li key={item.id} className="call-history__item">
              <ContactAvatar
                name={item.peer?.name}
                lastName={item.peer?.last_name}
                avatar={item.peer?.avatar}
                size="sm"
              />
              <div className="call-history__body">
                <strong>{peerLabel(item)}</strong>
                <span className="call-history__meta">
                  {item.direction === 'outgoing' ? '↗' : '↙'}{' '}
                  {STATUS_LABELS[item.status] || item.status} · {formatWhen(item)}
                  {item.duration > 0 && ` · ${formatDuration(item.duration)}`}
                </span>
              </div>
              <div className="call-history__actions">
                {item.peer && (
                  <>
                    <button type="button" className="icon-btn" title="Голосовой" onClick={() => dial(item.peer!.id, 'voice')}>
                      <VellaraIcon name="phone" size={18} />
                    </button>
                    <button type="button" className="icon-btn" title="Видео" onClick={() => dial(item.peer!.id, 'video')}>
                      <VellaraIcon name="video-call" size={18} />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {showNewCall && (
        <div className="new-call-backdrop" onClick={() => setShowNewCall(false)}>
          <div className="new-call-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>Новый звонок</h2>
              <button type="button" className="modal-close" onClick={() => setShowNewCall(false)}>
                <VellaraIcon name="close" size={18} />
              </button>
            </header>
            <input
              type="search"
              className="profile-field"
              style={{ margin: '12px 16px 0', minHeight: 'auto' }}
              placeholder="Поиск по контактам…"
              value={contactFilter}
              onChange={(e) => setContactFilter(e.target.value)}
            />
            <ul className="new-call-list">
              {filteredContacts.map((c) => (
                <li key={c.id}>
                  <ContactAvatar name={c.name} lastName={c.last_name} avatar={c.avatar} size="sm" />
                  <span>{c.name} {c.last_name}</span>
                  <button type="button" className="icon-btn" onClick={() => dial(c.id, 'voice')}>
                    <VellaraIcon name="phone" size={18} />
                  </button>
                  <button type="button" className="icon-btn" onClick={() => dial(c.id, 'video')}>
                    <VellaraIcon name="video-call" size={18} />
                  </button>
                </li>
              ))}
            </ul>
            {!filteredContacts.length && <p className="calls-page__hint">Нет контактов</p>}
          </div>
        </div>
      )}
    </div>
  );
}
