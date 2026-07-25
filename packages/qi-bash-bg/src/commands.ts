/**
 * User-facing /ps slash commands for background process management.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ProcessManager } from "./manager";
import { formatRuntime, formatStatus, truncateCmd } from "./utils";

function formatProcessList(manager: ProcessManager): string {
  const processes = manager.list();
  if (processes.length === 0) {
    return "No background processes.";
  }
  const lines = processes.map(
    (p) =>
      `${p.id}  "${p.name}"  ${truncateCmd(p.command, 48)}  [${formatStatus(p)}]  ${formatRuntime(p.startTime, p.endTime)}`,
  );
  return `${processes.length} process(es):\n${lines.join("\n")}`;
}

function resolveId(
  manager: ProcessManager,
  arg: string,
): { id: string } | { error: string } {
  const trimmed = arg.trim();
  if (!trimmed) return { error: "Missing process id. Usage: /ps:logs <id>" };
  const proc = manager.get(trimmed);
  if (!proc) return { error: `Process not found: ${trimmed}` };
  return { id: proc.id };
}

async function pickProcessId(
  ctx: ExtensionContext,
  manager: ProcessManager,
  prompt: string,
): Promise<string | null> {
  const processes = manager.list();
  if (processes.length === 0) {
    ctx.ui.notify("No background processes.", "info");
    return null;
  }
  if (!ctx.hasUI) {
    ctx.ui.notify(formatProcessList(manager), "info");
    return null;
  }
  const labels = processes.map(
    (p) => `${p.id} — ${p.name} [${formatStatus(p)}]`,
  );
  const choice = await ctx.ui.select(prompt, labels);
  if (!choice) return null;
  const id = choice.split(" — ")[0]?.trim();
  return id || null;
}

/**
 * Register /ps, /ps:logs, /ps:kill, /ps:clear (and deprecated /process:* aliases).
 */
export function setupProcessCommands(
  pi: ExtensionAPI,
  manager: ProcessManager,
): void {
  const runPs = async (_args: string, ctx: ExtensionContext) => {
    ctx.ui.notify(formatProcessList(manager), "info");
  };

  const runLogs = async (args: string, ctx: ExtensionContext) => {
    let id = args.trim();
    if (!id) {
      const picked = await pickProcessId(ctx, manager, "Select process for logs");
      if (!picked) return;
      id = picked;
    }
    const resolved = resolveId(manager, id);
    if ("error" in resolved) {
      ctx.ui.notify(resolved.error, "warning");
      return;
    }
    const proc = manager.get(resolved.id);
    if (!proc) {
      ctx.ui.notify(`Process not found: ${resolved.id}`, "warning");
      return;
    }
    const logFiles = manager.getLogFiles(proc.id);
    const output = manager.getOutput(proc.id, 40);
    const parts: string[] = [
      `Process ${proc.id} "${proc.name}" [${formatStatus(proc)}]`,
    ];
    if (logFiles) {
      parts.push(`stdout: ${logFiles.stdoutFile}`);
      parts.push(`stderr: ${logFiles.stderrFile}`);
    }
    if (output?.stdout.length) {
      parts.push("", "--- stdout (tail) ---", ...output.stdout.slice(-40));
    }
    if (output?.stderr.length) {
      parts.push("", "--- stderr (tail) ---", ...output.stderr.slice(-40));
    }
    ctx.ui.notify(parts.join("\n"), "info");
  };

  const runKill = async (args: string, ctx: ExtensionContext) => {
    let id = args.trim();
    if (!id) {
      const picked = await pickProcessId(ctx, manager, "Select process to kill");
      if (!picked) return;
      id = picked;
    }
    const resolved = resolveId(manager, id);
    if ("error" in resolved) {
      ctx.ui.notify(resolved.error, "warning");
      return;
    }
    const proc = manager.get(resolved.id);
    if (!proc) {
      ctx.ui.notify(`Process not found: ${resolved.id}`, "warning");
      return;
    }
    const result = await manager.kill(proc.id, {
      signal: "SIGTERM",
      timeoutMs: 3000,
    });
    if (result.ok) {
      ctx.ui.notify(`Terminated "${proc.name}" (${proc.id})`, "info");
    } else if (result.reason === "timeout") {
      ctx.ui.notify(
        `SIGTERM timed out for "${proc.name}" (${proc.id}). Process may still be running.`,
        "warning",
      );
    } else {
      ctx.ui.notify(`Failed to terminate "${proc.name}" (${proc.id})`, "error");
    }
  };

  const runClear = async (_args: string, ctx: ExtensionContext) => {
    const cleared = manager.clearFinished();
    ctx.ui.notify(
      cleared > 0
        ? `Cleared ${cleared} finished process(es)`
        : "No finished processes to clear",
      "info",
    );
  };

  pi.registerCommand("ps", {
    description: "List background processes managed by qi-bash-bg",
    handler: runPs,
  });

  pi.registerCommand("ps:logs", {
    description: "Show log file paths (and recent output) for a process",
    handler: runLogs,
  });

  pi.registerCommand("ps:kill", {
    description: "Terminate a background process (SIGTERM)",
    handler: runKill,
  });

  pi.registerCommand("ps:clear", {
    description: "Remove finished processes from the list",
    handler: runClear,
  });

  pi.registerCommand("process:list", {
    description: "Deprecated alias for /ps",
    handler: async (args, ctx) => {
      ctx.ui.notify("/process:list is deprecated; use /ps", "warning");
      await runPs(args, ctx);
    },
  });
  pi.registerCommand("process:logs", {
    description: "Deprecated alias for /ps:logs",
    handler: async (args, ctx) => {
      ctx.ui.notify("/process:logs is deprecated; use /ps:logs", "warning");
      await runLogs(args, ctx);
    },
  });
  pi.registerCommand("process:kill", {
    description: "Deprecated alias for /ps:kill",
    handler: async (args, ctx) => {
      ctx.ui.notify("/process:kill is deprecated; use /ps:kill", "warning");
      await runKill(args, ctx);
    },
  });
  pi.registerCommand("process:clear", {
    description: "Deprecated alias for /ps:clear",
    handler: async (args, ctx) => {
      ctx.ui.notify("/process:clear is deprecated; use /ps:clear", "warning");
      await runClear(args, ctx);
    },
  });
}
