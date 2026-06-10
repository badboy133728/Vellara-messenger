export type SendMessageOptions = {
  files?: File[];
  replyToId?: number;
  /** Вызывается сразу после добавления сообщения в ленту (до return). */
  onCreated?: (messageIds: number[]) => void;
};
