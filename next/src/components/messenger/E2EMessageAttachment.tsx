'use client';

import { useEffect, useState } from 'react';
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
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
  }, [src, message.id, message.file_path]);

  const isLoading = !src || !isLoaded;

  return (
    <span className={`msg-media-skeleton-wrap${isLoading ? ' is-loading' : ''}`}>
      {isLoading && (
        <span className="msg-media-skeleton" aria-hidden="true">
          <span className="attachment-preview-shimmer" aria-hidden="true" />
        </span>
      )}
      {src && (
        <img
          src={src}
          alt="Фото"
          decoding="async"
          className="msg-media-skeleton-wrap__img"
          onLoad={() => {
            setIsLoaded(true);
            onMediaLoad?.();
          }}
          onError={() => setIsLoaded(true)}
        />
      )}
    </span>
  );
}

export function E2EVideoAttachment({ message, userId, e2eContext, onMediaLoad }: Props) {
  const src = useDecryptedFileUrl(
    userId,
    e2eContext,
    message.file_path,
    message.file_original_name,
    mimeHintForMessageFile(message) ?? 'video/mp4',
  );
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(false);
  }, [src, message.id, message.file_path]);

  const isLoading = !src || !isReady;

  return (
    <div className={`msg-video-skeleton-wrap${isLoading ? ' is-loading' : ''}`}>
      {isLoading && (
        <span className="msg-media-skeleton" aria-hidden="true">
          <span className="attachment-preview-shimmer" aria-hidden="true" />
        </span>
      )}
      {src && (
        <video
          className="msg-video"
          src={src}
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={() => {
            setIsReady(true);
            onMediaLoad?.();
          }}
          onCanPlay={() => setIsReady(true)}
          onError={() => setIsReady(true)}
        />
      )}
    </div>
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
