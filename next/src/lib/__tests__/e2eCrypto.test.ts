import { describe, expect, it } from 'vitest';
import { aesDecrypt, aesEncrypt, generateAesKey } from '@/lib/crypto/aes';
import { createKeyBackup, restoreKeyBackup } from '@/lib/crypto/keyBackup';
import {
  exportPrivateKeyB64,
  exportPublicKeyB64,
  generateX25519KeyPair,
} from '@/lib/crypto/x25519';
import { decryptText, encryptText } from '@/lib/crypto/message';
import {
  deriveConversationAesKey,
  exportPublicKeyB64,
  generateX25519KeyPair,
  importPublicKeyB64,
  unwrapKeyFromSender,
  wrapKeyForRecipient,
} from '@/lib/crypto/x25519';

describe('e2e crypto', () => {
  it('encrypts and decrypts text with aes', async () => {
    const key = await generateAesKey();
    const packed = await aesEncrypt(key, new TextEncoder().encode('hello'));
    const plain = await aesDecrypt(key, packed);
    expect(new TextDecoder().decode(plain)).toBe('hello');
  });

  it('wraps conversation keys for recipients', async () => {
    const recipient = await generateX25519KeyPair();
    const recipientPub = await exportPublicKeyB64(recipient.publicKey);
    const convKey = await generateAesKey();
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', convKey));
    const envelope = await wrapKeyForRecipient(raw, recipientPub);
    const unwrapped = await unwrapKeyFromSender(envelope, recipient.privateKey);
    const a = new Uint8Array(await crypto.subtle.exportKey('raw', convKey));
    const b = new Uint8Array(await crypto.subtle.exportKey('raw', unwrapped));
    expect(b).toEqual(a);
  });

  it('backs up and restores identity keys with passphrase', async () => {
    const pair = await generateX25519KeyPair();
    const publicKeyB64 = await exportPublicKeyB64(pair.publicKey);
    const privateKeyB64 = await exportPrivateKeyB64(pair.privateKey);
    const backup = await createKeyBackup(privateKeyB64, publicKeyB64, 'my-secret-code');
    const restored = await restoreKeyBackup(backup, 'my-secret-code');
    expect(restored.publicKeyB64).toBe(publicKeyB64);
    expect(restored.privateKeyB64).toBe(privateKeyB64);
  });

  it('derives the same private chat key for both sides', async () => {
    const alice = await generateX25519KeyPair();
    const bob = await generateX25519KeyPair();
    const bobPub = await importPublicKeyB64(await exportPublicKeyB64(bob.publicKey));
    const alicePub = await importPublicKeyB64(await exportPublicKeyB64(alice.publicKey));
    const k1 = await deriveConversationAesKey(alice.privateKey, bobPub, 'conv-1');
    const k2 = await deriveConversationAesKey(bob.privateKey, alicePub, 'conv-1');
    const t1 = await encryptText(k1, 'secret');
    const plain = await decryptText(k2, t1);
    expect(plain).toBe('secret');
  });
});
