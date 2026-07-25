import { describe, expect, it } from "vitest";
import { readPlanModeEnabled } from "../src/adapters/plan-goal.js";

describe("readPlanModeEnabled", () => {
	it("returns false when no plan-mode-state entry", () => {
		const ctx = {
			sessionManager: {
				getBranch: () => [],
				getEntries: () => [],
			},
		};
		expect(readPlanModeEnabled(ctx as never)).toBe(false);
	});

	it("reads enabled from latest plan-mode-state custom entry", () => {
		const ctx = {
			sessionManager: {
				getBranch: () => [
					{ type: "custom", customType: "plan-mode-state", data: { enabled: false } },
					{ type: "custom", customType: "plan-mode-state", data: { enabled: true, awaitingAction: true } },
				],
				getEntries: () => [],
			},
		};
		expect(readPlanModeEnabled(ctx as never)).toBe(true);
	});

	it("falls back to getEntries when getBranch missing", () => {
		const ctx = {
			sessionManager: {
				getEntries: () => [
					{ type: "custom", customType: "plan-mode-state", data: { enabled: true } },
				],
			},
		};
		expect(readPlanModeEnabled(ctx as never)).toBe(true);
	});
});
