import { useEffect } from "react";
import type { PluginButtonIconProps, PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { markWorkspaceUnread, supportsWorkspaceUnread } from "./web.ts";

export function addMarkUnreadPill(
  client: PluginClientContext,
  agent: { id: string; workspaceId: string },
): PluginButtonRegistration | undefined {
  if (!supportsWorkspaceUnread()) return;
  let serverId: string | undefined;
  const lifetime = new AbortController();

  function MarkUnreadIcon({ host, size, color }: PluginButtonIconProps) {
    useEffect(() => {
      if (!lifetime.signal.aborted) serverId = host.id;
      // Paseo pending 時會用 spinner 換走 icon；取消要跟 registration，唔可以跟 icon unmount。
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
          if (!serverId || lifetime.signal.aborted) throw new Error("Open this chat before marking its workspace as unread.");
          await markWorkspaceUnread({
            serverId, workspaceId: agent.workspaceId,
          }, lifetime.signal);
        },
      },
    },
  });
  return {
    update: (patch) => registration.update(patch),
    remove() {
      lifetime.abort();
      serverId = undefined;
      registration.remove();
    },
  };
}
