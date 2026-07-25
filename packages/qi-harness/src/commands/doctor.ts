/**
 * /harness-doctor — conflict & environment checks for qi-harness.
 */

import { createRequire } from "node:module";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const require = createRequire(import.meta.url);

function resolvePiVersion(): string | undefined {
	try {
		const pkg = require("@earendil-works/pi-coding-agent/package.json") as { version?: string };
		return typeof pkg.version === "string" ? pkg.version : undefined;
	} catch {
		return undefined;
	}
}

export interface DoctorInput {
	piVersion?: string;
	minPiVersion: string;
	loadedExtensionPaths: string[];
	commands: string[];
	force?: boolean;
}

export interface DoctorReport {
	ok: boolean;
	errors: string[];
	warnings: string[];
	info: string[];
}

/** Semver-ish compare: split on `.`, compare numeric segments left-to-right. */
export function compareSemverIsh(a: string, b: string): number {
	const parse = (v: string): number[] =>
		v
			.replace(/^v/i, "")
			.split(/[.+-]/)
			.map((part) => {
				const n = Number.parseInt(part, 10);
				return Number.isFinite(n) ? n : 0;
			});

	const left = parse(a);
	const right = parse(b);
	const len = Math.max(left.length, right.length);
	for (let i = 0; i < len; i++) {
		const x = left[i] ?? 0;
		const y = right[i] ?? 0;
		if (x < y) return -1;
		if (x > y) return 1;
	}
	return 0;
}

function normalizePath(p: string): string {
	return p.replace(/\\/g, "/").toLowerCase();
}

function pathIncludes(paths: string[], ...needles: string[]): boolean {
	return paths.some((p) => {
		const n = normalizePath(p);
		return needles.some((needle) => n.includes(needle.toLowerCase()));
	});
}

function matchingPaths(paths: string[], ...needles: string[]): string[] {
	return paths.filter((p) => {
		const n = normalizePath(p);
		return needles.some((needle) => n.includes(needle.toLowerCase()));
	});
}

