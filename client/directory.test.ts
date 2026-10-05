import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import type { OwnedSubscription, PaseoAgent, PaseoAgentListResult, PaseoApi } from "@getpaseo/client";
import { observeDirectory, readAllAgents, type DirectoryState } from "./directory.ts";
import { unreadQueue } from "../shared/queue.ts";

function agent(id: string, requiresAttention = true): PaseoAgent {
  return {
    id, workspaceId: `workspace-${id}`, requiresAttention,
    attentionReason: "finished", attentionTimestamp: "2026-10-05T10:00:00Z",
  } as PaseoAgent;
}

function page(agents: PaseoAgent[], nextCursor: string | null = null): PaseoAgentListResult {
  return {
    requestId: "test", entries: agents.map((agent) => ({ agent })),
    pageInfo: { hasMore: nextCursor !== null, nextCursor, prevCursor: null },
  } as PaseoAgentListResult;
}

function fakeApi(list: (...args: any[]) => Promise<any>): PaseoApi {
  return { agents: { list } } as unknown as PaseoApi;
}

test("會補齊超過 200 個 chats 嘅分頁，唔會漏咗其他 workspace", async () => {
  const initial = page(Array.from({ length: 200 }, (_, i) => agent(`A-${i}`, false)), "second");
  const requested: string[] = [];
  const api = fakeApi(async ({ page: request }) => {
    requested.push(request.cursor);
    return page([agent("B")]);
  });
  const agents = await readAllAgents(api, new AbortController().signal, initial);
  assert.equal(agents.size, 201);
  assert.deepEqual(requested, ["second"]);
  assert.equal(unreadQueue(agents.values())[0]?.workspaceId, "workspace-B");
});

test("host 分頁錯誤會失敗，唔會永遠載入或展示唔齊嘅隊列", async () => {
  const api = fakeApi(async () => page([agent("A")], "stuck"));
  await assert.rejects(readAllAgents(api, new AbortController().signal), /finish paging/);
});

test("補頁期間已睇同手動 unread 嘅 live 更新唔會畀舊資料蓋返", async () => {
  let complete!: (result: PaseoAgentListResult) => void;
  const tail = new Promise<PaseoAgentListResult>((resolve) => { complete = resolve; });
  const initial = page([agent("A")], "second");
  let observer!: Parameters<OwnedSubscription<PaseoAgentListResult>["subscribe"]>[0];
  let releases = 0;
  let unsubscribes = 0;
  const subscription: OwnedSubscription<PaseoAgentListResult> = {
    subscriptionId: "initial",
    ready: Promise.resolve({ ...initial, subscriptionId: "initial" }),
    subscribe(next) {
      observer = next;
      next.snapshot({ ...initial, subscriptionId: "initial" });
      return () => { unsubscribes++; };
    },
    async release() { releases++; },
  };
  const api = fakeApi(async (options) => options.subscribe ? { ...initial, subscription } : tail);
  const states: DirectoryState[] = [];
  const stop = observeDirectory(api, (state) => states.push(state));
  await setImmediate();
  observer.update({ type: "agent_update", payload: { kind: "upsert", agent: agent("A", false) } } as any);
  observer.update({ type: "agent_update", payload: { kind: "upsert", agent: agent("B") } } as any);
  complete(page([agent("A"), agent("B", false)]));
  await setImmediate();
  const state = states.at(-1)!;
  assert.equal(state.loading, false);
  assert.deepEqual(unreadQueue(state.agents.values()).map(({ id }) => id), ["B"]);
  stop();
  assert.equal(unsubscribes, 1);
  assert.equal(releases, 1);
});

test("reconnect 用 fresh snapshot 重建隊列，remove 更新會即刻移除 chat", async () => {
  const initial = page([agent("A")]);
  let observer!: Parameters<OwnedSubscription<PaseoAgentListResult>["subscribe"]>[0];
  const subscription: OwnedSubscription<PaseoAgentListResult> = {
    subscriptionId: "initial",
    ready: Promise.resolve({ ...initial, subscriptionId: "initial" }),
    subscribe(next) {
      observer = next;
      next.snapshot({ ...initial, subscriptionId: "initial" });
      return () => {};
    },
    async release() {},
  };
  const api = fakeApi(async () => ({ ...initial, subscription }));
  let state!: DirectoryState;
  const stop = observeDirectory(api, (next) => { state = next; });
  await setImmediate();
  assert.equal(unreadQueue(state.agents.values())[0]?.id, "A");
  observer.snapshot({ ...page([agent("C")]), subscriptionId: "reconnected" });
  await setImmediate();
  assert.deepEqual(unreadQueue(state.agents.values()).map(({ id }) => id), ["C"]);
  observer.update({ type: "agent_update", payload: { kind: "remove", agentId: "C" } } as any);
  assert.equal(state.agents.size, 0);
  stop();
});

test("停用 plugin 會取消未完成讀取，唔會再發佈結果", async () => {
  let complete!: (result: PaseoAgentListResult) => void;
  let signal!: AbortSignal;
  let releases = 0;
  const pending = new Promise<PaseoAgentListResult>((resolve) => { complete = resolve; });
  const api = fakeApi(async (options) => { signal = options.signal; return pending; });
  const states: DirectoryState[] = [];
  const stop = observeDirectory(api, (state) => states.push(state));
  stop();
  assert.equal(signal.aborted, true);
  const before = states.length;
  complete({ ...page([agent("A")]), subscription: { release: async () => { releases++; } } as any });
  await setImmediate();
  assert.equal(states.length, before);
  assert.equal(releases, 1);
});
