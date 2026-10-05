import assert from "node:assert/strict";
import { test } from "node:test";
import { unreadQueue, type Chat } from "./queue.ts";

const chat = (id: string, time: string, changes: Partial<Chat> = {}): Chat => ({
  id,
  workspaceId: `workspace-${id}`,
  requiresAttention: true,
  attentionReason: "finished",
  attentionTimestamp: time,
  ...changes,
});

test("跨 workspace 按回覆時間 A → B → C，打開之後就唔再排入隊", () => {
  const a = chat("A", "2026-10-05T10:00:00Z");
  const b = chat("B", "2026-10-05T10:01:00Z");
  const c = chat("C", "2026-10-05T10:02:00Z");
  assert.deepEqual(unreadQueue([c, b, a]).map(({ id }) => id), ["A", "B", "C"]);
  a.requiresAttention = false;
  assert.equal(unreadQueue([c, b, a])[0]?.workspaceId, "workspace-B");
  b.requiresAttention = false;
  assert.equal(unreadQueue([c, b, a])[0]?.id, "C");
  c.requiresAttention = false;
  assert.deepEqual(unreadQueue([c, b, a]), []);
});

test("手動 unread 可以重新加入隊，再跳返所屬 workspace", () => {
  const a = chat("A", "2026-10-05T10:03:00Z", { requiresAttention: false });
  assert.deepEqual(unreadQueue([a]), []);
  a.requiresAttention = true;
  assert.equal(unreadQueue([a])[0]?.workspaceId, "workspace-A");
});

test("手動開 chat 同新完成回覆都直接跟原生 unread 狀態", () => {
  const a = chat("A", "2026-10-05T10:00:00Z", { requiresAttention: false });
  const b = chat("B", "2026-10-05T10:01:00Z");
  assert.deepEqual(unreadQueue([a, b]).map(({ id }) => id), ["B"]);
  a.requiresAttention = true;
  a.attentionTimestamp = "2026-10-05T10:02:00Z";
  assert.deepEqual(unreadQueue([a, b]).map(({ id }) => id), ["B", "A"]);
});

test("撳 Next 時排除目前 chat，避免原生已讀更新未到而跳返自己", () => {
  const a = chat("A", "2026-10-05T10:00:00Z");
  const b = chat("B", "2026-10-05T10:01:00Z");
  assert.equal(unreadQueue([a, b], "A")[0]?.id, "B");
  assert.deepEqual(unreadQueue([a], "A"), []);
});

test("permission、error、archived 同冇 workspace 嘅 agent 唔係待睇回覆", () => {
  const cases = [
    chat("permission", "2026-10-05T10:00:00Z", { attentionReason: "permission" }),
    chat("error", "2026-10-05T10:00:00Z", { attentionReason: "error" }),
    chat("archived", "2026-10-05T10:00:00Z", { archivedAt: "2026-10-05T11:00:00Z" }),
    chat("orphan", "2026-10-05T10:00:00Z", { workspaceId: undefined }),
  ];
  assert.deepEqual(unreadQueue(cases), []);
});

test("時間相同有固定次序；缺漏時間排最後，唔用 updatedAt 估回覆時間", () => {
  const a = chat("A", "2026-10-05T10:00:00Z");
  const b = chat("B", "2026-10-05T10:00:00Z");
  const missing = chat("missing", "invalid");
  assert.deepEqual(unreadQueue([missing, b, a]).map(({ id }) => id), ["A", "B", "missing"]);
});
