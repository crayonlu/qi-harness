/**
 * Thin adapter: synchronize ModeMutex with plan/goal UX.
 *
 * Existing `/plan` and `/goal` come from Pin packages — we cannot wrap their
 * handlers. Instead we:
 * - track mode via custom session entries + status + plan-mode-state / pi-goal events
 * - expose `/build` as a real alias that runs `/plan implement`
 * - expose `/harness-mode` for observability
 * - enforce mutex: block goal tools while plan active; auto-pause goal on conflict
 * - on agent_end, optionally auto `/goal pause` on network-like failures (P2)
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ModeMutex } from "../mode/mutex.js";

const ENTRY_TYPE = "qi-harness-mode";
const STATUS_KEY = "qi-harness-mode";
const PLAN_STATE_ENTRY = "plan-mode-state";
const GOAL_STATE_CHANNEL = "pi-goal:state";

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

interface GoalStatePayload {
	goalId?: string;
	status?: string;
	reason?: string;
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
		return;
	}
}

/** Authoritative plan-mode enabled flag from `@narumitw/pi-plan-mode` session state. */
export function readPlanModeEnabled(ctx: ExtensionContext): boolean {
	const branch =
		typeof ctx.sessionManager.getBranch === "function"
			? ctx.sessionManager.getBranch()
			: ctx.sessionManager.getEntries();
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i] as { type?: string; customType?: string; data?: unknown };
		if (entry?.type !== "custom" || entry.customType !== PLAN_STATE_ENTRY) continue;
		const data = entry.data as { enabled?: boolean } | undefined;
		return data?.enabled === true;
	}
	return false;
}

