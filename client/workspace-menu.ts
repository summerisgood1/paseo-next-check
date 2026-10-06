interface MenuAction {
  enabled: boolean;
  activate(): void;
}

export interface WorkspaceMenuDriver {
  find(testId: string): MenuAction | null;
  openContextMenu(testId: string): boolean;
  observe(check: () => void): () => void;
}

export async function markUnreadThroughWorkspaceMenu(
  driver: WorkspaceMenuDriver,
  target: { serverId: string; workspaceId: string },
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw new Error("Mark as unread was canceled.");
  const key = `${target.serverId}:${target.workspaceId}`;
  const actionId = `sidebar-workspace-menu-mark-as-unread-${key}`;

  await new Promise<void>((resolve, reject) => {
    let finished = false;
    let unobserve: (() => void) | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error, activate?: () => void) => {
      if (finished) return;
      finished = true;
      unobserve?.();
      if (timeout) clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else {
        try { activate?.(); resolve(); }
        catch (error) { reject(error); }
      }
    };
    const abort = () => finish(new Error("Mark as unread was canceled."));
    const select = () => {
      if (finished) return;
      if (signal.aborted) { abort(); return; }
      const action = driver.find(actionId);
      if (!action) return;
      if (!action.enabled) { finish(new Error("Mark as unread is unavailable for this workspace.")); return; }
      // 先停止監察，避免原生選單更新時重複撳同一個操作。
      finish(undefined, () => action.activate());
    };

    signal.addEventListener("abort", abort, { once: true });
    timeout = setTimeout(() => finish(new Error(
      "Paseo's Mark as unread menu is unavailable. Open the sidebar and show this workspace, then try again.",
    )), 2_000);
    try {
      unobserve = driver.observe(select);
      if (finished) { unobserve(); return; }
      // 已開住嘅目標選單可以直接用；唔會揀其他 workspace 同名嘅操作。
      if (driver.find(actionId)) select();
      else {
        const trigger = driver.find(`sidebar-workspace-kebab-${key}`);
        if (trigger?.enabled) trigger.activate();
        else if (!driver.openContextMenu(`sidebar-workspace-row-${key}`)) {
          finish(new Error("Open the sidebar and show this workspace, then try Mark as unread again."));
        }
        select();
      }
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
