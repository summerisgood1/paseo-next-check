import { useEffect } from "react";
import type { PluginButtonIconProps, PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { markWorkspaceUnread, supportsWorkspaceUnread } from "./web.ts";

export function addMarkUnreadPill(
  client: PluginClientContext,
  agent: { id: string; workspaceId: string },
): PluginButtonRegistration | undefined {
  if (!supportsWorkspaceUnread()) return;
  let mounted: { serverId: string; request: AbortController } | undefined;
  let removed = false;

  function MarkUnreadIcon({ host, size, color }: PluginButtonIconProps) {
    useEffect(() => {
      if (removed) return;
      const view = { serverId: host.id, request: new AbortController() };
      mounted = view;
      return () => {
        view.request.abort();
        if (mounted === view) mounted = undefined;
      };
    }, [host.id]);
    return <Icon name="Circle" size={size} color={color} />;
  }

  const registration = client.addComposerPill({
    id: "mark-as-unread", workspaceId: agent.workspaceId, agentId: agent.id,
    button: {
      title: "Mark this workspace's latest eligible chat as unread", label: "Mark as unread",
      icon: MarkUnreadIcon,
      behavior: {
        kind: "action",
        async onPress() {
          if (!mounted || removed) throw new Error("Open this chat before marking its workspace as unread.");
          await markWorkspaceUnread({
            serverId: mounted.serverId, workspaceId: agent.workspaceId,
          }, mounted.request.signal);
        },
      },
    },
  });
  return {
    update: (patch) => registration.update(patch),
    remove() {
      removed = true;
      mounted?.request.abort();
      registration.remove();
    },
  };
}