function syncPlanFromSession(ctx: ExtensionContext, mutex: ModeMutex): boolean {
	const enabled = readPlanModeEnabled(ctx);
	if (enabled !== mutex.snapshot().planActive) {
		mutex.setPlan(enabled);
	}
	return enabled;
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

function isGoalToolName(name: string): boolean {
	const n = name.toLowerCase();
	return n === "goal_complete" || n === "goal_blocked" || n.startsWith("goal_");
}

function isPlanEnterTool(name: string): boolean {
	const n = name.toLowerCase();
	return n.includes("plan") && (n.includes("enter") || n === "plan" || n.includes("plan_mode"));
}

function safeSend(pi: ExtensionAPI, text: string, deliverAs?: "followUp" | "steer"): void {
	try {
		if (deliverAs) pi.sendUserMessage(text, { deliverAs });
		else pi.sendUserMessage(text);
	} catch {
		// ignore — command context may be mid-teardown
	}
}

export function registerPlanGoalMutex(pi: ExtensionAPI, mutex: ModeMutex): void {
	let lastCtx: ExtensionContext | undefined;
	let autoPauseInFlight = false;

	const requestGoalPause = (ctx: ExtensionContext, reason: string): void => {
		if (autoPauseInFlight) return;
		autoPauseInFlight = true;
		ctx.ui.notify(reason, "warning");
		safeSend(pi, "/goal pause", ctx.isIdle() ? undefined : "followUp");
		setTimeout(() => {
			autoPauseInFlight = false;
		}, 1500);
	};

	pi.on("session_start", async (_event, ctx) => {
		lastCtx = ctx;
		hydrateFromSession(ctx, mutex);
		syncPlanFromSession(ctx, mutex);
		updateStatus(ctx, mutex);
	});

	pi.on("agent_start", async (_event, ctx) => {
		lastCtx = ctx;
		syncPlanFromSession(ctx, mutex);
		inferFromTools(pi, mutex);
		updateStatus(ctx, mutex);
	});

	pi.on("turn_start", async (_event, ctx) => {
		lastCtx = ctx;
		syncPlanFromSession(ctx, mutex);
		inferFromTools(pi, mutex);
		updateStatus(ctx, mutex);
	});

	// Cross-extension: pi-goal broadcasts state on the shared event bus
	pi.events.on(GOAL_STATE_CHANNEL, (data: unknown) => {
		const payload = (data ?? {}) as GoalStatePayload;
		const status = payload.status ?? "";
		const ctx = lastCtx;
		if (!ctx) return;

		const planActive = syncPlanFromSession(ctx, mutex) || mutex.snapshot().planActive;

		if (status === "active" || status === "queued") {
			const gate = mutex.canStartGoal();
			if (!gate.ok || planActive) {
				mutex.setGoal(true);
				persistMode(pi, mutex);
				updateStatus(ctx, mutex);
				requestGoalPause(
					ctx,
					gate.reason ??
						"Cannot run goal while plan mode is active — pausing goal. Exit plan with /plan implement or /build first.",
				);
				return;
			}
			mutex.setGoal(true);
			persistMode(pi, mutex);
			updateStatus(ctx, mutex);
			return;
		}

		if (status === "paused") {
			mutex.setGoal(true);
			persistMode(pi, mutex);
			updateStatus(ctx, mutex);
			return;
		}
		if (status === "cleared" || status === "complete" || status === "blocked") {
			mutex.setGoal(false);
			persistMode(pi, mutex);
			updateStatus(ctx, mutex);
		}
	});

	// Hard block goal tools while plan mode is active
	pi.on("tool_call", async (event, ctx) => {
		lastCtx = ctx;
		const name = event.toolName;
		const planActive = syncPlanFromSession(ctx, mutex) || mutex.snapshot().planActive;

		if (isGoalToolName(name) && planActive) {
			const gate = mutex.canStartGoal();
			return {
				block: true,
				reason:
					gate.reason ??
					"Goal tools blocked while plan mode is active. Run /plan implement or /build first.",
			};
		}

		if (isPlanEnterTool(name)) {
			const gate = mutex.canEnterPlan();
			mutex.setPlan(true);
			persistMode(pi, mutex);
			updateStatus(ctx, mutex);
			if (gate.pauseGoal && mutex.snapshot().goalActive) {
				requestGoalPause(
					ctx,
					"Plan entered while goal active — auto-pausing goal (/goal pause).",
				);
			}
			return undefined;
		}

		const lower = name.toLowerCase();
		if (lower.includes("plan") && (lower.includes("exit") || lower.includes("implement") || lower.includes("finalize"))) {
			mutex.setPlan(false);
			persistMode(pi, mutex);
			updateStatus(ctx, mutex);
		}
		if (name === "goal_complete" || name === "goal_blocked") {
			updateStatus(ctx, mutex);
		}
		return undefined;
	});

	pi.registerCommand("build", {
		description: "Exit plan mode and implement the proposed plan (runs /plan implement)",
		handler: async (_args, ctx) => {
			lastCtx = ctx;
			const planEnabled = syncPlanFromSession(ctx, mutex);
			if (!planEnabled && !mutex.snapshot().planActive) {
				ctx.ui.notify(
					"Plan mode does not appear active. If you have a proposed plan, try `/plan implement` directly.",
					"warning",
				);
			}

			ctx.ui.notify("Running /plan implement…", "info");
			try {
				// Extension commands are executed by sendUserMessage → prompt → _tryExecuteExtensionCommand
				pi.sendUserMessage("/plan implement");
			} catch (err) {
				const detail = err instanceof Error ? err.message : String(err);
				ctx.ui.notify(`Failed to run /plan implement: ${detail}`, "error");
				return;
			}

			mutex.setPlan(false);
			persistMode(pi, mutex);
			updateStatus(ctx, mutex);
		},
	});

	pi.registerCommand("harness-mode", {
		description: "Show qi-harness plan/goal mutex state",
		handler: async (_args, ctx) => {
			lastCtx = ctx;
			syncPlanFromSession(ctx, mutex);
			const snap = mutex.snapshot();
			const planSession = readPlanModeEnabled(ctx);
			const lines = [
				"qi-harness mode",
				`  planActive (mutex):   ${snap.planActive}`,
				`  planActive (session): ${planSession}`,
				`  goalActive:           ${snap.goalActive}`,
				`  pauseGoalRequested:   ${snap.pauseGoalRequested}`,
				"",
				"Rules: cannot start goal while plan active (auto /goal pause + tool block);",
				"entering plan while goal active requests pause.",
				"Use /build or /plan implement to leave plan and implement.",
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// P2: network failure → /goal pause when goal appears active
	pi.on("agent_end", async (event, ctx) => {
		lastCtx = ctx;
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

		requestGoalPause(ctx, "Network-like error while goal active — sending /goal pause.");
	});
}
