import { describe, expect, it } from 'vitest';
import { publicStorageUrl } from '@/lib/storage';

describe('publicStorageUrl', () => {
  it('returns null for empty path', () => {
    expect(publicStorageUrl(null)).toBeNull();
  });

  it('returns http urls unchanged', () => {
    expect(publicStorageUrl('https://cdn.example.com/x.png')).toBe('https://cdn.example.com/x.png');
  });

  it('does not expose public url for private messages bucket', () => {
    const prev = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    expect(publicStorageUrl('messages/u/1.jpg')).toBeNull();
    expect(publicStorageUrl('avatars/u/1.jpg')).toBe(
      'https://abc.supabase.co/storage/v1/object/public/avatars/u/1.jpg',
    );
    process.env.NEXT_PUBLIC_SUPABASE_URL = prev;
  });
});
