import { base64ToBytes, bytesToBase64 } from '@/lib/crypto/base64';

const IV_BYTES = 12;

export async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw.buffer as ArrayBuffer, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function exportAesKeyRaw(key: CryptoKey): Promise<Uint8Array> {
  const buf = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(buf);
}

export async function generateAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function aesEncrypt(key: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext.buffer as ArrayBuffer),
  );
  const out = new Uint8Array(iv.length + ciphertext.length);
  out.set(iv, 0);
  out.set(ciphertext, iv.length);
  return out;
}

export async function aesDecrypt(key: CryptoKey, payload: Uint8Array): Promise<Uint8Array> {
  if (payload.length <= IV_BYTES) throw new Error('Некорректный шифротекст');
  const iv = payload.slice(0, IV_BYTES);
  const ciphertext = payload.slice(IV_BYTES);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Uint8Array(plain);
}

export function packEncrypted(payload: Uint8Array): string {
  return bytesToBase64(payload);
}

export function unpackEncrypted(packed: string): Uint8Array {
  return base64ToBytes(packed);
}
