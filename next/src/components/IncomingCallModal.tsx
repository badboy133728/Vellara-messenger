'use client';

import { ContactAvatar } from '@/components/ContactAvatar';
import { VellaraIcon } from '@/components/icons/VellaraIcon';

export function IncomingCallModal({
  caller,
  isVideo,
  onAccept,
  onReject,
}: {
  caller: { name?: string; last_name?: string; avatar?: string | null } | null;
  isVideo: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const callerName = caller
    ? `${caller.name || ''} ${caller.last_name || ''}`.trim() || 'Контакт'
    : 'Звонок';

  return (
    <div className="incoming-call-backdrop">
      <div className="incoming-call-modal" role="dialog" aria-label="Входящий звонок">
        <ContactAvatar
          name={caller?.name}
          lastName={caller?.last_name}
          avatar={caller?.avatar}
          size="lg"
        />
        <h2>{callerName}</h2>
        <p className="incoming-call-modal__hint">{isVideo ? 'Видеозвонок' : 'Голосовой звонок'}</p>
        <p className="incoming-call-modal__ring incoming-call-modal__ring--with-icon">
          <VellaraIcon name="phone" size={18} />
          Входящий вызов…
        </p>
        <div className="incoming-call-modal__actions">
          <button type="button" className="call-ctrl call-ctrl--accept" title="Принять" onClick={onAccept}>
            <VellaraIcon name="check" size={22} />
          </button>
          <button type="button" className="call-ctrl call-ctrl--reject" title="Отклонить" onClick={onReject}>
            <VellaraIcon name="close" size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}
