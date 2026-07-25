/**
 * Thin adapter: synchronize ModeMutex with plan/goal UX.
 *
 * Existing `/plan` and `/goal` come from Pin packages — we cannot wrap their
 * handlers. Instead we:
 * - track mode via custom session entries + status
 * - expose `/build` as a symmetric exit-plan guidance command
 * - expose `/harness-mode` for observability
 * - on agent_end, optionally auto `/goal pause` on network-like failures (P2)
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ModeMutex } from "../mode/mutex.js";

const ENTRY_TYPE = "qi-harness-mode";
const STATUS_KEY = "qi-harness-mode";

const NETWORK_ERROR_PATTERNS: readonly RegExp[] = [
	/\bECONNRESET\b/i,
	/\bETIMEDOUT\b/i,
	/\bENOTFOUND\b/i,
	/\bEAI_AGAIN\b/i,
	/\bECONNREFUSED\b/i,
	/\bsocket hang up\b/i,
	/\bfetch failed\b/i,
	/\bnetwork\s+error\b/i,
	/\bAPIConnectionError\b/i,
	/\bConnection\s+error\b/i,
	/\bTLS\s+handshake\b/i,
	/\bSSL\s+error\b/i,
	/\bUND_ERR_/i,
];

interface ModeEntryData {
	planActive: boolean;
	goalActive: boolean;
	pauseGoalRequested: boolean;
	updatedAt: number;
}

function textFromMessage(message: unknown): string {
	if (!message || typeof message !== "object") return "";
	const m = message as { role?: string; content?: unknown; errorMessage?: string };
	const parts: string[] = [];
	if (typeof m.errorMessage === "string") parts.push(m.errorMessage);
	const content = m.content;
	if (typeof content === "string") {
		parts.push(content);
	} else if (Array.isArray(content)) {
		for (const block of content) {
			if (!block || typeof block !== "object") continue;
			const b = block as { type?: string; text?: string };
			if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
		}
	}
	return parts.join("\n");
}

export function looksLikeNetworkError(text: string): boolean {
	if (!text.trim()) return false;
	return NETWORK_ERROR_PATTERNS.some((re) => re.test(text));
}

function persistMode(pi: ExtensionAPI, mutex: ModeMutex): void {
	const snap = mutex.snapshot();
	const data: ModeEntryData = {
		...snap,
		updatedAt: Date.now(),
	};
	pi.appendEntry(ENTRY_TYPE, data);
}

function updateStatus(ctx: ExtensionContext, mutex: ModeMutex): void {
	const snap = mutex.snapshot();
	const parts: string[] = [];
	if (snap.planActive) parts.push("plan");
	if (snap.goalActive) parts.push(snap.pauseGoalRequested ? "goal(pause?)" : "goal");
	ctx.ui.setStatus(STATUS_KEY, parts.length > 0 ? `mode:${parts.join("+")}` : "mode:build");
}

function hydrateFromSession(ctx: ExtensionContext, mutex: ModeMutex): void {
	const entries = ctx.sessionManager.getEntries();
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type !== "custom") continue;
		if (entry.customType !== ENTRY_TYPE) continue;
		const data = entry.data as ModeEntryData | undefined;
		if (!data) continue;
		mutex.setPlan(Boolean(data.planActive));
		mutex.setGoal(Boolean(data.goalActive));
		if (data.pauseGoalRequested && data.goalActive) {
			mutex.canEnterPlan(); // re-assert pause flag when goal still active
		}
		return;
	}
}

/**
 * Best-effort inference from registered tools / active tools when Pin packages
 * expose plan/goal state via tool names.
 */
