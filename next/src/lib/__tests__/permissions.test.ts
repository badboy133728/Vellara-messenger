import { describe, expect, it } from 'vitest';
import { canManageGroup, isMember, ROLE_ADMIN, ROLE_MEMBER } from '@/lib/chat/permissions';

describe('permissions', () => {
  it('admin can manage group', () => {
    expect(canManageGroup(ROLE_ADMIN)).toBe(true);
    expect(canManageGroup(ROLE_MEMBER)).toBe(false);
  });

  it('isMember checks user list', () => {
    expect(isMember(['a', 'b'], 'a')).toBe(true);
    expect(isMember(['a', 'b'], 'c')).toBe(false);
  });
});
