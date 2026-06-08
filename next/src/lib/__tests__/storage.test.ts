import { describe, expect, it } from 'vitest';
import { publicStorageUrl } from '@/lib/storage';

describe('publicStorageUrl', () => {
  it('returns null for empty path', () => {
    expect(publicStorageUrl(null)).toBeNull();
  });

  it('returns http urls unchanged', () => {
    expect(publicStorageUrl('https://cdn.example.com/x.png')).toBe('https://cdn.example.com/x.png');
  });

  it('builds supabase public url', () => {
    const prev = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    expect(publicStorageUrl('messages/u/1.jpg')).toBe(
      'https://abc.supabase.co/storage/v1/object/public/messages/u/1.jpg',
    );
    process.env.NEXT_PUBLIC_SUPABASE_URL = prev;
  });
});
