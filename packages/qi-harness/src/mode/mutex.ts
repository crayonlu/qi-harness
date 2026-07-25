/**
 * Plan ↔ Goal mode mutual exclusion.
 *
 * Pure state machine — no Pi imports — so unit tests can exercise every
 * transition without ExtensionAPI mocks.
 *
 * Rules:
 * - Goal cannot start while plan is active.
 * - Entering plan while goal is active is allowed, but requests a goal pause
 *   (`pauseGoalRequested` / `pauseGoal: true`).
 */

export interface ModeSnapshot {
	planActive: boolean;
	goalActive: boolean;
	pauseGoalRequested: boolean;
}

export interface CanStartGoalResult {
	ok: boolean;
	reason?: string;
}

export interface CanEnterPlanResult {
	ok: boolean;
	reason?: string;
	/** True when goal is active and should be paused before/while plan runs. */
	pauseGoal?: boolean;
}

export class ModeMutex {
	#planActive = false;
	#goalActive = false;
	#pauseGoalRequested = false;

	setPlan(on: boolean): void {
		this.#planActive = on;
		if (on && this.#goalActive) {
			this.#pauseGoalRequested = true;
		}
		if (!on && !this.#goalActive) {
			this.#pauseGoalRequested = false;
		}
	}

	setGoal(on: boolean): void {
		this.#goalActive = on;
		if (!on) {
			this.#pauseGoalRequested = false;
		} else if (this.#planActive) {
			// Defensive: callers should check canStartGoal first; still flag conflict.
			this.#pauseGoalRequested = false;
		}
	}

	canStartGoal(): CanStartGoalResult {
		if (this.#planActive) {
			return {
				ok: false,
				reason: "Cannot start goal while plan mode is active; exit plan first (/plan implement or /build).",
			};
		}
		return { ok: true };
	}

	canEnterPlan(): CanEnterPlanResult {
		if (this.#goalActive) {
			this.#pauseGoalRequested = true;
			return { ok: true, pauseGoal: true };
		}
		return { ok: true };
	}

	snapshot(): ModeSnapshot {
		return {
			planActive: this.#planActive,
			goalActive: this.#goalActive,
			pauseGoalRequested: this.#pauseGoalRequested,
		};
	}
}
