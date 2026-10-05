import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { usePaseo } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { unreadQueue } from "../shared/queue.ts";
import { readFreshDirectory } from "./directory.ts";

export function NextUnreadScreen({ params, navigation, host, theme, layout }: PluginScreenProps) {
  const paseo = usePaseo();
  const originAgentId = params.originAgentId;
  const directory = useQuery({
    queryKey: ["next-unread", host.id, originAgentId],
    queryFn: ({ signal }) => readFreshDirectory(paseo, signal),
    enabled: Boolean(navigation),
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const message = !navigation ? "Update Paseo to open the next unread chat."
    : directory.error?.message ?? null;

  useEffect(() => {
    if (!navigation || !directory.data || directory.isFetching) return;
    // 原生 focus／blur 嘅已讀更新可以遲一步；今次操作唔會揀返來源 chat。
    const next = unreadQueue(directory.data.values(), originAgentId)[0];
    if (next) navigation.openAgent({ agentId: next.id, serverId: host.id });
    else if (originAgentId) navigation.openAgent({ agentId: originAgentId, serverId: host.id });
  }, [directory.data, directory.isFetching, navigation, host.id, originAgentId]);

  return (
    <View style={{
      flex: 1, justifyContent: "center", alignItems: "center", gap: 16,
      padding: layout.compact ? 16 : 24, backgroundColor: theme.colors.surface0,
    }}>
      {!message && <ActivityIndicator color={theme.colors.foregroundMuted} />}
      <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.foreground, textAlign: "center" }}>
        {message ?? "Opening next unread chat…"}
      </Text>
      {message && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void directory.refetch()}
            style={{ borderRadius: 8, padding: 12, backgroundColor: theme.colors.accent }}
          >
            <Text style={{ color: theme.colors.accentForeground }}>Retry</Text>
          </Pressable>
          {originAgentId && navigation && (
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.openAgent({ agentId: originAgentId, serverId: host.id })}
              style={{ borderRadius: 8, padding: 12, borderWidth: 1, borderColor: theme.colors.border }}
            >
              <Text style={{ color: theme.colors.foreground }}>Back to chat</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
