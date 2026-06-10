import { base64ToBytes, bytesToBase64 } from '@/lib/crypto/base64';
import { aesDecrypt, aesEncrypt, importAesKey, packEncrypted, unpackEncrypted } from '@/lib/crypto/aes';

export async function generateX25519KeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'X25519' },
    true,
    ['deriveKey', 'deriveBits'],
  ) as Promise<CryptoKeyPair>;
}

export async function exportPublicKeyB64(publicKey: CryptoKey): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
  return bytesToBase64(raw);
}

export async function importPublicKeyB64(b64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(b64);
  return crypto.subtle.importKey('raw', raw.buffer as ArrayBuffer, { name: 'X25519' }, true, []);
}

export async function exportPrivateKeyB64(privateKey: CryptoKey): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey));
  return bytesToBase64(raw);
}

export async function importPrivateKeyB64(b64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(b64);
  return crypto.subtle.importKey('pkcs8', raw.buffer as ArrayBuffer, { name: 'X25519' }, true, [
    'deriveKey',
    'deriveBits',
  ]);
}

export async function deriveConversationAesKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  saltInfo: string,
): Promise<CryptoKey> {
  const bits = await crypto.subtle.deriveBits(
    { name: 'X25519', public: publicKey },
    privateKey,
    256,
  );
  const salt = new TextEncoder().encode(saltInfo);
  const hkdfKey = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: new TextEncoder().encode('vellara-e2e-v1'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

/** Обёртка ключа беседы для получателя (X25519 + AES-GCM). */
export async function wrapKeyForRecipient(
  conversationKeyRaw: Uint8Array,
  recipientPublicB64: string,
): Promise<string> {
  const recipientPublic = await importPublicKeyB64(recipientPublicB64);
  const ephemeral = await generateX25519KeyPair();
  const wrapKey = await deriveConversationAesKey(
    ephemeral.privateKey,
    recipientPublic,
    'vellara-wrap-v1',
  );
  const packed = await aesEncrypt(wrapKey, conversationKeyRaw);
  const ephemeralPub = await exportPublicKeyB64(ephemeral.publicKey);
  return JSON.stringify({ ep: ephemeralPub, ct: packEncrypted(packed) });
}

export async function unwrapKeyFromSender(
  envelopeJson: string,
  myPrivateKey: CryptoKey,
): Promise<CryptoKey> {
  const { ep, ct } = JSON.parse(envelopeJson) as { ep: string; ct: string };
  const senderEphemeralPublic = await importPublicKeyB64(ep);
  const wrapKey = await deriveConversationAesKey(myPrivateKey, senderEphemeralPublic, 'vellara-wrap-v1');
  const raw = await aesDecrypt(wrapKey, unpackEncrypted(ct));
  return importAesKey(raw);
}
