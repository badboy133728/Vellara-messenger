import { describe, expect, it } from 'vitest';
import { aesDecrypt, aesEncrypt, generateAesKey } from '@/lib/crypto/aes';
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
