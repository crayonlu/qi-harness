import { describe, expect, it } from "vitest";
import { formatSplitDiff } from "../src/ux/diff-split.js";

describe("formatSplitDiff", () => {
	it("uses stacked unified-like format when width <= 120", () => {
		const out = formatSplitDiff("a\nb\nc\n", "a\nx\nc\n", 80);
		expect(out).toContain("  a");
		expect(out).toContain("- b");
		expect(out).toContain("+ x");
		expect(out).toContain("  c");
		expect(out).not.toContain(" | ");
	});

	it("uses side-by-side columns when width > 120", () => {
		const out = formatSplitDiff("hello\nworld\n", "hello\nthere\n", 140);
		expect(out).toContain(" | ");
		expect(out).toMatch(/-\s+world/);
		expect(out).toMatch(/\+\s+there/);
		const contextLine = out.split("\n").find((l) => l.includes("hello") && l.includes("|"));
		expect(contextLine).toBeDefined();
	});

	it("handles additions and deletions at end", () => {
		const stacked = formatSplitDiff("only\n", "only\nnew\n", 80);
		expect(stacked).toContain("  only");
		expect(stacked).toContain("+ new");

		const del = formatSplitDiff("a\nb\n", "a\n", 80);
		expect(del).toContain("- b");
	});

	it("treats identical texts as context lines", () => {
		const out = formatSplitDiff("same\n", "same\n", 80);
		expect(out).toBe("  same");
	});

	it("is deterministic for empty inputs", () => {
		expect(formatSplitDiff("", "", 80)).toBe("");
		expect(formatSplitDiff("", "x\n", 80)).toBe("+ x");
		expect(formatSplitDiff("y\n", "", 80)).toBe("- y");
	});
});
