import { describe, expect, it } from "vitest";
import { looksLikeNetworkError } from "../src/adapters/plan-goal.js";

describe("looksLikeNetworkError (P2 goal auto-pause)", () => {
	it("detects common network failure strings", () => {
		expect(looksLikeNetworkError("fetch failed")).toBe(true);
		expect(looksLikeNetworkError("Error: ECONNRESET")).toBe(true);
		expect(looksLikeNetworkError("APIConnectionError: connection refused")).toBe(true);
	});

	it("ignores unrelated assistant text", () => {
		expect(looksLikeNetworkError("Tests passed")).toBe(false);
		expect(looksLikeNetworkError("")).toBe(false);
	});
});
