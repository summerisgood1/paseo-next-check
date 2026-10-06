import { useEffect } from "react";
import type { PluginButtonIconProps, PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { Icon, useToast, type ToastApi } from "@getpaseo/plugin/client/react-native";
import { markWorkspaceUnread, supportsWorkspaceUnread } from "./web.ts";

export function addMarkUnreadPill(
  client: PluginClientContext,
  agent: { id: string; workspaceId: string },
): PluginButtonRegistration | undefined {
  if (!supportsWorkspaceUnread()) return;
  let serverId: string | undefined;
  let toast: ToastApi | undefined;
  const lifetime = new AbortController();
  const showUnsupported = () => toast?.show(
    "Direct Mark as unread is not supported yet. Use the workspace menu.",
    { variant: "info", durationMs: 3_200 },
  );

  function MarkUnreadIcon({ host, size, color }: PluginButtonIconProps) {
    const hostToast = useToast();
    useEffect(() => {
      if (!lifetime.signal.aborted) { serverId = host.id; toast = hostToast; }
      // Paseo pending 時會用 spinner 換走 icon；取消要跟 registration，唔可以跟 icon unmount。
    }, [host.id, hostToast]);
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
          if (lifetime.signal.aborted) return;
          if (!serverId) { showUnsupported(); return; }
          try {
            await markWorkspaceUnread({
              serverId, workspaceId: agent.workspaceId,
            }, lifetime.signal);
          } catch {
            // 後備選單未能自動標記唔算操作錯誤；保留選單，只提示直接操作未支援。
            if (!lifetime.signal.aborted) showUnsupported();
          }
        },
      },
    },
  });
  return {
    update: (patch) => registration.update(patch),
    remove() {
      lifetime.abort();
      serverId = undefined;
      toast = undefined;
      registration.remove();
    },
  };
}
