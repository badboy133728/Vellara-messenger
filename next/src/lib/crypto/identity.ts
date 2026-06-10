import { api } from '@/lib/api';
import {
  exportPrivateKeyB64,
  exportPublicKeyB64,
  generateX25519KeyPair,
  importPrivateKeyB64,
} from '@/lib/crypto/x25519';

const DB_NAME = 'vellara-e2e';
const DB_VERSION = 1;
const STORE = 'identity';

type IdentityRecord = {
  userId: string;
  privateKeyB64: string;
  publicKeyB64: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'userId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB error'));
  });
}

async function readIdentity(userId: string): Promise<IdentityRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(userId);
    req.onsuccess = () => resolve((req.result as IdentityRecord | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error('read identity failed'));
  });
}

async function writeIdentity(record: IdentityRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('write identity failed'));
  });
}

async function uploadPublicKey(publicKeyB64: string): Promise<void> {
  await api('/api/user/e2e-key', {
    method: 'PUT',
    body: JSON.stringify({ public_key: publicKeyB64 }),
  });
}

let cachedPrivateKey: CryptoKey | null = null;
let cachedPublicB64: string | null = null;
let cachedUserId: string | null = null;

export async function ensureIdentityKeys(userId: string): Promise<{ publicKeyB64: string; privateKey: CryptoKey }> {
  if (cachedUserId === userId && cachedPrivateKey && cachedPublicB64) {
    return { publicKeyB64: cachedPublicB64, privateKey: cachedPrivateKey };
  }

  let record = await readIdentity(userId);
  if (!record) {
    const pair = await generateX25519KeyPair();
    const publicKeyB64 = await exportPublicKeyB64(pair.publicKey);
    const privateKeyB64 = await exportPrivateKeyB64(pair.privateKey);
    record = { userId, privateKeyB64, publicKeyB64 };
    await writeIdentity(record);
    await uploadPublicKey(publicKeyB64);
  } else {
    await uploadPublicKey(record.publicKeyB64).catch(() => {
      /* повторная синхронизация не критична */
    });
  }

  const privateKey = await importPrivateKeyB64(record.privateKeyB64);
  cachedUserId = userId;
  cachedPrivateKey = privateKey;
  cachedPublicB64 = record.publicKeyB64;
  return { publicKeyB64: record.publicKeyB64, privateKey };
}

export function clearIdentityCache() {
  cachedPrivateKey = null;
  cachedPublicB64 = null;
  cachedUserId = null;
}
