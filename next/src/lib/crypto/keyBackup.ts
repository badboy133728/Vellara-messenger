import { aesDecrypt, aesEncrypt } from '@/lib/crypto/aes';
import { base64ToBytes, bytesToBase64 } from '@/lib/crypto/base64';

export const BACKUP_PREFIX = 'e2e-backup:v1:';
const PBKDF2_ITERATIONS = 250_000;
const SALT_BYTES = 16;

type BackupPayload = {
  privateKeyB64: string;
  publicKeyB64: string;
};

async function deriveKeyFromPassphrase(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const saltBuffer = new Uint8Array(salt);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function createKeyBackup(
  privateKeyB64: string,
  publicKeyB64: string,
  passphrase: string,
): Promise<string> {
  const trimmed = passphrase.trim();
  if (trimmed.length < 6) {
    throw new Error('Код восстановления — минимум 6 символов');
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKeyFromPassphrase(trimmed, salt);
  const payload = new TextEncoder().encode(
    JSON.stringify({ privateKeyB64, publicKeyB64 } satisfies BackupPayload),
  );
  const encrypted = await aesEncrypt(key, payload);
  const packed = new Uint8Array(salt.length + encrypted.length);
  packed.set(salt, 0);
  packed.set(encrypted, salt.length);
  return BACKUP_PREFIX + bytesToBase64(packed);
}

export async function restoreKeyBackup(
  backup: string,
  passphrase: string,
): Promise<BackupPayload> {
  if (!backup.startsWith(BACKUP_PREFIX)) {
    throw new Error('Некорректная резервная копия ключа');
  }
  const packed = new Uint8Array(base64ToBytes(backup.slice(BACKUP_PREFIX.length)));
  if (packed.length <= SALT_BYTES + 12) {
    throw new Error('Некорректная резервная копия ключа');
  }
  const salt = packed.slice(0, SALT_BYTES);
  const ciphertext = packed.slice(SALT_BYTES);
  const key = await deriveKeyFromPassphrase(passphrase.trim(), salt);
  const plain = await aesDecrypt(key, ciphertext);
  const parsed = JSON.parse(new TextDecoder().decode(plain)) as BackupPayload;
  if (!parsed.privateKeyB64 || !parsed.publicKeyB64) {
    throw new Error('Некорректная резервная копия ключа');
  }
  return parsed;
}
