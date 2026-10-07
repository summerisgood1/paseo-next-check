import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { URL } from "node:url";
import { test, type TestContext } from "node:test";
import React, { act } from "react";
import { create } from "react-test-renderer";
import ts from "typescript";
import type { PluginButtonIconProps, PluginComposerPillContribution } from "@getpaseo/plugin/client";
import type { addCodeReviewPill } from "./code-review.tsx";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL("./code-review.tsx", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

async function press(t: TestContext, provider: string, failure?: Error) {
  const print = console.error;
  t.mock.method(console, "error", (...args: unknown[]) => {
    if (!String(args[0]).startsWith("react-test-renderer is deprecated")) print(...args);
  });
  const sent: string[] = [];
  const notices: string[] = [];
  let contribution!: PluginComposerPillContribution;
  const module = { exports: {} as { addCodeReviewPill: typeof addCodeReviewPill } };
  // Node cannot load React Native; swap only that boundary and keep the real component, effect and press callback.
  const load = (name: string) => name === "@getpaseo/plugin/client/react-native"
    ? { Icon: () => null, useToast: () => ({
      show(message: string) { notices.push(message); },
      error(message: string) { notices.push(`error: ${message}`); },
    }) }
    : require(name);
  new Function("require", "module", "exports", source)(load, module, module.exports);
  module.exports.addCodeReviewPill({
    addComposerPill(value: PluginComposerPillContribution) {
      contribution = value;
      return { update() {}, remove() {} };
    },
    paseo: { agents: { ref(id: string) {
      assert.equal(id, "agent-A");
      return {
        async send(text: string) {
          if (failure) throw failure;
          sent.push(text);
        },
      };
    } } },
  } as unknown as Parameters<typeof addCodeReviewPill>[0], { id: "agent-A", workspaceId: "workspace-A", provider });
  const props = { host: { id: "host-A", label: "Host A" }, size: 14, color: "#000000" } as PluginButtonIconProps;
  await act(async () => {
    create(React.createElement(contribution.button.icon as React.ComponentType<PluginButtonIconProps>, props));
  });
  const behavior = contribution.button.behavior;
  assert.equal(behavior.kind, "action");
  await (behavior as Extract<typeof behavior, { kind: "action" }>).onPress();
  return { sent, notices };
}

test("asks each provider for its native review, then the same triage table", async (t) => {
  const prompts = new Map<string, string>();
  for (const provider of ["claude", "codex", "opencode"]) {
    const { sent, notices } = await press(t, provider);
    assert.equal(sent.length, 1);
    assert.deepEqual(notices, []);
    prompts.set(provider, sent[0]);
  }
  assert.match(prompts.get("claude")!, /^Run \/code-review medium /);
  assert.match(prompts.get("codex")!, /codex review --uncommitted/);
  assert.match(prompts.get("opencode")!, /^Review the current changes for bugs\. /);
  for (const prompt of prompts.values()) assert.match(prompt, /most severe first.*Action \(Fix\/Skip\)/);
});

test("shows the failure instead of failing silently when the agent cannot be reached", async (t) => {
  const { sent, notices } = await press(t, "claude", new Error("Agent not found: agent-A"));
  assert.deepEqual(sent, []);
  assert.deepEqual(notices, ["error: Agent not found: agent-A"]);
});
