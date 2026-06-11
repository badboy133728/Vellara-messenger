export const CONV_PRIVATE = 'private';
export const CONV_GROUP = 'group';
export const CONV_SAVED = 'saved';
export const CONV_CHANNEL = 'channel';

export function isChannelType(type: string | null | undefined): boolean {
  return type === CONV_CHANNEL;
}

export function isGroupType(type: string | null | undefined): boolean {
  return type === CONV_GROUP;
}

export function isMultiPartyType(type: string | null | undefined): boolean {
  return isGroupType(type) || isChannelType(type);
}

export function hasConversationTitle(type: string | null | undefined): boolean {
  return isGroupType(type) || isChannelType(type);
}
