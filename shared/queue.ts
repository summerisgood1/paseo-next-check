export interface Chat {
  id: string;
  workspaceId?: string | null;
  requiresAttention?: boolean;
  attentionReason?: "finished" | "error" | "permission" | null;
  attentionTimestamp?: string | null;
  archivedAt?: string | null;
}

function unreadTime(chat: Chat): number {
  const time = Date.parse(chat.attentionTimestamp ?? "");
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

export function unreadQueue<T extends Chat>(chats: Iterable<T>, originAgentId?: string): T[] {
  return Array.from(chats)
    .filter((chat) =>
      chat.id !== originAgentId &&
      Boolean(chat.workspaceId) &&
      !chat.archivedAt &&
      chat.requiresAttention === true &&
      chat.attentionReason === "finished",
    )
    .sort((a, b) => {
      const first = unreadTime(a);
      const second = unreadTime(b);
      return first === second ? a.id.localeCompare(b.id) : first < second ? -1 : 1;
    });
}
