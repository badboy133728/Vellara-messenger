import { aesDecrypt, aesEncrypt, packEncrypted, unpackEncrypted } from '@/lib/crypto/aes';

export const E2E_PREFIX = 'e2e:v1:';
export const E2E_NAME_PREFIX = 'e2e:v1:';

export function isE2EContent(value: string | null | undefined): boolean {
  return !!value?.startsWith(E2E_PREFIX);
}

export function isE2EFileName(value: string | null | undefined): boolean {
  return !!value?.startsWith(E2E_NAME_PREFIX);
}

export async function encryptText(key: CryptoKey, plaintext: string): Promise<string> {
  const bytes = new TextEncoder().encode(plaintext);
  const encrypted = await aesEncrypt(key, bytes);
  return E2E_PREFIX + packEncrypted(encrypted);
}

export async function decryptText(key: CryptoKey, ciphertext: string): Promise<string> {
  if (!isE2EContent(ciphertext)) return ciphertext;
  const packed = ciphertext.slice(E2E_PREFIX.length);
  const bytes = await aesDecrypt(key, unpackEncrypted(packed));
  return new TextDecoder().decode(bytes);
}

export async function encryptFileName(key: CryptoKey, name: string): Promise<string> {
  const bytes = new TextEncoder().encode(name);
  const encrypted = await aesEncrypt(key, bytes);
  return E2E_NAME_PREFIX + packEncrypted(encrypted);
}

export async function decryptFileName(key: CryptoKey, ciphertext: string): Promise<string> {
  if (!isE2EFileName(ciphertext)) return ciphertext;
  const packed = ciphertext.slice(E2E_NAME_PREFIX.length);
  const bytes = await aesDecrypt(key, unpackEncrypted(packed));
  return new TextDecoder().decode(bytes);
}

export async function encryptBlob(key: CryptoKey, blob: Blob): Promise<Blob> {
  const raw = new Uint8Array(await blob.arrayBuffer());
  const encrypted = await aesEncrypt(key, raw);
  return new Blob([Uint8Array.from(encrypted)], { type: 'application/octet-stream' });
}

export async function decryptBlob(key: CryptoKey, blob: Blob, mimeType?: string): Promise<Blob> {
  const raw = new Uint8Array(await blob.arrayBuffer());
  const plain = await aesDecrypt(key, raw);
  return new Blob([Uint8Array.from(plain)], { type: mimeType || 'application/octet-stream' });
}
