import { api } from '@/lib/api';
import { exportAesKeyRaw, generateAesKey } from '@/lib/crypto/aes';
import { ensureIdentityKeys } from '@/lib/crypto/identity';
import {
  deriveConversationAesKey,
  importPublicKeyB64,
  unwrapKeyFromSender,
  wrapKeyForRecipient,
} from '@/lib/crypto/x25519';

const keyCache = new Map<string, CryptoKey>();

function cacheKey(conversationId: number, userId: string) {
  return `${userId}:${conversationId}`;
}

export type ConversationKeyContext = {
  conversationId: number;
  conversationType: string;
  memberUserIds: string[];
  partnerUserId?: string | null;
};

async function fetchUserPublicKey(userId: string): Promise<string> {
  const data = await api<{ public_key: string | null }>(`/api/users/${userId}/e2e-key`);
  if (!data.public_key) throw new Error('У собеседника нет ключа шифрования');
  return data.public_key;
}

async function derivePrivateChatKey(
  conversationId: number,
  myPrivateKey: CryptoKey,
  partnerPublicB64: string,
): Promise<CryptoKey> {
  const partnerPublic = await importPublicKeyB64(partnerPublicB64);
  return deriveConversationAesKey(myPrivateKey, partnerPublic, `vellara-private-${conversationId}`);
}

async function deriveSavedChatKey(userId: string, conversationId: number, privateKey: CryptoKey): Promise<CryptoKey> {
  const { publicKeyB64 } = await ensureIdentityKeys(userId);
  const publicKey = await importPublicKeyB64(publicKeyB64);
  return deriveConversationAesKey(privateKey, publicKey, `vellara-saved-${conversationId}`);
}

async function fetchGroupEnvelope(conversationId: number): Promise<string | null> {
  try {
    const data = await api<{ envelope: string | null }>(`/api/chat/${conversationId}/e2e-key`);
    return data.envelope ?? null;
  } catch {
    return null;
  }
}

async function publishGroupEnvelopes(
  conversationId: number,
  envelopes: { user_id: string; envelope: string }[],
): Promise<void> {
  await api(`/api/chat/${conversationId}/e2e-key`, {
    method: 'POST',
    body: JSON.stringify({ envelopes }),
  });
}

async function ensureGroupConversationKey(
  conversationId: number,
  userId: string,
  memberUserIds: string[],
  privateKey: CryptoKey,
): Promise<CryptoKey> {
  const existing = await fetchGroupEnvelope(conversationId);
  if (existing) {
    return unwrapKeyFromSender(existing, privateKey);
  }

  const convKey = await generateAesKey();
  const raw = await exportAesKeyRaw(convKey);
  const envelopes: { user_id: string; envelope: string }[] = [];

  for (const memberId of memberUserIds) {
    const pub = await fetchUserPublicKey(memberId);
    const envelope = await wrapKeyForRecipient(raw, pub);
    envelopes.push({ user_id: memberId, envelope });
  }

  await publishGroupEnvelopes(conversationId, envelopes);
  return convKey;
}

export async function getConversationKey(
  userId: string,
  ctx: ConversationKeyContext,
): Promise<CryptoKey> {
  const ck = cacheKey(ctx.conversationId, userId);
  const cached = keyCache.get(ck);
  if (cached) return cached;

  const { privateKey } = await ensureIdentityKeys(userId);

  let key: CryptoKey;
  if (ctx.conversationType === 'saved') {
    key = await deriveSavedChatKey(userId, ctx.conversationId, privateKey);
  } else if (ctx.conversationType === 'group') {
    key = await ensureGroupConversationKey(
      ctx.conversationId,
      userId,
      ctx.memberUserIds,
      privateKey,
    );
  } else {
    const partnerId = ctx.partnerUserId;
    if (!partnerId) throw new Error('Не найден собеседник для шифрования');
    const partnerPub = await fetchUserPublicKey(partnerId);
    key = await derivePrivateChatKey(ctx.conversationId, privateKey, partnerPub);
  }

  keyCache.set(ck, key);
  return key;
}

export function clearConversationKeyCache() {
  keyCache.clear();
}
