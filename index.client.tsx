import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { NextUnreadScreen } from "./client/next-unread.tsx";
import { observeDirectory } from "./client/directory.ts";
import { unreadQueue } from "./shared/queue.ts";
import { addMarkUnreadPill } from "./client/mark-unread.tsx";
import { addCodeReviewPill } from "./client/code-review.tsx";

export default function contribute(client: PluginClientContext) {
  const removeScreen = client.addScreen({
    id: "next-unread", title: "Next unread", Component: NextUnreadScreen,
  });
  const buttons = new Map<string, {
    workspaceId: string;
    registration: PluginButtonRegistration;
    markUnread?: PluginButtonRegistration;
    codeReview: PluginButtonRegistration;
  }>();

  const stop = observeDirectory(client.paseo, ({ agents, loading, error }) => {
    for (const [agentId, button] of buttons) {
      const agent = agents.get(agentId);
      if (!agent || agent.archivedAt || agent.workspaceId !== button.workspaceId) {
        button.registration.remove();
        button.markUnread?.remove();
        button.codeReview.remove();
        buttons.delete(agentId);
      }
    }

    const queue = unreadQueue(agents.values());
    for (const agent of agents.values()) {
      if (!agent.workspaceId || agent.archivedAt) continue;
      const remaining = queue.length - Number(queue.some(({ id }) => id === agent.id));
      const button = {
        title: error ? `Next unread: ${error}` : remaining ? `Next unread (${remaining})` : "No unread replies",
        label: "Next unread",
        icon: "ArrowRight",
        disabled: loading || Boolean(error) || remaining === 0,
      };
      const existing = buttons.get(agent.id);
      // send() interrupts a running turn, so stay disabled whenever the status may be stale.
      const review = {
        disabled: loading || Boolean(error) || (agent.status !== "idle" && agent.status !== "error"),
      };
      if (existing) {
        existing.registration.update(button);
        existing.codeReview.update(review);
      } else {
        const registration = client.addComposerPill({
          id: "next-unread", workspaceId: agent.workspaceId, agentId: agent.id,
          button: {
            ...button,
            behavior: {
              kind: "action",
              onPress: () => client.openScreen({
                screenId: "next-unread", params: { originAgentId: agent.id },
              }),
            },
          },
        });
        const markUnread = addMarkUnreadPill(client, { id: agent.id, workspaceId: agent.workspaceId });
        const codeReview = addCodeReviewPill(client, {
          id: agent.id, workspaceId: agent.workspaceId, provider: agent.provider,
        });
        codeReview.update(review);
        buttons.set(agent.id, { workspaceId: agent.workspaceId, registration, markUnread, codeReview });
      }
    }
  });

  return () => {
    stop();
    for (const { registration, markUnread, codeReview } of buttons.values()) {
      registration.remove();
      markUnread?.remove();
      codeReview.remove();
    }
    buttons.clear();
    removeScreen();
  };
}
