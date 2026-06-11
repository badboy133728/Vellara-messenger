'use client';

import { useDecryptedFileUrl } from '@/hooks/useDecryptedFileUrl';
import type { ConversationKeyContext } from '@/lib/crypto/conversationKey';
import { mimeHintForMessageFile } from '@/lib/chat/attachmentTypes';
import { displayFileName } from '@/lib/e2e/messageCrypto';
import type { FormattedMessage } from '@/lib/types';
import { VellaraIcon } from '@/components/icons/VellaraIcon';
import { VoiceMessagePlayer } from '@/components/VoiceMessagePlayer';

type Props = {
  message: FormattedMessage;
  userId: string;
  e2eContext: ConversationKeyContext | null;
  isMine: boolean;
  onMediaLoad?: () => void;
};

export function E2EImageAttachment({ message, userId, e2eContext, onMediaLoad }: Props) {
  const src = useDecryptedFileUrl(
    userId,
    e2eContext,
    message.file_path,
    message.file_original_name,
    mimeHintForMessageFile(message) ?? 'image/jpeg',
  );
  if (!src) return null;
  return <img src={src} alt="Фото" decoding="async" onLoad={onMediaLoad} />;
}

export function E2EVideoAttachment({ message, userId, e2eContext, onMediaLoad }: Props) {
  const src = useDecryptedFileUrl(
    userId,
    e2eContext,
    message.file_path,
    message.file_original_name,
    mimeHintForMessageFile(message) ?? 'video/mp4',
  );
  if (!src) return null;
  return (
    <video
      className="msg-video"
      src={src}
      controls
      playsInline
      preload="metadata"
      onLoadedMetadata={onMediaLoad}
    />
  );
}

export function E2EVoiceAttachment({ message, userId, e2eContext, isMine }: Props) {
  const src = useDecryptedFileUrl(
    userId,
    e2eContext,
    message.file_path,
    message.file_original_name,
    mimeHintForMessageFile(message) ?? 'audio/ogg',
  );
  if (!src) return null;
  return <VoiceMessagePlayer src={src} duration={message.voice_duration || 0} isMine={isMine} />;
}

export function E2EDocumentAttachment({ message, userId, e2eContext }: Props) {
  const src = useDecryptedFileUrl(
    userId,
    e2eContext,
    message.file_path,
    message.file_original_name,
  );
  if (!src) return null;
  return (
    <a
      className="msg-doc-link"
      href={src}
      target="_blank"
      rel="noreferrer"
      download={displayFileName(message) ?? 'file'}
    >
      <span className="msg-doc-icon">
        <VellaraIcon name="document" size={18} />
      </span>
      <span className="msg-doc-name">{displayFileName(message) ?? 'Файл'}</span>
    </a>
  );
}
