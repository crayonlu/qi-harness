import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ProcessManager } from "../manager";
import { setupCleanupHook } from "./cleanup";
import { setupProcessEndHook } from "./process-end";
import { setupProcessWatchHook } from "./process-watch";

export function setupProcessesHooks(
  pi: ExtensionAPI,
  manager: ProcessManager,
): void {
  setupCleanupHook(pi, manager);
  setupProcessEndHook(pi, manager);
  setupProcessWatchHook(pi, manager);
}
