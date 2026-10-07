import { useEffect } from "react";
import type { PluginButtonIconProps, PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { Icon, useToast, type ToastApi } from "@getpaseo/plugin/client/react-native";

// Each provider runs its own native reviewer. Paseo does not expose Codex's review mode, so Codex runs its CLI.
const reviewers: Record<string, string> = {
  claude: "Run /code-review medium on the current changes.",
  codex: "Run Codex's native reviewer on the current changes with `codex review --uncommitted`.",
};

// Raw review output is long and mixes real bugs with nits; the same triage pass turns it into a decision list.
const triage = "Then triage the findings: re-check each one against the code and reply with a single table, "
  + "most severe first, with columns Severity (High/Medium/Low), Issue, Location, Action (Fix/Skip) and Why. "
  + "Mark Fix only when a concrete failure can really happen in this code; Skip style, nits, speculation "
  + "and anything already handled. Do not change code yet.";

export function addCodeReviewPill(
  client: PluginClientContext,
  agent: { id: string; workspaceId: string; provider: string },
): PluginButtonRegistration {
  let toast: ToastApi | undefined;

  function CodeReviewIcon({ size, color }: PluginButtonIconProps) {
    const hostToast = useToast();
    useEffect(() => { toast = hostToast; }, [hostToast]);
    return <Icon name="ScanSearch" size={size} color={color} />;
  }

  return client.addComposerPill({
    id: "code-review", workspaceId: agent.workspaceId, agentId: agent.id,
    button: {
      title: "Review this workspace's changes and triage what needs fixing", label: "Code review",
      icon: CodeReviewIcon,
      behavior: {
        kind: "action",
        async onPress() {
          const reviewer = reviewers[agent.provider] ?? "Review the current changes for bugs.";
          try {
            await client.paseo.agents.ref(agent.id).send(`${reviewer} ${triage}`);
          } catch (error) {
            toast?.error(error instanceof Error ? error.message : String(error));
          }
        },
      },
    },
  });
}
