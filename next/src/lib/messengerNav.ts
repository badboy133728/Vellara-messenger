export type MessengerTab = 'chats' | 'calls' | 'contacts' | 'favorites' | 'settings' | 'dashboard';

export type MessengerNavState = {
  tab: MessengerTab;
  activeId: number | null;
  profileUserId: string | null;
  showGroupSettings: boolean;
  showGroupPanel: boolean;
  showCreateGroup: boolean;
  showCreateChannel: boolean;
};

export const MESSENGER_NAV_KEY = 'vellara';

export const DEFAULT_MESSENGER_NAV: MessengerNavState = {
  tab: 'chats',
  activeId: null,
  profileUserId: null,
  showGroupSettings: false,
  showGroupPanel: false,
  showCreateGroup: false,
  showCreateChannel: false,
};

/** Bottom nav tabs — swipe left/right cycles these (mobile). */
export const MOBILE_SWIPE_TABS: MessengerTab[] = ['chats', 'calls', 'contacts', 'favorites'];

export function tabStep(tab: MessengerTab, direction: 1 | -1): MessengerTab | null {
  const idx = MOBILE_SWIPE_TABS.indexOf(tab);
  if (idx < 0) return null;
  const next = idx + direction;
  if (next < 0 || next >= MOBILE_SWIPE_TABS.length) return null;
  return MOBILE_SWIPE_TABS[next];
}