function commandNames(commands: string[]): Set<string> {
	return new Set(
		commands.map((c) =>
			c
				.replace(/^\//, "")
				.toLowerCase()
				.replace(/:\d+$/, ""),
		),
	);
}

function pushIssue(
	report: DoctorReport,
	force: boolean,
	message: string,
	severity: "error" | "warning" = "error",
): void {
	if (severity === "warning" || force) {
		report.warnings.push(message);
	} else {
		report.errors.push(message);
	}
}

/**
 * Pure doctor checks — unit-testable without ExtensionAPI.
 */
export function runDoctorChecks(input: DoctorInput): DoctorReport {
	const force = input.force === true;
	const report: DoctorReport = {
		ok: true,
		errors: [],
		warnings: [],
		info: [],
	};

	const paths = input.loadedExtensionPaths;
	report.info.push(`Scanning ${paths.length} extension path(s); ${input.commands.length} command(s) registered.`);

	// Pi version
	if (input.piVersion === undefined || input.piVersion.trim() === "") {
		report.warnings.push(
			`Pi version unknown; cannot verify >= ${input.minPiVersion}. Pass piVersion or ensure @earendil-works/pi-coding-agent exports VERSION.`,
		);
	} else if (compareSemverIsh(input.piVersion, input.minPiVersion) < 0) {
		pushIssue(
			report,
			force,
			`Pi version ${input.piVersion} is below minimum ${input.minPiVersion}. Upgrade @earendil-works/pi-coding-agent.`,
		);
	} else {
		report.info.push(`Pi version ${input.piVersion} meets minimum ${input.minPiVersion}.`);
	}

	// Dual /btw: narumitw pi-btw vs juicesharp rpiv-btw
	const hasPiBtw = pathIncludes(paths, "pi-btw", "/@narumitw/pi-btw", "narumitw/pi-btw");
	const hasRpivBtw = pathIncludes(paths, "rpiv-btw", "@juicesharp/rpiv-btw", "juicesharp/rpiv-btw");
	if (hasPiBtw && hasRpivBtw) {
		pushIssue(
			report,
			force,
			"Conflict: both pi-btw (narumitw) and rpiv-btw are loaded. Keep only @juicesharp/rpiv-btw (qi-harness default).",
		);
	}

	// Dual subagents: nicobailon pi-subagents vs narumitw subagents package.
	// Note: "@narumitw/pi-subagents" contains the substring "pi-subagents" — exclude narumitw from the nicobailon check.
	const hasNicobailon = paths.some((p) => {
		const n = normalizePath(p);
		if (n.includes("narumitw")) return false;
		return (
			n.includes("nicobailon/pi-subagents") ||
			n.includes("/node_modules/pi-subagents") ||
			/(^|\/)pi-subagents(\/|$)/.test(n)
		);
	});
	const hasNarumitwSubagents = pathIncludes(
		paths,
		"narumitw/pi-subagents",
		"@narumitw/pi-subagents",
		"narumitw/subagents",
	);
	if (hasNicobailon && hasNarumitwSubagents) {
		pushIssue(
			report,
			force,
			"Conflict: both nicobailon/pi-subagents and a narumitw subagents package are loaded. Keep only one.",
		);
	}

	// oh-my-pi host / extensions must not be mixed with official Pi + qi-harness
	const ohMyPi = matchingPaths(paths, "oh-my-pi", "oh_my_pi", "@oh-my-pi/");
	if (ohMyPi.length > 0) {
		pushIssue(
			report,
			force,
			`Conflict: oh-my-pi path(s) detected (${ohMyPi.join(", ")}). qi-harness targets @earendil-works/pi-coding-agent only — do not mix hosts.`,
		);
	}

	// Statusline vs starship mutual exclusion (P2)
	const hasStatusline = pathIncludes(
		paths,
		"pi-statusline",
		"@narumitw/pi-statusline",
		"narumitw/pi-statusline",
	);
	const hasStarship = pathIncludes(paths, "starship", "pi-starship", "@narumitw/pi-starship");
	if (hasStatusline && hasStarship) {
		pushIssue(
			report,
			force,
			"Conflict: both pi-statusline and a starship status extension are loaded. Keep only one statusline provider.",
		);
	} else if (hasStatusline) {
		report.info.push("pi-statusline loaded.");
	}

	const hasRetry = pathIncludes(paths, "pi-retry", "@narumitw/pi-retry", "narumitw/pi-retry");
	if (hasRetry) {
		report.info.push("pi-retry loaded.");
	}

	// Duplicate /goal implementations
	const goalPaths = matchingPaths(
		paths,
		"pi-goal",
		"@narumitw/pi-goal",
		"/goal/",
		"narumitw/pi-goal",
	);
	const uniqueGoalRoots = new Set(
		goalPaths.map((p) => {
			const n = normalizePath(p);
			const idx = n.indexOf("pi-goal");
			return idx >= 0 ? n.slice(0, idx + "pi-goal".length) : n;
		}),
	);
	if (uniqueGoalRoots.size > 1) {
		pushIssue(
			report,
			force,
			`Conflict: multiple goal packages loaded (${[...uniqueGoalRoots].join(", ")}). Duplicate /goal registrations will collide.`,
		);
	}

	const names = commandNames(input.commands);
	const goalCommandCount = input.commands.filter((c) => {
		const base = c.replace(/^\//, "").toLowerCase().replace(/:\d+$/, "");
		return base === "goal";
	}).length;
	if (goalCommandCount > 1) {
		pushIssue(
			report,
			force,
			`Conflict: ${goalCommandCount} /goal command registrations found (numeric suffixes indicate duplicates). Uninstall the extra goal package.`,
		);
	}

	// Expected harness commands
	const expected = ["plan", "goal", "btw", "cleanup"] as const;
	for (const cmd of expected) {
		if (!names.has(cmd)) {
			report.warnings.push(`Expected command /${cmd} not found. Is the corresponding package loaded?`);
		}
	}
	if (!names.has("todos") && !names.has("todo")) {
		report.warnings.push("Expected todo command (/todos or /todo) not found. Is @juicesharp/rpiv-todo loaded?");
	} else {
		report.info.push(`Todo command present (${names.has("todos") ? "/todos" : "/todo"}).`);
	}

	if (names.has("plan") && names.has("goal") && names.has("btw") && names.has("cleanup")) {
		report.info.push("Core slash commands present: plan, goal, btw, cleanup.");
	}

	report.ok = report.errors.length === 0;
	return report;
}

export function formatDoctorReport(report: DoctorReport): string {
	const lines: string[] = [
		`qi-harness doctor: ${report.ok ? "PASS" : "FAIL"}`,
	];
	for (const e of report.errors) lines.push(`  ERROR   ${e}`);
	for (const w of report.warnings) lines.push(`  WARN    ${w}`);
	for (const i of report.info) lines.push(`  INFO    ${i}`);
	return lines.join("\n");
}

const DEFAULT_MIN_PI = "0.80.6";

function collectExtensionPaths(pi: ExtensionAPI): string[] {
	const paths = new Set<string>();
	try {
		for (const cmd of pi.getCommands()) {
			const p = cmd.sourceInfo?.path;
			if (p && !p.startsWith("<builtin")) paths.add(p);
		}
	} catch {
		// getCommands may throw before session is ready
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

/**
 * Register `/harness-doctor` slash command.
 */
export function registerDoctorCommand(pi: ExtensionAPI, options?: { minPiVersion?: string }): void {
	const minPiVersion = options?.minPiVersion ?? DEFAULT_MIN_PI;

	pi.registerCommand("harness-doctor", {
		description: "Check qi-harness conflicts, Pi version, and expected commands",
		handler: async (args, ctx) => {
			const force = /\b(--force|-f)\b/.test(args);
			const piVersion = resolvePiVersion();
			const commands = pi.getCommands().map((c) => c.name);
			const loadedExtensionPaths = collectExtensionPaths(pi);

			const report = runDoctorChecks({
				piVersion,
				minPiVersion,
				loadedExtensionPaths,
				commands,
				force,
			});

			const text = formatDoctorReport(report);
			ctx.ui.notify(text, report.ok ? "info" : "error");
		},
	});
}
