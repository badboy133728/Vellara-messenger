'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

type Contact = { id: string; name: string; last_name: string };

export function CreateGroupModal({
  contacts,
  onClose,
  onCreated,
}: {
  contacts: Contact[];
  onClose: () => void;
  onCreated: (conversationId: number) => void;
}) {
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected.size === 0) {
      setError('Выберите участников');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api<{ conversation: { id: number } }>('/api/chat/groups', {
        method: 'POST',
        body: JSON.stringify({ title, member_ids: [...selected] }),
      });
      onCreated(res.conversation.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <h3>Создать группу</h3>
        {error && <p className="auth-error">{error}</p>}
        <form onSubmit={submit} className="modal-form">
          <label>
            Название
            <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={100} />
          </label>
          <div className="modal-members">
            <p>Участники из контактов:</p>
            <ul>
              {contacts.map((c) => (
                <li key={c.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                    />
                    {c.name} {c.last_name}
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Отмена</button>
            <button type="submit" disabled={loading}>{loading ? '…' : 'Создать'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
