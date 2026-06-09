'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { ContactAvatar } from '@/components/ContactAvatar';
import { VellaraIcon } from '@/components/icons/VellaraIcon';
import { useAuth } from '@/hooks/useAuth';
import { useCall } from '@/hooks/useCallManager';
import { displayFullName } from '@/utils/formatName';
import { UserProfilePanel } from './UserProfilePanel';

type Contact = {
  id: string;
  name: string;
  last_name: string;
  email: string;
  avatar: string | null;
};

type Incoming = Contact & { sender_id: string };

function pluralContacts(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'контакт';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'контакта';
  return 'контактов';
}

export function ContactsPanel({
  onStartChat,
  contactsRefreshKey = 0,
}: {
  onStartChat: (id: string) => void;
  contactsRefreshKey?: number;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const { isAuthenticated } = useAuth();
  const { startCall, loadContactIds } = useCall();
  const [contactIds, setContactIds] = useState<Set<string>>(new Set());
  const incomingCountRef = useRef(0);

  const load = useCallback(async () => {
    const [my, inc] = await Promise.all([
      api<Contact[]>('/api/contacts/my'),
      api<Incoming[]>('/api/contacts/incoming'),
    ]);
    setContacts(my);
    setIncoming(inc);
    incomingCountRef.current = inc.length;
    setContactIds(await loadContactIds());
  }, [loadContactIds]);

  useEffect(() => {
    if (!isAuthenticated) return;
    load()
      .catch(() => {
        setContacts([]);
        setIncoming([]);
      })
      .finally(() => setLoading(false));
  }, [load, isAuthenticated]);

  useEffect(() => {
    if (contactsRefreshKey < 1) return;
    (async () => {
      try {
        const [my, inc] = await Promise.all([
          api<Contact[]>('/api/contacts/my'),
          api<Incoming[]>('/api/contacts/incoming'),
        ]);
        setContacts(my);
        setIncoming(inc);
        setContactIds(await loadContactIds());
        if (inc.length > incomingCountRef.current) {
          const latest = inc[0];
          const who = latest ? displayFullName(latest.name, latest.last_name, 'Пользователь') : 'Пользователь';
          showToast(`${who} отправил заявку в контакты`);
        }
        incomingCountRef.current = inc.length;
      } catch {
        /* ignore */
      }
    })();
  }, [contactsRefreshKey, loadContactIds]);

  useEffect(() => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const t = setTimeout(() => {
      api<Contact[]>(`/api/contacts/search?query=${encodeURIComponent(query)}`)
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setIsSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const sendRequest = async (contactId: string) => {
    await api('/api/contacts/send', {
      method: 'POST',
      body: JSON.stringify({ contact_id: contactId }),
    });
    setSearchResults((prev) => prev.filter((u) => u.id !== contactId));
    showToast('Заявка отправлена');
  };

  const accept = async (senderId: string) => {
    await api(`/api/contacts/accept/${senderId}`, { method: 'POST' });
    await load();
    showToast('Контакт добавлен');
  };

  const reject = async (senderId: string) => {
    await api(`/api/contacts/reject/${senderId}`, { method: 'POST' });
    await load();
  };

  const removeContact = async (contactId: string) => {
    await api(`/api/contacts/${contactId}`, { method: 'DELETE' });
    await load();
    showToast('Контакт удалён');
  };

  const dial = (contactId: string, type: 'voice' | 'video') => {
    startCall(contactId, type, contactIds).catch(() => showToast('Не удалось начать звонок'));
  };

  if (profileUserId) {
    return (
      <UserProfilePanel
        userId={profileUserId}
        isInContacts={contacts.some((c) => c.id === profileUserId)}
        onBack={() => setProfileUserId(null)}
        onAddToContacts={async () => {
          await sendRequest(profileUserId);
        }}
        onStartChat={(id) => {
          setProfileUserId(null);
          onStartChat(id);
        }}
      />
    );
  }

  return (
    <div className="contacts-page">
      <div className="contacts-layout">
        <header className="contacts-header">
          <h1 className="contacts-title">Контакты</h1>
          <p className="contacts-subtitle">
            {loading ? 'Загрузка…' : `${contacts.length} ${pluralContacts(contacts.length)}`}
            {incoming.length > 0 && (
              <span className="contacts-badge">{incoming.length} заявок</span>
            )}
          </p>
        </header>

        <div className="contacts-search-bar">
          <VellaraIcon name="search" size={18} className="contacts-search-icon" />
          <input
            type="search"
            className="contacts-search-input"
            placeholder="Найти по имени или email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="contacts-search-clear" onClick={() => setQuery('')}>
              <VellaraIcon name="close" size={16} />
            </button>
          )}
        </div>

        {query.length >= 2 && (
          <section className="contacts-section">
            <h2 className="contacts-section__title">Результаты поиска</h2>
            {isSearching ? (
              <p className="contacts-empty">Поиск…</p>
            ) : searchResults.length === 0 ? (
              <p className="contacts-empty">Никого не найдено</p>
            ) : (
              <ul className="contacts-list">
                {searchResults.map((u) => (
                  <li key={u.id} className="contact-card">
                    <button type="button" className="contact-card__main" onClick={() => setProfileUserId(u.id)}>
                      <ContactAvatar name={u.name} lastName={u.last_name} avatar={u.avatar} />
                      <span className="contact-card__body">
                        <span className="contact-card__name">{displayFullName(u.name, u.last_name)}</span>
                        <span className="contact-card__meta">{u.email}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="profile-btn profile-btn--gold contact-card__action"
                      onClick={() => sendRequest(u.id)}
                      title="Отправить заявку"
                    >
                      + Заявка
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {incoming.length > 0 && (
          <section className="contacts-section contacts-section--highlight">
            <div className="contacts-section__head">
              <h2 className="contacts-section__title contacts-section__title--with-icon">
                <VellaraIcon name="bell" size={18} />
                Входящие заявки
              </h2>
              <span className="contacts-count">{incoming.length}</span>
            </div>
            <ul className="contacts-list">
              {incoming.map((req) => (
                <li key={req.sender_id} className="contact-card contact-card--request">
                  <button
                    type="button"
                    className="contact-card__main"
                    onClick={() => setProfileUserId(req.sender_id)}
                  >
                    <ContactAvatar
                      name={req.name}
                      lastName={req.last_name}
                      avatar={req.avatar}
                      variant="request"
                    />
                    <span className="contact-card__body">
                      <span className="contact-card__name">{displayFullName(req.name, req.last_name)}</span>
                      <span className="contact-card__meta">{req.email}</span>
                    </span>
                  </button>
                  <div className="contact-card__actions">
                    <button
                      type="button"
                      className="profile-btn profile-btn--gold profile-btn--icon contact-card__action"
                      onClick={() => accept(req.sender_id)}
                      title="Принять"
                      aria-label="Принять заявку"
                    >
                      <VellaraIcon name="check" size={18} />
                    </button>
                    <button
                      type="button"
                      className="profile-btn profile-btn--outline profile-btn--icon contact-card__action"
                      onClick={() => reject(req.sender_id)}
                      title="Отклонить"
                      aria-label="Отклонить заявку"
                    >
                      <VellaraIcon name="close" size={18} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="contacts-section">
          <h2 className="contacts-section__title">Мои контакты</h2>
          {contacts.length === 0 ? (
            <p className="contacts-empty">Список пуст. Найдите пользователя через поиск.</p>
          ) : (
            <ul className="contacts-list">
              {contacts.map((c) => (
                <li key={c.id} className="contact-card">
                  <button type="button" className="contact-card__main" onClick={() => setProfileUserId(c.id)}>
                    <ContactAvatar name={c.name} lastName={c.last_name} avatar={c.avatar} />
                    <span className="contact-card__body">
                      <span className="contact-card__name">{displayFullName(c.name, c.last_name)}</span>
                      <span className="contact-card__meta">{c.email}</span>
                    </span>
                  </button>
                  <div className="contact-card__actions">
                    <button
                      type="button"
                      className="profile-btn profile-btn--outline profile-btn--icon contact-card__action"
                      title="Голосовой звонок"
                      aria-label="Голосовой звонок"
                      onClick={() => dial(c.id, 'voice')}
                    >
                      <VellaraIcon name="phone" size={18} />
                    </button>
                    <button
                      type="button"
                      className="profile-btn profile-btn--outline profile-btn--icon contact-card__action"
                      title="Видеозвонок"
                      aria-label="Видеозвонок"
                      onClick={() => dial(c.id, 'video')}
                    >
                      <VellaraIcon name="video-call" size={18} />
                    </button>
                    <button
                      type="button"
                      className="profile-btn profile-btn--outline profile-btn--icon contact-card__action"
                      title="Написать сообщение"
                      aria-label="Написать сообщение"
                      onClick={() => onStartChat(c.id)}
                    >
                      <VellaraIcon name="chats" size={18} />
                    </button>
                    <button
                      type="button"
                      className="profile-btn profile-btn--outline profile-btn--icon contact-card__action"
                      title="Удалить из контактов"
                      aria-label="Удалить из контактов"
                      onClick={() => removeContact(c.id)}
                    >
                      <VellaraIcon name="close" size={18} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {toast && <div className="contacts-toast">{toast}</div>}
    </div>
  );
}