function inferFromTools(pi: ExtensionAPI, mutex: ModeMutex): void {
	let tools: string[] = [];
	try {
		tools = pi.getActiveTools();
	} catch {
		return;
	}
	const lower = tools.map((t) => t.toLowerCase());
	const planLike = lower.some((t) => t.includes("plan_exit") || t === "plan_enter" || t.includes("plan_mode"));
	const goalLike = lower.some(
		(t) => t === "goal_complete" || t === "goal_blocked" || t.startsWith("goal_"),
	);
	if (planLike && !mutex.snapshot().planActive) {
		const gate = mutex.canEnterPlan();
		mutex.setPlan(true);
		if (gate.pauseGoal && mutex.snapshot().goalActive) {
			// pause requested; caller may send /goal pause
		}
	}
	if (goalLike && !mutex.snapshot().goalActive) {
		const gate = mutex.canStartGoal();
		if (gate.ok) mutex.setGoal(true);
	}
}

export function registerPlanGoalMutex(pi: ExtensionAPI, mutex: ModeMutex): void {
	pi.on("session_start", async (_event, ctx) => {
		hydrateFromSession(ctx, mutex);
		updateStatus(ctx, mutex);
	});

	pi.on("agent_start", async (_event, ctx) => {
		inferFromTools(pi, mutex);
		updateStatus(ctx, mutex);
	});

	pi.on("turn_start", async (_event, ctx) => {
		inferFromTools(pi, mutex);
		updateStatus(ctx, mutex);
	});

	// Listen for tool_call that clearly enter/exit plan or goal tooling
	pi.on("tool_call", async (event, ctx) => {
		const name = event.toolName.toLowerCase();
		if (name.includes("plan") && (name.includes("enter") || name === "plan")) {
			const gate = mutex.canEnterPlan();
			mutex.setPlan(true);
			persistMode(pi, mutex);
			updateStatus(ctx, mutex);
			if (gate.pauseGoal) {
				ctx.ui.notify("Plan entered while goal active — pause goal recommended (/goal pause).", "warning");
			}
		}
		if (name.includes("plan") && (name.includes("exit") || name.includes("implement") || name.includes("finalize"))) {
			mutex.setPlan(false);
			persistMode(pi, mutex);
			updateStatus(ctx, mutex);
		}
		if (name === "goal_complete" || name === "goal_blocked") {
			// still "in goal" until cleared; leave goalActive as-is
			updateStatus(ctx, mutex);
		}
		return undefined;
	});

	pi.registerCommand("build", {
		description: "Exit plan mode guidance — prefer /plan implement; marks plan inactive in harness mutex",
		handler: async (_args, ctx) => {
			mutex.setPlan(false);
			persistMode(pi, mutex);
			updateStatus(ctx, mutex);
			ctx.ui.notify(
				"Harness: plan marked inactive. If still in plan-mode tools, run `/plan implement` (or the plan package’s exit command) to fully leave plan.",
				"info",
			);
			// Nudge the agent with a user-visible follow-up only when idle guidance helps
			if (ctx.isIdle()) {
				pi.sendUserMessage(
					"Please exit plan mode and continue implementation (equivalent to /plan implement).",
					{ deliverAs: "followUp" },
				);
			}
		},
	});

	pi.registerCommand("harness-mode", {
		description: "Show qi-harness plan/goal mutex state",
		handler: async (_args, ctx) => {
			const snap = mutex.snapshot();
			const lines = [
				"qi-harness mode",
				`  planActive:           ${snap.planActive}`,
				`  goalActive:           ${snap.goalActive}`,
				`  pauseGoalRequested:   ${snap.pauseGoalRequested}`,
				"",
				"Rules: cannot start goal while plan active; entering plan while goal active requests pause.",
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// P2: network failure → /goal pause when goal appears active
	pi.on("agent_end", async (event, ctx) => {
		const snap = mutex.snapshot();
		if (!snap.goalActive) return;

		const messages = event.messages ?? [];
		let lastAssistantText = "";
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i] as { role?: string };
			if (msg?.role === "assistant") {
				lastAssistantText = textFromMessage(messages[i]);
				break;
			}
		}

		if (!looksLikeNetworkError(lastAssistantText)) return;

		ctx.ui.notify("Network-like error while goal active — sending /goal pause.", "warning");
		try {
			pi.sendUserMessage("/goal pause", { deliverAs: "followUp" });
		} catch {
			ctx.ui.notify("Failed to send /goal pause automatically.", "error");
		}
	});
}
