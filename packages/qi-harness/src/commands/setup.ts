/**
 * /harness-setup — install status, doctor, queue key docs, capability freeze notes.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	formatDoctorReport,
	runDoctorChecks,
	type DoctorReport,
} from "./doctor.js";

const DEFAULT_MIN_PI = "0.80.6";

const BUNDLED_CAPABILITIES: ReadonlyArray<{ name: string; stage: string }> = [
	{ name: "plan / build", stage: "P0" },
	{ name: "goal", stage: "P0" },
	{ name: "subagents (bg / blocking / parallel)", stage: "P0" },
	{ name: "MCP adapter", stage: "P0" },
	{ name: "ask / todo / btw", stage: "P0" },
	{ name: "cleanup", stage: "P0" },
	{ name: "slash categories", stage: "P0" },
	{ name: "bash-bg", stage: "P1" },
	{ name: "rewind", stage: "P1" },
	{ name: "LSP", stage: "P1" },
	{ name: "split diff", stage: "P1" },
];

function collectExtensionPaths(pi: ExtensionAPI): string[] {
	const paths = new Set<string>();
	try {
		for (const cmd of pi.getCommands()) {
			const p = cmd.sourceInfo?.path;
			if (p && !p.startsWith("<builtin")) paths.add(p);
		}
	} catch {
		// ignore
	}
	try {
		for (const tool of pi.getAllTools()) {
			const p = tool.sourceInfo?.path;
			if (p && !p.startsWith("<builtin")) paths.add(p);
		}
	} catch {
		// ignore
	}
	return [...paths];
}

async function resolvePiVersion(): Promise<string | undefined> {
	try {
		const mod = await import("@earendil-works/pi-coding-agent");
		const v = (mod as { VERSION?: string }).VERSION;
		return typeof v === "string" ? v : undefined;
	} catch {
		return undefined;
	}
}

function buildSetupMessage(report: DoctorReport, piVersion: string | undefined): string {
	const lines: string[] = [
		"qi-harness setup",
		"────────────────",
		`Install: @crayonlu/qi-harness (omnibus Pi extension)`,
		`Pi: ${piVersion ?? "unknown"} (peer >= ${DEFAULT_MIN_PI})`,
		"",
		"Bundled capabilities:",
		...BUNDLED_CAPABILITIES.map((c) => `  [${c.stage}] ${c.name}`),
		"",
		"Queue keys (Pi native — harness does not replace them):",
		"  Enter       = steer (interrupt / inject into current turn)",
		"  Alt+Enter   = followUp (queue for after current turn)",
		"  Esc         = abort streaming; restores already-queued messages to the editor",
		"  Alt+Up      = dequeue / pull queued message back",
		"",
		"NOT supported (product freeze — see docs/capability-matrix.md):",
		"  #11  Double/empty Enter flush of the queue (not implemented; will not be claimed)",
		"  #12  Esc early-cancel refill of the just-submitted prompt (not a product promise)",
		"",
		formatDoctorReport(report),
		"",
		"Next: /harness-doctor for a re-check; /harness-mode for plan/goal state.",
	];
	return lines.join("\n");
}

/**
 * Register `/harness-setup`.
 */
export function registerSetupCommand(pi: ExtensionAPI, options?: { minPiVersion?: string }): void {
	const minPiVersion = options?.minPiVersion ?? DEFAULT_MIN_PI;

	pi.registerCommand("harness-setup", {
		description: "Show qi-harness install status, queue keys, and run doctor",
		handler: async (args, ctx) => {
			const force = /\b(--force|-f)\b/.test(args);
			const piVersion = await resolvePiVersion();
			const commands = pi.getCommands().map((c) => c.name);
			const loadedExtensionPaths = collectExtensionPaths(pi);

			const report = runDoctorChecks({
				piVersion,
				minPiVersion,
				loadedExtensionPaths,
				commands,
				force,
			});

			ctx.ui.notify(buildSetupMessage(report, piVersion), report.ok ? "info" : "warning");
		},
	});
}
