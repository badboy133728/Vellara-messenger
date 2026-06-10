import { describe, expect, it } from 'vitest';
import { messagePreview, resolveFileType } from '@/lib/chat/formatters';
import type { MessageRow } from '@/lib/types';

describe('messagePreview', () => {
  it('shows deleted message text', () => {
    const msg = {
      deleted_at: '2026-01-01',
      content: 'hi',
      user_id: 'a',
      file_type: null,
    } as MessageRow;
    expect(messagePreview(msg, 'b')).toBe('Сообщение удалено');
  });

  it('prefixes own messages', () => {
    const msg = {
      content: 'Hello world',
      user_id: 'me',
      file_type: null,
      deleted_at: null,
    } as MessageRow;
    expect(messagePreview(msg, 'me')).toBe('Вы: Hello world');
  });

  it('shows video preview', () => {
    const msg = {
      content: '',
      user_id: 'a',
      file_type: 'video',
      deleted_at: null,
    } as MessageRow;
    expect(messagePreview(msg, 'b')).toBe('Видео');
  });
});

describe('resolveFileType', () => {
  it('detects images', () => {
    expect(resolveFileType('image/png', 'photo.png')).toBe('image');
  });

  it('detects voice webm', () => {
    expect(resolveFileType('video/webm', 'voice.webm')).toBe('voice');
  });

  it('detects video mp4', () => {
    expect(resolveFileType('video/mp4', 'clip.mp4')).toBe('video');
  });

  it('detects video mov', () => {
    expect(resolveFileType('video/quicktime', 'movie.mov')).toBe('video');
  });
});
