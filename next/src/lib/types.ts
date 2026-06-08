export type Profile = {
  id: string;
  email: string;
  name: string;
  last_name: string;
  avatar: string | null;
  background: string | null;
  background_gradient: string | null;
  bio: string | null;
  theme: string;
  profile_visibility: string;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
  id: number;
  conversation_id: number;
  user_id: string;
  message_type: string;
  content: string;
  read_at: string | null;
  file_path: string | null;
  file_type: string | null;
  file_original_name: string | null;
  voice_duration: number | null;
  album_group_id: string | null;
  reply_to_id: number | null;
  is_edited: boolean;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageReplyPreview = {
  id: number;
  user_id: string;
  content: string;
  file_type: string | null;
  is_deleted: boolean;
  sender: {
    id: string;
    name: string;
    last_name: string;
    avatar: string | null;
  } | null;
};

export type ConversationRow = {
  id: number;
  type: string;
  title: string | null;
  created_by: string | null;
  allow_voice_messages: boolean;
  created_at: string;
  updated_at: string;
};

export type MemberRow = {
  id: number;
  conversation_id: number;
  user_id: string;
  role: string;
  last_read_at: string | null;
  is_archived: boolean;
  profiles?: Profile;
};

export type FormattedMessage = {
  id: number;
  conversation_id?: number;
  message_type: string;
  content: string;
  user_id: string;
  created_at: string;
  read_at: string | null;
  file_path: string | null;
  file_type: string | null;
  file_original_name: string | null;
  voice_duration: number | null;
  album_group_id: string | null;
  is_edited: boolean;
  edited_at: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  sender: {
    id: string;
    name: string;
    last_name: string;
    avatar: string | null;
  } | null;
  group_read_status?: 'sent' | 'partial' | 'all';
  reply_to_id?: number | null;
  reply_to?: MessageReplyPreview | null;
};

export type ConversationListItem = {
  id: number;
  type: string;
  title: string | null;
  members_count: number | null;
  my_role: string;
  allow_voice_messages: boolean | null;
  other_user: {
    id: string;
    name: string;
    last_name: string;
    avatar: string | null;
    is_online: boolean;
    last_seen_at: string | null;
  } | null;
  last_message: Record<string, unknown> | null;
  last_message_preview: string;
  unread_count: number;
  has_unread: boolean;
  is_archived: boolean;
  updated_at: string;
};
