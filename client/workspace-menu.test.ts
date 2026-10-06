import assert from "node:assert/strict";
import { test } from "node:test";
import { markUnreadThroughWorkspaceMenu, type WorkspaceMenuDriver } from "./workspace-menu.ts";

const target = { serverId: "host-A", workspaceId: "workspace-A" };
const key = "host-A:workspace-A";
const actionId = `sidebar-workspace-menu-mark-as-unread-${key}`;
const triggerId = `sidebar-workspace-kebab-${key}`;
const rowId = `sidebar-workspace-row-${key}`;

function menu() {
  const actions = new Map<string, { enabled: boolean; activate(): void }>();
  const listeners = new Set<() => void>();
  const selected: string[] = [];
  const opened: string[] = [];
  const queries: string[] = [];
  let showContext = false;
  const add = (id: string, enabled = true, activate = () => { selected.push(id); }) => {
    actions.set(id, { enabled, activate });
  };
  const driver: WorkspaceMenuDriver = {
    find(id) { queries.push(id); return actions.get(id) ?? null; },
    openContextMenu(id) {
      opened.push(id);
      if (showContext) add(actionId);
      return showContext;
    },
    observe(check) { listeners.add(check); return () => { listeners.delete(check); }; },
  };
  return {
    driver, add, selected, opened, queries, listeners,
    contextAvailable() { showContext = true; },
    change() { for (const check of listeners) check(); },
  };
}

test("同名 unread 操作只會揀指定 host 同 workspace，等原生選單出現先撳", async () => {
  const ui = menu();
  ui.add("sidebar-workspace-menu-mark-as-unread-host-B:workspace-A");
  ui.add("sidebar-workspace-menu-mark-as-unread-host-A:workspace-B");
  ui.add(triggerId, true, () => { ui.opened.push(triggerId); });
  const pending = markUnreadThroughWorkspaceMenu(ui.driver, target, new AbortController().signal);
  assert.deepEqual(ui.selected, []);
  assert.deepEqual(ui.opened, [triggerId]);
  ui.add(actionId);
  ui.change();
  ui.change();
  await pending;
  assert.deepEqual(ui.selected, [actionId]);
  assert.equal(ui.listeners.size, 0);
});

test("kebab 未顯示都可以沿用正確 workspace 嘅原生右鍵選單", async () => {
  const ui = menu();
  ui.contextAvailable();
  await markUnreadThroughWorkspaceMenu(ui.driver, target, new AbortController().signal);
  assert.deepEqual(ui.opened, [rowId]);
  assert.deepEqual(ui.selected, [actionId]);
  assert.equal(ui.listeners.size, 0);
});

test("sidebar 冇目標 workspace 會報錯，唔會操作另一個 workspace", async () => {
  const ui = menu();
  ui.add("sidebar-workspace-kebab-host-B:workspace-B");
  await assert.rejects(markUnreadThroughWorkspaceMenu(ui.driver, target, new AbortController().signal), /Open the sidebar/);
  assert.deepEqual(ui.selected, []);
  assert.equal(ui.listeners.size, 0);
});

test("取消請求或停用 plugin 會停止等待，遲到嘅 menu 唔會觸發操作", async () => {
  const ui = menu();
  ui.add(triggerId);
  const request = new AbortController();
  const pending = markUnreadThroughWorkspaceMenu(ui.driver, target, request.signal);
  request.abort();
  await assert.rejects(pending, /canceled/);
  ui.add(actionId);
  ui.change();
  assert.deepEqual(ui.selected, [triggerId]);
  assert.equal(ui.listeners.size, 0);
});

test("原生 unread 操作 disabled 或撳掣失敗會傳返錯誤", async () => {
  const disabled = menu();
  disabled.add(actionId, false);
  await assert.rejects(markUnreadThroughWorkspaceMenu(disabled.driver, target, new AbortController().signal), /unavailable/);
  assert.deepEqual(disabled.selected, []);
  const broken = menu();
  broken.add(actionId, true, () => { throw new Error("native menu failed"); });
  await assert.rejects(markUnreadThroughWorkspaceMenu(broken.driver, target, new AbortController().signal), /native menu failed/);
  assert.equal(broken.listeners.size, 0);
});

test("原生選單結構變咗會限時失敗同清走監察", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const ui = menu();
  ui.add(triggerId);
  const pending = markUnreadThroughWorkspaceMenu(ui.driver, target, new AbortController().signal);
  t.mock.timers.tick(2_000);
  await assert.rejects(pending, /menu is unavailable/);
  assert.equal(ui.listeners.size, 0);
  assert.deepEqual(ui.selected, [triggerId]);
});
