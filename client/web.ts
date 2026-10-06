import { Platform } from "react-native";
import { markUnreadThroughWorkspaceMenu } from "./workspace-menu.ts";

// DOM 只用喺 web 後備操作；native client 唔會讀取呢啲 globals。
interface WebElement {
  isConnected: boolean;
  getAttribute(name: string): string | null;
  getClientRects(): { length: number };
  getBoundingClientRect(): { x: number; y: number; width: number; height: number };
  closest(selector: string): WebElement | null;
  click(): void;
  dispatchEvent(event: unknown): boolean;
}
declare const document: {
  documentElement: unknown;
  querySelector(selector: string): WebElement | null;
};
declare const MutationObserver: new (check: () => void) => {
  observe(target: unknown, options: { childList: boolean; subtree: boolean; attributes: boolean }): void;
  disconnect(): void;
};
declare const MouseEvent: new (type: string, options: {
  bubbles: boolean; cancelable: boolean; button: number; clientX: number; clientY: number;
}) => unknown;

export function supportsWorkspaceUnread(): boolean {
  return Platform.OS === "web";
}

export async function markWorkspaceUnread(
  target: { serverId: string; workspaceId: string },
  signal: AbortSignal,
): Promise<void> {
  if (Platform.OS !== "web") return;
  const findElement = (testId: string): WebElement | null => {
    const escaped = testId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const element = document.querySelector(`[data-testid="${escaped}"]`);
    return element?.isConnected && element.getClientRects().length > 0
      && !element.closest('[aria-hidden="true"]') ? element : null;
  };
  const enabled = (element: WebElement) => element.getAttribute("aria-disabled") !== "true"
    && element.getAttribute("disabled") === null
    && element.getAttribute("data-menu-disabled") !== "true";

  await markUnreadThroughWorkspaceMenu({
    find(testId) {
      const element = findElement(testId);
      return element ? { enabled: enabled(element), activate: () => element.click() } : null;
    },
    openContextMenu(testId) {
      const element = findElement(testId);
      if (!element || !enabled(element)) return false;
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true, cancelable: true, button: 2,
        clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2,
      }));
      return true;
    },
    observe(check) {
      const observer = new MutationObserver(check);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      return () => observer.disconnect();
    },
  }, target, signal);
}
