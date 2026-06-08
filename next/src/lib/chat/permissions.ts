export const ROLE_ADMIN = 'admin';
export const ROLE_MEMBER = 'member';

export function canManageGroup(role: string): boolean {
  return role === ROLE_ADMIN;
}

export function isMember(memberUserIds: string[], userId: string): boolean {
  return memberUserIds.includes(userId);
}
