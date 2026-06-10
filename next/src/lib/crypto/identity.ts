import { api } from '@/lib/api';
import { createKeyBackup, restoreKeyBackup } from '@/lib/crypto/keyBackup';
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

type ServerE2EState = {
  public_key: string | null;
  has_backup: boolean;
  key_backup?: string | null;
};

export class E2ERecoveryRequiredError extends Error {
  constructor() {
    super('Введите код восстановления шифрования');
    this.name = 'E2ERecoveryRequiredError';
  }
}

export class E2ENoBackupError extends Error {
  constructor() {
    super(
      'Ключи шифрования есть только на другом устройстве. Задайте код восстановления там, в настройках.',
    );
    this.name = 'E2ENoBackupError';
  }
}

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

async function deleteIdentity(userId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(userId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('delete identity failed'));
  });
}

async function fetchServerE2EState(): Promise<ServerE2EState> {
  return api<ServerE2EState>('/api/user/e2e-key');
}

async function uploadPublicKey(publicKeyB64: string, restore = false): Promise<void> {
  await api('/api/user/e2e-key', {
    method: 'PUT',
    body: JSON.stringify({ public_key: publicKeyB64, restore }),
  });
}

async function uploadKeyBackup(backup: string): Promise<void> {
  await api('/api/user/e2e-key', {
    method: 'PUT',
    body: JSON.stringify({ key_backup: backup }),
  });
}

let cachedPrivateKey: CryptoKey | null = null;
let cachedPublicB64: string | null = null;
let cachedUserId: string | null = null;

function cacheKeys(userId: string, publicKeyB64: string, privateKey: CryptoKey) {
  cachedUserId = userId;
  cachedPublicB64 = publicKeyB64;
  cachedPrivateKey = privateKey;
}

export async function ensureIdentityKeys(
  userId: string,
  options?: { recoveryPassphrase?: string },
): Promise<{ publicKeyB64: string; privateKey: CryptoKey }> {
  if (cachedUserId === userId && cachedPrivateKey && cachedPublicB64) {
    return { publicKeyB64: cachedPublicB64, privateKey: cachedPrivateKey };
  }

  const server = await fetchServerE2EState();
  let record = await readIdentity(userId);

  if (record) {
    if (server.public_key && server.public_key !== record.publicKeyB64) {
      if (server.has_backup && server.key_backup) {
        await deleteIdentity(userId);
        record = null;
      } else {
        await uploadPublicKey(record.publicKeyB64, true);
      }
    } else if (!server.public_key) {
      await uploadPublicKey(record.publicKeyB64);
    } else {
      await uploadPublicKey(record.publicKeyB64).catch(() => {});
    }
  }

  if (record) {
    const privateKey = await importPrivateKeyB64(record.privateKeyB64);
    cacheKeys(userId, record.publicKeyB64, privateKey);
    return { publicKeyB64: record.publicKeyB64, privateKey };
  }

  if (server.public_key) {
    if (!server.has_backup || !server.key_backup) {
      throw new E2ENoBackupError();
    }
    const passphrase = options?.recoveryPassphrase?.trim();
    if (!passphrase) {
      throw new E2ERecoveryRequiredError();
    }

    let restored;
    try {
      restored = await restoreKeyBackup(server.key_backup, passphrase);
    } catch {
      throw new Error('Неверный код восстановления');
    }

    record = {
      userId,
      privateKeyB64: restored.privateKeyB64,
      publicKeyB64: restored.publicKeyB64,
    };

    if (server.public_key !== record.publicKeyB64) {
      await uploadPublicKey(record.publicKeyB64, true);
    }

    await writeIdentity(record);
    const privateKey = await importPrivateKeyB64(record.privateKeyB64);
    cacheKeys(userId, record.publicKeyB64, privateKey);
    return { publicKeyB64: record.publicKeyB64, privateKey };
  }

  const pair = await generateX25519KeyPair();
  const publicKeyB64 = await exportPublicKeyB64(pair.publicKey);
  const privateKeyB64 = await exportPrivateKeyB64(pair.privateKey);
  record = { userId, privateKeyB64, publicKeyB64 };
  await writeIdentity(record);
  await uploadPublicKey(publicKeyB64);

  const privateKey = await importPrivateKeyB64(privateKeyB64);
  cacheKeys(userId, publicKeyB64, privateKey);
  return { publicKeyB64, privateKey };
}

export async function setupKeyBackup(userId: string, passphrase: string): Promise<void> {
  const record = await readIdentity(userId);
  if (!record) {
    await ensureIdentityKeys(userId);
  }
  const current = (await readIdentity(userId))!;
  const backup = await createKeyBackup(
    current.privateKeyB64,
    current.publicKeyB64,
    passphrase,
  );
  await uploadKeyBackup(backup);
  await uploadPublicKey(current.publicKeyB64, true);
}

export function clearIdentityCache() {
  cachedPrivateKey = null;
  cachedPublicB64 = null;
  cachedUserId = null;
}
