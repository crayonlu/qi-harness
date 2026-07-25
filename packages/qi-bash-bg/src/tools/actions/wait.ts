import type { ExecuteResult } from "../../constants";
import type { ProcessManager } from "../../manager";

const LIVE = new Set(["running", "terminating", "terminate_timeout"]);

/**
 * Block until a process exits (or timeout). Used so agents can await builds
 * without polling in a busy loop.
 */
export async function executeWait(
  params: { id?: string; timeoutMs?: number },
  manager: ProcessManager,
): Promise<ExecuteResult> {
  if (!params.id) {
    return {
      content: [{ type: "text", text: "id is required for wait" }],
      details: {
        action: "wait",
        success: false,
        message: "id is required for wait",
      },
    };
  }

  const timeoutMs = Math.max(0, params.timeoutMs ?? 600_000);
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const info = manager.get(params.id);
    if (!info) {
      return {
        content: [{ type: "text", text: `Process ${params.id} not found` }],
        details: {
          action: "wait",
          success: false,
          message: `Process ${params.id} not found`,
        },
      };
    }
    if (!LIVE.has(info.status)) {
      const ok = info.success === true;
      return {
        content: [
          {
            type: "text",
            text: `Process ${info.id} "${info.name}" finished: status=${info.status} exitCode=${info.exitCode}`,
          },
        ],
        details: {
          action: "wait",
          success: ok,
          message: `Process finished with status ${info.status}`,
          process: info,
        },
      };
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  const info = manager.get(params.id);
  return {
    content: [
      {
        type: "text",
        text: `Timed out waiting for process ${params.id} after ${timeoutMs}ms (still ${info?.status ?? "unknown"})`,
      },
    ],
    details: {
      action: "wait",
      success: false,
      message: `wait timed out after ${timeoutMs}ms`,
      process: info ?? undefined,
    },
  };
}
