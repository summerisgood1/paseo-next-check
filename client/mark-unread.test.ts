import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { URL } from "node:url";
import { test, type TestContext } from "node:test";
import React, { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import ts from "typescript";
import type { PluginButtonIconProps, PluginComposerPillContribution } from "@getpaseo/plugin/client";
import type { ToastOptions } from "@getpaseo/plugin/client/react-native";
import type { addMarkUnreadPill } from "./mark-unread.tsx";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL("./mark-unread.tsx", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function fixture(t: TestContext) {
  const print = console.error;
  t.mock.method(console, "error", (...args: unknown[]) => {
    if (!String(args[0]).startsWith("react-test-renderer is deprecated")) print(...args);
  });
  let signal!: AbortSignal;
  let complete!: () => void;
  let fail!: (error: Error) => void;
  let contribution!: PluginComposerPillContribution;
  let removals = 0;
  const notices: { message: string; options?: ToastOptions }[] = [];
  const toast = { show(message: string, options?: ToastOptions) { notices.push({ message, options }); } };
  const module = { exports: {} as { addMarkUnreadPill: typeof addMarkUnreadPill } };
  // Node 唔會載入 React Native；只替換平台邊界，保留真正嘅 component、effect 同按掣 callback。
  const load = (name: string) => {
    if (name === "@getpaseo/plugin/client/react-native") return { Icon: () => null, useToast: () => toast };
    if (name === "./web.ts") return {
      supportsWorkspaceUnread: () => true,
      markWorkspaceUnread(_target: unknown, request: AbortSignal) {
        signal = request;
        return new Promise<void>((resolve, reject) => {
          const abort = () => reject(new Error("Mark as unread was canceled."));
          complete = () => { signal.removeEventListener("abort", abort); resolve(); };
          fail = (error) => { signal.removeEventListener("abort", abort); reject(error); };
          if (signal.aborted) abort();
          else signal.addEventListener("abort", abort, { once: true });
        });
      },
    };
    return require(name);
  };
  new Function("require", "module", "exports", source)(load, module, module.exports);
  const registration = module.exports.addMarkUnreadPill({
    addComposerPill(value: PluginComposerPillContribution) {
      contribution = value;
      return { update() {}, remove() { removals++; } };
    },
  } as unknown as Parameters<typeof addMarkUnreadPill>[0], { id: "agent-A", workspaceId: "workspace-A" })!;
  const props = { host: { id: "host-A", label: "Host A" }, size: 14, color: "#000000" } as PluginButtonIconProps;
  const icon = () => React.createElement(contribution.button.icon as React.ComponentType<PluginButtonIconProps>, props);
  const press = () => {
    const behavior = contribution.button.behavior;
    assert.equal(behavior.kind, "action");
    return Promise.resolve((behavior as Extract<typeof behavior, { kind: "action" }>).onPress());
  };
  return { registration, icon, press, signal: () => signal, complete: () => complete(),
    fail: (error: Error) => fail(error), notices, removals: () => removals };
}

test("Paseo pending 狀態將 icon 換成 spinner，唔會取消已開始嘅原生 unread 操作", async (t) => {
  const f = fixture(t);
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(f.icon()); });
  let error: unknown;
  const pending = f.press().catch((failure: unknown) => { error = failure; });
  // 原生 PluginButton 喺 pending 時會拆走 custom icon，選單操作呢刻仲等緊 render。
  await act(async () => { renderer.update(React.createElement(React.Fragment, null, "Pending spinner")); });
  try {
    assert.equal(f.signal().aborted, false);
    assert.equal(error, undefined);
    f.complete();
    await pending;
    assert.equal(error, undefined);
    assert.deepEqual(f.notices, []);
  } finally {
    f.registration.remove();
    await pending;
    await act(async () => { renderer.unmount(); });
  }
});

test("plugin registration 移除時仍然會取消原生選單操作，唔顯示錯誤或未支援提示", async (t) => {
  const f = fixture(t);
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(f.icon()); });
  const pending = f.press();
  f.registration.remove();
  await pending;
  assert.equal(f.signal().aborted, true);
  assert.equal(f.removals(), 1);
  assert.deepEqual(f.notices, []);
  await act(async () => { renderer.unmount(); });
});

test("原生選單無法自動標 unread 時只顯示未支援資訊，唔觸發 Paseo error toast", async (t) => {
  const f = fixture(t);
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(f.icon()); });
  const pending = f.press();
  // Paseo 將 icon 換成 spinner 後，資訊提示都要繼續用到同一個 host 嘅 toast。
  await act(async () => { renderer.update(React.createElement(React.Fragment, null, "Pending spinner")); });
  f.fail(new Error("Paseo's Mark as unread menu is unavailable."));
  try {
    await pending;
    assert.equal(f.notices.length, 1);
    assert.match(f.notices[0].message, /not supported yet/);
    assert.equal(f.notices[0].options?.variant, "info");
  } finally {
    f.registration.remove();
    await act(async () => { renderer.unmount(); });
  }
});
